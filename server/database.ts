import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import {
  Employee,
  CompanyAsset,
  DeskSlot,
  AuditLog,
  UserRole,
  DocumentStatus,
  ImportSummary,
  AlertItem,
} from '../src/types/index.js';
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
} from './seedData.js';

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

class DatabaseService {
  private data: DatabaseSchema;
  private sseClients: Response[] = [];

  constructor() {
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

  // --- Document Verification ---
  public updateDocument(
    employeeId: string,
    docKey: string,
    params: {
      status: DocumentStatus;
      reviewNotes?: string;
      verifiedBy?: string;
      fileName?: string;
      fileSize?: string;
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

    if (params.status === 'Verified') {
      doc.verifiedBy = params.verifiedBy || actor;
      doc.verifiedAt = new Date().toISOString();
    } else if (params.status === 'Submitted') {
      doc.uploadedAt = new Date().toISOString();
    }

    emp.updatedAt = new Date().toISOString();
    emp.profileCompletion = calculateCompletion(emp);
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
    return emp;
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
