import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
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
  RoleSalaryStructure,
  SavedOfferLetterFile,
  AssetReturnReminderRecord,
  NotificationDeliveryLog,
  DepartmentConfig,
  SubDepartmentConfig,
  DepartmentWithCounts,
  QrDocumentTokenRecord,
  ProfileDocumentInspection,
  DocumentQrStatusInfo,
  PublicQrDocumentSlot,
  PublicQrSessionData,
  LiveQrUploadEvent,
  MarketType,
} from '../src/types/index.ts';
import {
  ALL_DESK_CODES,
  DEFAULT_DEPARTMENTS,
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
  DEFAULT_ROLE_SALARY_STRUCTURES,
} from './lifecycleEngine.ts';

export function normalizeLegacyRole(raw?: string): UserRole {
  if (raw === 'HR' || raw === 'Co-Founder' || raw === 'CEO') return raw;
  if (raw === 'FINANCE_ADMIN') return 'Co-Founder';
  if (raw === 'DEPT_HEAD_VIEWER') return 'CEO';
  return 'HR';
}

// Permanent public HTTPS application endpoint (deployed globally on Cloud Run)
export const PERMANENT_PUBLIC_APP_URL =
  (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').trim() ||
  'https://ais-pre-vtqywkmlbp4hnugfkn6ztw-912480930497.asia-southeast1.run.app';

export function isInvalidHostOrIp(hostOrUrl: string): boolean {
  if (!hostOrUrl) return true;
  const lower = hostOrUrl.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('169.254.') ||
    lower.startsWith('192.168.') ||
    lower.includes('.192.168.') ||
    lower.startsWith('10.') ||
    lower.includes('.10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower) ||
    lower.includes('.local')
  );
}

export function cleanPublicOrigin(candidateOrigin?: string): string {
  const envUrl = (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  if (envUrl && !isInvalidHostOrIp(envUrl)) {
    try {
      const parsed = new URL(envUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {}
  }

  if (candidateOrigin && typeof candidateOrigin === 'string' && candidateOrigin.trim()) {
    try {
      const parsed = new URL(candidateOrigin.trim());
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !isInvalidHostOrIp(parsed.hostname)
      ) {
        return parsed.origin;
      }
    } catch {}
  }

  return PERMANENT_PUBLIC_APP_URL;
}

// Exactly and ONLY these 4 departments can have Intern sub-departments or Intern categories
export function isInternAllowedDepartment(deptNameOrId?: string): boolean {
  if (!deptNameOrId) return false;
  const s = deptNameOrId.trim().toLowerCase();
  return (
    s === 'hr' ||
    s === 'dept-hr' ||
    s === 'human resources' ||
    s === 'human resources (hr)' ||
    s === 'ai' ||
    s === 'dept-ai' ||
    s === 'ai department' ||
    s === 'ai intern' ||
    s === 'da' ||
    s === 'dept-da' ||
    s === 'da department' ||
    s === 'dm' ||
    s === 'dept-dm' ||
    s === 'dept-marketing' ||
    s === 'dm department' ||
    s === 'dm intern' ||
    s === 'digital marketing' ||
    s === 'digital marketing department' ||
    s === 'marketing & digital media'
  );
}

export function normalizeStandardDepartmentName(rawDept?: string): string {
  if (!rawDept) return 'Gurgaon Market';
  const s = rawDept.trim().toLowerCase();
  if (s === 'hr' || s === 'human resources' || s === 'human resources (hr)' || s === 'dept-hr') return 'HR';
  if (s === 'ai' || s === 'ai department' || s === 'ai intern' || s === 'dept-ai') return 'AI';
  if (s === 'da' || s === 'da department' || s === 'dept-da') return 'DA';
  if (
    s === 'dm' ||
    s === 'dm department' ||
    s === 'dm intern' ||
    s === 'digital marketing' ||
    s === 'digital marketing department' ||
    s === 'marketing & digital media' ||
    s === 'dept-dm' ||
    s === 'dept-marketing'
  ) {
    return 'DM';
  }
  return rawDept.trim();
}

interface DatabaseSchema {
  employees: Employee[];
  assets: CompanyAsset[];
  auditLogs: AuditLog[];
  departments?: DepartmentConfig[];
  employmentCategories?: string[];
  qrDocumentTokens?: QrDocumentTokenRecord[];
  salaryStructures?: RoleSalaryStructure[];
  assetReturnReminders?: AssetReturnReminderRecord[];
  notificationDeliveryLogs?: NotificationDeliveryLog[];
  acknowledgedAlerts: Record<string, { dismissedAt: string; dismissedBy: string }>;
  version: number;
  lastUpdated: string;
}

export const QR_EXPIRY_DURATION_MS = 24 * 60 * 60 * 1000; // Exact 24 hours (86,400,000 ms)
export const QR_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per document

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
          if (!parsed.assetReturnReminders || !Array.isArray(parsed.assetReturnReminders)) {
            parsed.assetReturnReminders = [];
          }
          if (!parsed.notificationDeliveryLogs || !Array.isArray(parsed.notificationDeliveryLogs)) {
            parsed.notificationDeliveryLogs = [];
          }
          if (!parsed.salaryStructures || !Array.isArray(parsed.salaryStructures) || parsed.salaryStructures.length === 0) {
            parsed.salaryStructures = JSON.parse(JSON.stringify(DEFAULT_ROLE_SALARY_STRUCTURES));
          }
          if (!parsed.qrDocumentTokens || !Array.isArray(parsed.qrDocumentTokens)) {
            parsed.qrDocumentTokens = [];
          }
          const isInitialDeptMigration = !parsed.departments || !Array.isArray(parsed.departments) || parsed.departments.length === 0;
          if (isInitialDeptMigration) {
            parsed.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS));
          }
          // Normalize any legacy role strings stored in persisted logs or history
          if (Array.isArray(parsed.auditLogs)) {
            parsed.auditLogs.forEach((log: any) => {
              log.actorRole = normalizeLegacyRole(log.actorRole);
            });
          }
          parsed.employees.forEach((emp: any) => {
            if (Array.isArray(emp.lifecycleHistory)) {
              emp.lifecycleHistory.forEach((entry: any) => {
                entry.actorRole = normalizeLegacyRole(entry.actorRole);
              });
            }
            if (Array.isArray(emp.documentReminders)) {
              emp.documentReminders.forEach((rem: any) => {
                rem.sentByRole = normalizeLegacyRole(rem.sentByRole);
              });
            }
            if (Array.isArray(emp.savedOfferLetters)) {
              emp.savedOfferLetters.forEach((f: any) => {
                f.generatedByRole = normalizeLegacyRole(f.generatedByRole);
              });
            }
          });

          const migrated = this.ensureDepartmentsAndAssignmentsOnSchema(parsed, isInitialDeptMigration);
          if (migrated || isInitialDeptMigration) {
            this.saveDataDirect(parsed);
          }

          console.log(`[DB] Successfully loaded ${parsed.employees.length} employees, ${parsed.departments.length} departments, and ${parsed.assets.length} assets from disk (v3).`);
          return parsed;
        }
      }
    } catch (err) {
      console.error('[DB] Error loading database file, initializing seed:', err);
    }

    // Initialize with verified seed data
    const initialEmployees = JSON.parse(JSON.stringify([...SEED_EMPLOYEES, ...SEED_CANDIDATES]));
    const initialData: DatabaseSchema = {
      employees: initialEmployees,
      assets: JSON.parse(JSON.stringify(SEED_ASSETS)),
      auditLogs: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
      departments: JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS)),
      qrDocumentTokens: [],
      salaryStructures: JSON.parse(JSON.stringify(DEFAULT_ROLE_SALARY_STRUCTURES)),
      assetReturnReminders: [],
      notificationDeliveryLogs: [],
      acknowledgedAlerts: {},
      version: 3,
      lastUpdated: new Date().toISOString(),
    };

    this.ensureDepartmentsAndAssignmentsOnSchema(initialData, false);
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
  public getEmployees(
    _role: UserRole = 'HR',
    filter?: { isCandidate?: boolean; search?: string; department?: string; departmentId?: string; subDepartment?: string }
  ): Employee[] {
    // Refresh live QR metadata (24h expiry awareness)
    this.data.employees.forEach(emp => {
      emp.documentQrMeta = this.computeEmployeeQrMeta(emp.id);
    });

    let list = this.data.employees;

    if (filter) {
      if (typeof filter.isCandidate === 'boolean') {
        list = list.filter(e => Boolean(e.isCandidate) === filter.isCandidate);
      }
      if (filter.departmentId && filter.departmentId !== 'All') {
        list = list.filter(e => e.departmentId === filter.departmentId);
      } else if (filter.department && filter.department !== 'All') {
        list = list.filter(e => e.department.toLowerCase() === filter.department!.toLowerCase());
      }
      if (filter.subDepartment && filter.subDepartment !== 'All') {
        if (filter.subDepartment === '__unassigned__') {
          list = list.filter(e => !e.subDepartment);
        } else {
          list = list.filter(e => (e.subDepartment || '').toLowerCase() === filter.subDepartment!.toLowerCase());
        }
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
            e.department.toLowerCase().includes(q) ||
            (e.subDepartment && e.subDepartment.toLowerCase().includes(q)) ||
            (e.desk && e.desk.toLowerCase().includes(q)) ||
            (e.sourceSpreadsheetSeat && e.sourceSpreadsheetSeat.toLowerCase().includes(q))
        );
      }
    }

    return list;
  }

  public getEmployeeById(id: string, _role: UserRole = 'HR'): Employee | null {
    const emp = this.data.employees.find(e => e.id === id);
    if (!emp) return null;
    emp.documentQrMeta = this.computeEmployeeQrMeta(emp.id);
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
      offerLetter: emp.offerLetter
        ? {
            ...emp.offerLetter,
            ctcLpaFormatted: '🔒 [RESTRICTED]',
            basicMonthly: 0,
            basicYearly: 0,
            pbvpMonthly: 0,
            pbvpYearly: 0,
            retentionBonusMonthly: 0,
            retentionBonusYearly: 0,
            totalDeductionsMonthly: 0,
            totalDeductionsYearly: 0,
            netPayMonthly: 0,
            netPayYearly: 0,
            compensationComponents: [],
            salaryBreakup: {
              ...emp.offerLetter.salaryBreakup,
              annualCtc: 0,
              monthlyCtc: 0,
              basicMonthly: 0,
              basicAnnual: 0,
              hraMonthly: 0,
              hraAnnual: 0,
              specialAllowanceMonthly: 0,
              specialAllowanceAnnual: 0,
              grossMonthly: 0,
              grossAnnual: 0,
              approxNetInHandMonthly: 0,
            },
          }
        : undefined,
    };
  }

  // --- Configurable Role Salary Structures ---
  public getSalaryStructures(): RoleSalaryStructure[] {
    if (!this.data.salaryStructures || this.data.salaryStructures.length === 0) {
      this.data.salaryStructures = JSON.parse(JSON.stringify(DEFAULT_ROLE_SALARY_STRUCTURES));
    }
    return this.data.salaryStructures!;
  }

  public saveSalaryStructure(
    structureInput: Partial<RoleSalaryStructure> & { designation: string },
    actor: string,
    actorRole: UserRole
  ): RoleSalaryStructure {
    const list = this.getSalaryStructures();
    const now = new Date().toISOString();
    const id = structureInput.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingIdx = list.findIndex(s => s.id === id);

    const saved: RoleSalaryStructure = {
      id,
      designation: structureInput.designation.trim(),
      department: structureInput.department || 'Sales & Investments',
      employmentType: structureInput.employmentType || 'Full-Time',
      market: structureInput.market || 'Gurgaon',
      defaultAnnualCtc: Math.max(0, Math.round(Number(structureInput.defaultAnnualCtc) || 480000)),
      rules:
        structureInput.rules && structureInput.rules.length > 0
          ? structureInput.rules
          : DEFAULT_ROLE_SALARY_STRUCTURES[0].rules,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = saved;
    } else {
      list.push(saved);
    }

    this.logAudit(
      actor,
      actorRole,
      existingIdx >= 0 ? 'Updated Role Salary Structure' : 'Created Role Salary Structure',
      'SalaryStructure',
      saved.id,
      saved.designation,
      `Configured default CTC ${saved.market === 'Dubai' ? 'AED' : 'INR'} ${saved.defaultAnnualCtc.toLocaleString()} with ${saved.rules.filter(r => r.enabled).length} active components.`
    );
    this.persist();
    return saved;
  }

  public deleteSalaryStructure(id: string, actor: string, actorRole: UserRole): boolean {
    const list = this.getSalaryStructures();
    const target = list.find(s => s.id === id);
    if (!target || list.length <= 1) return false;
    this.data.salaryStructures = list.filter(s => s.id !== id);
    this.logAudit(
      actor,
      actorRole,
      'Deleted Role Salary Structure',
      'SalaryStructure',
      id,
      target.designation,
      `Removed role salary structure for ${target.designation}.`
    );
    this.persist();
    return true;
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
    const resolvedMarket: MarketType =
      empData.market ||
      (empData.department?.toLowerCase().includes('dubai') ? 'Dubai' : 'Gurgaon');

    const resolvedDept = this.resolveAndEnsureDepartment(
      empData.departmentId,
      empData.department || (resolvedMarket === 'Dubai' ? 'Dubai Market' : 'Gurgaon Market'),
      empData.subDepartment,
      resolvedMarket
    );

    const isDubaiDocs = resolvedMarket === 'Dubai' || resolvedMarket === 'Dual Market' || resolvedDept.department.toLowerCase().includes('dubai');

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
      departmentId: resolvedDept.departmentId,
      department: resolvedDept.department,
      subDepartment: resolvedDept.subDepartment,
      designation: empData.designation || 'Property Consultant',
      reportingManager: empData.reportingManager || 'Management',
      joiningDate: empData.joiningDate || new Date().toISOString().split('T')[0],
      internshipCompletionDate: empData.internshipCompletionDate,
      jobEndDate: empData.jobEndDate,
      employmentStatus: empData.employmentStatus || (isCand ? 'Upcoming Joiner' : 'Full-Time'),
      isCandidate: isCand,
      candidateStatus: empData.candidateStatus || (isCand ? 'Offer Accepted' : undefined),
      market: resolvedMarket,
      desk: ALL_DESK_CODES.includes(desk) ? desk : '',
      sourceSpreadsheetSeat: empData.sourceSpreadsheetSeat || desk,
      previousCompany: empData.previousCompany,
      previousDesignation: empData.previousDesignation,
      previousCTC: empData.previousCTC,
      offeredCTC: empData.offeredCTC,
      employmentCategory: empData.employmentCategory || 'Employee',
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
      documents: empData.documents || getDefaultDocumentChecklist(isDubaiDocs),
      savedOfferLetters: empData.savedOfferLetters || [],
      documentQrMeta: {
        hasToken: false,
        isActive: false,
        isExpired: false,
        isRevoked: false,
        targetDocKeys: [],
        uploadedDocKeys: [],
      },
      profileCompletion: 0,
      notes: empData.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!isInternAllowedDepartment(newEmp.department)) {
      if (newEmp.employmentCategory === 'Intern') {
        newEmp.employmentCategory = 'Employee';
      }
      if (newEmp.employmentStatus === 'Intern') {
        newEmp.employmentStatus = newEmp.isCandidate ? 'Offer Accepted' : 'Full-Time';
      }
      newEmp.internshipCompletionDate = undefined;
    }

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
      `Created ${isCand ? 'candidate' : 'employee'} profile (${newEmp.employeeCode}) in ${newEmp.department}${newEmp.subDepartment ? ` / ${newEmp.subDepartment}` : ''}. Seat: ${newEmp.sourceSpreadsheetSeat || 'None'}.`
    );

    this.broadcast('EMPLOYEE_CREATED', newEmp);
    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());
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

    if (updates.department !== undefined || updates.departmentId !== undefined || updates.subDepartment !== undefined) {
      const resolvedDept = this.resolveAndEnsureDepartment(
        updates.departmentId !== undefined ? updates.departmentId : (updates.department !== undefined ? undefined : existing.departmentId),
        updates.department !== undefined ? updates.department : existing.department,
        updates.subDepartment !== undefined ? updates.subDepartment : existing.subDepartment,
        merged.market
      );
      merged.departmentId = resolvedDept.departmentId;
      merged.department = resolvedDept.department;
      merged.subDepartment = resolvedDept.subDepartment;
    }

    if (!isInternAllowedDepartment(merged.department)) {
      if (merged.employmentCategory === 'Intern') {
        merged.employmentCategory = 'Employee';
      }
      if (merged.employmentStatus === 'Intern') {
        merged.employmentStatus = merged.isCandidate ? 'Offer Accepted' : 'Full-Time';
      }
      merged.internshipCompletionDate = undefined;
    }

    if (!merged.documents || Object.keys(merged.documents).length === 0) {
      merged.documents = getDefaultDocumentChecklist(merged.market === 'Dubai' || merged.market === 'Dual Market');
    }

    merged.documentQrMeta = this.computeEmployeeQrMeta(merged.id);
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
      `Updated profile fields (${Object.keys(updates).join(', ')}). Department: ${merged.department}${merged.subDepartment ? ` / ${merged.subDepartment}` : ''}. Profile score: ${merged.profileCompletion}%.`
    );

    this.broadcast('EMPLOYEE_UPDATED', merged);
    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());
    return merged;
  }

  public deleteEmployee(id: string, actor: string, actorRole: UserRole): boolean {
    const index = this.data.employees.findIndex(e => e.id === id);
    if (index === -1) return false;

    const removed = this.data.employees[index];
    this.data.employees.splice(index, 1);

    // Immediately revoke any active QR tokens belonging to the deleted profile
    if (this.data.qrDocumentTokens) {
      const nowIso = new Date().toISOString();
      this.data.qrDocumentTokens.forEach(t => {
        if (t.employeeId === id && !t.revokedAt) {
          t.revokedAt = nowIso;
          t.revokedBy = actor;
          t.revokeReason = 'Profile deleted';
        }
      });
    }

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
    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());
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
  public saveSecureBuffer(personId: string, docKey: string, originalFileName: string, fileBuffer: Buffer): string {
    const safePersonId = path.basename(personId).replace(/[^a-zA-Z0-9._-]/g, '_');
    const personDir = path.join(SECURE_UPLOADS_DIR, safePersonId);
    if (!fs.existsSync(personDir)) {
      fs.mkdirSync(personDir, { recursive: true });
    }

    const sanitizedBase = path.basename(originalFileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `${docKey}.pdf`;
    const safeDocKey = docKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storedFileName = `${safeDocKey}_${Date.now()}_${sanitizedBase}`;
    const targetFilePath = path.join(personDir, storedFileName);
    fs.writeFileSync(targetFilePath, fileBuffer);

    return path.join('secure_uploads', safePersonId, storedFileName);
  }

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
      else if (fileName.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else mimeType = 'application/pdf';
    }

    // 1. Check storagePath on disk in secure_uploads (with strict path-traversal guard)
    if (doc.storagePath) {
      const diskPath = path.resolve(DATA_DIR, doc.storagePath);
      if (diskPath.startsWith(SECURE_UPLOADS_DIR + path.sep) && fs.existsSync(diskPath)) {
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

  public deleteEmployeeDocumentFile(
    employeeId: string,
    docKey: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; employee?: Employee; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp || !emp.documents || !emp.documents[docKey]) {
      return { success: false, message: 'Document slot not found.' };
    }

    const doc = emp.documents[docKey];
    if (doc.storagePath) {
      try {
        const diskPath = path.resolve(DATA_DIR, doc.storagePath);
        if (diskPath.startsWith(SECURE_UPLOADS_DIR + path.sep) && fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      } catch (err) {
        console.warn(`[STORAGE] Could not delete disk file for ${employeeId}/${docKey}:`, err);
      }
    }

    const oldFileName = doc.fileName || docKey;
    doc.fileName = undefined;
    doc.fileSize = undefined;
    doc.fileData = undefined;
    doc.storagePath = undefined;
    doc.mimeType = undefined;
    doc.uploadedAt = undefined;
    doc.status = 'Missing';
    doc.reviewNotes = `Attachment removed by ${actor} (${actorRole}) on ${new Date().toLocaleDateString()}`;

    emp.profileCompletion = calculateCompletion(emp);
    emp.updatedAt = new Date().toISOString();
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Document Removed',
      emp.isCandidate ? 'Candidate' : 'Employee',
      emp.id,
      emp.fullName,
      `Deleted file attachment '${oldFileName}' for '${doc.title}'. Document checklist status reset to Missing.`
    );

    this.broadcast('DOCUMENT_STATUS_CHANGED', { employeeId: emp.id, docKey, doc, profileCompletion: emp.profileCompletion });
    this.broadcast('ALERT_UPDATED', { candidateId: emp.id });
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, employee: emp, message: `Attachment for '${doc.title}' deleted successfully.` };
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
      'HR',
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
  ): { success: boolean; candidate?: Employee; employee?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate) return { success: false, message: 'Candidate not found.' };

    const offerLetter = buildOfferLetterData(candidate, customOverrides, this.getSalaryStructures());
    candidate.offerLetter = offerLetter;

    // Keep HR candidate record synchronized with dynamic offer details
    if (offerLetter.candidateName && offerLetter.candidateName.trim()) {
      candidate.fullName = offerLetter.candidateName.trim();
    }
    if (offerLetter.designation && offerLetter.designation.trim()) {
      candidate.designation = offerLetter.designation.trim();
    }
    if (offerLetter.department && offerLetter.department.trim()) {
      candidate.department = offerLetter.department.trim();
    }
    if (offerLetter.reportingManager !== undefined && offerLetter.reportingManager.trim()) {
      candidate.reportingManager = offerLetter.reportingManager.trim();
    }
    if (offerLetter.candidateEmail && offerLetter.candidateEmail.trim()) {
      candidate.email = offerLetter.candidateEmail.trim();
    }
    if (offerLetter.candidatePhone && offerLetter.candidatePhone.trim()) {
      candidate.phone = offerLetter.candidatePhone.trim();
    }
    if (offerLetter.candidateAddress && offerLetter.candidateAddress.trim()) {
      candidate.currentAddress = offerLetter.candidateAddress.trim();
    }
    if (offerLetter.market) {
      candidate.market = offerLetter.market;
    }
    if (customOverrides?.joiningDate && customOverrides.joiningDate.trim()) {
      candidate.joiningDate = customOverrides.joiningDate.trim();
    }
    if (offerLetter.salaryBreakup?.annualCtc) {
      candidate.offeredCTC = offerLetter.ctcLpaFormatted || `${Number((offerLetter.salaryBreakup.annualCtc / 100000).toFixed(2))} LPA`;
    }
    candidate.profileCompletion = calculateCompletion(candidate);
    candidate.updatedAt = new Date().toISOString();

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Executive Offer Letter Saved: Ref ${offerLetter.refNo}`,
      `Saved offer letter for ${offerLetter.designation} (${offerLetter.department}) with Annual CTC of ${offerLetter.salaryBreakup.currency} ${offerLetter.salaryBreakup.annualCtc.toLocaleString()}. Status: ${offerLetter.status}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter, employee: candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, employee: candidate, offerLetter, message: 'Offer letter saved to candidate record.' };
  }

  public saveGeneratedOfferLetterWithDocx(
    candidateId: string,
    actor: string,
    actorRole: UserRole,
    customOverrides: Partial<OfferLetterData> | undefined,
    docxBuffer: Buffer
  ): {
    success: boolean;
    candidate?: Employee;
    employee?: Employee;
    offerLetter?: OfferLetterData;
    savedFile?: SavedOfferLetterFile;
    message: string;
  } {
    const genRes = this.generateOfferLetter(candidateId, actor, actorRole, customOverrides);
    if (!genRes.success || !genRes.candidate || !genRes.offerLetter) {
      return genRes;
    }

    const candidate = genRes.candidate;
    const offerLetter = genRes.offerLetter;

    const personDir = path.join(SECURE_UPLOADS_DIR, candidate.id);
    if (!fs.existsSync(personDir)) {
      fs.mkdirSync(personDir, { recursive: true });
    }

    const sanitizedName = (offerLetter.candidateName || candidate.fullName || 'Candidate')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts = Date.now();
    const displayFileName = `White_Collar_Realty_Offer_Letter_${sanitizedName}_${new Date(ts).toISOString().split('T')[0]}.docx`;
    const storedFileName = `offer_letter_${ts}_${displayFileName}`;
    const diskPath = path.join(personDir, storedFileName);

    fs.writeFileSync(diskPath, docxBuffer);
    const relativeStoragePath = path.join('secure_uploads', candidate.id, storedFileName);
    const sizeKb = Math.max(1, Math.round(docxBuffer.length / 1024));
    const fileSizeStr = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb} KB`;

    const savedFile: SavedOfferLetterFile = {
      id: `ol-docx-${ts}-${Math.random().toString(36).slice(2, 6)}`,
      refNo: offerLetter.refNo,
      fileName: displayFileName,
      fileSize: fileSizeStr,
      storagePath: relativeStoragePath,
      generatedAt: new Date(ts).toISOString(),
      generatedBy: actor,
      generatedByRole: actorRole,
      designation: offerLetter.designation,
      department: offerLetter.department,
      annualCtc: offerLetter.salaryBreakup.annualCtc,
      currency: offerLetter.salaryBreakup.currency,
      offerSnapshot: JSON.parse(JSON.stringify(offerLetter)),
    };

    if (!candidate.savedOfferLetters) {
      candidate.savedOfferLetters = [];
    }
    candidate.savedOfferLetters.unshift(savedFile);
    if (candidate.savedOfferLetters.length > 25) {
      candidate.savedOfferLetters = candidate.savedOfferLetters.slice(0, 25);
    }

    if (!candidate.documents) {
      candidate.documents = getDefaultDocumentChecklist(
        candidate.market === 'Dubai' || candidate.market === 'Dual Market'
      );
    }
    candidate.documents.offer_letter = {
      key: 'offer_letter',
      title: 'Signed Offer Letter (.docx)',
      category: 'Photos & General',
      status: 'Verified',
      required: false,
      fileName: displayFileName,
      fileSize: fileSizeStr,
      storagePath: relativeStoragePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      uploadedAt: savedFile.generatedAt,
      verifiedBy: actor,
      verifiedAt: savedFile.generatedAt,
      reviewNotes: `Generated & saved official .docx (${offerLetter.refNo}) by ${actor} (${actorRole}).`,
    };

    candidate.updatedAt = savedFile.generatedAt;
    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', {
      candidateId: candidate.id,
      offerLetter,
      savedFile,
      employee: candidate,
    });
    this.broadcast('EMPLOYEE_UPDATED', candidate);

    return {
      success: true,
      candidate,
      employee: candidate,
      offerLetter,
      savedFile,
      message: 'Offer letter generated and .docx saved to candidate profile.',
    };
  }

  public getSavedOfferLetterFile(
    candidateId: string,
    fileId?: string
  ): { filePath: string; fileName: string; record: SavedOfferLetterFile } | null {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.savedOfferLetters || candidate.savedOfferLetters.length === 0) {
      return null;
    }

    const record = fileId
      ? candidate.savedOfferLetters.find(f => f.id === fileId)
      : candidate.savedOfferLetters[0];
    if (!record) return null;

    const diskPath = path.resolve(DATA_DIR, record.storagePath);
    if (!diskPath.startsWith(SECURE_UPLOADS_DIR + path.sep) || !fs.existsSync(diskPath)) {
      return null;
    }

    return {
      filePath: diskPath,
      fileName: record.fileName,
      record,
    };
  }

  public approveOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; employee?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Approved';
    candidate.offerLetter.approvedBy = actor;
    candidate.offerLetter.approvedAt = new Date().toISOString();
    candidate.updatedAt = new Date().toISOString();

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Offer Letter Approved by HR Leadership`,
      `Offer Ref ${candidate.offerLetter.refNo} officially approved by ${actor} (${actorRole}). Ready for issuance to candidate.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter, employee: candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, employee: candidate, offerLetter: candidate.offerLetter, message: 'Offer letter approved successfully.' };
  }

  public issueOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; employee?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Issued';
    candidate.offerLetter.issuedAt = new Date().toISOString();
    candidate.candidateStatus = 'Offer Extended';
    candidate.updatedAt = new Date().toISOString();

    this.addLifecycleEvent(
      candidate,
      'Offer Extended',
      `Offer Letter Issued to Candidate`,
      `Official White Collar Realty offer letter dispatched to ${candidate.email}. Candidate acceptance deadline: ${candidate.offerLetter.validTillDate}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter, employee: candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, employee: candidate, offerLetter: candidate.offerLetter, message: 'Offer letter issued to candidate.' };
  }

  public acceptOfferLetter(
    candidateId: string,
    signatureName: string,
    actor = 'Candidate Portal',
    actorRole: UserRole = 'HR'
  ): { success: boolean; candidate?: Employee; employee?: Employee; offerLetter?: OfferLetterData; message: string } {
    const candidate = this.data.employees.find(e => e.id === candidateId);
    if (!candidate || !candidate.offerLetter) return { success: false, message: 'Candidate or offer letter not found.' };

    candidate.offerLetter.status = 'Accepted';
    candidate.offerLetter.acceptedAt = new Date().toISOString();
    candidate.offerLetter.candidateSignatureName = signatureName || candidate.fullName;
    candidate.offerLetter.signedAt = new Date().toISOString();
    candidate.candidateStatus = 'Offer Accepted';
    candidate.updatedAt = new Date().toISOString();

    this.addLifecycleEvent(
      candidate,
      'Offer Accepted',
      `Offer Formally Accepted by ${candidate.fullName}`,
      `Candidate confirmed acceptance of offer Ref ${candidate.offerLetter.refNo}. Target joining date: ${candidate.joiningDate || candidate.offerLetter.joiningDate}.`,
      actor,
      actorRole
    );

    this.persist();
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter, employee: candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return { success: true, candidate, employee: candidate, offerLetter: candidate.offerLetter, message: 'Offer accepted successfully.' };
  }

  public emailOfferLetter(
    candidateId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; candidate?: Employee; employee?: Employee; message: string; error?: string } {
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
    this.broadcast('OFFER_LETTER_UPDATED', { candidateId: candidate.id, offerLetter: candidate.offerLetter, employee: candidate });
    this.broadcast('EMPLOYEE_UPDATED', candidate);
    return {
      success: true,
      candidate,
      employee: candidate,
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

    const host = (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
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
      const isViewer = false;
      
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

  // --- Comprehensive Individual Profile Excel Generator (All Linked Records) ---
  public generateIndividualProfileExcel(employeeId: string, role: UserRole): Buffer | null {
    const emp = this.getEmployeeById(employeeId, role);
    if (!emp) return null;

    const fVal = (v: any, fallback = 'Not Provided'): string => {
      if (v === null || v === undefined || v === '') return fallback;
      if (typeof v === 'number') return isNaN(v) ? fallback : String(v);
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (Array.isArray(v)) {
        if (v.length === 0) return fallback;
        return v
          .map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
          .join('; ');
      }
      return String(v).trim() || fallback;
    };

    const wb = XLSX.utils.book_new();

    // ------------------------------------------------------------------------
    // Sheet 1: Personal & Contact
    // ------------------------------------------------------------------------
    const personalRows: Array<[string, string]> = [
      ['SECTION: BASIC PROFILE INFORMATION', ''],
      ['Full Legal Name', fVal(emp.fullName)],
      ['Employee / Candidate Code', fVal(emp.employeeCode)],
      ['Profile Classification', emp.isCandidate ? 'Candidate / Upcoming Joiner' : 'Active Full-Time Employee'],
      ['Official Work Email', fVal(emp.email)],
      ['Primary Contact Phone', fVal(emp.phone)],
      ['Alternate Phone', fVal(emp.alternatePhone, 'None / Not Provided')],
      ['Date of Birth', fVal(emp.dateOfBirth)],
      ['Gender', fVal(emp.gender)],
      ['Nationality', fVal(emp.nationality)],
      ['Current Residential Address', fVal(emp.currentAddress)],
      ['Permanent Residential Address', fVal(emp.permanentAddress)],
      ['', ''],
      ['SECTION: EMERGENCY & NEXT OF KIN CONTACT', ''],
      ['Emergency Contact Name', fVal(emp.emergencyContact?.name)],
      ['Emergency Contact Relationship', fVal(emp.emergencyContact?.relation)],
      ['Emergency Contact Phone', fVal(emp.emergencyContact?.phone)],
      ['Registered Family Members Count', String(emp.familyDetails?.length || 0)],
      [
        'Family Members Details',
        emp.familyDetails && emp.familyDetails.length > 0
          ? emp.familyDetails
              .map(
                f =>
                  `${f.relation}: ${f.name} (Phone: ${fVal(f.phone, 'N/A')}, Occupation: ${fVal(f.occupation, 'N/A')})`
              )
              .join(' | ')
          : 'None Registered',
      ],
      ['', ''],
      ['SECTION: STATUTORY IDENTITY & BANKING DETAILS', ''],
      ['Aadhaar Card Number', fVal(emp.identityDetails?.aadhaarNo)],
      ['PAN Card Number', fVal(emp.identityDetails?.panNo)],
      ['Passport Number', fVal(emp.identityDetails?.passportNo, 'Not Applicable / Not Provided')],
      ['Visa Status & Details', fVal(emp.identityDetails?.visaStatus, 'Not Applicable / Indian Citizen')],
      ['Bank Name', fVal(emp.bankDetails?.bankName)],
      ['Bank Account Number', fVal(emp.bankDetails?.accountNo)],
      ['Bank IFSC Code', fVal(emp.bankDetails?.ifscCode)],
      ['Bank Branch Name', fVal(emp.bankDetails?.branchName)],
      ['', ''],
      ['SECTION: SOCIAL, PORTFOLIO & PERSONAL BACKGROUND', ''],
      ['LinkedIn Profile URL', fVal(emp.linkedinUrl, 'Not Provided')],
      ['Google Drive Dossier Link', fVal(emp.googleDriveLink, 'Not Linked')],
      ['Hobbies & Interests', fVal(emp.hobbies, 'Not Disclosed')],
      ['Medical / Health Conditions', fVal(emp.medicalConditions, 'None Disclosed (Fit to Work)')],
    ];

    const wsPersonal = XLSX.utils.aoa_to_sheet([
      ['Information Field', 'Recorded Profile Value'],
      ...personalRows,
    ]);
    wsPersonal['!cols'] = [{ wch: 34 }, { wch: 72 }];
    XLSX.utils.book_append_sheet(wb, wsPersonal, 'Personal & Contact');

    // ------------------------------------------------------------------------
    // Sheet 2: Employment & Department
    // ------------------------------------------------------------------------
    const isInternDept = isInternAllowedDepartment(emp.department);
    const empRows: Array<[string, string]> = [
      ['SECTION: ORGANIZATIONAL ALIGNMENT', ''],
      ['Designation / Title', fVal(emp.designation)],
      ['Department', fVal(emp.department)],
      ['Sub-Department / Unit', fVal(emp.subDepartment, 'General (Department Root)')],
      ['Employment Category', fVal(emp.employmentCategory, 'Employee')],
      ['Employment Status', fVal(emp.employmentStatus)],
      [
        'Candidate Onboarding Status',
        emp.isCandidate ? fVal(emp.candidateStatus, 'Offer Accepted') : 'N/A (Active Employee)',
      ],
      ['Market Focus', fVal(emp.market)],
      ['Reporting Manager', fVal(emp.reportingManager, 'Executive Management')],
      ['', ''],
      ['SECTION: TENURE & KEY DATES', ''],
      ['Official / Expected Joining Date', fVal(emp.joiningDate)],
      [
        'Internship Completion Date',
        isInternDept && emp.employmentCategory === 'Intern'
          ? fVal(emp.internshipCompletionDate, 'Not Set')
          : 'N/A (Not an Intern)',
      ],
      ['Job End Date / Exit Date', fVal(emp.jobEndDate, 'N/A (Active in Service)')],
      ['', ''],
      ['SECTION: WORKPLACE & DESK PLACEMENT', ''],
      ['Designated Desk Slot', fVal(emp.desk, 'Unassigned')],
      ['Office Bay Location', emp.desk ? getBayFromDesk(emp.desk) : 'Unassigned'],
      ['Source Spreadsheet Seat Notation', fVal(emp.sourceSpreadsheetSeat, 'N/A')],
      ['', ''],
      ['SECTION: SYSTEM METADATA', ''],
      ['Profile Readiness Score', `${emp.profileCompletion || 0}% Complete`],
      ['System Database Identifier', fVal(emp.id)],
      ['Record Created Timestamp', fVal(emp.createdAt)],
      ['Record Last Updated Timestamp', fVal(emp.updatedAt)],
    ];

    const wsEmp = XLSX.utils.aoa_to_sheet([
      ['Employment Field', 'Recorded Organizational Value'],
      ...empRows,
    ]);
    wsEmp['!cols'] = [{ wch: 34 }, { wch: 72 }];
    XLSX.utils.book_append_sheet(wb, wsEmp, 'Employment & Dept');

    // ------------------------------------------------------------------------
    // Sheet 3: Compensation & Experience
    // ------------------------------------------------------------------------
    const expRows: Array<[string, string]> = [
      ['SECTION: PRIOR EXPERIENCE & CTC', ''],
      ['Previous Employer / Company', fVal(emp.previousCompany, 'Fresher / First Professional Role')],
      ['Previous Designation', fVal(emp.previousDesignation, 'Student / Trainee')],
      ['Total Professional Experience', `${fVal(emp.totalExperienceYears, '0')} Year(s), ${fVal(emp.totalExperienceMonths, '0')} Month(s)`],
      ['Gurgaon Market Real Estate Experience', fVal(emp.gurgaonMarketExperience, 'None / New to Micro-Market')],
      ['Dubai Market Real Estate Experience', fVal(emp.dubaiMarketExperience, 'None / New to Region')],
      ['Previous Verified CTC', fVal(emp.previousCTC, 'N/A (Fresher / Not Disclosed)')],
      ['Current Offered CTC (White Collar Realty)', fVal(emp.offeredCTC, 'As per Company Structure')],
      ['', ''],
      ['SECTION: CAREER ASPIRATIONS & GOALS', ''],
      ['Why White Collar Realty', fVal(emp.aspirations?.whyWhiteCollarRealty, 'Not Recorded')],
      ['Association Duration Expectation', fVal(emp.aspirations?.associationDuration, 'Not Recorded')],
      ['Short-Term Career Goal', fVal(emp.aspirations?.shortTermGoal, 'Not Recorded')],
      ['Long-Term Career Goal', fVal(emp.aspirations?.longTermGoal, 'Not Recorded')],
    ];

    const educationTableData =
      emp.education && emp.education.length > 0
        ? emp.education.map(ed => ({
            'Degree / Qualification': fVal(ed.degree),
            'Institution': fVal(ed.institution),
            'Board or University': fVal(ed.boardOrUniversity),
            'Passing Year': fVal(ed.yearOfPassing),
            'Grade or Percentage': fVal(ed.gradeOrPercentage),
          }))
        : [
            {
              'Degree / Qualification': 'None Registered',
              'Institution': 'N/A',
              'Board or University': 'N/A',
              'Passing Year': 'N/A',
              'Grade or Percentage': 'N/A',
            },
          ];

    const referencesTableData =
      emp.references && emp.references.length > 0
        ? emp.references.map(r => ({
            'Reference Name': fVal(r.name),
            'Reference Type': fVal(r.type),
            'Relationship / Title': fVal(r.relationshipOrTitle),
            'Phone Number': fVal(r.phone),
            'Email / Organization': fVal(r.company || r.email, 'N/A'),
          }))
        : [
            {
              'Reference Name': 'None Registered',
              'Reference Type': 'N/A',
              'Relationship / Title': 'N/A',
              'Phone Number': 'N/A',
              'Email / Organization': 'N/A',
            },
          ];

    const wsCompAoa = [
      ['Experience & Compensation Metric', 'Profile Value'],
      ...expRows,
      ['', ''],
      ['ACADEMIC & EDUCATIONAL BACKGROUND', '', '', '', ''],
      ['Degree / Qualification', 'Institution', 'Board / University', 'Passing Year', 'Grade / %'],
      ...educationTableData.map(e => [
        e['Degree / Qualification'],
        e['Institution'],
        e['Board or University'],
        e['Passing Year'],
        e['Grade or Percentage'],
      ]),
      ['', ''],
      ['PROFESSIONAL & PERSONAL REFERENCES', '', '', '', ''],
      ['Reference Name', 'Reference Type', 'Relationship / Title', 'Phone Number', 'Email / Organization'],
      ...referencesTableData.map(r => [
        r['Reference Name'],
        r['Reference Type'],
        r['Relationship / Title'],
        r['Phone Number'],
        r['Email / Organization'],
      ]),
    ];
    const wsComp = XLSX.utils.aoa_to_sheet(wsCompAoa);
    wsComp['!cols'] = [{ wch: 32 }, { wch: 32 }, { wch: 28 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsComp, 'Compensation & Exp');

    // ------------------------------------------------------------------------
    // Sheet 4: Documents & Verification
    // ------------------------------------------------------------------------
    const docEntries = Object.values(emp.documents || {});
    const docTableRows = docEntries.map(d => ({
      'Document Slot Key': d.key,
      'Document Title': d.title,
      'Category': d.category,
      'Mandatory / Required': d.required ? 'Yes' : 'No',
      'Verification Status': d.status,
      'Uploaded File Name': fVal(d.fileName, 'Not Uploaded'),
      'File Size': fVal(d.fileSize, '—'),
      'File Type / MIME': fVal(d.mimeType, '—'),
      'Uploaded Timestamp': fVal(d.uploadedAt, '—'),
      'Uploaded Via': fVal(d.uploadedVia, d.fileName ? 'HR Admin / Portal' : '—'),
      'Verified By': fVal(d.verifiedBy, 'Pending Verification'),
      'Verified Timestamp': fVal(d.verifiedAt, '—'),
      'HR Review Notes': fVal(d.reviewNotes, 'None'),
      'File Stored on Server': d.storagePath || d.fileData ? 'Yes' : 'No',
    }));

    const wsDocs = XLSX.utils.json_to_sheet(
      docTableRows.length > 0
        ? docTableRows
        : [
            {
              'Document Slot Key': 'N/A',
              'Document Title': 'No checklist documents configured',
              'Category': 'N/A',
              'Mandatory / Required': 'N/A',
              'Verification Status': 'N/A',
              'Uploaded File Name': 'N/A',
              'File Size': 'N/A',
              'File Type / MIME': 'N/A',
              'Uploaded Timestamp': 'N/A',
              'Uploaded Via': 'N/A',
              'Verified By': 'N/A',
              'Verified Timestamp': 'N/A',
              'HR Review Notes': 'N/A',
              'File Stored on Server': 'N/A',
            },
          ]
    );
    wsDocs['!cols'] = [
      { wch: 22 },
      { wch: 32 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 22 },
      { wch: 35 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDocs, 'Documents & Status');

    // ------------------------------------------------------------------------
    // Sheet 5: Offer Letter & Lifecycle
    // ------------------------------------------------------------------------
    const off = emp.offerLetter;
    const grossVal = off?.salaryBreakup?.grossMonthly;
    const offerSummaryRows: Array<[string, string]> = [
      ['SECTION: EMPLOYMENT OFFER LETTER RECORD', ''],
      ['Offer Reference Number', fVal(off?.refNo, 'Not Generated')],
      ['Offer Lifecycle Status', fVal(off?.status, 'Draft / Not Generated')],
      ['Designation in Offer', fVal(off?.designation, fVal(emp.designation))],
      ['Department in Offer', fVal(off?.department, fVal(emp.department))],
      ['Proposed Date of Joining', fVal(off?.joiningDate, fVal(emp.joiningDate))],
      ['Offer Valid Till Date', fVal(off?.validTillDate, 'N/A')],
      ['Annual CTC (LPA)', fVal(off?.ctcLpaFormatted, fVal(emp.offeredCTC))],
      ['Monthly Gross CTC', grossVal ? `₹${grossVal.toLocaleString('en-IN')}` : 'N/A'],
      ['Monthly Basic Salary', off?.basicMonthly ? `₹${off.basicMonthly.toLocaleString('en-IN')}` : 'N/A'],
      ['Annual Basic Salary', off?.basicYearly ? `₹${off.basicYearly.toLocaleString('en-IN')}` : 'N/A'],
      ['Monthly PBVP / Variable Pay', off?.pbvpMonthly ? `₹${off.pbvpMonthly.toLocaleString('en-IN')}` : 'N/A'],
      ['Annual PBVP / Variable Pay', off?.pbvpYearly ? `₹${off.pbvpYearly.toLocaleString('en-IN')}` : 'N/A'],
      ['Monthly Retention Bonus', off?.retentionBonusMonthly ? `₹${off.retentionBonusMonthly.toLocaleString('en-IN')}` : 'N/A'],
      ['Monthly Total Deductions', off?.totalDeductionsMonthly ? `₹${off.totalDeductionsMonthly.toLocaleString('en-IN')}` : 'N/A'],
      ['Estimated Net In-Hand Pay (Monthly)', off?.netPayMonthly ? `₹${off.netPayMonthly.toLocaleString('en-IN')}` : 'N/A'],
      ['Formally Approved By', fVal(off?.approvedBy, 'Pending HR Approval')],
      ['Formally Issued Timestamp', fVal(off?.issuedAt, 'Not Yet Formally Issued')],
      ['Candidate Acceptance Date', fVal(off?.acceptedAt, 'Pending Candidate Signature')],
      ['Candidate Signatory Name', fVal(off?.candidateSignatureName, 'Pending Signature')],
    ];

    const interviewRows = (emp.interviews || []).map((iv, idx) => [
      String(idx + 1),
      fVal(iv.roundName),
      fVal(iv.mode),
      fVal(iv.scheduledDate),
      fVal(iv.interviewer),
      fVal(iv.status),
      iv.rating ? `${iv.rating} / 5` : 'Not Rated',
      fVal(iv.feedback, 'No notes recorded'),
    ]);

    const savedOfferRows = (emp.savedOfferLetters || []).map(f => [
      fVal(f.id || f.refNo),
      fVal(f.fileName),
      fVal(f.generatedAt),
      `${fVal(f.generatedBy)} (${fVal(f.generatedByRole)})`,
    ]);

    const wsLifecycleAoa = [
      ['Offer Letter Attribute', 'Recorded Value'],
      ...offerSummaryRows,
      ['', ''],
      ['INTERVIEW EVALUATION ROUNDS', '', '', '', '', '', '', ''],
      ['Round #', 'Round Title', 'Format', 'Scheduled Date', 'Interviewer', 'Status', 'Rating', 'Feedback'],
      ...(interviewRows.length > 0
        ? interviewRows
        : [['1', 'No interview rounds registered for this profile', '—', '—', '—', '—', '—', '—']]),
      ['', ''],
      ['SAVED WORD (.DOCX) OFFER LETTERS', '', '', ''],
      ['File ID', 'Document File Name', 'Generated At', 'Generated By & Role'],
      ...(savedOfferRows.length > 0
        ? savedOfferRows
        : [['N/A', 'No Word offer letter files generated yet', '—', '—']]),
    ];

    const wsLifecycle = XLSX.utils.aoa_to_sheet(wsLifecycleAoa);
    wsLifecycle['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsLifecycle, 'Offer & Lifecycle');

    // ------------------------------------------------------------------------
    // Sheet 6: Asset History & Reminders
    // ------------------------------------------------------------------------
    const assignedAssets = this.data.assets.filter(
      a =>
        a.assignedEmployeeId === emp.id ||
        (emp.employeeCode && a.assignedEmployeeCode === emp.employeeCode)
    );
    const assetTableRows = assignedAssets.map(a => ({
      'Asset Tag': a.assetTag,
      'Asset Model / Name': a.name,
      'Category': a.type,
      'Serial Number': fVal(a.serialNumber, 'N/A'),
      'Status': a.status,
      'Physical Condition': a.condition,
      'Issue Date': fVal(a.issueDate, '—'),
      'Expected Return Date': fVal(a.expectedReturnDate, 'Not Specified'),
      'Actual Return Date': fVal(a.returnDate, 'Still in Possession'),
      'Custody Notes': fVal(a.notes, 'None'),
    }));

    const assetReminders = (this.data.assetReturnReminders || []).filter(r => r.personId === emp.id);
    const reminderTableRows = assetReminders.map(r => ({
      'Reminder ID': r.id,
      'Asset Tag': (r.unreturnedAssets || []).map(a => a.assetTag).join(', ') || 'N/A',
      'Asset Name': (r.unreturnedAssets || []).map(a => a.name).join(', ') || 'N/A',
      'Channel': `Email: ${r.emailStatus} | WA: ${r.whatsappStatus}`,
      'Status': r.overallStatus,
      'Sent At': fVal(r.emailSentAt || r.whatsappSentAt || r.createdAt),
      'Next Retry At': fVal(r.nextRetryAt, '—'),
      'Sent By': 'Automated Asset Scheduler',
      'Delivery Notes': `Email err: ${r.emailError || 'None'} | WA err: ${r.whatsappError || 'None'}`,
    }));

    const wsAssetAoa = [
      ['COMPANY ASSET CUSTODY & INVENTORY ASSIGNMENTS', '', '', '', '', '', '', '', '', ''],
      ['Asset Tag', 'Asset Model / Name', 'Category', 'Serial Number', 'Status', 'Condition', 'Issue Date', 'Expected Return', 'Return Date', 'Notes'],
      ...(assetTableRows.length > 0
        ? assetTableRows.map(a => [
            a['Asset Tag'],
            a['Asset Model / Name'],
            a['Category'],
            a['Serial Number'],
            a['Status'],
            a['Physical Condition'],
            a['Issue Date'],
            a['Expected Return Date'],
            a['Actual Return Date'],
            a['Custody Notes'],
          ])
        : [['N/A', 'No assets currently or historically assigned to this person', '—', '—', '—', '—', '—', '—', '—', '—']]),
      ['', ''],
      ['ASSET RETURN AUTOMATED NOTIFICATION & REMINDER LOGS', '', '', '', '', '', '', '', ''],
      ['Reminder ID', 'Asset Tag', 'Asset Name', 'Channel', 'Status', 'Sent At', 'Next Retry', 'Sent By', 'Notes'],
      ...(reminderTableRows.length > 0
        ? reminderTableRows.map(r => [
            r['Reminder ID'],
            r['Asset Tag'],
            r['Asset Name'],
            r['Channel'],
            r['Status'],
            r['Sent At'],
            r['Next Retry At'],
            r['Sent By'],
            r['Delivery Notes'],
          ])
        : [['N/A', 'No automated asset reminders logged for this person', '—', '—', '—', '—', '—', '—', '—']]),
    ];

    const wsAssets = XLSX.utils.aoa_to_sheet(wsAssetAoa);
    wsAssets['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsAssets, 'Assets & Inventory');

    // ------------------------------------------------------------------------
    // Sheet 7: Audit Trail & Activity Log
    // ------------------------------------------------------------------------
    const relevantLogs = this.data.auditLogs.filter(
      l =>
        l.entityId === emp.id ||
        (emp.employeeCode && (l.details?.includes(emp.employeeCode) || l.entityId?.includes(emp.employeeCode))) ||
        (emp.fullName && l.entityName === emp.fullName)
    );

    const logTableRows = relevantLogs.map(l => ({
      'Timestamp': l.timestamp,
      'Action Taken': l.action,
      'Actor Name': l.actor,
      'Actor Role': l.actorRole,
      'Entity Type': l.entityType,
      'Entity Name': l.entityName,
      'Detailed Log Message': l.details,
    }));

    const wsLogs = XLSX.utils.json_to_sheet(
      logTableRows.length > 0
        ? logTableRows
        : [
            {
              'Timestamp': fVal(emp.createdAt),
              'Action Taken': 'Profile Created',
              'Actor Name': 'HR System',
              'Actor Role': 'HR',
              'Entity Type': 'Employee',
              'Entity Name': emp.fullName,
              'Detailed Log Message': 'Initial record seeded in White Collar Realty directory.',
            },
          ]
    );
    wsLogs['!cols'] = [
      { wch: 24 },
      { wch: 28 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 24 },
      { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Audit Trail');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
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
    let defaultExpectedReturn: string | null = assetData.expectedReturnDate || null;
    if (assetData.assignedEmployeeId) {
      const emp = this.data.employees.find(e => e.id === assetData.assignedEmployeeId);
      if (emp) {
        empName = emp.fullName;
        empCode = emp.employeeCode;
        if (!defaultExpectedReturn) {
          defaultExpectedReturn =
            emp.internshipCompletionDate ||
            emp.jobEndDate ||
            emp.exitClearance?.actualLwd ||
            emp.exitClearance?.calculatedLwd ||
            null;
        }
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
      lastAssignedEmployeeId: assetData.assignedEmployeeId || null,
      lastAssignedEmployeeName: empName,
      issueDate: assetData.assignedEmployeeId ? (assetData.issueDate || new Date().toISOString().split('T')[0]) : undefined,
      expectedReturnDate: defaultExpectedReturn,
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
    actorRole: UserRole,
    expectedReturnDate?: string | null
  ): CompanyAsset | null {
    const asset = this.data.assets.find(a => a.id === assetId);
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!asset || !emp) return null;

    asset.assignedEmployeeId = emp.id;
    asset.assignedEmployeeName = emp.fullName;
    asset.assignedEmployeeCode = emp.employeeCode;
    asset.lastAssignedEmployeeId = emp.id;
    asset.lastAssignedEmployeeName = emp.fullName;
    asset.issueDate = issueDate || new Date().toISOString().split('T')[0];
    asset.expectedReturnDate =
      expectedReturnDate !== undefined
        ? expectedReturnDate
        : emp.internshipCompletionDate ||
          emp.jobEndDate ||
          emp.exitClearance?.actualLwd ||
          emp.exitClearance?.calculatedLwd ||
          null;
    asset.returnDate = null;
    asset.status = 'In Use';
    if (notes) asset.notes = notes;
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

    const formerEmpId = asset.assignedEmployeeId;
    const formerEmp = asset.assignedEmployeeName;
    if (formerEmpId) asset.lastAssignedEmployeeId = formerEmpId;
    if (formerEmp) asset.lastAssignedEmployeeName = formerEmp;
    asset.assignedEmployeeId = null;
    asset.assignedEmployeeName = null;
    asset.assignedEmployeeCode = null;
    asset.returnDate = returnDate || new Date().toISOString().split('T')[0];
    asset.status = 'Available';
    asset.condition = condition || asset.condition;
    if (notes) asset.notes = notes;
    asset.updatedAt = new Date().toISOString();

    asset.history.unshift({
      date: new Date().toISOString(),
      action: 'Returned',
      performedBy: actor,
      employeeName: formerEmp || undefined,
      notes: notes || `Returned by ${formerEmp || 'employee'} on ${asset.returnDate} in ${asset.condition} condition`,
    });

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Asset Returned',
      'Asset',
      asset.id,
      asset.name,
      `Returned [${asset.assetTag}] ${asset.name} from ${formerEmp || 'employee'} on ${asset.returnDate}. Marked as Available.`
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
    const initialEmployees = JSON.parse(JSON.stringify([...SEED_EMPLOYEES, ...SEED_CANDIDATES]));
    this.data = {
      employees: initialEmployees,
      assets: JSON.parse(JSON.stringify(SEED_ASSETS)),
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
        ...JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
      ],
      departments: JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS)),
      qrDocumentTokens: [],
      salaryStructures: JSON.parse(JSON.stringify(DEFAULT_ROLE_SALARY_STRUCTURES)),
      assetReturnReminders: [],
      notificationDeliveryLogs: [],
      acknowledgedAlerts: {},
      version: 3,
      lastUpdated: new Date().toISOString(),
    };
    this.ensureDepartmentsAndAssignmentsOnSchema(this.data, false);
    this.persist();
    this.broadcast('DATABASE_RESET', { time: this.data.lastUpdated });
    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());
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

  public dismissMissingDocumentAlerts(
    actor: string,
    actorRole: UserRole,
    candidateId?: string
  ): { dismissedIds: string[]; count: number } {
    if (!this.data.acknowledgedAlerts) {
      this.data.acknowledgedAlerts = {};
    }
    const nowIso = new Date().toISOString();
    const dismissedIds: string[] = [];

    if (candidateId) {
      const id = `missing-docs-${candidateId}`;
      this.data.acknowledgedAlerts[id] = { dismissedAt: nowIso, dismissedBy: actor };
      dismissedIds.push(id);
    } else {
      this.data.employees.forEach(cand => {
        if (!cand.isCandidate) return;
        const hasMissing = Object.values(cand.documents || {}).some(
          d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
        );
        if (hasMissing) {
          const id = `missing-docs-${cand.id}`;
          this.data.acknowledgedAlerts[id] = { dismissedAt: nowIso, dismissedBy: actor };
          dismissedIds.push(id);
        }
      });
    }

    this.persist();
    this.logAudit(
      actor,
      actorRole,
      'Missing Documents HR Alert Dismissed',
      'Candidate',
      candidateId || 'all-missing-docs',
      candidateId || 'HR Alert: Candidate Missing Documents',
      `Dismissed ${dismissedIds.length} missing-document alert(s) on dashboard.`
    );
    this.broadcast('ALERT_DISMISSED', { dismissedIds, actor });
    this.broadcast('ALERT_UPDATED', { dismissedIds });
    return { dismissedIds, count: dismissedIds.length };
  }

  public resetDismissedAlerts(actor: string): boolean {
    this.data.acknowledgedAlerts = {};
    this.persist();
    this.broadcast('ALERTS_RESET', { actor });
    return true;
  }

  // --- Automation: Asset Return Reminders & Notification Delivery Logs ---
  public getAssetReturnReminders(personId?: string): AssetReturnReminderRecord[] {
    const list = this.data.assetReturnReminders || [];
    if (personId) {
      return list.filter(r => r.personId === personId);
    }
    return list;
  }

  public getAssetReturnReminderByKey(idempotencyKey: string): AssetReturnReminderRecord | undefined {
    return (this.data.assetReturnReminders || []).find(r => r.idempotencyKey === idempotencyKey);
  }

  public upsertAssetReturnReminder(record: AssetReturnReminderRecord): AssetReturnReminderRecord {
    if (!this.data.assetReturnReminders) {
      this.data.assetReturnReminders = [];
    }
    const idx = this.data.assetReturnReminders.findIndex(
      r => r.id === record.id || r.idempotencyKey === record.idempotencyKey
    );
    if (idx >= 0) {
      this.data.assetReturnReminders[idx] = record;
    } else {
      this.data.assetReturnReminders.unshift(record);
    }
    this.persist();
    this.broadcast('ASSET_REMINDER_UPDATED', record);
    return record;
  }

  public addNotificationDeliveryLog(
    entry: Omit<NotificationDeliveryLog, 'id' | 'timestamp'> & { timestamp?: string }
  ): NotificationDeliveryLog {
    if (!this.data.notificationDeliveryLogs) {
      this.data.notificationDeliveryLogs = [];
    }
    const log: NotificationDeliveryLog = {
      ...entry,
      id: `ndlv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    this.data.notificationDeliveryLogs.unshift(log);
    if (this.data.notificationDeliveryLogs.length > 500) {
      this.data.notificationDeliveryLogs = this.data.notificationDeliveryLogs.slice(0, 500);
    }
    this.persist();
    this.broadcast('NOTIFICATION_LOG_ADDED', log);
    return log;
  }

  public getNotificationDeliveryLogs(limit = 100, personId?: string): NotificationDeliveryLog[] {
    let list = this.data.notificationDeliveryLogs || [];
    if (personId) {
      list = list.filter(l => l.personId === personId);
    }
    return list.slice(0, limit);
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }

  // ==========================================================================
  // Department & Sub-Department Management Engine
  // ==========================================================================
  private inferLegacyDepartmentMigration(emp: Employee): { department: string; subDepartment?: string; category?: 'Employee' | 'Intern' | 'Consultant' | 'Contractor' } | null {
    const desig = (emp.designation || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    const sub = (emp.subDepartment || '').toLowerCase();
    const isIntern =
      emp.employmentStatus === 'Intern' ||
      desig.includes('intern') ||
      desig.includes('trainee') ||
      dept.includes('intern');

    if (
      desig.includes('da ') ||
      desig.includes('data analyst') ||
      desig.includes('analytics') ||
      dept === 'da department' ||
      dept === 'data analytics'
    ) {
      return {
        department: 'DA Department',
        subDepartment: isIntern ? 'DA Interns' : 'DA Employees',
        category: isIntern ? 'Intern' : 'Employee',
      };
    }

    if (
      desig.includes('analytics') ||
      desig.includes('da ') ||
      dept === 'da' ||
      dept === 'da department' ||
      dept === 'data analytics' ||
      sub.includes('da ')
    ) {
      return {
        department: 'DA',
        subDepartment: isIntern ? 'DA Interns' : 'DA Employees',
        category: isIntern ? 'Intern' : 'Employee',
      };
    }

    if (
      desig.includes('ai ') ||
      desig.includes('artificial intelligence') ||
      dept === 'ai' ||
      dept === 'ai intern' ||
      dept === 'ai department' ||
      (dept.includes('tech') && isIntern) ||
      sub.includes('ai ')
    ) {
      return {
        department: 'AI',
        subDepartment: isIntern ? 'AI Interns' : 'AI Employees',
        category: isIntern ? 'Intern' : 'Employee',
      };
    }

    if (
      desig.includes('dm ') ||
      dept === 'dm' ||
      dept === 'dm intern' ||
      dept.includes('marketing') ||
      sub.includes('dm ')
    ) {
      return {
        department: 'DM',
        subDepartment: isIntern ? 'DM Interns' : 'DM Employees',
        category: isIntern ? 'Intern' : 'Employee',
      };
    }

    if (dept.includes('human resources') || dept === 'hr' || desig.includes('hr ')) {
      return {
        department: 'HR',
        subDepartment: isIntern ? 'HR Interns' : 'HR Employees',
        category: isIntern ? 'Intern' : 'Employee',
      };
    }

    if (desig.includes('dubai') || emp.market === 'Dubai' || dept.includes('dubai') || dept.includes('nri')) {
      return {
        department: 'Dubai Market',
        subDepartment: 'Dubai Employees',
        category: 'Employee',
      };
    }

    if (
      dept.includes('gurgaon') ||
      dept === 'sales & investments' ||
      dept === 'sales & leadership' ||
      dept === 'luxury residential & investments'
    ) {
      return {
        department: 'Gurgaon Market',
        subDepartment: 'Gurgaon Employees',
        category: 'Employee',
      };
    }

    if (dept === 'administration & facilities' || dept === 'operations & pantry support' || dept.includes('admin') || dept.includes('operations')) {
      return {
        department: 'Administration & Operations',
        subDepartment: 'Administration & Operations Employees',
        category: 'Employee',
      };
    }

    if (dept.includes('executive') || dept.includes('founder') || dept.includes('leadership')) {
      return {
        department: 'Executive Leadership',
        subDepartment: 'Executive Leadership Employees',
        category: 'Employee',
      };
    }

    return null;
  }

  private ensureDepartmentsAndAssignmentsOnSchema(schema: DatabaseSchema, _migrateLegacyLabels: boolean): boolean {
    let changed = false;
    const nowIso = new Date().toISOString();

    if (!schema.departments || !Array.isArray(schema.departments) || schema.departments.length === 0) {
      schema.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS));
      changed = true;
    }

    if (!schema.employmentCategories || !Array.isArray(schema.employmentCategories)) {
      schema.employmentCategories = ['Employee', 'Intern', 'Consultant', 'Contractor'];
      changed = true;
    }

    if (!schema.qrDocumentTokens || !Array.isArray(schema.qrDocumentTokens)) {
      schema.qrDocumentTokens = [];
      changed = true;
    }

    // 1. Consolidate & Standardize the 4 Intern-allowed departments: HR, AI, DA, DM
    const internDeptsConfig: { id: string; name: string; desc: string; market: MarketType; empSub: string; internSub: string }[] = [
      { id: 'dept-hr', name: 'HR', desc: 'People operations, talent acquisition, onboarding compliance, and employee lifecycle.', market: 'Dual Market', empSub: 'HR Employees', internSub: 'HR Interns' },
      { id: 'dept-ai', name: 'AI', desc: 'Artificial intelligence engineering, agentic automation, and LLM solutions.', market: 'Gurgaon', empSub: 'AI Employees', internSub: 'AI Interns' },
      { id: 'dept-da', name: 'DA', desc: 'Data analytics, business intelligence, real estate metrics, and market forecasting.', market: 'Gurgaon', empSub: 'DA Employees', internSub: 'DA Interns' },
      { id: 'dept-dm', name: 'DM', desc: 'Digital marketing, brand strategy, performance marketing, and creative lead generation.', market: 'Dual Market', empSub: 'DM Employees', internSub: 'DM Interns' },
    ];

    internDeptsConfig.forEach(cfg => {
      let dept = schema.departments!.find(d => {
        const n = d.name.toLowerCase();
        if (cfg.name === 'HR') return n === 'hr' || n === 'human resources' || d.id === 'dept-hr';
        if (cfg.name === 'AI') return n === 'ai' || n === 'ai department' || n === 'ai intern' || d.id === 'dept-ai';
        if (cfg.name === 'DA') return n === 'da' || n === 'da department' || d.id === 'dept-da';
        if (cfg.name === 'DM') return n === 'dm' || n === 'dm department' || n === 'dm intern' || n.includes('marketing') || d.id === 'dept-dm' || d.id === 'dept-marketing';
        return false;
      });

      if (!dept) {
        dept = {
          id: cfg.id,
          name: cfg.name,
          description: cfg.desc,
          marketFocus: cfg.market,
          subDepartments: [
            { id: `sub-${cfg.name.toLowerCase()}-emp`, name: cfg.empSub, createdAt: nowIso, updatedAt: nowIso },
            { id: `sub-${cfg.name.toLowerCase()}-intern`, name: cfg.internSub, createdAt: nowIso, updatedAt: nowIso },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        schema.departments!.push(dept);
        changed = true;
      } else {
        if (dept.name !== cfg.name) {
          dept.name = cfg.name;
          changed = true;
        }
        if (dept.id !== cfg.id) {
          dept.id = cfg.id;
          changed = true;
        }
        // Ensure only Employees and Interns sub-departments exist
        dept.subDepartments = [
          { id: `sub-${cfg.name.toLowerCase()}-emp`, name: cfg.empSub, createdAt: nowIso, updatedAt: nowIso },
          { id: `sub-${cfg.name.toLowerCase()}-intern`, name: cfg.internSub, createdAt: nowIso, updatedAt: nowIso },
        ];
        changed = true;
      }
    });

    // Remove legacy duplicate departments like dept-dm-intern or dept-marketing if merged into DM
    schema.departments = schema.departments!.filter(d => {
      if (d.name === 'DM Intern' || d.id === 'dept-dm-intern') return false;
      if (d.name === 'AI Intern' || d.id === 'dept-ai-intern') return false;
      return true;
    });

    // 2. Sanitize all other departments: MUST HAVE EMPLOYEES ONLY. Strip any intern sub-departments.
    schema.departments!.forEach(dept => {
      if (isInternAllowedDepartment(dept.name)) {
        return; // Handled above
      }

      // Purge any sub-departments with 'intern' in name
      const beforeCount = dept.subDepartments.length;
      dept.subDepartments = dept.subDepartments.filter(s => !s.name.toLowerCase().includes('intern') && !s.id.toLowerCase().includes('intern'));
      if (dept.subDepartments.length !== beforeCount) {
        changed = true;
      }

      // Ensure an Employee sub-department exists
      const baseClean = dept.name.replace(/Department|Market/gi, '').trim() || dept.name;
      const empSubName = `${baseClean} Employees`;
      if (dept.subDepartments.length === 0) {
        dept.subDepartments.push({
          id: `sub-${dept.id}-emp`,
          name: empSubName,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        changed = true;
      } else if (!dept.subDepartments.some(s => s.name.toLowerCase().includes('employee'))) {
        dept.subDepartments.unshift({
          id: `sub-${dept.id}-emp`,
          name: empSubName,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        changed = true;
      }
    });

    // 3. Normalize all employees & candidates to obey the rule
    schema.employees.forEach(emp => {
      // First normalize legacy department names
      const normDept = normalizeStandardDepartmentName(emp.department);
      if (normDept !== emp.department) {
        emp.department = normDept;
        changed = true;
      }

      const isAllowedInternDept = isInternAllowedDepartment(emp.department);

      // Check if employee designation or status is intern
      const desigLower = (emp.designation || '').toLowerCase();
      const statusLower = (emp.employmentStatus || '').toLowerCase();
      const hasInternDesignation = desigLower.includes('intern') || desigLower.includes('trainee');

      if (isAllowedInternDept) {
        // Find standardized department config
        const dObj = schema.departments!.find(d => d.name === emp.department);
        if (dObj) emp.departmentId = dObj.id;

        const isInternPerson =
          emp.employmentCategory === 'Intern' ||
          statusLower === 'intern' ||
          hasInternDesignation;

        if (isInternPerson) {
          emp.employmentCategory = 'Intern';
          emp.subDepartment = `${emp.department} Interns`;
          changed = true;
        } else {
          if (!emp.employmentCategory || emp.employmentCategory === 'Intern') {
            emp.employmentCategory = 'Employee';
            changed = true;
          }
          if (!emp.subDepartment || emp.subDepartment.toLowerCase().includes('intern')) {
            emp.subDepartment = `${emp.department} Employees`;
            changed = true;
          }
        }
      } else {
        // NON-INTERN DEPARTMENT: STRICTLY NO INTERN CATEGORIES ALLOWED
        if (emp.employmentCategory === 'Intern') {
          emp.employmentCategory = 'Employee';
          changed = true;
        }
        if (statusLower === 'intern') {
          emp.employmentStatus = emp.isCandidate ? 'Upcoming Joiner' : 'Full-Time';
          changed = true;
        }
        if (emp.internshipCompletionDate) {
          emp.internshipCompletionDate = '';
          changed = true;
        }

        const dObj = schema.departments!.find(d => d.name.toLowerCase() === emp.department.toLowerCase());
        if (dObj) {
          emp.departmentId = dObj.id;
          emp.department = dObj.name;
          const empSub = dObj.subDepartments.find(s => s.name.toLowerCase().includes('employee'))?.name || dObj.subDepartments[0]?.name || `${dObj.name} Employees`;
          if (!emp.subDepartment || emp.subDepartment.toLowerCase().includes('intern')) {
            emp.subDepartment = empSub;
            changed = true;
          }
        }
      }

      if (!emp.documents || Object.keys(emp.documents).length === 0) {
        emp.documents = getDefaultDocumentChecklist(emp.market === 'Dubai' || emp.market === 'Dual Market');
        changed = true;
      }
    });

    return changed;
  }

  private resolveAndEnsureDepartment(
    departmentId?: string,
    departmentName?: string,
    subDepartmentName?: string,
    marketFocus: MarketType = 'Gurgaon'
  ): { departmentId: string; department: string; subDepartment?: string } {
    const depts: DepartmentConfig[] =
      this.data.departments && this.data.departments.length > 0
        ? this.data.departments
        : (this.data.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS)) as DepartmentConfig[]);

    const nowIso = new Date().toISOString();
    let dept =
      (departmentId ? depts.find(d => d.id === departmentId) : undefined) ||
      (departmentName ? depts.find(d => d.name.toLowerCase() === departmentName.trim().toLowerCase()) : undefined);

    if (!dept) {
      const cleanName = (departmentName || '').trim() || (marketFocus === 'Dubai' ? 'Dubai Market' : 'Gurgaon Market');
      dept = depts.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
      if (!dept) {
        const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `dept-${Date.now()}`;
        dept = {
          id: `dept-${slug}-${Math.random().toString(36).slice(2, 5)}`,
          name: cleanName,
          description: `${cleanName} department`,
          marketFocus,
          subDepartments: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        depts.push(dept);
      }
    }

    let resolvedSub: string | undefined = undefined;
    if (subDepartmentName && subDepartmentName.trim()) {
      let cleanSub = subDepartmentName.trim();
      if (!isInternAllowedDepartment(dept.name) && cleanSub.toLowerCase().includes('intern')) {
        cleanSub =
          dept.subDepartments.find(s => s.name.toLowerCase().includes('employee'))?.name ||
          `${dept.name.replace(/Department|Market/gi, '').trim()} Employees`;
      }
      const foundSub = dept.subDepartments.find(s => s.name.toLowerCase() === cleanSub.toLowerCase());
      if (foundSub) {
        resolvedSub = foundSub.name;
      } else {
        const subSlug = cleanSub.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sub-${Date.now()}`;
        dept.subDepartments.push({
          id: `sub-${subSlug}-${Math.random().toString(36).slice(2, 5)}`,
          name: cleanSub,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        dept.updatedAt = nowIso;
        resolvedSub = cleanSub;
      }
    }

    return {
      departmentId: dept.id,
      department: dept.name,
      subDepartment: resolvedSub,
    };
  }

  public getDepartments(): DepartmentConfig[] {
    if (!this.data.departments || this.data.departments.length === 0) {
      this.data.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS)) as DepartmentConfig[];
    }
    return this.data.departments!;
  }

  public getDepartmentsWithCounts(): DepartmentWithCounts[] {
    const depts = this.getDepartments();
    return depts.map(dept => {
      const members = this.data.employees.filter(
        e => e.departmentId === dept.id || e.department.toLowerCase() === dept.name.toLowerCase()
      );
      const subDepartmentCounts: Record<string, number> = {};
      dept.subDepartments.forEach(s => {
        subDepartmentCounts[s.name] = 0;
      });
      let unassignedSubCount = 0;
      let missingDocsCount = 0;

      members.forEach(m => {
        if (m.subDepartment) {
          subDepartmentCounts[m.subDepartment] = (subDepartmentCounts[m.subDepartment] || 0) + 1;
        } else {
          unassignedSubCount++;
        }
        const hasMissing = Object.values(m.documents || {}).some(
          d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
        );
        if (hasMissing) missingDocsCount++;
      });

      if (unassignedSubCount > 0) {
        subDepartmentCounts['__unassigned__'] = unassignedSubCount;
      }

      return {
        ...dept,
        totalCount: members.length,
        employeeCount: members.filter(m => !m.isCandidate).length,
        candidateCount: members.filter(m => m.isCandidate).length,
        missingDocsCount,
        subDepartmentCounts,
      };
    });
  }

  public createDepartment(
    input: { name: string; description?: string; marketFocus?: MarketType; subDepartments?: string[] },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; department?: DepartmentWithCounts; error?: string } {
    const cleanName = (input.name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Department name is required.' };
    }

    const isInternDept = isInternAllowedDepartment(cleanName);
    const rawSubs = input.subDepartments || [];
    if (!isInternDept) {
      const hasInternSub = rawSubs.some(s => s.toLowerCase().includes('intern'));
      if (hasInternSub) {
        return {
          success: false,
          error: 'Intern sub-departments are strictly restricted to HR, AI, DA, and DM departments only.',
        };
      }
    }

    const depts = this.getDepartments();
    if (depts.some(d => d.name.toLowerCase() === cleanName.toLowerCase())) {
      return { success: false, error: `A department named '${cleanName}' already exists.` };
    }

    const nowIso = new Date().toISOString();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
    const subDepts: SubDepartmentConfig[] = (input.subDepartments || [])
      .map(s => s.trim())
      .filter(Boolean)
      .filter((v, idx, arr) => arr.findIndex(x => x.toLowerCase() === v.toLowerCase()) === idx)
      .map(sName => ({
        id: `sub-${sName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 5)}`,
        name: sName,
        createdAt: nowIso,
        updatedAt: nowIso,
      }));

    const newDept: DepartmentConfig = {
      id: `dept-${slug}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      description: input.description?.trim() || `${cleanName} department`,
      marketFocus: input.marketFocus || 'Gurgaon',
      subDepartments: subDepts,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    depts.push(newDept);
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Department Created',
      'Department',
      newDept.id,
      newDept.name,
      `Created department '${newDept.name}'${subDepts.length ? ` with ${subDepts.length} sub-department(s)` : ''}.`
    );

    const allWithCounts = this.getDepartmentsWithCounts();
    this.broadcast('DEPARTMENTS_UPDATED', allWithCounts);
    return {
      success: true,
      department: allWithCounts.find(d => d.id === newDept.id),
    };
  }

  public updateDepartment(
    id: string,
    updates: { name?: string; description?: string; marketFocus?: MarketType },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; department?: DepartmentWithCounts; error?: string } {
    const depts = this.getDepartments();
    const target = depts.find(d => d.id === id);
    if (!target) {
      return { success: false, error: 'Department not found.' };
    }

    const oldName = target.name;
    if (updates.name !== undefined) {
      const nextName = updates.name.trim();
      if (!nextName) {
        return { success: false, error: 'Department name cannot be empty.' };
      }
      if (depts.some(d => d.id !== id && d.name.toLowerCase() === nextName.toLowerCase())) {
        return { success: false, error: `Another department named '${nextName}' already exists.` };
      }
      target.name = nextName;
    }

    if (updates.description !== undefined) {
      target.description = updates.description.trim();
    }
    if (updates.marketFocus !== undefined) {
      target.marketFocus = updates.marketFocus;
    }
    target.updatedAt = new Date().toISOString();

    // Cascade department rename to every assigned employee & candidate
    let updatedMembers = 0;
    if (target.name !== oldName) {
      this.data.employees.forEach(emp => {
        if (emp.departmentId === target.id || emp.department.toLowerCase() === oldName.toLowerCase()) {
          emp.departmentId = target.id;
          emp.department = target.name;
          emp.updatedAt = target.updatedAt;
          updatedMembers++;
        }
      });
    }

    this.persist();

    this.logAudit(
      actor,
      actorRole,
      target.name !== oldName ? 'Department Renamed' : 'Department Updated',
      'Department',
      target.id,
      target.name,
      target.name !== oldName
        ? `Renamed department from '${oldName}' to '${target.name}' (${updatedMembers} profile(s) synchronized).`
        : `Updated department settings for '${target.name}'.`
    );

    const allWithCounts = this.getDepartmentsWithCounts();
    this.broadcast('DEPARTMENTS_UPDATED', allWithCounts);
    if (updatedMembers > 0) {
      this.broadcast('EMPLOYEES_BULK_UPDATED', { departmentId: target.id, departmentName: target.name });
    }
    return {
      success: true,
      department: allWithCounts.find(d => d.id === target.id),
    };
  }

  public deleteDepartment(
    id: string,
    reassignToDepartmentId: string | undefined,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; error?: string } {
    const depts = this.getDepartments();
    if (depts.length <= 1) {
      return { success: false, error: 'At least one department must remain in the system.' };
    }
    const targetIdx = depts.findIndex(d => d.id === id);
    if (targetIdx === -1) {
      return { success: false, error: 'Department not found.' };
    }
    const target = depts[targetIdx];
    const members = this.data.employees.filter(
      e => e.departmentId === target.id || e.department.toLowerCase() === target.name.toLowerCase()
    );

    let fallbackDept: DepartmentConfig | undefined = undefined;
    if (members.length > 0) {
      if (!reassignToDepartmentId) {
        return {
          success: false,
          error: `Department '${target.name}' has ${members.length} assigned member(s). Specify reassignToDepartmentId to move them safely before deleting.`,
        };
      }
      fallbackDept = depts.find(d => d.id === reassignToDepartmentId && d.id !== id);
      if (!fallbackDept) {
        return { success: false, error: 'Valid target reassignment department is required.' };
      }

      const nowIso = new Date().toISOString();
      members.forEach(emp => {
        emp.departmentId = fallbackDept!.id;
        emp.department = fallbackDept!.name;
        emp.subDepartment = undefined;
        emp.updatedAt = nowIso;
      });
    }

    depts.splice(targetIdx, 1);
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Department Deleted',
      'Department',
      target.id,
      target.name,
      members.length > 0
        ? `Deleted department '${target.name}' and reassigned ${members.length} member(s) to '${fallbackDept!.name}'.`
        : `Deleted empty department '${target.name}'.`
    );

    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());
    if (members.length > 0) {
      this.broadcast('EMPLOYEES_BULK_UPDATED', { reassignedTo: fallbackDept!.id });
    }
    return { success: true };
  }

  public addSubDepartment(
    deptId: string,
    input: { name: string; description?: string },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; department?: DepartmentWithCounts; error?: string } {
    const dept = this.getDepartments().find(d => d.id === deptId);
    if (!dept) return { success: false, error: 'Department not found.' };

    const cleanName = (input.name || '').trim();
    if (!cleanName) return { success: false, error: 'Sub-department name is required.' };

    if (!isInternAllowedDepartment(dept.name) && cleanName.toLowerCase().includes('intern')) {
      return {
        success: false,
        error: `Only HR, AI, DA, and DM departments are permitted to have Intern sub-departments. '${dept.name}' must have Employees only.`,
      };
    }

    if (dept.subDepartments.some(s => s.name.toLowerCase() === cleanName.toLowerCase())) {
      return { success: false, error: `Sub-department '${cleanName}' already exists in ${dept.name}.` };
    }

    const nowIso = new Date().toISOString();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sub';
    dept.subDepartments.push({
      id: `sub-${slug}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      description: input.description?.trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    dept.updatedAt = nowIso;
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Sub-Department Created',
      'Department',
      dept.id,
      `${dept.name} / ${cleanName}`,
      `Added sub-department '${cleanName}' under '${dept.name}'.`
    );

    const allWithCounts = this.getDepartmentsWithCounts();
    this.broadcast('DEPARTMENTS_UPDATED', allWithCounts);
    return { success: true, department: allWithCounts.find(d => d.id === dept.id) };
  }

  public updateSubDepartment(
    deptId: string,
    subId: string,
    updates: { name?: string; description?: string },
    actor: string,
    actorRole: UserRole
  ): { success: boolean; department?: DepartmentWithCounts; error?: string } {
    const dept = this.getDepartments().find(d => d.id === deptId);
    if (!dept) return { success: false, error: 'Department not found.' };

    const sub = dept.subDepartments.find(s => s.id === subId);
    if (!sub) return { success: false, error: 'Sub-department not found.' };

    const oldSubName = sub.name;
    if (updates.name !== undefined) {
      const nextName = updates.name.trim();
      if (!nextName) return { success: false, error: 'Sub-department name cannot be empty.' };
      if (!isInternAllowedDepartment(dept.name) && nextName.toLowerCase().includes('intern')) {
        return {
          success: false,
          error: `Only HR, AI, DA, and DM departments are permitted to have Intern sub-departments. '${dept.name}' must have Employees only.`,
        };
      }
      if (dept.subDepartments.some(s => s.id !== subId && s.name.toLowerCase() === nextName.toLowerCase())) {
        return { success: false, error: `Sub-department '${nextName}' already exists in ${dept.name}.` };
      }
      sub.name = nextName;
    }
    if (updates.description !== undefined) {
      sub.description = updates.description.trim();
    }

    const nowIso = new Date().toISOString();
    sub.updatedAt = nowIso;
    dept.updatedAt = nowIso;

    let updatedCount = 0;
    if (sub.name !== oldSubName) {
      this.data.employees.forEach(emp => {
        if (
          (emp.departmentId === dept.id || emp.department.toLowerCase() === dept.name.toLowerCase()) &&
          (emp.subDepartment || '').toLowerCase() === oldSubName.toLowerCase()
        ) {
          emp.subDepartment = sub.name;
          emp.updatedAt = nowIso;
          updatedCount++;
        }
      });
    }

    this.persist();
    this.logAudit(
      actor,
      actorRole,
      sub.name !== oldSubName ? 'Sub-Department Renamed' : 'Sub-Department Updated',
      'Department',
      dept.id,
      `${dept.name} / ${sub.name}`,
      sub.name !== oldSubName
        ? `Renamed sub-department '${oldSubName}' to '${sub.name}' in ${dept.name} (${updatedCount} profile(s) updated).`
        : `Updated sub-department '${sub.name}' in ${dept.name}.`
    );

    const allWithCounts = this.getDepartmentsWithCounts();
    this.broadcast('DEPARTMENTS_UPDATED', allWithCounts);
    if (updatedCount > 0) {
      this.broadcast('EMPLOYEES_BULK_UPDATED', { departmentId: dept.id, subDepartment: sub.name });
    }
    return { success: true, department: allWithCounts.find(d => d.id === dept.id) };
  }

  public deleteSubDepartment(
    deptId: string,
    subId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; department?: DepartmentWithCounts; error?: string } {
    const dept = this.getDepartments().find(d => d.id === deptId);
    if (!dept) return { success: false, error: 'Department not found.' };

    const subIdx = dept.subDepartments.findIndex(s => s.id === subId);
    if (subIdx === -1) return { success: false, error: 'Sub-department not found.' };

    const removedSub = dept.subDepartments[subIdx];
    dept.subDepartments.splice(subIdx, 1);
    const nowIso = new Date().toISOString();
    dept.updatedAt = nowIso;

    let clearedCount = 0;
    this.data.employees.forEach(emp => {
      if (
        (emp.departmentId === dept.id || emp.department.toLowerCase() === dept.name.toLowerCase()) &&
        (emp.subDepartment || '').toLowerCase() === removedSub.name.toLowerCase()
      ) {
        emp.subDepartment = undefined;
        emp.updatedAt = nowIso;
        clearedCount++;
      }
    });

    this.persist();
    this.logAudit(
      actor,
      actorRole,
      'Sub-Department Deleted',
      'Department',
      dept.id,
      `${dept.name} / ${removedSub.name}`,
      `Removed sub-department '${removedSub.name}' from ${dept.name} (${clearedCount} profile(s) unassigned from sub-department).`
    );

    const allWithCounts = this.getDepartmentsWithCounts();
    this.broadcast('DEPARTMENTS_UPDATED', allWithCounts);
    if (clearedCount > 0) {
      this.broadcast('EMPLOYEES_BULK_UPDATED', { departmentId: dept.id });
    }
    return { success: true, department: allWithCounts.find(d => d.id === dept.id) };
  }

  // --- Employment Categories Dynamic CRUD ---
  public getEmploymentCategories(): string[] {
    if (!this.data.employmentCategories || !Array.isArray(this.data.employmentCategories) || this.data.employmentCategories.length === 0) {
      this.data.employmentCategories = ['Employee', 'Intern', 'Consultant', 'Contractor'];
      this.persist();
    }
    return this.data.employmentCategories;
  }

  public createEmploymentCategory(name: string, actor: string, actorRole: UserRole): { success: boolean; categories: string[]; error?: string } {
    const clean = name.trim();
    if (!clean) return { success: false, categories: this.getEmploymentCategories(), error: 'Category name is required.' };
    const current = this.getEmploymentCategories();
    if (current.some(c => c.toLowerCase() === clean.toLowerCase())) {
      return { success: false, categories: current, error: `Category '${clean}' already exists.` };
    }
    current.push(clean);
    this.data.employmentCategories = current;
    this.persist();
    this.logAudit(actor, actorRole, 'Category Created', 'Department', clean, clean, `Created employment category '${clean}'.`);
    this.broadcast('CATEGORIES_UPDATED', current);
    return { success: true, categories: current };
  }

  public deleteEmploymentCategory(name: string, actor: string, actorRole: UserRole): { success: boolean; categories: string[]; error?: string } {
    const clean = name.trim();
    let current = this.getEmploymentCategories();
    if (['Employee', 'Intern'].includes(clean)) {
      return { success: false, categories: current, error: `Core category '${clean}' cannot be deleted.` };
    }
    current = current.filter(c => c.toLowerCase() !== clean.toLowerCase());
    this.data.employmentCategories = current;
    this.persist();
    this.logAudit(actor, actorRole, 'Category Removed', 'Department', clean, clean, `Removed employment category '${clean}'.`);
    this.broadcast('CATEGORIES_UPDATED', current);
    return { success: true, categories: current };
  }

  // ==========================================================================
  // Individual 24-Hour Document QR & Secure Candidate Upload Engine
  // ==========================================================================
  private hashQrToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private getLatestQrTokenForEmployee(employeeId: string): QrDocumentTokenRecord | undefined {
    const tokens = (this.data.qrDocumentTokens || []).filter(t => t.employeeId === employeeId);
    if (tokens.length === 0) return undefined;
    // Prefer active non-revoked token first, otherwise most recently created
    const nowMs = Date.now();
    const active = tokens.find(t => !t.revokedAt && new Date(t.expiresAt).getTime() > nowMs);
    if (active) return active;
    return tokens.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  private computeEmployeeQrMeta(employeeId: string): Omit<DocumentQrStatusInfo, 'shareUrl' | 'qrDataUrl'> {
    const latest = this.getLatestQrTokenForEmployee(employeeId);
    if (!latest) {
      return {
        hasToken: false,
        isActive: false,
        isExpired: false,
        isRevoked: false,
        targetDocKeys: [],
        uploadedDocKeys: [],
      };
    }

    const nowMs = Date.now();
    const expiresMs = new Date(latest.expiresAt).getTime();
    const isRevoked = Boolean(latest.revokedAt);
    const isExpired = !isRevoked && nowMs >= expiresMs;
    const isActive = !isRevoked && nowMs < expiresMs;
    const remainingMs = isActive ? Math.max(0, expiresMs - nowMs) : 0;

    return {
      hasToken: true,
      isActive,
      isExpired,
      isRevoked,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      remainingMs,
      createdBy: latest.createdBy,
      createdByRole: latest.createdByRole,
      targetDocKeys: latest.targetDocKeys || [],
      uploadedDocKeys: latest.uploadedDocKeys || [],
      openCount: latest.openCount || 0,
      lastOpenedAt: latest.lastOpenedAt,
    };
  }

  public inspectProfileMissingDocuments(employeeId: string): ProfileDocumentInspection | null {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return null;

    if (!emp.documents || Object.keys(emp.documents).length === 0) {
      emp.documents = getDefaultDocumentChecklist(emp.market === 'Dubai' || emp.market === 'Dual Market');
      this.persist();
    }

    const docs = Object.values(emp.documents);
    const isMissingStatus = (s: DocumentStatus) => s === 'Missing' || s === 'Not Submitted' || s === 'Rejected';
    const isUploadedPending = (s: DocumentStatus) => s === 'Uploaded' || s === 'Submitted' || s === 'Under Review';

    const missingRequired = docs
      .filter(d => d.required && isMissingStatus(d.status))
      .map(d => ({ key: d.key, title: d.title, category: d.category, status: d.status, required: d.required }));

    const missingOptional = docs
      .filter(d => !d.required && d.status !== 'Not Applicable' && isMissingStatus(d.status))
      .map(d => ({ key: d.key, title: d.title, category: d.category, status: d.status, required: d.required }));

    const uploadedPendingVerification = docs
      .filter(d => isUploadedPending(d.status))
      .map(d => ({
        key: d.key,
        title: d.title,
        category: d.category,
        status: d.status,
        uploadedAt: d.uploadedAt,
        fileName: d.fileName,
      }));

    const verified = docs
      .filter(d => d.status === 'Verified')
      .map(d => ({
        key: d.key,
        title: d.title,
        category: d.category,
        verifiedAt: d.verifiedAt,
        verifiedBy: d.verifiedBy,
      }));

    return {
      totalChecklistCount: docs.filter(d => d.status !== 'Not Applicable').length,
      requiredCount: docs.filter(d => d.required).length,
      missingRequired,
      missingOptional,
      uploadedPendingVerification,
      verified,
    };
  }

  public async getEmployeeDocumentQrStatus(
    employeeId: string,
    baseOrigin: string,
    includeSecretShare = false
  ): Promise<{ inspection: ProfileDocumentInspection; qrStatus: DocumentQrStatusInfo } | null> {
    const inspection = this.inspectProfileMissingDocuments(employeeId);
    if (!inspection) return null;

    const latest = this.getLatestQrTokenForEmployee(employeeId);
    const meta = this.computeEmployeeQrMeta(employeeId);
    const qrStatus: DocumentQrStatusInfo = { ...meta };

    if (includeSecretShare && latest && meta.isActive && latest.token) {
      const cleanOrigin = cleanPublicOrigin(baseOrigin);
      const shareUrl = `${cleanOrigin}/qr-upload/${latest.token}`;
      qrStatus.shareUrl = shareUrl;
      qrStatus.qrDataUrl = await QRCode.toDataURL(shareUrl, {
        width: 340,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
    }

    return { inspection, qrStatus };
  }

  public async generateEmployeeDocumentQr(
    employeeId: string,
    baseOrigin: string,
    actor: string,
    actorRole: UserRole,
    options?: { includeOptionalMissing?: boolean; customDocKeys?: string[] }
  ): Promise<{ success: boolean; inspection?: ProfileDocumentInspection; qrStatus?: DocumentQrStatusInfo; message: string }> {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) {
      return { success: false, message: 'Candidate/Employee profile not found.' };
    }

    // Step 1: Automatically inspect profile and identify missing documents before generating QR
    const inspection = this.inspectProfileMissingDocuments(employeeId)!;

    let targetDocKeys: string[] = [];
    if (options?.customDocKeys && options.customDocKeys.length > 0) {
      targetDocKeys = options.customDocKeys.filter(k => Boolean(emp.documents[k]) && emp.documents[k].status !== 'Not Applicable');
    } else {
      targetDocKeys = inspection.missingRequired.map(d => d.key);
      if (options?.includeOptionalMissing) {
        targetDocKeys = [...targetDocKeys, ...inspection.missingOptional.map(d => d.key)];
      }
      // If all required documents are already uploaded/verified, fall back to optional missing or required checklist so QR always reflects accurate profile state
      if (targetDocKeys.length === 0) {
        if (inspection.missingOptional.length > 0) {
          targetDocKeys = inspection.missingOptional.map(d => d.key);
        } else {
          targetDocKeys = Object.values(emp.documents)
            .filter(d => d.required && d.status !== 'Not Applicable')
            .map(d => d.key);
        }
      }
    }

    if (!this.data.qrDocumentTokens) {
      this.data.qrDocumentTokens = [];
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    // Exact 24-hour expiration (24 * 60 * 60 * 1000 ms)
    const expiresAtIso = new Date(nowMs + QR_EXPIRY_DURATION_MS).toISOString();

    // Step 2: Revoke/supersede any existing unrevoked QR tokens for this candidate so prior links cannot be reused
    let supersededCount = 0;
    this.data.qrDocumentTokens.forEach(existing => {
      if (existing.employeeId === emp.id && !existing.revokedAt) {
        existing.revokedAt = nowIso;
        existing.revokedBy = actor;
        existing.revokeReason = 'Superseded by newly generated 24-hour Document QR';
        supersededCount++;
      }
    });

    // Step 3: Generate opaque 256-bit cryptographic token (zero candidate ID or PII in token)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashQrToken(rawToken);

    const newRecord: QrDocumentTokenRecord = {
      id: `qrt-${nowMs}-${crypto.randomBytes(3).toString('hex')}`,
      token: rawToken,
      tokenHash,
      employeeId: emp.id,
      createdAt: nowIso,
      expiresAt: expiresAtIso,
      createdBy: actor,
      createdByRole: actorRole,
      targetDocKeys,
      uploadedDocKeys: [],
      openCount: 0,
    };

    this.data.qrDocumentTokens.unshift(newRecord);
    // Keep token ledger bounded while preserving all active tokens
    if (this.data.qrDocumentTokens.length > 1000) {
      this.data.qrDocumentTokens = this.data.qrDocumentTokens.slice(0, 1000);
    }

    emp.documentQrMeta = this.computeEmployeeQrMeta(emp.id);
    emp.updatedAt = nowIso;
    this.persist();

    const cleanOrigin = cleanPublicOrigin(baseOrigin);
    const shareUrl = `${cleanOrigin}/qr-upload/${rawToken}`;
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 340,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    const qrStatus: DocumentQrStatusInfo = {
      ...emp.documentQrMeta,
      shareUrl,
      qrDataUrl,
    };

    this.logAudit(
      actor,
      actorRole,
      supersededCount > 0 ? 'Document QR Regenerated (24h)' : 'Document QR Generated (24h)',
      'DocumentQR',
      emp.id,
      emp.fullName,
      `Generated candidate-specific 24-hour Document QR (${inspection.missingRequired.length} missing required doc(s) detected; expires ${new Date(expiresAtIso).toLocaleString()}).`
    );

    this.broadcast('DOCUMENT_QR_GENERATED', {
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      missingRequiredCount: inspection.missingRequired.length,
      expiresAt: expiresAtIso,
      qrMeta: emp.documentQrMeta,
    });
    this.broadcast('EMPLOYEE_UPDATED', emp);

    return {
      success: true,
      inspection,
      qrStatus,
      message:
        supersededCount > 0
          ? 'Fresh 24-hour Document QR generated and prior QR deactivated.'
          : '24-hour Document QR generated successfully.',
    };
  }

  public revokeEmployeeDocumentQr(
    employeeId: string,
    actor: string,
    actorRole: UserRole
  ): { success: boolean; message: string } {
    const emp = this.data.employees.find(e => e.id === employeeId);
    if (!emp) return { success: false, message: 'Profile not found.' };

    const nowIso = new Date().toISOString();
    let revokedCount = 0;
    (this.data.qrDocumentTokens || []).forEach(t => {
      if (t.employeeId === employeeId && !t.revokedAt) {
        t.revokedAt = nowIso;
        t.revokedBy = actor;
        t.revokeReason = 'Manually revoked by HR';
        revokedCount++;
      }
    });

    if (revokedCount === 0) {
      return { success: false, message: 'No active Document QR found to revoke.' };
    }

    emp.documentQrMeta = this.computeEmployeeQrMeta(emp.id);
    emp.updatedAt = nowIso;
    this.persist();

    this.logAudit(
      actor,
      actorRole,
      'Document QR Revoked',
      'DocumentQR',
      emp.id,
      emp.fullName,
      `Revoked active Document QR token for ${emp.fullName}.`
    );

    this.broadcast('DOCUMENT_QR_REVOKED', { employeeId: emp.id, qrMeta: emp.documentQrMeta });
    this.broadcast('EMPLOYEE_UPDATED', emp);
    return { success: true, message: 'Document QR revoked immediately.' };
  }

  public validatePublicQrToken(rawToken: string): {
    ok: boolean;
    httpStatus: number;
    code: 'VALID' | 'INVALID_TOKEN' | 'QR_EXPIRED' | 'QR_REVOKED' | 'PROFILE_NOT_FOUND';
    error?: string;
    tokenRecord?: QrDocumentTokenRecord;
    employee?: Employee;
  } {
    const trimmed = (rawToken || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(trimmed)) {
      return {
        ok: false,
        httpStatus: 404,
        code: 'INVALID_TOKEN',
        error: 'Invalid or unrecognized QR document link.',
      };
    }

    const incomingHashBuf = Buffer.from(this.hashQrToken(trimmed.toLowerCase()), 'hex');
    const matched = (this.data.qrDocumentTokens || []).find(rec => {
      if (!rec.tokenHash || rec.tokenHash.length !== 64) return false;
      const storedBuf = Buffer.from(rec.tokenHash, 'hex');
      if (storedBuf.length !== incomingHashBuf.length) return false;
      return crypto.timingSafeEqual(storedBuf, incomingHashBuf);
    });

    if (!matched) {
      return {
        ok: false,
        httpStatus: 404,
        code: 'INVALID_TOKEN',
        error: 'Invalid or unrecognized QR document link.',
      };
    }

    if (matched.revokedAt) {
      return {
        ok: false,
        httpStatus: 410,
        code: 'QR_REVOKED',
        error: 'This QR code was replaced or deactivated by HR. Please scan the latest QR code shared with you.',
      };
    }

    const nowMs = Date.now();
    const expiresAtMs = new Date(matched.expiresAt).getTime();
    if (isNaN(expiresAtMs) || nowMs >= expiresAtMs) {
      return {
        ok: false,
        httpStatus: 410,
        code: 'QR_EXPIRED',
        error: 'This QR upload link expired after its 24-hour security window. Please contact White Collar Realty HR for a regenerated QR code.',
      };
    }

    const emp = this.data.employees.find(e => e.id === matched.employeeId);
    if (!emp) {
      return {
        ok: false,
        httpStatus: 404,
        code: 'PROFILE_NOT_FOUND',
        error: 'Associated onboarding profile is no longer available.',
      };
    }

    return {
      ok: true,
      httpStatus: 200,
      code: 'VALID',
      tokenRecord: matched,
      employee: emp,
    };
  }

  private mapDocStatusForPublicQr(status: DocumentStatus): 'Missing' | 'Uploaded' | 'Verified' {
    if (status === 'Verified') return 'Verified';
    if (status === 'Uploaded' || status === 'Submitted' || status === 'Under Review') return 'Uploaded';
    return 'Missing';
  }

  public getPublicQrUploadSession(
    rawToken: string,
    recordOpen = true
  ): {
    ok: boolean;
    httpStatus: number;
    code: string;
    error?: string;
    session?: PublicQrSessionData;
  } {
    const check = this.validatePublicQrToken(rawToken);
    if (!check.ok || !check.tokenRecord || !check.employee) {
      return {
        ok: false,
        httpStatus: check.httpStatus,
        code: check.code,
        error: check.error,
      };
    }

    const { tokenRecord, employee } = check;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (recordOpen) {
      tokenRecord.openCount = (tokenRecord.openCount || 0) + 1;
      tokenRecord.lastOpenedAt = nowIso;
      employee.documentQrMeta = this.computeEmployeeQrMeta(employee.id);
      this.persist();

      const openEvent: LiveQrUploadEvent = {
        uploadId: `open-${tokenRecord.id}-${nowMs}`,
        employeeId: employee.id,
        employeeName: employee.fullName,
        department: employee.department,
        subDepartment: employee.subDepartment,
        progress: 0,
        status: 'OPENED',
        timestamp: nowIso,
      };
      this.broadcast('QR_UPLOAD_PROGRESS', openEvent);
    }

    // Build candidate-scoped document list containing ONLY that candidate's target missing/required documents
    const empDocs = employee.documents || {};
    const targetKeys =
      tokenRecord.targetDocKeys && tokenRecord.targetDocKeys.length > 0
        ? tokenRecord.targetDocKeys
        : Object.values(empDocs)
            .filter(d => d.required && d.status !== 'Not Applicable')
            .map(d => d.key);

    const slots: PublicQrDocumentSlot[] = targetKeys
      .map(k => empDocs[k])
      .filter((d): d is DocumentRecord => Boolean(d) && d.status !== 'Not Applicable')
      .map(d => {
        const publicStatus = this.mapDocStatusForPublicQr(d.status);
        return {
          key: d.key,
          title: d.title,
          category: d.category,
          required: d.required,
          status: publicStatus,
          uploadedAt: d.uploadedAt,
          fileName: publicStatus !== 'Missing' ? d.fileName : undefined,
          fileSize: publicStatus !== 'Missing' ? d.fileSize : undefined,
          isLocked: publicStatus !== 'Missing', // Prevent duplicate upload once Uploaded or Verified
        };
      });

    const expiresAtMs = new Date(tokenRecord.expiresAt).getTime();
    return {
      ok: true,
      httpStatus: 200,
      code: 'VALID',
      session: {
        valid: true,
        recipientName: employee.fullName,
        designation: employee.designation,
        department: employee.department,
        subDepartment: employee.subDepartment,
        companyName: 'White Collar Realty',
        createdAt: tokenRecord.createdAt,
        expiresAt: tokenRecord.expiresAt,
        remainingMs: Math.max(0, expiresAtMs - nowMs),
        allowedFormats: ['PDF', 'JPG', 'PNG'],
        maxFileSizeBytes: QR_MAX_FILE_SIZE_BYTES,
        documents: slots,
      },
    };
  }

  public broadcastQrUploadProgress(event: LiveQrUploadEvent) {
    this.broadcast('QR_UPLOAD_PROGRESS', event);
  }

  private detectAndVerifyBinaryFormat(
    buffer: Buffer,
    fileName: string,
    declaredMime?: string
  ): { valid: boolean; mimeType?: string; error?: string } {
    if (!buffer || buffer.length < 8) {
      return { valid: false, error: 'Uploaded file is empty or corrupted.' };
    }

    const ext = path.extname(fileName || '').toLowerCase();
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (!allowedExts.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file extension '${ext || 'unknown'}'. Only PDF, JPG, and PNG files are allowed.`,
      };
    }

    const isPdfMagic =
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d; // %PDF-

    const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    const isPngMagic =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    if (ext === '.pdf') {
      if (!isPdfMagic) {
        return { valid: false, error: 'File content does not match a valid PDF document.' };
      }
      if (declaredMime && !['application/pdf', 'application/octet-stream'].includes(declaredMime.toLowerCase())) {
        return { valid: false, error: 'Invalid MIME type for PDF upload.' };
      }
      return { valid: true, mimeType: 'application/pdf' };
    }

    if (ext === '.jpg' || ext === '.jpeg') {
      if (!isJpegMagic) {
        return { valid: false, error: 'File content does not match a valid JPG/JPEG image.' };
      }
      if (declaredMime && !['image/jpeg', 'image/jpg', 'application/octet-stream'].includes(declaredMime.toLowerCase())) {
        return { valid: false, error: 'Invalid MIME type for JPG image upload.' };
      }
      return { valid: true, mimeType: 'image/jpeg' };
    }

    if (ext === '.png') {
      if (!isPngMagic) {
        return { valid: false, error: 'File content does not match a valid PNG image.' };
      }
      if (declaredMime && !['image/png', 'application/octet-stream'].includes(declaredMime.toLowerCase())) {
        return { valid: false, error: 'Invalid MIME type for PNG image upload.' };
      }
      return { valid: true, mimeType: 'image/png' };
    }

    return { valid: false, error: 'Only PDF, JPG, and PNG files are accepted.' };
  }

  private formatBytesHuman(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  public savePublicQrDocumentUpload(
    rawToken: string,
    docKey: string,
    fileBuffer: Buffer,
    originalFileName: string,
    declaredMime?: string,
    uploadId?: string
  ): {
    ok: boolean;
    httpStatus: number;
    code: string;
    error?: string;
    slot?: PublicQrDocumentSlot;
    session?: PublicQrSessionData;
  } {
    const check = this.validatePublicQrToken(rawToken);
    if (!check.ok || !check.tokenRecord || !check.employee) {
      return {
        ok: false,
        httpStatus: check.httpStatus,
        code: check.code,
        error: check.error,
      };
    }

    const { tokenRecord, employee } = check;
    const cleanDocKey = (docKey || '').trim();
    const empDocs = employee.documents || {};
    const targetDoc = empDocs[cleanDocKey];

    // Prevent cross-candidate or unknown document slot access
    if (!targetDoc || targetDoc.status === 'Not Applicable') {
      return {
        ok: false,
        httpStatus: 403,
        code: 'UNAUTHORIZED_DOCUMENT_SLOT',
        error: 'This document type is not part of your onboarding checklist.',
      };
    }

    // Prevent duplicate uploads if already Uploaded, Submitted, Under Review, or Verified
    if (
      targetDoc.status === 'Uploaded' ||
      targetDoc.status === 'Submitted' ||
      targetDoc.status === 'Under Review' ||
      targetDoc.status === 'Verified'
    ) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'DUPLICATE_UPLOAD',
        error: `Duplicate upload prevented: '${targetDoc.title}' has already been ${targetDoc.status === 'Verified' ? 'verified' : 'uploaded'}.`,
      };
    }

    // Enforce strict scope to only this QR's required/missing target documents
    if (tokenRecord.targetDocKeys.length > 0 && !tokenRecord.targetDocKeys.includes(cleanDocKey)) {
      return {
        ok: false,
        httpStatus: 403,
        code: 'DOCUMENT_NOT_REQUESTED',
        error: 'This document was not requested on your QR checklist.',
      };
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'EMPTY_FILE',
        error: 'Uploaded file cannot be empty.',
      };
    }

    if (fileBuffer.length > QR_MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        httpStatus: 413,
        code: 'FILE_TOO_LARGE',
        error: 'File exceeds the maximum allowed size of 10 MB.',
      };
    }

    const formatCheck = this.detectAndVerifyBinaryFormat(fileBuffer, originalFileName, declaredMime);
    if (!formatCheck.valid || !formatCheck.mimeType) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_FILE_TYPE',
        error: formatCheck.error || 'Only valid PDF, JPG, and PNG files are allowed.',
      };
    }

    // Persist binary file directly into candidate's private secure directory
    const storagePath = this.saveSecureBuffer(employee.id, cleanDocKey, originalFileName, fileBuffer);
    const nowIso = new Date().toISOString();
    const formattedSize = this.formatBytesHuman(fileBuffer.length);
    const cleanDisplayFileName = path.basename(originalFileName).replace(/[^\w.\- ()]/g, '_');

    // Automatically transition status: Missing -> Uploaded
    targetDoc.status = 'Uploaded';
    targetDoc.fileName = cleanDisplayFileName;
    targetDoc.fileSize = formattedSize;
    targetDoc.mimeType = formatCheck.mimeType;
    targetDoc.storagePath = storagePath;
    targetDoc.fileData = undefined; // Served securely via storagePath without bloating hr_db.json
    targetDoc.uploadedAt = nowIso;
    targetDoc.uploadedVia = 'QR';

    if (!tokenRecord.uploadedDocKeys.includes(cleanDocKey)) {
      tokenRecord.uploadedDocKeys.push(cleanDocKey);
    }

    employee.updatedAt = nowIso;
    employee.documentQrMeta = this.computeEmployeeQrMeta(employee.id);
    employee.profileCompletion = calculateCompletion(employee);

    this.persist();

    this.logAudit(
      `${employee.fullName} (QR Upload)`,
      'HR',
      'Document Uploaded via 24h QR',
      'DocumentQR',
      `${employee.id}-${cleanDocKey}`,
      `${employee.fullName} - ${targetDoc.title}`,
      `Uploaded '${cleanDisplayFileName}' (${formattedSize}, ${formatCheck.mimeType}) via candidate-specific QR. Status automatically updated: Missing -> Uploaded.`
    );

    const completedEvent: LiveQrUploadEvent = {
      uploadId: uploadId || `upl-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.fullName,
      department: employee.department,
      subDepartment: employee.subDepartment,
      docKey: cleanDocKey,
      docTitle: targetDoc.title,
      fileName: cleanDisplayFileName,
      fileSize: formattedSize,
      progress: 100,
      status: 'COMPLETED',
      timestamp: nowIso,
    };

    this.broadcast('QR_UPLOAD_PROGRESS', completedEvent);
    this.broadcast('QR_UPLOAD_COMPLETED', {
      ...completedEvent,
      profileCompletion: employee.profileCompletion,
      document: targetDoc,
    });
    this.broadcast('DOCUMENT_STATUS_CHANGED', {
      employeeId: employee.id,
      docKey: cleanDocKey,
      doc: targetDoc,
      profileCompletion: employee.profileCompletion,
    });
    this.broadcast('ALERT_UPDATED', { candidateId: employee.id });
    this.broadcast('EMPLOYEE_UPDATED', employee);
    this.broadcast('DEPARTMENTS_UPDATED', this.getDepartmentsWithCounts());

    const refreshedSession = this.getPublicQrUploadSession(rawToken, false);
    const updatedSlot: PublicQrDocumentSlot = {
      key: targetDoc.key,
      title: targetDoc.title,
      category: targetDoc.category,
      required: targetDoc.required,
      status: 'Uploaded',
      uploadedAt: targetDoc.uploadedAt,
      fileName: targetDoc.fileName,
      fileSize: targetDoc.fileSize,
      isLocked: true,
    };

    return {
      ok: true,
      httpStatus: 200,
      code: 'UPLOADED',
      slot: updatedSlot,
      session: refreshedSession.session,
    };
  }
}

export const db = new DatabaseService();
