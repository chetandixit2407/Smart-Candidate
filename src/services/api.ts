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
} from '../types/index.js';

class ApiService {
  private currentRole: UserRole = 'HR_ADMIN';
  private currentUserName = 'Simran Kaur (HR Head)';

  public setRole(role: UserRole, name?: string) {
    this.currentRole = role;
    if (name) {
      this.currentUserName = name;
    } else {
      if (role === 'HR_ADMIN') this.currentUserName = 'Simran Kaur (HR Head)';
      else if (role === 'HR_MANAGER') this.currentUserName = 'Ritu Agarwal (HR Ops)';
      else if (role === 'HR_EXECUTIVE') this.currentUserName = 'Ananya Sen (Talent Acquisition)';
      else if (role === 'FINANCE_ADMIN') this.currentUserName = 'Rajesh Mehta (Head of Finance & FnF)';
      else this.currentUserName = 'Varun Batra (Sales Director - Viewer)';
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

  // --- Real-time SSE Subscription ---
  public subscribeToEvents(onEvent: (type: string, data: unknown) => void): () => void {
    const eventSource = new EventSource('/api/events');

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
  public async getEmployees(params?: { isCandidate?: boolean; search?: string; department?: string }): Promise<Employee[]> {
    const query = new URLSearchParams();
    if (params?.isCandidate !== undefined) query.set('isCandidate', String(params.isCandidate));
    if (params?.search) query.set('search', params.search);
    if (params?.department && params.department !== 'All') query.set('department', params.department);

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

  public async issueAsset(id: string, employeeId: string, issueDate: string, notes: string): Promise<CompanyAsset> {
    const res = await fetch(`/api/assets/${id}/issue`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ employeeId, issueDate, notes }),
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

  public async downloadDocument(employeeId: string, docKey: string, fallbackFileName?: string): Promise<void> {
    const res = await fetch(`/api/employees/${employeeId}/documents/${docKey}/download`, {
      headers: {
        'x-user-role': this.currentRole,
        'x-user-name': this.currentUserName,
      },
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

  public async downloadOfferLetterDocx(candidateId: string, customData?: Partial<OfferLetterData>): Promise<void> {
    const res = await fetch(`/api/candidates/${candidateId}/offer-letter/docx`, {
      method: customData ? 'POST' : 'GET',
      headers: this.getHeaders(),
      body: customData ? JSON.stringify(customData) : undefined,
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
