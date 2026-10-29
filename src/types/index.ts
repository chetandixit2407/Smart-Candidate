export type UserRole = 'HR_ADMIN' | 'HR_MANAGER' | 'DEPT_HEAD_VIEWER';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
}

export type EmploymentStatus =
  | 'Full-Time'
  | 'Intern'
  | 'Probation'
  | 'Notice Period'
  | 'Upcoming Joiner'
  | 'Ex-Employee';

export type MarketType = 'Gurgaon' | 'Dubai' | 'Dual Market';

export type DocumentStatus =
  | 'Missing'
  | 'Not Submitted'
  | 'Submitted'
  | 'Under Review'
  | 'Verified'
  | 'Rejected'
  | 'Not Applicable';

export type DocumentCategory =
  | 'Identity'
  | 'Education'
  | 'Previous Employment'
  | 'Financial & Tax'
  | 'Visa & Relocation'
  | 'Photos & General';

export interface DocumentRecord {
  key: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  fileName?: string;
  fileSize?: string;
  uploadedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  reviewNotes?: string;
  required: boolean;
  driveLink?: string;
}

export interface FamilyMember {
  relation: string;
  name: string;
  phone: string;
  address?: string;
  occupation?: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  boardOrUniversity: string;
  yearOfPassing: string;
  gradeOrPercentage: string;
}

export interface ReferenceEntry {
  type: 'Personal' | 'Professional';
  name: string;
  relationshipOrTitle: string;
  company?: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface BankDetails {
  bankName?: string;
  accountNo?: string;
  ifscCode?: string;
  branchName?: string;
}

export interface IdentityDetails {
  aadhaarNo?: string;
  panNo?: string;
  passportNo?: string;
  visaStatus?: string;
  visaExpirationDate?: string;
}

export interface AspirationsInfo {
  whyWhiteCollarRealty?: string;
  associationDuration?: string;
  shortTermGoal?: string;
  longTermGoal?: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  dateOfBirth: string; // YYYY-MM-DD or DD Month
  gender: 'Male' | 'Female' | 'Other';
  nationality: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  familyDetails: FamilyMember[];
  department: string;
  designation: string;
  reportingManager: string;
  joiningDate: string; // YYYY-MM-DD or text like 1 Sept 2026
  internshipCompletionDate?: string;
  employmentStatus: EmploymentStatus;
  isCandidate: boolean; // true for upcoming candidates/pipeline joiners
  candidateStatus?: 'Interviewing' | 'Offer Extended' | 'Offer Accepted' | 'Joining Confirmed';
  market: MarketType;
  desk?: string; // Standard desk code e.g. C2, A3, B2, or ''
  sourceSpreadsheetSeat?: string; // Raw seat value from spreadsheet e.g. CB, AC, Reception, BB, etc.
  
  // Previous experience & CTC
  previousCompany?: string;
  previousDesignation?: string;
  previousCTC?: string;
  offeredCTC?: string;
  totalExperienceYears?: number;
  totalExperienceMonths?: number;
  gurgaonMarketExperience?: string;
  dubaiMarketExperience?: string;
  
  // Education & References
  education: EducationEntry[];
  references: ReferenceEntry[];
  
  // Banking, Identity & Detailed Information Sheet fields
  bankDetails?: BankDetails;
  identityDetails?: IdentityDetails;
  linkedinUrl?: string;
  instaUrl?: string;
  medicalConditions?: string;
  bloodGroup?: string;
  hobbies?: string;
  aspirations?: AspirationsInfo;
  googleDriveLink?: string;

  // Documents
  documents: Record<string, DocumentRecord>;
  
  profileCompletion: number; // 0-100%
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetCategory =
  | 'Access Card'
  | 'Charger'
  | 'SIM Card'
  | 'Parking Card'
  | 'Laptop'
  | 'Phone / Tablet'
  | 'Display Monitor'
  | 'Other';

export type AssetCondition = 'Brand New' | 'Good' | 'Fair' | 'Needs Service';
export type AssetStatus = 'In Use' | 'Available' | 'In Repair' | 'Retired';

export interface AssetHistoryEntry {
  date: string;
  action: 'Issued' | 'Returned' | 'Transferred' | 'Maintenance' | 'Condition Check';
  performedBy: string;
  employeeName?: string;
  notes?: string;
}

export interface CompanyAsset {
  id: string;
  assetTag: string;
  name: string;
  type: AssetCategory;
  serialNumber?: string;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  assignedEmployeeCode?: string | null;
  issueDate?: string;
  returnDate?: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  notes?: string;
  history: AssetHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DeskSlot {
  code: string; // e.g. A1, A2...
  bay: string;  // Bay A, Bay B...
  status: 'Available' | 'Occupied' | 'Reserved';
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  assignedEmployeeCode?: string | null;
  assignedEmployeeDepartment?: string | null;
  assignedEmployeeDesignation?: string | null;
  sourceSeatNotation?: string | null; // e.g. CB, AC, EB, etc.
  isUpcoming?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: UserRole;
  action: string;
  entityType: 'Employee' | 'Candidate' | 'Desk' | 'Asset' | 'Document' | 'Import';
  entityId: string;
  entityName: string;
  details: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  mapped: Partial<Employee>;
  matchStatus: 'New Record' | 'Exact Match' | 'Potential Duplicate' | 'Conflict';
  matchedExistingId?: string;
  matchedExistingName?: string;
  validationErrors: string[];
}

export interface ImportSummary {
  totalRows: number;
  newRecordsCreated: number;
  recordsMerged: number;
  recordsSkipped: number;
  conflictsResolved: number;
  timestamp: string;
}

export type AlertType = 'BIRTHDAY' | 'INTERNSHIP_COMPLETION';

export interface AlertItem {
  id: string;
  type: AlertType;
  personId: string;
  fullName: string;
  photoUrl?: string;
  designation: string;
  department: string;
  phone: string;
  email: string;
  isCandidate: boolean;
  eventDate: string;
  formattedEventDate: string;
  daysRemaining: number;
  targetYear?: number;
  joiningDate?: string;
  internshipCompletionDate?: string;
  desk?: string;
  title: string;
  summary: string;
  market?: string;
  dismissed?: boolean;
  dismissedAt?: string;
  profileCompletion?: number;
}
