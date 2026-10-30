import {
  Employee,
  CompanyAsset,
  DeskSlot,
  AuditLog,
  UserRole,
  DocumentStatus,
  ImportPreviewRow,
  ImportSummary,
  AlertItem,
  UploadToken,
  InterviewRound,
  OfferLetterData,
  ProbationReview,
  FullAndFinalSettlement,
  ExitClearanceRecord,
  SavedOfferLetterFile,
  AssetReturnReminderRecord,
  NotificationDeliveryLog,
  DepartmentWithCounts,
  MarketType,
  ProfileDocumentInspection,
  DocumentQrStatusInfo,
  PublicQrSessionData,
  PublicQrDocumentSlot,
} from '../types/index.js';

class ApiService {
  private currentRole: UserRole = 'HR';
  private currentUserName = 'Nisha (HR)';

  public setRole(role: UserRole, name?: string) {
    this.currentRole = role;
    if (name) {
      this.currentUserName = name;
    } else {
      if (role === 'HR') this.currentUserName = 'Nisha (HR)';
      else if (role === 'Co-Founder') this.currentUserName = 'Rohit Juneja (Co-Founder)';
      else this.currentUserName = 'Lalit Sir (CEO)';
    }
  }

  public getRole(): UserRole {
    return this.currentRole;
  }

  public getUserName(): string {
    return this.currentUserName;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-user-role': this.currentRole,
      'x-user-name': this.currentUserName,
    };
  }

  private getAuthOnlyHeaders(): Record<string, string> {
    return {
      'x-user-role': this.currentRole,
      'x-user-name': this.currentUserName,
    };
  }

  // --- Real-time SSE Subscription ---
  public subscribeToEvents(onEvent: (type: string, data: unknown) => void): () => void {
    const sseUrl = `/api/events?role=${encodeURIComponent(this.currentRole)}&name=${encodeURIComponent(this.currentUserName)}`;
    const eventSource = new EventSource(sseUrl);

    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(type, parsed);
      } catch (err) {
        console.error(`Failed to parse SSE event ${type}:`, err);
      }
    };

    const eventTypes = [
      'CONNECTED',
      'HEARTBEAT',
      'EMPLOYEE_CREATED',
      'EMPLOYEE_UPDATED',
      'EMPLOYEE_DELETED',
      'CANDIDATE_CONVERTED',
      'DOCUMENT_STATUS_CHANGED',
      'DESK_ALLOCATION_CHANGED',
      'ASSET_CREATED',
      'ASSET_UPDATED',
      'AUDIT_LOG_ADDED',
      'IMPORT_COMPLETED',
      'DATABASE_RESET',
      'ALERT_DISMISSED',
      'ALERTS_RESET',
      'CANDIDATE_DOCUMENTS_SUBMITTED',
      'UPLOAD_SUBMITTED',
      'UPLOAD_LINK_GENERATED',
      'UPLOAD_LINK_REVOKED',
      'OFFER_LETTER_UPDATED',
      'OFFER_LETTER_EMAILED',
      'REMINDER_SENT',
      'ALERT_UPDATED',
      'LIFECYCLE_EVENT_ADDED',
      'ASSET_REMINDER_UPDATED',
      'NOTIFICATION_LOG_ADDED',
      'DOCUMENT_QR_GENERATED',
      'DOCUMENT_QR_REVOKED',
      'QR_UPLOAD_PROGRESS',
      'QR_UPLOAD_COMPLETED',
      'DEPARTMENTS_UPDATED',
      'EMPLOYEES_BULK_UPDATED',
    ];

    eventTypes.forEach(type => {
      eventSource.addEventListener(type, handleEvent(type) as EventListener);
    });

    return () => {
      eventSource.close();
    };
  }

  // --- Stats ---
  public async getStats() {
    const res = await fetch('/api/stats', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    return res.json();
  }

  // --- Employees & Candidates ---
  public async getEmployees(params?: {
    isCandidate?: boolean;
    search?: string;
    department?: string;
    departmentId?: string;
    subDepartment?: string;
  }): Promise<Employee[]> {
    const query = new URLSearchParams();
    if (params?.isCandidate !== undefined) query.set('isCandidate', String(params.isCandidate));
    if (params?.search) query.set('search', params.search);
    if (params?.department && params.department !== 'All') query.set('department', params.department);
    if (params?.departmentId && params.departmentId !== 'All') query.set('departmentId', params.departmentId);
    if (params?.subDepartment && params.subDepartment !== 'All') query.set('subDepartment', params.subDepartment);

    const res = await fetch(`/api/employees?${query.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch employees');
    const data = await res.json();
    return data.employees;
  }

  public async getEmployeeById(id: string): Promise<Employee> {
    const res = await fetch(`/api/employees/${id}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Employee not found');
    return res.json();
  }

  public async createEmployee(emp: Partial<Employee>): Promise<Employee> {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(emp),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create employee');
    }
    return res.json();
  }

  public async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update employee');
    }
    return res.json();
  }

  public async deleteEmployee(id: string): Promise<void> {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete employee');
    }
  }

  public async convertCandidate(
    id: string,
    params: { employeeCode?: string; joiningDate?: string; desk?: string }
  ): Promise<Employee> {
    const res = await fetch(`/api/candidates/${id}/convert`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to convert candidate to employee');
    }
    return res.json();
  }

  public async updateDocumentStatus(
    employeeId: string,
    docKey: string,
    payload: {
      status: DocumentStatus;
      reviewNotes?: string;
      verifiedBy?: string;
      fileName?: string;
      fileSize?: string;
    }
  ): Promise<Employee> {
    const res = await fetch(`/api/employees/${employeeId}/documents/${docKey}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update document status');
    }
    return res.json();
  }

  // --- Desks ---
  public async getDesks(): Promise<{ desks: DeskSlot[]; total: number; allowedDesks: string[] }> {
    const res = await fetch('/api/desks', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch desks');
    return res.json();
  }

  public async assignDesk(deskCode: string, employeeId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/desks/assign', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ deskCode, employeeId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to assign desk');
    return data;
  }

  public async releaseDesk(deskCode: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/desks/release', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ deskCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to release desk');
    return data;
  }

  // --- Assets ---
  public async getAssets(): Promise<CompanyAsset[]> {
    const res = await fetch('/api/assets', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch assets');
    const data = await res.json();
    return data.assets;
  }

  public async createAsset(asset: Partial<CompanyAsset>): Promise<CompanyAsset> {
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(asset),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create asset');
    }
    return res.json();
  }

  public async updateAsset(id: string, updates: Partial<CompanyAsset>): Promise<CompanyAsset> {
    const res = await fetch(`/api/assets/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update asset');
    }
    return res.json();
  }

  public async issueAsset(
    id: string,
    employeeId: string,
    issueDate: string,
    notes: string,
    expectedReturnDate?: string | null
  ): Promise<CompanyAsset> {
    const res = await fetch(`/api/assets/${id}/issue`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ employeeId, issueDate, notes, expectedReturnDate }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to issue asset');
    }
    return res.json();
  }

  public async returnAsset(
    id: string,
    returnDate: string,
    condition: CompanyAsset['condition'],
    notes: string
  ): Promise<CompanyAsset> {
    const res = await fetch(`/api/assets/${id}/return`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ returnDate, condition, notes }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to return asset');
    }
    return res.json();
  }

  public async transferAsset(id: string, newEmployeeId: string, notes: string): Promise<CompanyAsset> {
    const res = await fetch(`/api/assets/${id}/transfer`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ newEmployeeId, notes }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to transfer asset');
    }
    return res.json();
  }

  // --- Audit Logs ---
  public async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch('/api/audit-logs', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    const data = await res.json();
    return data.logs;
  }

  // --- Import ---
  public async previewImport(payload: { fileBase64?: string; csvText?: string; targetType?: string }): Promise<{
    sheetName: string;
    totalRows: number;
    headers: string[];
    preview: ImportPreviewRow[];
  }> {
    const res = await fetch('/api/import/preview', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to preview import');
    }
    return res.json();
  }

  public async commitImport(rows: Partial<Employee>[], mode: 'merge' | 'create_all'): Promise<ImportSummary> {
    const res = await fetch('/api/import/commit', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ rows, mode }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to commit import');
    }
    return res.json();
  }

  // --- Upcoming Alerts ---
  public async getAlerts(params?: { refDate?: string; maxDays?: number; activeOnly?: boolean }): Promise<{
    alerts: AlertItem[];
    total: number;
    referenceDate: string;
    maxDays: number;
  }> {
    const query = new URLSearchParams();
    if (params?.refDate) query.set('refDate', params.refDate);
    if (params?.maxDays !== undefined) query.set('maxDays', String(params.maxDays));
    if (params?.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));

    const res = await fetch(`/api/alerts?${query.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch upcoming alerts');
    return res.json();
  }

  public async dismissAlert(alertId: string): Promise<{ success: boolean; alertId: string }> {
    const res = await fetch('/api/alerts/dismiss', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ alertId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to dismiss alert');
    }
    return res.json();
  }

  public async dismissMissingDocAlerts(candidateId?: string): Promise<{ success: boolean; dismissedCount: number }> {
    const res = await fetch('/api/alerts/dismiss-missing-docs', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(candidateId ? { candidateId } : {}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to dismiss missing document alerts');
    }
    return res.json();
  }

  public async resetDismissedAlerts(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/alerts/reset-dismissed', {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reset dismissed alerts');
    }
    return res.json();
  }

  // --- One-Time Upload Link ---
  public async generateUploadLink(
    candidateId: string,
    options?: { expiryDays?: number; isOneTime?: boolean }
  ): Promise<{ success: boolean; token: UploadToken; message: string }> {
    const res = await fetch(`/api/candidates/${candidateId}/upload-link/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(options || {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to generate upload link');
    return data;
  }

  public async revokeUploadLink(candidateId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/candidates/${candidateId}/upload-link/revoke`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to revoke upload link');
    return data;
  }

  public async getPublicCandidateByToken(token: string): Promise<{ valid: boolean; error?: string; candidate?: any }> {
    const res = await fetch(`/api/public/upload-portal/${token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load candidate portal');
    return data;
  }

  public async submitCandidateUpload(
    token: string,
    documents: Record<string, { fileName: string; fileSize?: string; fileData: string; mimeType: string; reviewNotes?: string }>
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/public/upload-portal/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to submit candidate documents');
    return data;
  }

  public async uploadDocumentFile(
    employeeId: string,
    docKey: string,
    payload: {
      fileData: string;
      fileName: string;
      fileSize?: string;
      mimeType?: string;
      status?: DocumentStatus;
      reviewNotes?: string;
    }
  ): Promise<Employee> {
    const res = await fetch(`/api/employees/${employeeId}/documents/${docKey}/upload`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload document file');
    return data;
  }

  public async fetchDocumentObjectUrl(employeeId: string, docKey: string): Promise<string> {
    const res = await fetch(`/api/employees/${employeeId}/documents/${docKey}/file`, {
      headers: this.getAuthOnlyHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load document file' }));
      throw new Error(err.error || 'Failed to load document file');
    }
    const blob = await res.blob();
    return window.URL.createObjectURL(blob);
  }

  public async downloadDocument(employeeId: string, docKey: string, fallbackFileName?: string): Promise<void> {
    const res = await fetch(`/api/employees/${employeeId}/documents/${docKey}/download`, {
      headers: this.getAuthOnlyHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to download document from server');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fallbackFileName || `${docKey}.pdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 200);
  }

  public async downloadExcelExport(format: 'single-sheet' | 'multi-sheet' = 'single-sheet'): Promise<void> {
    const endpoint = format === 'single-sheet' ? '/api/export/excel/single-sheet' : '/api/export/excel';
    const res = await fetch(endpoint, {
      headers: this.getAuthOnlyHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to export Excel workbook' }));
      throw new Error(err.error || 'Failed to export Excel workbook');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const disposition = res.headers.get('Content-Disposition');
    let filename =
      format === 'single-sheet'
        ? `WhiteCollarRealty_Master_Directory_SingleSheet_${Date.now()}.xlsx`
        : `WhiteCollarRealty_HR_Master_${Date.now()}.xlsx`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 200);
  }

  // --- Lifecycle & Interviews ---
  public async addInterview(candidateId: string, data: Partial<InterviewRound>): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/interviews`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to schedule interview');
    }
    return res.json();
  }

  public async updateInterview(candidateId: string, roundId: string, updates: Partial<InterviewRound>): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/interviews/${roundId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to update interview');
    }
    return res.json();
  }

  public async deleteInterview(candidateId: string, roundId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/interviews/${roundId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to delete interview');
    }
    return res.json();
  }

  // --- Offer Letters ---
  public async generateOfferLetter(candidateId: string, customOverrides?: Partial<OfferLetterData>): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(customOverrides || {}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to generate offer letter');
    }
    return res.json();
  }

  public async updateOfferLetter(candidateId: string, customOverrides: Partial<OfferLetterData>): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(customOverrides),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to update offer letter');
    }
    return res.json();
  }

  public async approveOfferLetter(candidateId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/approve`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to approve offer letter');
    }
    return res.json();
  }

  public async issueOfferLetter(candidateId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/issue`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to issue offer letter');
    }
    return res.json();
  }

  public async acceptOfferLetter(candidateId: string, signatureName: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/accept`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ signatureName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to accept offer letter');
    }
    return res.json();
  }

  public async emailOfferLetter(candidateId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/email`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to email offer letter');
    }
    return res.json();
  }

  public async getSavedOfferLetterFiles(candidateId: string): Promise<{
    candidateId: string;
    candidateName: string;
    savedOfferLetters: SavedOfferLetterFile[];
    currentOfferLetter: OfferLetterData | null;
  }> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/files`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load saved offer letters' }));
      throw new Error(err.error || 'Failed to load saved offer letters');
    }
    return res.json();
  }

  public async downloadSavedOfferLetterFile(
    candidateId: string,
    fileId: string,
    fallbackFileName?: string
  ): Promise<void> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/files/${encodeURIComponent(fileId)}/download`, {
      headers: this.getAuthOnlyHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to download saved offer letter .docx' }));
      throw new Error(err.error || 'Failed to download saved offer letter .docx');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition');
    let filename = fallbackFileName || `White_Collar_Realty_Offer_Letter_${candidateId}.docx`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 200);
  }

  public async downloadOfferLetterDocx(candidateId: string, customData?: Partial<OfferLetterData>): Promise<void> {
    const usePost = Boolean(customData) && (this.currentRole === 'HR' || this.currentRole === 'Co-Founder');
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/docx`, {
      method: usePost ? 'POST' : 'GET',
      headers: usePost ? this.getHeaders() : this.getAuthOnlyHeaders(),
      body: usePost ? JSON.stringify(customData) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to download Word document' }));
      throw new Error(err.message || err.error || 'Failed to download Word document');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition');
    let filename = `White_Collar_Realty_Offer_Letter_${candidateId}.docx`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  public async getMasterOfferTemplate(): Promise<any> {
    const res = await fetch('/api/offer-letter/master-template', {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to load master offer template');
    return res.json();
  }

  public async getSalaryStructures(): Promise<{ structures: any[] }> {
    const res = await fetch('/api/salary-structures', {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load salary structures' }));
      throw new Error(err.message || err.error || 'Failed to load salary structures');
    }
    return res.json();
  }

  public async saveSalaryStructure(structure: any): Promise<any> {
    const res = await fetch('/api/salary-structures', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(structure),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save salary structure' }));
      throw new Error(err.message || err.error || 'Failed to save salary structure');
    }
    return res.json();
  }

  public async deleteSalaryStructure(id: string): Promise<any> {
    const res = await fetch(`/api/salary-structures/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete salary structure' }));
      throw new Error(err.message || err.error || 'Failed to delete salary structure');
    }
    return res.json();
  }

  public async getMissingDocuments(candidateId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/missing-documents`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch missing documents');
    return res.json();
  }

  public async sendDocumentReminder(
    candidateId: string,
    payload: {
      channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
      missingDocumentKeys?: string[];
      deadlineHours?: number;
      messageBody?: string;
      emailSubject?: string;
      recipientEmail?: string;
      recipientPhone?: string;
    }
  ): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/reminders/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to send document reminder');
    }
    return res.json();
  }

  public async getCandidateReminders(candidateId: string): Promise<any> {
    const res = await fetch(`/api/candidates/${candidateId}/reminders`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch candidate reminders');
    return res.json();
  }

  // --- Probation ---
  public async recordProbationReview(employeeId: string, data: Partial<ProbationReview>): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/probation/review`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to record probation review');
    }
    return res.json();
  }

  public async confirmProbation(employeeId: string, confirmationLetterRef?: string): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/probation/confirm`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ confirmationLetterRef }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to confirm probation');
    }
    return res.json();
  }

  public async extendProbation(employeeId: string, extensionMonths: number, reason: string): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/probation/extend`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ extensionMonths, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to extend probation');
    }
    return res.json();
  }

  // --- Exit, Clearances & FnF ---
  public async initiateExit(employeeId: string, data: any): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/exit/initiate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to initiate exit');
    }
    return res.json();
  }

  public async updateExitClearance(employeeId: string, dept: string, updates: any): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/exit/clearance/${dept}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to update exit clearance');
    }
    return res.json();
  }

  public async calculateFnF(employeeId: string, overrides?: any): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/exit/fnf/calculate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(overrides || {}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to calculate FnF');
    }
    return res.json();
  }

  public async finalizeFnF(employeeId: string, paymentData: any): Promise<any> {
    const res = await fetch(`/api/employees/${employeeId}/exit/fnf/settle`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(paymentData || {}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || 'Failed to finalize FnF settlement');
    }
    return res.json();
  }

  // --- Scheduled Automation & Asset Return Reminders ---
  public async getAutomationStatus(): Promise<any> {
    const res = await fetch('/api/automation/status', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch automation status');
    return res.json();
  }

  public async getAssetReminders(personId?: string): Promise<{ reminders: AssetReturnReminderRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (personId) query.set('personId', personId);
    const res = await fetch(`/api/automation/asset-reminders?${query.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch asset return reminders');
    return res.json();
  }

  public async getDeliveryLogs(
    personId?: string,
    limit?: number
  ): Promise<{ logs: NotificationDeliveryLog[]; total: number }> {
    const query = new URLSearchParams();
    if (personId) query.set('personId', personId);
    if (limit !== undefined) query.set('limit', String(limit));
    const res = await fetch(`/api/automation/delivery-logs?${query.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch notification delivery logs');
    return res.json();
  }

  public async runAssetReminderSweep(referenceDate?: string): Promise<{ success: boolean; summary: any }> {
    const res = await fetch('/api/automation/asset-reminders/run', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(referenceDate ? { referenceDate } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to run asset return reminder sweep' }));
      throw new Error(err.error || 'Failed to run asset return reminder sweep');
    }
    return res.json();
  }

  // --- Configurable Departments & Sub-Departments ---
  public async getDepartments(): Promise<DepartmentWithCounts[]> {
    const res = await fetch('/api/departments', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch departments');
    const data = await res.json();
    return data.departments || [];
  }

  public async createDepartment(payload: {
    name: string;
    description?: string;
    marketFocus?: MarketType;
    subDepartments?: string[];
  }): Promise<{ department: DepartmentWithCounts; departments: DepartmentWithCounts[] }> {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create department');
    return data;
  }

  public async updateDepartment(
    id: string,
    payload: { name?: string; description?: string; marketFocus?: MarketType }
  ): Promise<{ department: DepartmentWithCounts; departments: DepartmentWithCounts[] }> {
    const res = await fetch(`/api/departments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update department');
    return data;
  }

  public async deleteDepartment(
    id: string,
    reassignToDepartmentId?: string
  ): Promise<{ success: boolean; departments: DepartmentWithCounts[] }> {
    const query = new URLSearchParams();
    if (reassignToDepartmentId) query.set('reassignToDepartmentId', reassignToDepartmentId);
    const res = await fetch(`/api/departments/${encodeURIComponent(id)}?${query.toString()}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify(reassignToDepartmentId ? { reassignToDepartmentId } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete department');
    return data;
  }

  public async addSubDepartment(
    deptId: string,
    payload: { name: string; description?: string }
  ): Promise<{ department: DepartmentWithCounts; departments: DepartmentWithCounts[] }> {
    const res = await fetch(`/api/departments/${encodeURIComponent(deptId)}/sub-departments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add sub-department');
    return data;
  }

  public async updateSubDepartment(
    deptId: string,
    subId: string,
    payload: { name?: string; description?: string }
  ): Promise<{ department: DepartmentWithCounts; departments: DepartmentWithCounts[] }> {
    const res = await fetch(
      `/api/departments/${encodeURIComponent(deptId)}/sub-departments/${encodeURIComponent(subId)}`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update sub-department');
    return data;
  }

  public async deleteSubDepartment(
    deptId: string,
    subId: string
  ): Promise<{ department: DepartmentWithCounts; departments: DepartmentWithCounts[] }> {
    const res = await fetch(
      `/api/departments/${encodeURIComponent(deptId)}/sub-departments/${encodeURIComponent(subId)}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete sub-department');
    return data;
  }

  // --- Dynamic Employment Categories ---
  public async getEmploymentCategories(): Promise<string[]> {
    const res = await fetch('/api/employment-categories', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch employment categories');
    const data = await res.json();
    return data.categories || [];
  }

  public async createEmploymentCategory(name: string): Promise<string[]> {
    const res = await fetch('/api/employment-categories', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create employment category');
    return data.categories || [];
  }

  public async deleteEmploymentCategory(name: string): Promise<string[]> {
    const res = await fetch(`/api/employment-categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete employment category');
    return data.categories || [];
  }

  // --- System Network Info for LAN & QR Sharing ---
  public async getNetworkInfo(): Promise<{
    port: number;
    lanIp: string | null;
    lanOrigin: string | null;
    defaultOrigin: string;
    configuredBaseUrl: string | null;
  }> {
    const res = await fetch('/api/system/network-info', {
      headers: this.getHeaders(),
    });
    return await res.json();
  }

  // --- Individual 24-Hour Document QR (Protected HR / Co-Founder) ---
  public async getEmployeeDocumentQr(
    employeeId: string,
    options?: { preferLan?: boolean; customOrigin?: string }
  ): Promise<{ inspection: ProfileDocumentInspection; qrStatus: DocumentQrStatusInfo; networkInfo?: any }> {
    const query = new URLSearchParams({
      clientOrigin: options?.customOrigin || window.location.origin,
    });
    if (options?.preferLan) query.set('preferLan', 'true');
    if (options?.customOrigin) query.set('customOrigin', options.customOrigin);

    const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/document-qr?${query.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to inspect profile QR status');
    return data;
  }

  public async generateEmployeeDocumentQr(
    employeeId: string,
    options?: { includeOptionalMissing?: boolean; customDocKeys?: string[]; preferLan?: boolean; customOrigin?: string }
  ): Promise<{
    success: boolean;
    inspection: ProfileDocumentInspection;
    qrStatus: DocumentQrStatusInfo;
    message: string;
    networkInfo?: any;
  }> {
    const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/document-qr`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...(options || {}),
        clientOrigin: options?.customOrigin || window.location.origin,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate Document QR');
    return data;
  }

  public async revokeEmployeeDocumentQr(employeeId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/document-qr/revoke`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke Document QR');
    return data;
  }

  // --- Public QR-Based Document Upload (No HR Login Required) ---
  public async getPublicQrSession(token: string, silent = false): Promise<PublicQrSessionData> {
    const query = silent ? '?silent=true' : '';
    const res = await fetch(`/api/public/document-qr/${encodeURIComponent(token)}${query}`, {
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ error: 'Unable to load QR session' }));
    if (!res.ok) {
      const err: Error & { status?: number; code?: string } = new Error(data.error || 'QR upload link unavailable');
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  }

  public uploadPublicQrDocument(
    token: string,
    docKey: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; slot: PublicQrDocumentSlot; session: PublicQrSessionData }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `/api/public/document-qr/${encodeURIComponent(token)}/upload/${encodeURIComponent(docKey)}`,
        true
      );
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-Mime-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.min(98, Math.max(1, Math.round((e.loaded / e.total) * 98)));
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(xhr.responseText || '{}');
        } catch {
          parsed = { error: 'Unexpected server response' };
        }
        if (xhr.status >= 200 && xhr.status < 300 && parsed.success) {
          if (onProgress) onProgress(100);
          resolve(parsed);
        } else {
          const err: Error & { status?: number; code?: string } = new Error(
            parsed.error || 'Document upload failed'
          );
          err.status = xhr.status;
          err.code = parsed.code;
          reject(err);
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error while uploading document. Please check your connection and try again.'));
      };

      xhr.send(file);
    });
  }

  // --- Reset Database ---
  public async resetDatabase(): Promise<void> {
    const res = await fetch('/api/database/reset', {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reset database');
    }
  }
}

export const api = new ApiService();
