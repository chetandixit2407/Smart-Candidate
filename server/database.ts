import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import type {
  Employee,
  CompanyAsset,
  DeskSlot,
  AuditLog,
  UserRole,
  DocumentStatus,
  ImportSummary,
  AlertItem,
  UploadToken,
  InterviewRound,
  OfferLetterData,
  OfferTemplateRevision,
  DocumentReminderRecord,
  DocumentRecord,
  ProbationReview,
  ProbationRecord,
  ExitClearanceRecord,
  FullAndFinalSettlement,
  LifecycleStage,
  LifecycleHistoryEntry,
} from '../src/types/index.ts';
import {
  ALL_DESK_CODES,
  getBayFromDesk,
  mapSpreadsheetSeatToStandardDesk,
  SEED_EMPLOYEES,
  SEED_CANDIDATES,
  SEED_ASSETS,
  INITIAL_AUDIT_LOGS,
  calculateCompletion,
  getDefaultDocumentChecklist,
} from './seedData.ts';
import {
  buildOfferLetterData,
  calculateSalaryBreakup,
  calculateFullAndFinalSettlement,
  checkOfferMissingFields,
} from './lifecycleEngine.ts';

interface DatabaseSchema {
  employees: Employee[];
  assets: CompanyAsset[];
  auditLogs: AuditLog[];
  acknowledgedAlerts: Record<string, { dismissedAt: string; dismissedBy: string }>;
  version: number;
  lastUpdated: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'hr_db.json');
const SECURE_UPLOADS_DIR = path.join(DATA_DIR, 'secure_uploads');

class DatabaseService {
  private data: DatabaseSchema;
  private sseClients: Response[] = [];

  constructor() {
    if (!fs.existsSync(SECURE_UPLOADS_DIR)) {
      fs.mkdirSync(SECURE_UPLOADS_DIR, { recursive: true });
    }
    this.data = this.loadData();
    // Heartbeat every 25 seconds for SSE
    setInterval(() => {
      this.broadcast('HEARTBEAT', { time: new Date().toISOString() });
    }, 25000);
  }

  private loadData(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        // If version 3, load existing database
        if (parsed.version === 3 && parsed.employees && parsed.assets) {
          if (!parsed.acknowledgedAlerts) parsed.acknowledgedAlerts = {};
          console.log(`[DB] Successfully loaded ${parsed.employees.length} employees and ${parsed.assets.length} assets from disk (v3).`);
          return parsed;
        }
      }
    } catch (err) {
      console.error('[DB] Error loading database file, initializing seed:', err);
    }

    // Initialize with verified seed data
    const initialEmployees = [...SEED_EMPLOYEES, ...SEED_CANDIDATES];
    const initialData: DatabaseSchema = {
      employees: initialEmployees,
      assets: SEED_ASSETS,
      auditLogs: INITIAL_AUDIT_LOGS,
      acknowledgedAlerts: {},
      version: 3,
      lastUpdated: new Date().toISOString(),
    };

    this.saveDataDirect(initialData);
    console.log(`[DB] Initialized database with ${initialEmployees.length} employees/candidates and ${SEED_ASSETS.length} assets (v3).`);
    return initialData;
  }

  private saveDataDirect(dataToSave: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to write database to disk:', err);
    }
  }

  private persist() {
    this.data.lastUpdated = new Date().toISOString();
    this.saveDataDirect(this.data);
  }

  // --- Real-Time SSE Management ---
  public addSSEClient(res: Response) {
    this.sseClients.push(res);
    res.on('close', () => {
      this.sseClients = this.sseClients.filter(c => c !== res);
    });
  }

  public broadcast(type: string, payload: unknown) {
    const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    this.sseClients.forEach(client => {
      try {
        client.write(message);
      } catch (err) {
        // Client disconnected
      }
    });
  }

  public logAudit(
    actor: string,
    actorRole: UserRole,
    action: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    entityName: string,
    details: string
  ) {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      actor,
      actorRole,
      action,
      entityType,
      entityId,
      entityName,
      details,
    };
    this.data.auditLogs.unshift(newLog);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.persist();
    this.broadcast('AUDIT_LOG_ADDED', newLog);
  }

  // --- Employees & Candidates ---
  public getEmployees(role: UserRole = 'HR_ADMIN', filter?: { isCandidate?: boolean; search?: string; department?: string }): Employee[] {
    let list = this.data.employees;

    if (filter) {
      if (typeof filter.isCandidate === 'boolean') {
        list = list.filter(e => Boolean(e.isCandidate) === filter.isCandidate);
      }
      if (filter.department && filter.department !== 'All') {
        list = list.filter(e => e.department === filter.department);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          e =>
            e.fullName.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.phone.toLowerCase().includes(q) ||
            e.designation.toLowerCase().includes(q) ||
            (e.desk && e.desk.toLowerCase().includes(q)) ||
            (e.sourceSpreadsheetSeat && e.sourceSpreadsheetSeat.toLowerCase().includes(q))
        );
      }
    }

    // Role-based field masking
    if (role === 'DEPT_HEAD_VIEWER') {
      return list.map(emp => this.redactSensitiveFields(emp));
    }

    return list;
  }

  public getEmployeeById(id: string, role: UserRole = 'HR_ADMIN'): Employee | null {
    const emp = this.data.employees.find(e => e.id === id);
    if (!emp) return null;
    if (role === 'DEPT_HEAD_VIEWER') {
      return this.redactSensitiveFields(emp);
    }
    return emp;
  }

  private redactSensitiveFields(emp: Employee): Employee {
    return {
      ...emp,
      previousCTC: '🔒 [RESTRICTED - HR ADMIN ONLY]',
      offeredCTC: '🔒 [RESTRICTED - HR ADMIN ONLY]',
      familyDetails: emp.familyDetails.map(f => ({
        ...f,
        phone: '••••••••••',
      })),
      emergencyContact: {
        ...emp.emergencyContact,
        phone: '••••••••••',
      },
      bankDetails: emp.bankDetails ? {
        bankName: emp.bankDetails.bankName,
        accountNo: '••••••••••••' + (emp.bankDetails.accountNo?.slice(-4) || ''),
        ifscCode: '••••••••',
        branchName: '••••••••',
      } : undefined,
      identityDetails: emp.identityDetails ? {
        aadhaarNo: '••••••••' + (emp.identityDetails.aadhaarNo?.slice(-4) || ''),
        panNo: '••••••••',
        passportNo: '••••••••',
        visaStatus: emp.identityDetails.visaStatus,
      } : undefined,
      googleDriveLink: emp.googleDriveLink ? '🔒 [RESTRICTED TO HR ADMIN]' : undefined,
    };
  }

  public createEmployee(empData: Partial<Employee>, actor: string, actorRole: UserRole): Employee {
    const isCand = Boolean(empData.isCandidate);
    const id = isCand
      ? `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      : `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Generate code if not provided
    let code = empData.employeeCode;
    if (!code) {
      const highestNum = this.data.employees
        .filter(e => !e.isCandidate && e.employeeCode.startsWith('WCR-'))
        .map(e => parseInt(e.employeeCode.replace('WCR-', ''), 10))
        .filter(n => !isNaN(n))
        .reduce((max, cur) => Math.max(max, cur), 25);
      code = isCand ? `WCR-${String(highestNum + 1).padStart(3, '0')} (Pending)` : `WCR-${String(highestNum + 1).padStart(3, '0')}`;
    }

    const desk = empData.desk || (empData.sourceSpreadsheetSeat ? mapSpreadsheetSeatToStandardDesk(empData.sourceSpreadsheetSeat) : '');

    const newEmp: Employee = {
      id,
      employeeCode: code,
      fullName: empData.fullName || 'New Employee',
      email: empData.email || '',
      phone: empData.phone || '',
      alternatePhone: empData.alternatePhone,
      dateOfBirth: empData.dateOfBirth || '',
      gender: empData.gender || 'Male',
      nationality: empData.nationality || 'Indian',
      currentAddress: empData.currentAddress || '',
      permanentAddress: empData.permanentAddress || '',
      emergencyContact: empData.emergencyContact || { name: '', relation: '', phone: '' },
      familyDetails: empData.familyDetails || [],
      department: empData.department || 'Sales & Investments',
      designation: empData.designation || 'Property Consultant',
      reportingManager: empData.reportingManager || 'Management',
      joiningDate: empData.joiningDate || new Date().toISOString().split('T')[0],
      internshipCompletionDate: empData.internshipCompletionDate,
      employmentStatus: empData.employmentStatus || (isCand ? 'Upcoming Joiner' : 'Full-Time'),
      isCandidate: isCand,
      candidateStatus: empData.candidateStatus || (isCand ? 'Offer Accepted' : undefined),
      market: empData.market || 'Gurgaon',
      desk: ALL_DESK_CODES.includes(desk) ? desk : '',
      sourceSpreadsheetSeat: empData.sourceSpreadsheetSeat || desk,
      previousCompany: empData.previousCompany,
      previousDesignation: empData.previousDesignation,
      previousCTC: empData.previousCTC,
      offeredCTC: empData.offeredCTC,
      totalExperienceYears: empData.totalExperienceYears || 0,
      totalExperienceMonths: empData.totalExperienceMonths || 0,
      gurgaonMarketExperience: empData.gurgaonMarketExperience,
      dubaiMarketExperience: empData.dubaiMarketExperience,
      education: empData.education || [],
      references: empData.references || [],
      bankDetails: empData.bankDetails,
      identityDetails: empData.identityDetails,
      linkedinUrl: empData.linkedinUrl,
      instaUrl: empData.instaUrl,
      medicalConditions: empData.medicalConditions,
      bloodGroup: empData.bloodGroup,
      hobbies: empData.hobbies,
      aspirations: empData.aspirations,
      googleDriveLink: empData.googleDriveLink,
      documents: empData.documents || getDefaultDocumentChecklist(empData.market === 'Dubai' || empData.market === 'Dual Market'),
      profileCompletion: 0,
      notes: empData.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    newEmp.profileCompletion = calculateCompletion(newEmp);

    if (newEmp.desk) {
      this.clearDeskAssignment(newEmp.desk, newEmp.id);
    }

    this.data.employees.push(newEmp);
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      isCand ? 'Candidate Created' : 'Employee Created',
      isCand ? 'Candidate' : 'Employee',
      newEmp.id,
      newEmp.fullName,
      `Created ${isCand ? 'candidate' : 'employee'} profile (${newEmp.employeeCode}). Seat: ${newEmp.sourceSpreadsheetSeat || 'None'}.`
    );

    this.broadcast('EMPLOYEE_CREATED', newEmp);
    return newEmp;
  }

  public updateEmployee(id: string, updates: Partial<Employee>, actor: string, actorRole: UserRole): Employee | null {
    const index = this.data.employees.findIndex(e => e.id === id);
    if (index === -1) return null;

    const existing = this.data.employees[index];
    const oldDesk = existing.desk;
    const newDesk = updates.desk;

    if (newDesk !== undefined && newDesk !== oldDesk) {
      if (newDesk) {
        this.clearDeskAssignment(newDesk, id);
      }
    }

    const merged: Employee = {
      ...existing,
      ...updates,
      bankDetails: updates.bankDetails ? { ...(existing.bankDetails || {}), ...updates.bankDetails } : existing.bankDetails,
      identityDetails: updates.identityDetails ? { ...(existing.identityDetails || {}), ...updates.identityDetails } : existing.identityDetails,
      emergencyContact: updates.emergencyContact ? { ...(existing.emergencyContact || {}), ...updates.emergencyContact } : existing.emergencyContact,
      aspirations: updates.aspirations ? { ...(existing.aspirations || {}), ...updates.aspirations } : existing.aspirations,
      familyDetails: updates.familyDetails !== undefined ? updates.familyDetails : existing.familyDetails,
      education: updates.education !== undefined ? updates.education : existing.education,
      references: updates.references !== undefined ? updates.references : existing.references,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    merged.profileCompletion = calculateCompletion(merged);

    this.data.employees[index] = merged;
    this.persist();

    if (newDesk !== undefined && newDesk !== oldDesk) {
      this.logAudit(
        actor,
        actorRole,
        'Desk Changed',
        'Desk',
        newDesk || oldDesk || 'unassigned',
        merged.fullName,
        `Desk allocation changed from '${oldDesk || 'None'}' to '${newDesk || 'None'}'.`
      );
      this.broadcast('DESK_ALLOCATION_CHANGED', { employeeId: merged.id, oldDesk, newDesk });
    }

    this.logAudit(
      actor,
      actorRole,
      'Profile Updated',
      merged.isCandidate ? 'Candidate' : 'Employee',
      merged.id,
      merged.fullName,
      `Updated profile fields (${Object.keys(updates).join(', ')}). Profile score: ${merged.profileCompletion}%.`
    );

    this.broadcast('EMPLOYEE_UPDATED', merged);
    return merged;
  }

  public deleteEmployee(id: string, actor: string, actorRole: UserRole): boolean {
    const index = this.data.employees.findIndex(e => e.id === id);
    if (index === -1) return false;

    const removed = this.data.employees[index];
    this.data.employees.splice(index, 1);

    this.data.assets.forEach(asset => {
      if (asset.assignedEmployeeId === id) {
        asset.assignedEmployeeId = null;
        asset.assignedEmployeeName = null;
        asset.assignedEmployeeCode = null;
        asset.status = 'Available';
        asset.returnDate = new Date().toISOString();
        asset.history.push({
          date: new Date().toISOString(),
          action: 'Returned',
          performedBy: actor,
          notes: `Returned due to employee record removal (${removed.fullName})`,
        });
      }
    });

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Record Deleted',
      removed.isCandidate ? 'Candidate' : 'Employee',
      removed.id,
      removed.fullName,
      `Deleted record for ${removed.fullName} (${removed.employeeCode}).`
    );

    this.broadcast('EMPLOYEE_DELETED', { id, desk: removed.desk });
    return true;
  }

  public convertCandidateToEmployee(
    candidateId: string,
    params: { employeeCode?: string; joiningDate?: string; desk?: string },
    actor: string,
    actorRole: UserRole
  ): Employee | null {
    const index = this.data.employees.findIndex(e => e.id === candidateId);
    if (index === -1) return null;

    const cand = this.data.employees[index];

    let code = params.employeeCode;
    if (!code || code.includes('Pending')) {
      const highestNum = this.data.employees
        .filter(e => !e.isCandidate && e.employeeCode.startsWith('WCR-'))
        .map(e => parseInt(e.employeeCode.replace('WCR-', ''), 10))
        .filter(n => !isNaN(n))
        .reduce((max, cur) => Math.max(max, cur), 25);
      code = `WCR-${String(highestNum + 1).padStart(3, '0')}`;
    }

    if (params.desk) {
      this.clearDeskAssignment(params.desk, candidateId);
    }

    cand.isCandidate = false;
    cand.candidateStatus = undefined;
    cand.employmentStatus = 'Full-Time';
    cand.employeeCode = code;
    if (params.joiningDate) cand.joiningDate = params.joiningDate;
    if (params.desk !== undefined) cand.desk = params.desk;
    cand.updatedAt = new Date().toISOString();
    cand.profileCompletion = calculateCompletion(cand);

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Candidate Converted to Employee',
      'Employee',
      cand.id,
      cand.fullName,
      `Converted candidate to active employee with code ${cand.employeeCode} and desk ${cand.desk || 'Unassigned'}.`
    );

    this.broadcast('CANDIDATE_CONVERTED', cand);
    return cand;
  }

  // --- Secure Private File Storage Helpers ---
  public saveSecureFile(personId: string, docKey: string, originalFileName: string, fileData: string): string {
    const personDir = path.join(SECURE_UPLOADS_DIR, personId);
    if (!fs.existsSync(personDir)) {
      fs.mkdirSync(personDir, { recursive: true });
    }

    const sanitizedBase = path.basename(originalFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFileName = `${docKey}_${Date.now()}_${sanitizedBase}`;
    const targetFilePath = path.join(personDir, storedFileName);

    if (fileData.startsWith('data:')) {
      const match = fileData.match(/^data:[^;]+;base64,(.+)$/);
      if (match) {
        fs.writeFileSync(targetFilePath, Buffer.from(match[1], 'base64'));
      } else {
        fs.writeFileSync(targetFilePath, Buffer.from(fileData, 'utf-8'));
      }
    } else {
      fs.writeFileSync(targetFilePath, Buffer.from(fileData, 'utf-8'));
    }

    return path.join('secure_uploads', personId, storedFileName);
  }

  public getSecureDocumentFile(employeeId: string, docKey: string): { filePath?: string; buffer?: Buffer; mimeType: string; fileName: string } | null {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp || !emp.documents || !emp.documents[docKey]) return null;

    const doc = emp.documents[docKey];
    // Check if this document genuinely has an attached file
    if (!doc.fileName && !doc.fileData && !doc.storagePath) {
      return null;
    }

    const fileName = doc.fileName || `${docKey}.pdf`;
    let mimeType = doc.mimeType;
    if (!mimeType) {
      if (fileName.endsWith('.png')) mimeType = 'image/png';
      else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else mimeType = 'application/pdf';
    }

    // 1. Check storagePath on disk in secure_uploads
    if (doc.storagePath) {
      const diskPath = path.resolve(DATA_DIR, doc.storagePath);
      if (fs.existsSync(diskPath)) {
        return { filePath: diskPath, mimeType, fileName };
      }
    }

    // 2. Check base64 fileData
    if (doc.fileData && doc.fileData.startsWith('data:')) {
      const match = doc.fileData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          buffer: Buffer.from(match[2], 'base64'),
          mimeType: match[1] || mimeType,
          fileName,
        };
      }
    }

    // 3. Pre-seeded historical sheets for Chetan Dixit only
    if (emp.id === 'emp-chetan-dixit') {
      const fname = fileName.toLowerCase();
      let relativePath = '';
      if (fname.includes('information') || fname.includes('sheet')) {
        relativePath = 'assets/aistudio/Chetan_Information_Sheet_-_Sheet1_06bd8f64.pdf';
      } else if (fname.includes('birthday') || fname.includes('details')) {
        relativePath = 'assets/aistudio/Employees_Details__Birthday___-_Sheet1_8b0b9282.pdf';
      }
      if (relativePath) {
        const publicPath = path.resolve(process.cwd(), 'public', relativePath);
        if (fs.existsSync(publicPath)) {
          return { filePath: publicPath, mimeType: 'application/pdf', fileName };
        }
      }
    }

    // No mock fallback for candidates without genuine files!
    return null;
  }

  // --- Document Verification & HR Upload ---
  public updateDocument(
    employeeId: string,
    docKey: string,
    params: {
      status: DocumentStatus;
      reviewNotes?: string;
      verifiedBy?: string;
      fileName?: string;
      fileSize?: string;
      fileData?: string;
      mimeType?: string;
    },
    actor: string,
    actorRole: UserRole
  ): Employee | null {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;

    if (!emp.documents) {
      emp.documents = getDefaultDocumentChecklist(emp.market === 'Dubai' || emp.market === 'Dual Market');
    }

    const currentDoc = emp.documents[docKey];
    if (!currentDoc) {
      emp.documents[docKey] = {
        key: docKey,
        title: docKey.replace(/_/g, ' ').toUpperCase(),
        category: 'Identity',
        status: params.status,
        required: true,
      };
    }

    const doc = emp.documents[docKey];
    const oldStatus = doc.status;
    doc.status = params.status;
    if (params.reviewNotes !== undefined) doc.reviewNotes = params.reviewNotes;
    if (params.fileName) doc.fileName = params.fileName;
    if (params.fileSize) doc.fileSize = params.fileSize;
    if (params.mimeType) doc.mimeType = params.mimeType;

    // Save actual file data to private disk storage
    if (params.fileData) {
      doc.fileData = params.fileData;
      try {
        const savedPath = this.saveSecureFile(emp.id, docKey, params.fileName || `${docKey}.pdf`, params.fileData);
        doc.storagePath = savedPath;
      } catch (err) {
        console.error(`[DB] Failed to persist file to secure storage for ${emp.id}/${docKey}:`, err);
      }
    }

    if (params.status === 'Verified') {
      doc.verifiedBy = params.verifiedBy || actor;
      doc.verifiedAt = new Date().toISOString();
    } else if (params.status === 'Submitted') {
      doc.uploadedAt = new Date().toISOString();
    }

    emp.updatedAt = new Date().toISOString();
    emp.profileCompletion = calculateCompletion(emp);

    // If documents are modified/rejected, clear any dismissal state so HR alert shows immediately
    if (params.status === 'Missing' || params.status === 'Rejected') {
      if (this.data.acknowledgedAlerts?.[`missing-docs-${emp.id}`]) {
        delete this.data.acknowledgedAlerts[`missing-docs-${emp.id}`];
      }
    }

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Document Status Updated',
      'Document',
      `${emp.id}-${docKey}`,
      `${emp.fullName} - ${doc.title}`,
      `Changed verification status from '${oldStatus}' to '${params.status}'. Review notes: ${params.reviewNotes || 'None'}.`
    );

    this.broadcast('DOCUMENT_STATUS_CHANGED', { employeeId: emp.id, docKey, doc, profileCompletion: emp.profileCompletion });
    this.broadcast('ALERT_UPDATED', { candidateId: emp.id });
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return emp;
  }

  // --- Candidate Document Upload Links ---
  public generateUploadToken(
    candidateId: string,
    actor: string,
    actorRole: UserRole,
    options?: { expiryDays?: number; isOneTime?: boolean }
  ): { success: boolean; token?: UploadToken; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    const expiryDays = options?.expiryDays && options.expiryDays > 0 ? options.expiryDays : 7;
    const isOneTime = options?.isOneTime !== undefined ? Boolean(options.isOneTime) : true;

    const tokenString = 'wcr-upl-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    const expires = new Date();
    expires.setDate(expires.getDate() + expiryDays);

    const tokenObj: UploadToken = {
      token: tokenString,
      employeeId: candidate.id,
      candidateName: candidate.fullName,
      candidateEmail: candidate.email,
      createdAt: new Date().toISOString(),
      expiresAt: expires.toISOString(),
      isUsed: false,
      revoked: false,
      isRevoked: false,
      submissionCount: 0,
      isOneTime,
      expiryDays,
    };

    candidate.uploadToken = tokenObj;
    candidate.updatedAt = new Date().toISOString();
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Upload Link Generated',
      'Candidate',
      candidate.id,
      candidate.fullName,
      `Generated ${isOneTime ? 'single-use' : 'multi-use'} upload link (expires in ${expiryDays} days on ${expires.toLocaleDateString()}).`
    );

    this.broadcast('UPLOAD_LINK_GENERATED', { candidateId: candidate.id, token: tokenObj });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, token: tokenObj, message: 'Candidate document upload link generated successfully.' };
  }

  public revokeUploadToken(candidateId: string, actor: string, actorRole: UserRole): { success: boolean; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.uploadToken) {
      return { success: false, message: 'Active upload link not found.' };
    }

    candidate.uploadToken.revoked = true;
    candidate.uploadToken.isRevoked = true;
    candidate.uploadToken.revokedAt = new Date().toISOString();
    candidate.updatedAt = new Date().toISOString();
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Upload Link Revoked',
      'Candidate',
      candidate.id,
      candidate.fullName,
      'Revoked active document upload link.'
    );

    this.broadcast('UPLOAD_LINK_REVOKED', { candidateId: candidate.id });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, message: 'Upload link successfully revoked.' };
  }

  public getPublicCandidateByToken(token: string): {
    valid: boolean;
    error?: string;
    candidate?: {
      id: string;
      fullName: string;
      employeeCode: string;
      email: string;
      phone: string;
      department: string;
      designation: string;
      market: string;
      joiningDate: string;
      documents: Record<string, any>;
      tokenInfo: UploadToken;
    };
  } {
    const candidate = this.data.employees.find(e => e.uploadToken?.token === token);
    if (!candidate || !candidate.uploadToken) {
      return { valid: false, error: 'Invalid or non-existent upload link.' };
    }

    const t = candidate.uploadToken;
    if (t.revoked || t.isRevoked) {
      return { valid: false, error: 'This upload link has been revoked by the HR compliance team.' };
    }
    if (t.isOneTime !== false && t.isUsed) {
      return { valid: false, error: 'This one-time upload link has already been submitted and is now closed.' };
    }
    if (new Date() > new Date(t.expiresAt)) {
      return { valid: false, error: 'This upload link has expired. Please contact White Collar Realty HR to generate a fresh link.' };
    }

    // Return sanitized document list
    const docs = candidate.documents || {};
    const sanitizedDocs: Record<string, any> = {};
    Object.entries(docs).forEach(([key, d]) => {
      sanitizedDocs[key] = {
        key: d.key,
        title: d.title,
        category: d.category,
        status: d.status,
        required: d.required,
        fileName: d.fileName,
        fileSize: d.fileSize,
        uploadedAt: d.uploadedAt,
        mimeType: d.mimeType,
        hasFile: Boolean(d.fileName && (d.fileData || d.storagePath)),
      };
    });

    return {
      valid: true,
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        employeeCode: candidate.employeeCode,
        email: candidate.email,
        phone: candidate.phone,
        department: candidate.department,
        designation: candidate.designation,
        market: candidate.market,
        joiningDate: candidate.joiningDate,
        documents: sanitizedDocs,
        tokenInfo: t,
      },
    };
  }

  public submitCandidateUpload(
    token: string,
    uploadedDocs: Record<string, { fileName: string; fileSize?: string; fileData: string; mimeType: string; reviewNotes?: string }>
  ): { success: boolean; message: string; candidate?: Employee } {
    const candidate = this.data.employees.find(e => e.uploadToken?.token === token);
    if (!candidate || !candidate.uploadToken) {
      return { success: false, message: 'Invalid upload link.' };
    }

    const t = candidate.uploadToken;
    if (t.revoked || t.isRevoked) {
      return { success: false, message: 'This upload link has been revoked.' };
    }
    if (t.isOneTime !== false && t.isUsed) {
      return { success: false, message: 'This one-time link has already been submitted.' };
    }
    if (new Date() > new Date(t.expiresAt)) {
      return { success: false, message: 'This upload link has expired.' };
    }

    if (!candidate.documents) {
      candidate.documents = getDefaultDocumentChecklist(candidate.market === 'Dubai' || candidate.market === 'Dual Market');
    }

    let filesCount = 0;
    const nowIso = new Date().toISOString();

    for (const [key, item] of Object.entries(uploadedDocs)) {
      if (!item.fileData) continue;
      filesCount++;
      if (!candidate.documents[key]) {
        candidate.documents[key] = {
          key,
          title: key.replace(/_/g, ' ').toUpperCase(),
          category: 'Identity',
          status: 'Submitted',
          required: true,
        };
      }

      // Persist raw file to secure disk storage
      let savedPath: string | undefined = undefined;
      try {
        savedPath = this.saveSecureFile(candidate.id, key, item.fileName || `${key}.pdf`, item.fileData);
      } catch (err) {
        console.error(`[DB] Error writing upload to disk for candidate ${candidate.id}:`, err);
      }

      candidate.documents[key].status = 'Submitted';
      candidate.documents[key].fileName = item.fileName;
      candidate.documents[key].fileSize = item.fileSize || '1.0 MB';
      candidate.documents[key].fileData = item.fileData;
      candidate.documents[key].mimeType = item.mimeType;
      candidate.documents[key].uploadedAt = nowIso;
      if (savedPath) {
        candidate.documents[key].storagePath = savedPath;
      }
      if (item.reviewNotes) {
        candidate.documents[key].reviewNotes = item.reviewNotes;
      }
    }

    if (t.isOneTime !== false) {
      t.isUsed = true;
      t.usedAt = nowIso;
    }
    t.submissionCount = (t.submissionCount || 0) + 1;

    candidate.updatedAt = nowIso;
    candidate.profileCompletion = calculateCompletion(candidate);
    this.persist();

    this.logAudit(
      'Candidate Portal',
      'HR_MANAGER',
      'Candidate Documents Uploaded via Secure Link',
      'Candidate',
      candidate.id,
      candidate.fullName,
      `Submitted ${filesCount} genuine documents via secure link.${t.isOneTime !== false ? ' Link is now closed.' : ' Multi-use link remains active.'}`
    );

    const payload = {
      candidateId: candidate.id,
      fullName: candidate.fullName,
      filesCount,
      profileCompletion: candidate.profileCompletion,
      documents: candidate.documents,
      tokenInfo: t,
      employee: candidate,
    };

    this.broadcast('CANDIDATE_DOCUMENTS_SUBMITTED', payload);
    this.broadcast('UPLOAD_SUBMITTED', payload);
    this.broadcast('ALERT_UPDATED', { candidateId: candidate.id });
    this.broadcast('EMPLOYEE_UPDATED', candidate);

    return {
      success: true,
      message: t.isOneTime !== false
        ? 'Documents successfully submitted. Your secure one-time link is now closed.'
        : 'Documents successfully submitted and updated.',
      candidate,
    };
  }

  // --- End-to-End HR Lifecycle Methods ---
  public addLifecycleEvent(
    emp: Employee,
    stage: LifecycleStage,
    title: string,
    description: string,
    actor: string,
    actorRole: UserRole,
    metadata?: Record<string, unknown>
  ) {
    if (!emp.lifecycleHistory) {
      emp.lifecycleHistory = [];
    }
    const entry: LifecycleHistoryEntry = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      stage,
      title,
      description,
      actor,
      actorRole,
      metadata,
    };
    emp.lifecycleHistory.unshift(entry);
    emp.lifecycleStage = stage;
    emp.updatedAt = new Date().toISOString();
    this.logAudit(actor, actorRole, title, 'Lifecycle', emp.id, emp.fullName, description);
    this.broadcast('LIFECYCLE_EVENT_ADDED', { employeeId: emp.id, event: entry, employee: emp });
  }

  // 1. Interview Pipeline
  public addInterviewRound(
    candidateId: string,
    data: Partial<InterviewRound>,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) return { success: false, message: 'Candidate not found.' };

    if (!candidate.interviews) candidate.interviews = [];
    const roundNumber = candidate.interviews.length + 1;
    const newRound: InterviewRound = {
      id: `rnd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      roundNumber,
      roundName: data.roundName || `Round ${roundNumber} - Assessment`,
      interviewer: data.interviewer || actor,
      interviewerEmail: data.interviewerEmail || '',
      scheduledDate: data.scheduledDate || new Date().toISOString().split('T')[0],
      scheduledTime: data.scheduledTime || '11:00 AM',
      mode: data.mode || 'Google Meet',
      meetingLink: data.meetingLink || '',
      status: data.status || 'Scheduled',
      rating: data.rating,
      scores: data.scores,
      feedback: data.feedback,
      recommendation: data.recommendation,
    };

    candidate.interviews.push(newRound);
    this.addLifecycleEvent(
      candidate,
      'Interview',
      `Interview Scheduled: ${newRound.roundName}`,
      `Round ${roundNumber} scheduled with ${newRound.interviewer} on ${newRound.scheduledDate} at ${newRound.scheduledTime} (${newRound.mode}).`,
      actor,
      actorRole
    );
    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, message: 'Interview round scheduled successfully.' };
  }

  public updateInterviewRound(
    candidateId: string,
    roundId: string,
    updates: Partial<InterviewRound>,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.interviews) return { success: false, message: 'Candidate or interview round not found.' };

    const roundIndex = candidate.interviews.findIndex(r => r.id === roundId);
    if (roundIndex === -1) return { success: false, message: 'Round not found.' };

    const current = candidate.interviews[roundIndex];
    const updatedRound = { ...current, ...updates };
    if (updates.status === 'Completed' && !updatedRound.completedAt) {
      updatedRound.completedAt = new Date().toISOString();
    }
    candidate.interviews[roundIndex] = updatedRound;

    if (updatedRound.status === 'Completed' && (updatedRound.recommendation === 'Strong Hire' || updatedRound.recommendation === 'Hire')) {
      candidate.candidateStatus = 'Interviewing';
      this.addLifecycleEvent(
        candidate,
        'Selected',
        `Interview Completed: ${updatedRound.roundName} (Recommended for Hire)`,
        `Evaluated by ${updatedRound.interviewer}. Score: ${updatedRound.rating || 'N/A'}/5. Feedback: ${updatedRound.feedback || 'Recommended for offer.'}`,
        actor,
        actorRole
      );
    } else {
      this.logAudit(
        actor,
        actorRole,
        `Interview Updated: ${updatedRound.roundName}`,
        'Candidate',
        candidate.id,
        candidate.fullName,
        `Status: ${updatedRound.status}. Rating: ${updatedRound.rating || 'N/A'}/5. Feedback: ${updatedRound.feedback || 'None'}.`
      );
    }

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, message: 'Interview round updated successfully.' };
  }

  public deleteInterviewRound(
    candidateId: string,
    roundId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.interviews) return { success: false, message: 'Candidate or round not found.' };

    candidate.interviews = candidate.interviews.filter(r => r.id !== roundId);
    this.logAudit(actor, actorRole, 'Interview Round Cancelled', 'Candidate', candidate.id, candidate.fullName, `Removed interview round ${roundId}.`);
    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, message: 'Interview round removed.' };
  }

  // 2. Offer Letter Generation & Management
  public generateOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole,
    customOverrides?: Partial<OfferLetterData>
  ): { success: boolean; candidate?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) return { success: false, message: 'Candidate not found.' };

    const offerLetter = buildOfferLetterData(candidate, customOverrides);
    candidate.offerLetter = offerLetter;
    if (customOverrides?.salaryBreakup?.annualCtc) {
      candidate.offeredCTC = `${(customOverrides.salaryBreakup.annualCtc / 100000).toFixed(1)} LPA`;
    }

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Executive Offer Letter Prepared: Ref ${offerLetter.refNo}`,
      `Prepared offer letter for ${offerLetter.designation} (${offerLetter.department}) with Annual CTC of ${offerLetter.salaryBreakup.currency} ${offerLetter.salaryBreakup.annualCtc.toLocaleString()}. Status: ${offerLetter.status}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, offerLetter, message: 'Offer letter generated successfully.' };
  }

  public approveOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Approved';
    candidate.offerLetter.approvedBy = actor;
    candidate.offerLetter.approvedAt = new Date().toISOString();

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Offer Letter Approved by HR Leadership`,
      `Offer Ref ${candidate.offerLetter.refNo} officially approved by ${actor} (${actorRole}). Ready for issuance to candidate.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, offerLetter: candidate.offerLetter, message: 'Offer letter approved successfully.' };
  }

  public issueOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Issued';
    candidate.offerLetter.issuedAt = new Date().toISOString();
    candidate.candidateStatus = 'Offer Extended';

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Offer Letter Issued to Candidate`,
      `Official White Collar Realty offer letter dispatched to ${candidate.email}. Candidate acceptance deadline: ${candidate.offerLetter.validTillDate}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, offerLetter: candidate.offerLetter, message: 'Offer letter issued to candidate.' };
  }

  public acceptOfferLetter(
    candidateId: string,
    signatureName: string,
    actor = 'Candidate Portal',
    actorRole: UserRole = 'HR_MANAGER'
  ): { success: boolean; candidate?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Accepted';
    candidate.offerLetter.acceptedAt = new Date().toISOString();
    candidate.offerLetter.candidateSignatureName = signatureName || candidate.fullName;
    candidate.offerLetter.signedAt = new Date().toISOString();
    candidate.candidateStatus = 'Offer Accepted';

    this.addLifecycleEvent(
      candidate,
      'Offer Accepted',
      `Offer Formally Accepted by ${candidate.fullName}`,
      `Candidate confirmed acceptance of offer Ref ${candidate.offerLetter.refNo}. Target joining date: ${candidate.joiningDate || candidate.offerLetter.joiningDate}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, offerLetter: candidate.offerLetter, message: 'Offer accepted successfully.' };
  }

  public emailOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; message: string; error?: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) {
      return { success: false, message: 'Candidate or offer letter not found.', error: 'Candidate or offer letter not found.' };
    }

    // STRICT REQUIREMENT: HR must approve it before emailing the offer letter to the candidate
    if (candidate.offerLetter.status !== 'Approved' && candidate.offerLetter.status !== 'Issued' && candidate.offerLetter.status !== 'Accepted') {
      return {
        success: false,
        message: 'Compliance check failed: The offer letter must be formally approved by HR Admin before emailing the candidate.',
        error: 'The offer letter must be formally approved by HR Admin before emailing the candidate.',
      };
    }

    const now = new Date().toISOString();
    candidate.offerLetter.status = candidate.offerLetter.status === 'Accepted' ? 'Accepted' : 'Issued';
    candidate.offerLetter.issuedAt = candidate.offerLetter.issuedAt || now;
    candidate.offerLetter.emailSentAt = now;
    candidate.offerLetter.emailSentBy = actor;
    candidate.candidateStatus = candidate.candidateStatus === 'Offer Accepted' ? 'Offer Accepted' : 'Offer Extended';
    candidate.updatedAt = now;

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Official Offer Letter Dispatched to ${candidate.email}`,
      `Executive 10-page offer letter (Ref: ${candidate.offerLetter.refNo}, CTC: ${candidate.offerLetter.ctcLpaFormatted || candidate.offeredCTC}) emailed by ${actor} (${actorRole}). Candidate notified for e-signature.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return {
      success: true,
      candidate,
      message: `Official 10-page offer letter successfully emailed to ${candidate.fullName} at ${candidate.email}.`,
    };
  }

  public getMissingRequiredDocuments(candidateId: string): {
    candidate: Employee | null;
    missingDocs: DocumentRecord[];
    missingCount: number;
    allDocsCount: number;
    isOverdue: boolean;
    deadline?: string;
  } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) {
      return { candidate: null, missingDocs: [], missingCount: 0, allDocsCount: 0, isOverdue: false };
    }

    const docs = candidate.documents || {};
    const missingDocs: DocumentRecord[] = [];
    let allDocsCount = 0;

    Object.values(docs).forEach(d => {
      allDocsCount++;
      if (d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')) {
        missingDocs.push(d);
      }
    });

    const isOverdue = Boolean(
      candidate.reminderDeadline &&
      new Date(candidate.reminderDeadline).getTime() < Date.now() &&
      missingDocs.length > 0
    );

    return {
      candidate,
      missingDocs,
      missingCount: missingDocs.length,
      allDocsCount,
      isOverdue,
      deadline: candidate.reminderDeadline,
    };
  }

  public recordDocumentReminder(
    candidateId: string,
    payload: {
      channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
      missingDocumentKeys?: string[];
      deadlineHours?: number;
      messageBody?: string;
      emailSubject?: string;
      recipientEmail?: string;
      recipientPhone?: string;
    },
    actor: string,
    actorRole: UserRole
  ): {
    success: boolean;
    candidate?: Employee;
    reminder?: DocumentReminderRecord;
    whatsappUrl?: string;
    mailtoUrl?: string;
    uploadUrl: string;
    message: string;
  } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) return { success: false, uploadUrl: '', message: 'Candidate not found.' };

    let token = candidate.uploadToken?.token;
    if (!candidate.uploadToken || candidate.uploadToken.revoked || candidate.uploadToken.isUsed) {
      const generated = this.generateUploadToken(candidate.id, actor, actorRole, { expiryDays: 7, isOneTime: false });
      token = generated.token?.token;
    }

    const host = process.env.PUBLIC_APP_URL || '';
    const uploadUrl = token ? `/upload-portal/${token}` : '';
    const fullUploadUrl = token ? `${host ? host : ''}/upload-portal/${token}` : '';

    const missingDocs = Object.values(candidate.documents || {}).filter(
      d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
    );
    const missingTitles = missingDocs.map(d => d.title);
    const missingKeys = missingDocs.map(d => d.key);

    const deadlineHours = payload.deadlineHours || 24;
    const deadlineDate = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
    const deadlineIso = deadlineDate.toISOString();

    const recipientPhone = payload.recipientPhone || candidate.phone;
    const recipientEmail = payload.recipientEmail || candidate.email;

    const missingListStr = missingTitles.map((t, idx) => `${idx + 1}. ${t}`).join('\n');
    const defaultSubject = `Action Required: Missing Onboarding Documents - White Collar Realty (${candidate.fullName})`;
    const defaultBody =
      `Dear ${candidate.fullName},\n\n` +
      `Congratulations on your offer with White Collar Realty as ${candidate.designation} (${candidate.department}).\n\n` +
      `Our HR compliance team has reviewed your pre-onboarding dossier and noticed that the following mandatory documents are still pending submission:\n\n` +
      `${missingListStr}\n\n` +
      `Please upload clear scanned copies within 24 hours via your secure upload link:\n` +
      `${fullUploadUrl || uploadUrl}\n\n` +
      `Submission Deadline: ${deadlineDate.toLocaleString()}\n\n` +
      `For any questions, reach out to White Collar Realty HR at hr@whitecollarrealty.com or +91 124-4349007.\n\n` +
      `Warm regards,\n` +
      `${actor}\nHuman Resources Recruiter\nWhite Collar Realty`;

    const finalMessage = payload.messageBody || defaultBody;
    const finalSubject = payload.emailSubject || defaultSubject;

    const reminderId = `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const reminderRecord: DocumentReminderRecord = {
      id: reminderId,
      sentAt: new Date().toISOString(),
      sentBy: actor,
      sentByRole: actorRole,
      channel: payload.channel,
      recipientEmail,
      recipientPhone,
      missingDocumentKeys: payload.missingDocumentKeys || missingKeys,
      missingDocumentTitles: missingTitles,
      deadline: deadlineIso,
      uploadLink: fullUploadUrl || uploadUrl,
      uploadToken: token || '',
      status: payload.channel === 'WHATSAPP' ? 'ACTION_INITIATED' : 'SENT',
      messageBody: finalMessage,
      emailSubject: finalSubject,
    };

    if (!candidate.documentReminders) candidate.documentReminders = [];
    candidate.documentReminders.unshift(reminderRecord);
    candidate.lastReminderSentAt = reminderRecord.sentAt;
    candidate.lastReminderChannel = payload.channel;
    candidate.reminderDeadline = deadlineIso;
    candidate.isOverdueForDocuments = false;
    candidate.updatedAt = new Date().toISOString();

    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const intlPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${intlPhone}&text=${encodeURIComponent(finalMessage)}`;
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalMessage)}`;

    this.logAudit(
      actor,
      actorRole,
      `Document Reminder Dispatched (${payload.channel})`,
      'Candidate',
      candidate.id,
      candidate.fullName,
      `Sent 24-hour reminder for ${missingTitles.length} missing document(s) to ${recipientPhone} / ${recipientEmail}. Deadline: ${deadlineDate.toLocaleString()}.`
    );

    this.persist();
    this.broadcast('REMINDER_SENT', { candidateId: candidate.id, reminder: reminderRecord, candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    this.broadcast('ALERT_UPDATED', { candidateId: candidate.id });

    return {
      success: true,
      candidate,
      reminder: reminderRecord,
      whatsappUrl,
      mailtoUrl,
      uploadUrl: fullUploadUrl || uploadUrl,
      message: `24-hour reminder successfully recorded and dispatched via ${payload.channel}.`,
    };
  }

  // 3. Probation Reviews & Confirmation
  public recordProbationReview(
    employeeId: string,
    reviewData: Partial<ProbationReview>,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    if (!emp.probation) {
      const joinDt = new Date(emp.joiningDate || new Date().toISOString().split('T')[0]);
      const endDt = new Date(joinDt);
      endDt.setMonth(endDt.getMonth() + 3);
      emp.probation = {
        startDate: emp.joiningDate || joinDt.toISOString().split('T')[0],
        endDate: endDt.toISOString().split('T')[0],
        durationMonths: 3,
        status: 'In Probation',
        reviews: [],
      };
    }

    const review: ProbationReview = {
      id: `prb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      reviewDate: reviewData.reviewDate || new Date().toISOString().split('T')[0],
      reviewer: reviewData.reviewer || actor,
      reviewerRole: reviewData.reviewerRole || actorRole,
      milestone: reviewData.milestone || '60-Day Midterm',
      kpiScore: reviewData.kpiScore || 85,
      attendanceRating: reviewData.attendanceRating || 'Good',
      salesOrTargetAchievement: reviewData.salesOrTargetAchievement || 'Met monthly target metrics.',
      strengths: reviewData.strengths || 'Professional customer handling and active client follow-up.',
      areasOfImprovement: reviewData.areasOfImprovement || 'Continue developing deeper product knowledge.',
      recommendation: reviewData.recommendation || 'Confirm',
    };

    emp.probation.reviews.push(review);
    this.addLifecycleEvent(
      emp,
      'Probation',
      `Probation Milestone Review: ${review.milestone}`,
      `Evaluated by ${review.reviewer}. Score: ${review.kpiScore}/100. Recommendation: ${review.recommendation}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: 'Probation review recorded.' };
  }

  public confirmProbation(
    employeeId: string,
    actor: string,
    actorRole: UserRole,
    confirmationLetterRef?: string
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    const ref = confirmationLetterRef || `WCR/HR/CONF/${new Date().getFullYear()}/${emp.employeeCode}`;
    const confirmedDate = new Date().toISOString().split('T')[0];

    if (!emp.probation) {
      emp.probation = {
        startDate: emp.joiningDate,
        endDate: confirmedDate,
        durationMonths: 3,
        status: 'Confirmed',
        reviews: [],
      };
    }

    emp.probation.status = 'Confirmed';
    emp.probation.confirmedDate = confirmedDate;
    emp.probation.confirmedBy = actor;
    emp.probation.confirmationLetterRef = ref;
    emp.employmentStatus = 'Full-Time';

    this.addLifecycleEvent(
      emp,
      'Confirmed',
      `Employment Formally Confirmed (Letter Ref: ${ref})`,
      `Successfully completed probation. Regularized as permanent Full-Time employee by ${actor}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: 'Employee probation confirmed.' };
  }

  public extendProbation(
    employeeId: string,
    extensionMonths: number,
    reason: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    if (!emp.probation) {
      emp.probation = {
        startDate: emp.joiningDate,
        endDate: new Date().toISOString().split('T')[0],
        durationMonths: 3,
        status: 'In Probation',
        reviews: [],
      };
    }

    const currentEnd = new Date(emp.probation.endDate);
    currentEnd.setMonth(currentEnd.getMonth() + extensionMonths);

    emp.probation.endDate = currentEnd.toISOString().split('T')[0];
    emp.probation.status = 'Extended';
    emp.probation.extensionMonths = extensionMonths;
    emp.probation.extensionReason = reason;

    this.addLifecycleEvent(
      emp,
      'Probation',
      `Probation Extended by ${extensionMonths} Month(s)`,
      `New probation end date: ${emp.probation.endDate}. Reason: ${reason}`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: `Probation extended by ${extensionMonths} month(s).` };
  }

  // 4. Exit, Clearances & FnF Settlement
  public initiateExit(
    employeeId: string,
    data: {
      resignationDate: string;
      reasonForExit: string;
      detailedReason?: string;
      exitType?: ExitClearanceRecord['exitType'];
      noticePeriodDays?: number;
      handoverToEmployeeId?: string;
      handoverNotes?: string;
    },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    const resignationDate = data.resignationDate || new Date().toISOString().split('T')[0];
    const noticePeriodDays = data.noticePeriodDays || (emp.employmentStatus === 'Probation' ? 30 : 60);

    const resDt = new Date(resignationDate);
    const lwdDt = new Date(resDt);
    lwdDt.setDate(lwdDt.getDate() + noticePeriodDays);
    const calculatedLwd = lwdDt.toISOString().split('T')[0];

    let handoverToName = '';
    if (data.handoverToEmployeeId) {
      const colleague = this.data.employees.find(e => e.id === data.handoverToEmployeeId);
      handoverToName = colleague ? colleague.fullName : data.handoverToEmployeeId;
    }

    emp.employmentStatus = 'Notice Period';
    emp.exitClearance = {
      resignationDate,
      resignationSubmittedDate: new Date().toISOString().split('T')[0],
      exitType: data.exitType || 'Voluntary Resignation',
      reasonForExit: data.reasonForExit || 'Career Growth',
      detailedReason: data.detailedReason || '',
      noticePeriodDays,
      calculatedLwd,
      actualLwd: calculatedLwd,
      shortfallNoticeDays: 0,
      handoverToEmployeeId: data.handoverToEmployeeId,
      handoverToName,
      handoverNotes: data.handoverNotes || '',
      handoverCompleted: false,
      departments: {
        itClearance: {
          status: 'Pending',
          emailRevoked: false,
          crmAccessRevoked: false,
          hardwareReturned: false,
        },
        hrClearance: {
          status: 'Pending',
          idCardReturned: false,
          exitInterviewCompleted: false,
        },
        financeClearance: {
          status: 'Pending',
          claimsSettled: false,
          salaryAdvancesRecovered: false,
        },
        deptHeadClearance: {
          status: 'Pending',
          clientPipelineHandedOver: false,
          knowledgeTransferDone: false,
        },
      },
      overallStatus: 'Initiated',
    };

    emp.fnfSettlement = calculateFullAndFinalSettlement(emp, { lastWorkingDay: calculatedLwd });

    this.addLifecycleEvent(
      emp,
      'Notice Period',
      `Exit Initiated: ${emp.exitClearance.exitType}`,
      `Resignation recorded on ${resignationDate}. Notice period: ${noticePeriodDays} days. Calculated Last Working Day: ${calculatedLwd}. Handover to: ${handoverToName || 'Pending'}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: 'Exit process initiated successfully.' };
  }

  public updateExitClearance(
    employeeId: string,
    deptKey: 'itClearance' | 'hrClearance' | 'financeClearance' | 'deptHeadClearance',
    updates: any,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp || !emp.exitClearance) return { success: false, message: 'Exit clearance not found.' };

    const dept = emp.exitClearance.departments[deptKey];
    Object.assign(dept, updates);
    dept.approver = actor;
    dept.approvedAt = new Date().toISOString();

    const depts = emp.exitClearance.departments;
    const allApproved =
      depts.itClearance.status === 'Approved' &&
      depts.hrClearance.status === 'Approved' &&
      depts.financeClearance.status === 'Approved' &&
      depts.deptHeadClearance.status === 'Approved';

    if (allApproved) {
      emp.exitClearance.overallStatus = 'Clearances Complete';
      emp.lifecycleStage = 'Exit Clearance';
    } else {
      emp.exitClearance.overallStatus = 'In Progress';
    }

    const deptName =
      deptKey === 'itClearance' ? 'IT & Systems' :
      deptKey === 'hrClearance' ? 'Human Resources' :
      deptKey === 'financeClearance' ? 'Finance & Accounts' : 'Department Head';

    this.logAudit(
      actor,
      actorRole,
      `Exit Clearance Signed: ${deptName}`,
      'ExitClearance',
      emp.id,
      emp.fullName,
      `Department clearance status updated to '${dept.status}'. Approver: ${actor}. Notes: ${dept.notes || 'None'}.`
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: `${deptName} clearance updated.` };
  }

  public calculateFnF(
    employeeId: string,
    overrides?: Partial<FullAndFinalSettlement>
  ): { success: boolean; fnfSettlement?: FullAndFinalSettlement; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Employee not found.' };

    const fnf = calculateFullAndFinalSettlement(emp, overrides);
    emp.fnfSettlement = fnf;
    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, fnfSettlement: fnf, employee: emp, message: 'Full & Final settlement calculated.' };
  }

  public finalizeFnFSettlement(
    employeeId: string,
    paymentData: {
      paymentReference?: string;
      paymentMode?: 'NEFT' | 'Bank Wire' | 'Cheque';
      remarks?: string;
    },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp || !emp.fnfSettlement) return { success: false, message: 'Employee or FnF settlement record not found.' };

    emp.fnfSettlement.status = 'Paid';
    emp.fnfSettlement.paymentReference = paymentData.paymentReference || `UTR-${Date.now().toString().slice(-8)}`;
    emp.fnfSettlement.paymentMode = paymentData.paymentMode || 'NEFT';
    emp.fnfSettlement.paymentDate = new Date().toISOString().split('T')[0];
    emp.fnfSettlement.approvedByFinance = actor;
    emp.fnfSettlement.approvedAt = new Date().toISOString();
    if (paymentData.remarks) emp.fnfSettlement.remarks = paymentData.remarks;

    emp.employmentStatus = 'Ex-Employee';
    emp.isCandidate = false;
    if (emp.exitClearance) emp.exitClearance.overallStatus = 'Settled';

    if (emp.desk) {
      this.releaseDesk(emp.desk, actor, actorRole);
      emp.desk = '';
    }

    this.addLifecycleEvent(
      emp,
      'FnF Settled',
      `Full & Final Settlement Disbursed (${emp.fnfSettlement.currency} ${emp.fnfSettlement.netSettlementAmount.toLocaleString()})`,
      `Final settlement executed via ${emp.fnfSettlement.paymentMode} (Ref: ${emp.fnfSettlement.paymentReference}) by ${actor}. Account closed and experience letter cleared.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: 'Full & Final settlement disbursed and account closed.' };
  }

  // --- Master Single-Sheet Excel Generator (Requirement 5) ---
  public generateSingleSheetExportData(role: UserRole): Array<Record<string, unknown>> {
    const all = this.getEmployees(role);
    const sorted = [...all].sort((a, b) => a.fullName.localeCompare(b.fullName));

    return sorted.map(p => {
      const isViewer = role === 'DEPT_HEAD_VIEWER';
      
      const assignedAssets = this.data.assets.filter(a => a.assignedEmployeeId === p.id && a.status === 'In Use');
      const activeAssetList = assignedAssets
        .map(a => `${a.assetTag}: ${a.name} (S/N: ${a.serialNumber || 'N/A'}, Cond: ${a.condition})`)
        .join('; ');

      const docs = Object.values(p.documents || {});
      const totalDocs = docs.length;
      const verifiedDocs = docs.filter(d => d.status === 'Verified').length;
      const submittedDocs = docs.filter(d => d.status === 'Submitted').length;
      const missingDocs = docs.filter(d => d.status === 'Missing' || d.status === 'Not Submitted').length;

      let uploadLinkStatus = 'Not Generated';
      if (p.uploadToken) {
        if (p.uploadToken.revoked) uploadLinkStatus = 'Revoked';
        else if (p.uploadToken.isUsed) uploadLinkStatus = `Submitted & Expired (${new Date(p.uploadToken.usedAt || '').toLocaleDateString()})`;
        else if (new Date() > new Date(p.uploadToken.expiresAt)) uploadLinkStatus = 'Expired';
        else uploadLinkStatus = 'Active - Pending Candidate Upload';
      }

      return {
        'Full Name': p.fullName,
        'Person Classification': p.isCandidate ? 'Candidate / Upcoming Joiner' : 'Active Employee',
        'Employee / Candidate Code': p.employeeCode || '',
        'Employment Status': p.employmentStatus || '',
        'Candidate Onboarding Status': p.isCandidate ? (p.candidateStatus || 'Offer Accepted') : '',
        'Department': p.department || '',
        'Designation': p.designation || '',
        'Reporting Manager': p.reportingManager || '',
        'Designated Desk': p.desk || '',
        'Spreadsheet Seat Notation': p.sourceSpreadsheetSeat || '',
        'Official Email': p.email || '',
        'Contact Phone': p.phone || '',
        'Alternate Phone': p.alternatePhone || '',
        'Date of Birth': p.dateOfBirth || '',
        'Gender': p.gender || '',
        'Nationality': p.nationality || '',
        'Current Residential Address': p.currentAddress || '',
        'Permanent Address': p.permanentAddress || '',
        'Emergency Contact Name': p.emergencyContact?.name || '',
        'Emergency Contact Relation': p.emergencyContact?.relation || '',
        'Emergency Contact Phone': p.emergencyContact?.phone || '',
        'Joining Date': p.joiningDate || '',
        'Internship Completion Date': p.internshipCompletionDate || '',
        'Market Operational Focus': p.market || '',
        'Previous Company': p.previousCompany || '',
        'Previous Designation': p.previousDesignation || '',
        'Previous CTC': isViewer ? '••••••••' : (p.previousCTC || ''),
        'Current Offered CTC': isViewer ? '••••••••' : (p.offeredCTC || ''),
        'Total Experience (Years)': p.totalExperienceYears !== undefined ? p.totalExperienceYears : '',
        'Total Experience (Months)': p.totalExperienceMonths !== undefined ? p.totalExperienceMonths : '',
        'Gurgaon Market Experience': p.gurgaonMarketExperience || '',
        'Dubai Market Experience': p.dubaiMarketExperience || '',
        'Highest Qualification': p.education && p.education[0] ? p.education[0].degree : '',
        'Education Institution': p.education && p.education[0] ? p.education[0].institution : '',
        'Aadhaar Number': isViewer ? '••••••••••••' : (p.identityDetails?.aadhaarNo || ''),
        'PAN Card Number': isViewer ? '••••••••••' : (p.identityDetails?.panNo || ''),
        'Bank Name': p.bankDetails?.bankName || '',
        'Bank Account Number': isViewer ? '••••••••••••' : (p.bankDetails?.accountNo || ''),
        'Bank IFSC Code': p.bankDetails?.ifscCode || '',
        'Google Drive Archive Link': isViewer ? '' : (p.googleDriveLink || ''),
        'Active Issued Assets Count': assignedAssets.length,
        'Active Assets Assigned': activeAssetList || '',
        'Total Documents Required': docs.filter(d => d.required).length,
        'Verified Documents Count': verifiedDocs,
        'Submitted Documents Count': submittedDocs,
        'Missing / Pending Documents Count': missingDocs,
        'Aadhaar Card Status': p.documents?.aadhaar_card?.status || '',
        'PAN Card Status': p.documents?.pan_card?.status || '',
        '10th Marksheet Status': p.documents?.edu_10th?.status || '',
        '12th Marksheet Status': p.documents?.edu_12th?.status || '',
        'Graduation Marksheet Status': p.documents?.edu_graduation?.status || '',
        'Previous Relieving Letter Status': p.documents?.prev_relieving?.status || '',
        'Salary Slips Status': p.documents?.salary_slips?.status || '',
        'Passport Status': p.documents?.passport?.status || '',
        'One-Time Upload Link Status': uploadLinkStatus,
        'Profile Completion %': p.profileCompletion || 0,
        'Record Created At': p.createdAt || '',
        'Last Updated At': p.updatedAt || '',
      };
    });
  }

  // --- Desk Management ---
  public getDesks(): DeskSlot[] {
    const slots: DeskSlot[] = ALL_DESK_CODES.map(code => {
      const bay = getBayFromDesk(code);
      const occupant = this.data.employees.find(e => e.desk === code);

      if (!occupant) {
        return {
          code,
          bay,
          status: 'Available',
          assignedEmployeeId: null,
          assignedEmployeeName: null,
          assignedEmployeeCode: null,
          assignedEmployeeDepartment: null,
          assignedEmployeeDesignation: null,
          sourceSeatNotation: null,
          isUpcoming: false,
        };
      }

      return {
        code,
        bay,
        status: occupant.isCandidate ? 'Reserved' : 'Occupied',
        assignedEmployeeId: occupant.id,
        assignedEmployeeName: occupant.fullName,
        assignedEmployeeCode: occupant.employeeCode,
        assignedEmployeeDepartment: occupant.department,
        assignedEmployeeDesignation: occupant.designation,
        sourceSeatNotation: occupant.sourceSpreadsheetSeat || null,
        isUpcoming: occupant.isCandidate,
      };
    });

    return slots;
  }

  private clearDeskAssignment(deskCode: string, exceptEmployeeId?: string) {
    this.data.employees.forEach(e => {
      if (e.desk === deskCode && e.id !== exceptEmployeeId) {
        e.desk = '';
        e.updatedAt = new Date().toISOString();
      }
    });
  }

  public assignDesk(deskCode: string, employeeId: string, actor: string, actorRole: UserRole): { success: boolean; message: string } {
    if (!ALL_DESK_CODES.includes(deskCode)) {
      return { success: false, message: `Invalid desk code '${deskCode}'. Allowed desks are A1-A5, B1-B5, C1-C3, D1-D4, E1-E5, F1-F5, G1-G5, H1-H5.` };
    }

    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) {
      return { success: false, message: `Employee or Candidate not found.` };
    }

    const previousDesk = emp.desk;
    const currentOccupant = this.data.employees.find(e => e.desk === deskCode && e.id !== employeeId);
    if (currentOccupant) {
      currentOccupant.desk = '';
      currentOccupant.updatedAt = new Date().toISOString();
      this.logAudit(
        actor,
        actorRole,
        'Desk Reassigned',
        'Desk',
        deskCode,
        deskCode,
        `Released previous occupant ${currentOccupant.fullName} to assign to ${emp.fullName}.`
      );
    }

    emp.desk = deskCode;
    emp.updatedAt = new Date().toISOString();
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Desk Allocated',
      'Desk',
      deskCode,
      deskCode,
      `Allocated Desk ${deskCode} to ${emp.fullName} (${emp.employeeCode}). Previous desk: ${previousDesk || 'None'}.`
    );

    this.broadcast('DESK_ALLOCATION_CHANGED', { deskCode, employeeId: emp.id, previousDesk });
    return { success: true, message: `Desk ${deskCode} allocated to ${emp.fullName}.` };
  }

  public releaseDesk(deskCode: string, actor: string, actorRole: UserRole): { success: boolean; message: string } {
    const occupant = this.data.employees.find(e => e.desk === deskCode);
    if (!occupant) {
      return { success: false, message: `Desk ${deskCode} is already available.` };
    }

    occupant.desk = '';
    occupant.updatedAt = new Date().toISOString();
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Desk Released',
      'Desk',
      deskCode,
      deskCode,
      `Released Desk ${deskCode} formerly held by ${occupant.fullName} (${occupant.employeeCode}).`
    );

    this.broadcast('DESK_ALLOCATION_CHANGED', { deskCode, releasedEmployeeId: occupant.id });
    return { success: true, message: `Desk ${deskCode} has been released.` };
  }

  // --- Company Assets & Inventory ---
  public getAssets(): CompanyAsset[] {
    return this.data.assets;
  }

  public getAssetById(id: string): CompanyAsset | null {
    return this.data.assets.find(a => a.id === id) || null;
  }

  public createAsset(assetData: Partial<CompanyAsset>, actor: string, actorRole: UserRole): CompanyAsset {
    const id = `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const tag = assetData.assetTag || `AST-${Date.now().toString().slice(-4)}`;

    let empName = null;
    let empCode = null;
    if (assetData.assignedEmployeeId) {
      const emp = this.data.employees.find(e => e.id === assetData.assignedEmployeeId);
      if (emp) {
        empName = emp.fullName;
        empCode = emp.employeeCode;
      }
    }

    const newAsset: CompanyAsset = {
      id,
      assetTag: tag,
      name: assetData.name || 'New Company Asset',
      type: assetData.type || 'Other',
      serialNumber: assetData.serialNumber,
      assignedEmployeeId: assetData.assignedEmployeeId || null,
      assignedEmployeeName: empName,
      assignedEmployeeCode: empCode,
      issueDate: assetData.assignedEmployeeId ? (assetData.issueDate || new Date().toISOString().split('T')[0]) : undefined,
      returnDate: null,
      condition: assetData.condition || 'Brand New',
      status: assetData.assignedEmployeeId ? 'In Use' : 'Available',
      notes: assetData.notes,
      history: [
        {
          date: new Date().toISOString(),
          action: assetData.assignedEmployeeId ? 'Issued' : 'Condition Check',
          performedBy: actor,
          employeeName: empName || undefined,
          notes: assetData.assignedEmployeeId ? `Initial issuance to ${empName}` : 'Asset added to inventory',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.assets.push(newAsset);
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Created',
      'Asset',
      newAsset.id,
      newAsset.name,
      `Registered new asset [${newAsset.assetTag}] ${newAsset.name} (${newAsset.type}).`
    );

    this.broadcast('ASSET_CREATED', newAsset);
    return newAsset;
  }

  public updateAsset(id: string, updates: Partial<CompanyAsset>, actor: string, actorRole: UserRole): CompanyAsset | null {
    const asset = this.data.assets.find(a => a.id === id);
    if (!asset) return null;

    Object.assign(asset, updates);
    asset.updatedAt = new Date().toISOString();

    if (updates.assignedEmployeeId !== undefined) {
      if (updates.assignedEmployeeId) {
        const emp = this.data.employees.find(e => e.id === updates.assignedEmployeeId);
        asset.assignedEmployeeName = emp ? emp.fullName : null;
        asset.assignedEmployeeCode = emp ? emp.employeeCode : null;
      } else {
        asset.assignedEmployeeName = null;
        asset.assignedEmployeeCode = null;
      }
    }

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Updated',
      'Asset',
      asset.id,
      asset.name,
      `Updated asset details for [${asset.assetTag}] ${asset.name}.`
    );

    this.broadcast('ASSET_UPDATED', asset);
    return asset;
  }

  public issueAsset(
    assetId: string,
    employeeId: string,
    issueDate: string,
    notes: string,
    actor: string,
    actorRole: UserRole
  ): CompanyAsset | null {
    const asset = this.data.assets.find(a => a.id === assetId);
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!asset || !emp) return null;

    asset.assignedEmployeeId = emp.id;
    asset.assignedEmployeeName = emp.fullName;
    asset.assignedEmployeeCode = emp.employeeCode;
    asset.issueDate = issueDate || new Date().toISOString().split('T')[0];
    asset.returnDate = null;
    asset.status = 'In Use';
    asset.updatedAt = new Date().toISOString();

    asset.history.unshift({
      date: new Date().toISOString(),
      action: 'Issued',
      performedBy: actor,
      employeeName: emp.fullName,
      notes: notes || `Issued to ${emp.fullName} (${emp.employeeCode})`,
    });

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Issued',
      'Asset',
      asset.id,
      asset.name,
      `Issued [${asset.assetTag}] ${asset.name} to ${emp.fullName} (${emp.employeeCode}).`
    );

    this.broadcast('ASSET_UPDATED', asset);
    return asset;
  }

  public returnAsset(
    assetId: string,
    returnDate: string,
    condition: CompanyAsset['condition'],
    notes: string,
    actor: string,
    actorRole: UserRole
  ): CompanyAsset | null {
    const asset = this.data.assets.find(a => a.id === assetId);
    if (!asset) return null;

    const formerEmp = asset.assignedEmployeeName;
    asset.assignedEmployeeId = null;
    asset.assignedEmployeeName = null;
    asset.assignedEmployeeCode = null;
    asset.returnDate = returnDate || new Date().toISOString().split('T')[0];
    asset.status = 'Available';
    asset.condition = condition || asset.condition;
    asset.updatedAt = new Date().toISOString();

    asset.history.unshift({
      date: new Date().toISOString(),
      action: 'Returned',
      performedBy: actor,
      employeeName: formerEmp || undefined,
      notes: notes || `Returned by ${formerEmp || 'employee'} in ${condition} condition`,
    });

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Returned',
      'Asset',
      asset.id,
      asset.name,
      `Returned [${asset.assetTag}] ${asset.name} from ${formerEmp || 'employee'}. Marked as Available.`
    );

    this.broadcast('ASSET_UPDATED', asset);
    return asset;
  }

  public transferAsset(
    assetId: string,
    newEmployeeId: string,
    notes: string,
    actor: string,
    actorRole: UserRole
  ): CompanyAsset | null {
    const asset = this.data.assets.find(a => a.id === assetId);
    const newEmp = this.data.employees.find(e => e.id === newEmployeeId);
    if (!asset || !newEmp) return null;

    const formerEmp = asset.assignedEmployeeName;
    asset.assignedEmployeeId = newEmp.id;
    asset.assignedEmployeeName = newEmp.fullName;
    asset.assignedEmployeeCode = newEmp.employeeCode;
    asset.issueDate = new Date().toISOString().split('T')[0];
    asset.returnDate = null;
    asset.status = 'In Use';
    asset.updatedAt = new Date().toISOString();

    asset.history.unshift({
      date: new Date().toISOString(),
      action: 'Transferred',
      performedBy: actor,
      employeeName: newEmp.fullName,
      notes: notes || `Transferred from ${formerEmp || 'inventory'} to ${newEmp.fullName}`,
    });

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Transferred',
      'Asset',
      asset.id,
      asset.name,
      `Transferred [${asset.assetTag}] from ${formerEmp || 'previous'} to ${newEmp.fullName}.`
    );

    this.broadcast('ASSET_UPDATED', asset);
    return asset;
  }

  // --- Audit Logs ---
  public getAuditLogs(limit = 100): AuditLog[] {
    return this.data.auditLogs.slice(0, limit);
  }

  // --- Import Commit Engine ---
  public commitImportedRecords(
    records: Partial<Employee>[],
    mode: 'merge' | 'create_all',
    actor: string,
    actorRole: UserRole
  ): ImportSummary {
    let created = 0;
    let merged = 0;
    let skipped = 0;

    for (const rec of records) {
      if (!rec.fullName) {
        skipped++;
        continue;
      }

      const existing = this.data.employees.find(
        e =>
          (rec.email && e.email.toLowerCase() === rec.email.toLowerCase()) ||
          (rec.phone && e.phone && e.phone.replace(/\D/g, '') === rec.phone.replace(/\D/g, '')) ||
          (rec.employeeCode && e.employeeCode.toUpperCase() === rec.employeeCode.toUpperCase())
      );

      if (existing && mode === 'merge') {
        const updated: Partial<Employee> = {};
        if (rec.designation && !existing.designation) updated.designation = rec.designation;
        if (rec.department && !existing.department) updated.department = rec.department;
        if (rec.desk && !existing.desk) updated.desk = rec.desk;
        if (rec.sourceSpreadsheetSeat && !existing.sourceSpreadsheetSeat) updated.sourceSpreadsheetSeat = rec.sourceSpreadsheetSeat;
        if (rec.dateOfBirth && !existing.dateOfBirth) updated.dateOfBirth = rec.dateOfBirth;
        if (rec.joiningDate && !existing.joiningDate) updated.joiningDate = rec.joiningDate;
        if (rec.internshipCompletionDate) updated.internshipCompletionDate = rec.internshipCompletionDate;
        if (rec.previousCompany && !existing.previousCompany) updated.previousCompany = rec.previousCompany;
        if (rec.previousCTC && !existing.previousCTC) updated.previousCTC = rec.previousCTC;
        if (rec.offeredCTC && !existing.offeredCTC) updated.offeredCTC = rec.offeredCTC;
        if (rec.bankDetails && !existing.bankDetails) updated.bankDetails = rec.bankDetails;
        if (rec.identityDetails && !existing.identityDetails) updated.identityDetails = rec.identityDetails;
        if (rec.googleDriveLink && !existing.googleDriveLink) updated.googleDriveLink = rec.googleDriveLink;

        this.updateEmployee(existing.id, updated, actor, actorRole);
        merged++;
      } else {
        this.createEmployee(rec, actor, actorRole);
        created++;
      }
    }

    const summary: ImportSummary = {
      totalRows: records.length,
      newRecordsCreated: created,
      recordsMerged: merged,
      recordsSkipped: skipped,
      conflictsResolved: 0,
      timestamp: new Date().toISOString(),
    };

    this.logAudit(
      actor,
      actorRole,
      'Batch Import Completed',
      'Import',
      'import-batch',
      'Spreadsheet Import',
      `Imported ${records.length} rows (${created} created, ${merged} merged, ${skipped} skipped).`
    );

    this.broadcast('IMPORT_COMPLETED', summary);
    return summary;
  }

  // --- Reset to Fresh Seed Data ---
  public resetToSeed(actor: string, actorRole: UserRole) {
    const initialEmployees = [...SEED_EMPLOYEES, ...SEED_CANDIDATES];
    this.data = {
      employees: initialEmployees,
      assets: SEED_ASSETS,
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor,
          actorRole,
          action: 'Database Reset',
          entityType: 'Import',
          entityId: 'reset-seed',
          entityName: 'System Database',
          details: 'Reset system database to pristine White Collar Realty seed dataset.',
        },
        ...INITIAL_AUDIT_LOGS,
      ],
      acknowledgedAlerts: {},
      version: 3,
      lastUpdated: new Date().toISOString(),
    };
    this.persist();
    this.broadcast('DATABASE_RESET', { time: this.data.lastUpdated });
  }

  // --------------------------------------------------------------------------
  // Upcoming Alerts Engine (Internship Completion & Employee Birthdays)
  // --------------------------------------------------------------------------
  public getUpcomingAlerts(referenceDateStr?: string, maxDays = 2, activeOnly = true): AlertItem[] {
    const now = referenceDateStr ? new Date(referenceDateStr) : new Date();
    
    // Normalize reference date to midnight UTC/local for reliable day-diff calculation
    const refYear = now.getFullYear();
    const refMonth = now.getMonth();
    const refDay = now.getDate();
    const refMidnight = new Date(refYear, refMonth, refDay, 0, 0, 0, 0);

    const alerts: AlertItem[] = [];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // 1. Employee & Candidate Birthday Alerts (Repeats Annually)
    this.data.employees.forEach(person => {
      if (!person.dateOfBirth) return;

      const dobParts = person.dateOfBirth.split(/[-/]/);
      if (dobParts.length < 3) return;

      let bYear = parseInt(dobParts[0], 10);
      let bMonth = parseInt(dobParts[1], 10);
      let bDay = parseInt(dobParts[2], 10);

      // Handle DD-MM-YYYY format if applicable
      if (dobParts[0].length <= 2 && dobParts[2].length === 4) {
        bDay = parseInt(dobParts[0], 10);
        bMonth = parseInt(dobParts[1], 10);
        bYear = parseInt(dobParts[2], 10);
      }

      if (isNaN(bMonth) || isNaN(bDay) || bMonth < 1 || bMonth > 12) return;

      // Calculate next birthday occurrence
      let targetBday = new Date(refYear, bMonth - 1, bDay, 0, 0, 0, 0);

      // If target birthday has already passed this year (before refMidnight), next birthday is next year
      if (targetBday.getTime() < refMidnight.getTime()) {
        targetBday = new Date(refYear + 1, bMonth - 1, bDay, 0, 0, 0, 0);
      }

      const diffMs = targetBday.getTime() - refMidnight.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // Trigger condition: alert window (0 to maxDays, typically exactly 2 days or 0-2 days before)
      if (diffDays >= 0 && diffDays <= maxDays) {
        const targetYear = targetBday.getFullYear();
        const alertId = `birthday-${person.id}-${targetYear}`;
        const ack = this.data.acknowledgedAlerts?.[alertId];
        const isDismissed = Boolean(ack);

        if (!activeOnly || !isDismissed) {
          const formattedBday = `${bDay} ${monthNames[bMonth - 1]} (${targetYear})`;
          const ageTurning = !isNaN(bYear) && bYear > 1900 ? ` (Turning ${targetYear - bYear})` : '';

          alerts.push({
            id: alertId,
            type: 'BIRTHDAY',
            personId: person.id,
            fullName: person.fullName,
            photoUrl: person.fullName.toLowerCase().includes('chetan')
              ? '/src/assets/images/avatar_chetan_sharma_1793257665587.jpg'
              : undefined,
            designation: person.designation,
            department: person.department,
            phone: person.phone,
            email: person.email,
            isCandidate: person.isCandidate,
            eventDate: `${targetYear}-${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}`,
            formattedEventDate: formattedBday,
            daysRemaining: diffDays,
            targetYear,
            joiningDate: person.joiningDate,
            desk: person.desk,
            title: `Upcoming Birthday: ${person.fullName}${ageTurning}`,
            summary: `${person.fullName}'s birthday is coming up in ${
              diffDays === 0 ? 'today!' : diffDays === 1 ? '1 day (tomorrow)' : `${diffDays} days`
            } on ${formattedBday}. Celebrate and acknowledge their milestone!`,
            market: person.market,
            dismissed: isDismissed,
            dismissedAt: ack?.dismissedAt,
            profileCompletion: person.profileCompletion,
          });
        }
      }
    });

    // 2. Internship Completion Alerts (Trigger 2 days before completion date)
    this.data.employees.forEach(person => {
      if (!person.internshipCompletionDate) return;

      const endParts = person.internshipCompletionDate.split(/[-/]/);
      if (endParts.length < 3) return;

      let eYear = parseInt(endParts[0], 10);
      let eMonth = parseInt(endParts[1], 10);
      let eDay = parseInt(endParts[2], 10);

      if (endParts[0].length <= 2 && endParts[2].length === 4) {
        eDay = parseInt(endParts[0], 10);
        eMonth = parseInt(endParts[1], 10);
        eYear = parseInt(endParts[2], 10);
      }

      if (isNaN(eYear) || isNaN(eMonth) || isNaN(eDay)) return;

      const endDate = new Date(eYear, eMonth - 1, eDay, 0, 0, 0, 0);
      const diffMs = endDate.getTime() - refMidnight.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= maxDays) {
        const alertId = `internship-${person.id}-${person.internshipCompletionDate}`;
        const ack = this.data.acknowledgedAlerts?.[alertId];
        const isDismissed = Boolean(ack);

        if (!activeOnly || !isDismissed) {
          const formattedEndDate = `${eDay} ${monthNames[eMonth - 1]} ${eYear}`;

          alerts.push({
            id: alertId,
            type: 'INTERNSHIP_COMPLETION',
            personId: person.id,
            fullName: person.fullName,
            photoUrl: person.fullName.toLowerCase().includes('chetan')
              ? '/src/assets/images/avatar_chetan_sharma_1793257665587.jpg'
              : undefined,
            designation: person.designation,
            department: person.department,
            phone: person.phone,
            email: person.email,
            isCandidate: person.isCandidate,
            eventDate: person.internshipCompletionDate,
            formattedEventDate: formattedEndDate,
            daysRemaining: diffDays,
            joiningDate: person.joiningDate,
            internshipCompletionDate: person.internshipCompletionDate,
            desk: person.desk,
            title: `Internship Completion: ${person.fullName}`,
            summary: `${person.fullName}'s internship completes in ${
              diffDays === 0 ? 'today!' : diffDays === 1 ? '1 day (tomorrow)' : `${diffDays} days`
            } on ${formattedEndDate}. Review performance appraisal, documentation, and full-time conversion offer.`,
            market: person.market,
            dismissed: isDismissed,
            dismissedAt: ack?.dismissedAt,
            profileCompletion: person.profileCompletion,
          });
        }
      }
    });

    // 3. Probation Completion Alerts (Within 15 days)
    this.data.employees.forEach(person => {
      if (!person.probation || person.probation.status !== 'In Probation' || !person.probation.endDate) return;

      const pParts = person.probation.endDate.split(/[-/]/);
      if (pParts.length < 3) return;

      const pYear = parseInt(pParts[0], 10);
      const pMonth = parseInt(pParts[1], 10);
      const pDay = parseInt(pParts[2], 10);
      if (isNaN(pYear) || isNaN(pMonth) || isNaN(pDay)) return;

      const pDate = new Date(pYear, pMonth - 1, pDay, 0, 0, 0, 0);
      const diffMs = pDate.getTime() - refMidnight.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 15) {
        const alertId = `probation-${person.id}-${person.probation.endDate}`;
        const ack = this.data.acknowledgedAlerts?.[alertId];
        const isDismissed = Boolean(ack);

        if (!activeOnly || !isDismissed) {
          const formattedPDate = `${pDay} ${monthNames[pMonth - 1]} ${pYear}`;
          alerts.push({
            id: alertId,
            type: 'PROBATION_EXPIRY',
            personId: person.id,
            fullName: person.fullName,
            designation: person.designation,
            department: person.department,
            phone: person.phone,
            email: person.email,
            isCandidate: person.isCandidate,
            eventDate: person.probation.endDate,
            formattedEventDate: formattedPDate,
            daysRemaining: diffDays,
            joiningDate: person.joiningDate,
            desk: person.desk,
            title: `Probation Ending: ${person.fullName}`,
            summary: `${person.fullName}'s probation ends in ${diffDays} day(s) on ${formattedPDate}. Conduct confirmation review or extension decision.`,
            market: person.market,
            dismissed: isDismissed,
            dismissedAt: ack?.dismissedAt,
            profileCompletion: person.profileCompletion,
          });
        }
      }
    });

    // 4. Notice Period & Last Working Day Alerts (Within 15 days)
    this.data.employees.forEach(person => {
      if (person.employmentStatus !== 'Notice Period' || !person.exitClearance?.calculatedLwd) return;

      const lwdParts = person.exitClearance.calculatedLwd.split(/[-/]/);
      if (lwdParts.length < 3) return;

      const lYear = parseInt(lwdParts[0], 10);
      const lMonth = parseInt(lwdParts[1], 10);
      const lDay = parseInt(lwdParts[2], 10);
      if (isNaN(lYear) || isNaN(lMonth) || isNaN(lDay)) return;

      const lDate = new Date(lYear, lMonth - 1, lDay, 0, 0, 0, 0);
      const diffMs = lDate.getTime() - refMidnight.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 15) {
        const alertId = `notice-${person.id}-${person.exitClearance.calculatedLwd}`;
        const ack = this.data.acknowledgedAlerts?.[alertId];
        const isDismissed = Boolean(ack);

        if (!activeOnly || !isDismissed) {
          const formattedLwd = `${lDay} ${monthNames[lMonth - 1]} ${lYear}`;
          alerts.push({
            id: alertId,
            type: 'NOTICE_PERIOD_LWD',
            personId: person.id,
            fullName: person.fullName,
            designation: person.designation,
            department: person.department,
            phone: person.phone,
            email: person.email,
            isCandidate: person.isCandidate,
            eventDate: person.exitClearance.calculatedLwd,
            formattedEventDate: formattedLwd,
            daysRemaining: diffDays,
            joiningDate: person.joiningDate,
            desk: person.desk,
            title: `Last Working Day: ${person.fullName}`,
            summary: `${person.fullName}'s last working day is in ${diffDays} day(s) on ${formattedLwd}. Ensure IT, HR, Finance clearances and FnF settlement are completed.`,
            market: person.market,
            dismissed: isDismissed,
            dismissedAt: ack?.dismissedAt,
            profileCompletion: person.profileCompletion,
          });
        }
      }
    });

    // 5. Candidate Missing Required Document Alerts (Real-Time HR Popup Alerts)
    this.data.employees.forEach(candidate => {
      if (!candidate.isCandidate) return;

      const docs = candidate.documents || {};
      const missingDocs: DocumentRecord[] = [];
      Object.values(docs).forEach(d => {
        if (d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')) {
          missingDocs.push(d);
        }
      });

      if (missingDocs.length > 0) {
        // Unique alert ID per candidate missing docs state
        const alertId = `missing-docs-${candidate.id}`;
        const ack = this.data.acknowledgedAlerts?.[alertId];
        const isDismissed = Boolean(ack);

        let isOverdue = false;
        let daysRemaining = 1;
        if (candidate.reminderDeadline) {
          const deadlineTime = new Date(candidate.reminderDeadline).getTime();
          const nowTime = now.getTime();
          isOverdue = deadlineTime < nowTime;
          daysRemaining = Math.max(0, Math.ceil((deadlineTime - nowTime) / (1000 * 60 * 60 * 24)));
        }

        if (!activeOnly || !isDismissed) {
          const missingTitles = missingDocs.map(d => d.title);
          alerts.push({
            id: alertId,
            type: 'MISSING_DOCUMENTS',
            personId: candidate.id,
            fullName: candidate.fullName,
            designation: candidate.designation,
            department: candidate.department,
            phone: candidate.phone,
            email: candidate.email,
            isCandidate: true,
            eventDate: candidate.reminderDeadline ? candidate.reminderDeadline.split('T')[0] : (candidate.joiningDate || now.toISOString().split('T')[0]),
            formattedEventDate: candidate.reminderDeadline ? new Date(candidate.reminderDeadline).toLocaleString() : '24h Submission Window',
            daysRemaining,
            joiningDate: candidate.joiningDate,
            desk: candidate.desk,
            title: isOverdue
              ? `⚠️ OVERDUE: Missing Documents - ${candidate.fullName}`
              : `Pending Documents - ${candidate.fullName} (${missingDocs.length} Required)`,
            summary: `${candidate.fullName} has ${missingDocs.length} required document(s) pending: ${missingTitles.slice(0, 3).join(', ')}${missingTitles.length > 3 ? ` and ${missingTitles.length - 3} more` : ''}. ${isOverdue ? 'Submission deadline is overdue!' : 'Submission requested within 24 hours.'}`,
            market: candidate.market,
            dismissed: isDismissed,
            dismissedAt: ack?.dismissedAt,
            profileCompletion: candidate.profileCompletion,
            missingDocuments: missingTitles,
            missingDocumentCount: missingDocs.length,
            submissionStatus: isOverdue ? 'Overdue (Past 24h Deadline)' : (candidate.documentReminders?.length ? 'Reminder Dispatched' : 'Pending Submission'),
            deadline: candidate.reminderDeadline,
            isOverdue,
            remindersSentCount: candidate.documentReminders?.length || 0,
            lastReminderSentAt: candidate.lastReminderSentAt,
            uploadToken: candidate.uploadToken?.token,
            uploadUrl: candidate.uploadToken?.token ? `/upload-portal/${candidate.uploadToken.token}` : undefined,
          });
        }
      }
    });

    // Sort by daysRemaining ascending (0 days first, then 1, then 2)
    return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  public dismissAlert(alertId: string, actor: string): boolean {
    if (!this.data.acknowledgedAlerts) {
      this.data.acknowledgedAlerts = {};
    }
    this.data.acknowledgedAlerts[alertId] = {
      dismissedAt: new Date().toISOString(),
      dismissedBy: actor,
    };
    this.persist();
    this.broadcast('ALERT_DISMISSED', { alertId, actor });
    return true;
  }

  public resetDismissedAlerts(actor: string): boolean {
    this.data.acknowledgedAlerts = {};
    this.persist();
    this.broadcast('ALERTS_RESET', { actor });
    return true;
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }
}

export const db = new DatabaseService();
