export type UserRole =
  | 'HR_ADMIN'
  | 'HR_MANAGER'
  | 'HR_EXECUTIVE'
  | 'DEPT_HEAD_VIEWER'
  | 'FINANCE_ADMIN';

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
  fileData?: string; // base64 or public url for immediate preview
  storagePath?: string; // secure disk storage relative path
  mimeType?: string; // e.g. application/pdf, image/png, etc.
}

export interface UploadToken {
  token: string;
  employeeId: string;
  candidateName: string;
  candidateEmail: string;
  createdAt: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string;
  revoked: boolean;
  isRevoked?: boolean;
  revokedAt?: string;
  submissionCount?: number;
  isOneTime?: boolean; // If true, expires immediately upon submission
  expiryDays?: number; // Configurable duration in days
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

export type LifecycleStage =
  | 'Application'
  | 'Screening'
  | 'Interview'
  | 'Selected'
  | 'Offer Extended'
  | 'Offer Accepted'
  | 'Joining Confirmed'
  | 'Onboarded'
  | 'Internship'
  | 'Probation'
  | 'Confirmed'
  | 'Notice Period'
  | 'Exit Clearance'
  | 'FnF Settled'
  | 'Ex-Employee';

export interface InterviewRound {
  id: string;
  roundNumber: number;
  roundName: string;
  interviewer: string;
  interviewerEmail?: string;
  scheduledDate: string;
  scheduledTime?: string;
  mode: 'In-Person' | 'Google Meet' | 'Phone Call';
  meetingLink?: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  rating?: number;
  scores?: {
    domainKnowledge?: number;
    marketAcumen?: number;
    communication?: number;
    culturalFit?: number;
  };
  feedback?: string;
  recommendation?: 'Strong Hire' | 'Hire' | 'Hold' | 'Reject' | 'Proceed to Next Round';
  completedAt?: string;
}

export interface SalaryBreakup {
  annualCtc: number;
  monthlyCtc: number;
  basicMonthly: number;
  basicAnnual: number;
  hraMonthly: number;
  hraAnnual: number;
  specialAllowanceMonthly: number;
  specialAllowanceAnnual: number;
  statutoryBonusMonthly: number;
  statutoryBonusAnnual: number;
  pfEmployerMonthly: number;
  pfEmployerAnnual: number;
  gratuityMonthly: number;
  gratuityAnnual: number;
  variableIncentiveAnnual: number;
  grossMonthly: number;
  grossAnnual: number;
  approxNetInHandMonthly: number;
  currency: 'INR' | 'AED';
}

export interface DocumentReminderRecord {
  id: string;
  sentAt: string;
  sentBy: string;
  sentByRole: UserRole;
  channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  recipientEmail: string;
  recipientPhone: string;
  missingDocumentKeys: string[];
  missingDocumentTitles: string[];
  deadline: string; // ISO date string or formatted (within 24 hours)
  uploadLink: string;
  uploadToken: string;
  status: 'SENT' | 'DELIVERED' | 'ACTION_INITIATED' | 'COMPLETED' | 'OVERDUE';
  messageBody: string;
  emailSubject?: string;
}

export interface OfferTemplateRevision {
  version: string;
  updatedAt: string;
  updatedBy: string;
  changeSummary: string;
  recruiterName?: string;
  recruiterTitle?: string;
  customClauses?: Record<string, string>;
}

export interface OfferLetterData {
  refNo: string;
  issueDate: string;
  candidateName: string;
  candidateAddress: string;
  candidateEmail: string;
  candidatePhone: string;
  designation: string;
  department: string;
  reportingManager: string;
  joiningDate: string;
  workLocation: string;
  market: MarketType;
  probationMonths: number;
  noticePeriodDays: number;
  validTillDate: string;
  status: 'Draft' | 'Under Review' | 'Approved' | 'Issued' | 'Accepted' | 'Declined';
  salaryBreakup: SalaryBreakup;
  clauses: string[];
  missingFields: string[];
  approvedBy?: string;
  approvedAt?: string;
  issuedAt?: string;
  acceptedAt?: string;
  candidateSignatureName?: string;
  signedAt?: string;
  pdfPath?: string;
  templateVersion?: string;
  customNotes?: string;
  // White Collar Realty 10-Page Exact Template Fields
  recruiterName?: string;
  recruiterTitle?: string;
  recruiterPhone?: string;
  recruiterEmail?: string;
  ctcLpaFormatted?: string;
  basicMonthly?: number;
  basicYearly?: number;
  pbvpMonthly?: number;
  pbvpYearly?: number;
  retentionBonusMonthly?: number;
  retentionBonusYearly?: number;
  annexureSections?: Record<string, string>;
  templateHistory?: OfferTemplateRevision[];
  emailSentAt?: string;
  emailSentBy?: string;
}

export interface ProbationReview {
  id: string;
  reviewDate: string;
  reviewer: string;
  reviewerRole: string;
  milestone: '30-Day Check' | '60-Day Midterm' | '90-Day Final' | '180-Day Final';
  kpiScore: number;
  attendanceRating: 'Excellent' | 'Good' | 'Needs Improvement';
  salesOrTargetAchievement?: string;
  strengths: string;
  areasOfImprovement: string;
  recommendation: 'Confirm' | 'Extend' | 'Under Observation' | 'Terminate';
}

export interface ProbationRecord {
  startDate: string;
  endDate: string;
  durationMonths: number;
  status: 'In Probation' | 'Due for Confirmation' | 'Confirmed' | 'Extended' | 'Terminated';
  reviews: ProbationReview[];
  extensionMonths?: number;
  extensionReason?: string;
  confirmedDate?: string;
  confirmationLetterRef?: string;
  confirmedBy?: string;
}

export interface ExitClearanceRecord {
  resignationDate: string;
  resignationSubmittedDate: string;
  exitType: 'Voluntary Resignation' | 'End of Contract' | 'Probation Non-Confirmation' | 'Mutual Separation' | 'Termination';
  reasonForExit: string;
  detailedReason?: string;
  noticePeriodDays: number;
  calculatedLwd: string;
  actualLwd: string;
  shortfallNoticeDays: number;
  handoverToEmployeeId?: string;
  handoverToName?: string;
  handoverNotes?: string;
  handoverCompleted: boolean;
  handoverCompletedDate?: string;
  departments: {
    itClearance: {
      status: 'Pending' | 'Approved' | 'Rejected';
      approver?: string;
      approvedAt?: string;
      notes?: string;
      emailRevoked: boolean;
      crmAccessRevoked: boolean;
      hardwareReturned: boolean;
    };
    hrClearance: {
      status: 'Pending' | 'Approved' | 'Rejected';
      approver?: string;
      approvedAt?: string;
      notes?: string;
      idCardReturned: boolean;
      exitInterviewCompleted: boolean;
    };
    financeClearance: {
      status: 'Pending' | 'Approved' | 'Rejected';
      approver?: string;
      approvedAt?: string;
      notes?: string;
      claimsSettled: boolean;
      salaryAdvancesRecovered: boolean;
    };
    deptHeadClearance: {
      status: 'Pending' | 'Approved' | 'Rejected';
      approver?: string;
      approvedAt?: string;
      notes?: string;
      clientPipelineHandedOver: boolean;
      knowledgeTransferDone: boolean;
    };
  };
  overallStatus: 'Initiated' | 'In Progress' | 'Clearances Complete' | 'Settled' | 'Closed';
}

export interface FullAndFinalSettlement {
  settlementId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  settlementDate: string;
  lastWorkingDay: string;
  joiningDate: string;
  totalServiceDuration: string;
  workingDaysInFinalMonth: number;
  workedDays: number;
  earnedBasicAndAllowance: number;
  leaveBalanceDays: number;
  leaveEncashmentRatePerDay: number;
  leaveEncashmentAmount: number;
  pendingIncentivesOrBonus: number;
  gratuityAmount: number;
  otherAllowances: number;
  totalGrossEarnings: number;
  noticeShortfallDays: number;
  noticeShortfallDeduction: number;
  unreturnedAssetDeduction: number;
  salaryAdvanceDeduction: number;
  providentFundEmployeeDeduction: number;
  professionalTaxDeduction: number;
  tdsIncomeTaxDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSettlementAmount: number;
  currency: 'INR' | 'AED';
  status: 'Draft' | 'Finance Approved' | 'Paid' | 'Disputed';
  paymentReference?: string;
  paymentMode?: 'NEFT' | 'Bank Wire' | 'Cheque';
  paymentDate?: string;
  approvedByFinance?: string;
  approvedAt?: string;
  remarks?: string;
}

export interface LifecycleHistoryEntry {
  id: string;
  timestamp: string;
  stage: LifecycleStage;
  title: string;
  description: string;
  actor: string;
  actorRole: UserRole;
  metadata?: Record<string, unknown>;
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

  // Documents & Reminders
  documents: Record<string, DocumentRecord>;
  documentReminders?: DocumentReminderRecord[];
  lastReminderSentAt?: string;
  lastReminderChannel?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  reminderDeadline?: string;
  isOverdueForDocuments?: boolean;
  isDocumentSubmissionOverdue?: boolean;
  
  profileCompletion: number; // 0-100%
  notes?: string;
  uploadToken?: UploadToken | null;

  // End-to-End Lifecycle Properties
  lifecycleStage?: LifecycleStage;
  interviews?: InterviewRound[];
  offerLetter?: OfferLetterData;
  probation?: ProbationRecord;
  exitClearance?: ExitClearanceRecord;
  fnfSettlement?: FullAndFinalSettlement;
  lifecycleHistory?: LifecycleHistoryEntry[];

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
  entityId?: string;
  entityType:
    | 'Employee'
    | 'Candidate'
    | 'Desk'
    | 'Asset'
    | 'Document'
    | 'Import'
    | 'Lifecycle'
    | 'OfferLetter'
    | 'ExitClearance'
    | 'Settlement';
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

export type AlertType =
  | 'BIRTHDAY'
  | 'INTERNSHIP_COMPLETION'
  | 'PROBATION_EXPIRY'
  | 'NOTICE_PERIOD_LWD'
  | 'PENDING_DOCUMENT_SUBMISSION'
  | 'MISSING_DOCUMENTS';

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
  // Missing Document Alert Details
  missingDocuments?: string[];
  missingDocumentCount?: number;
  submissionStatus?: string;
  deadline?: string;
  isOverdue?: boolean;
  remindersSentCount?: number;
  lastReminderSentAt?: string;
  uploadToken?: string;
  uploadUrl?: string;
}

export const ALL_DESK_CODES: string[] = [
  'A1', 'A2', 'A3', 'A4', 'A5',
  'B1', 'B2', 'B3', 'B4', 'B5',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3', 'D4',
  'E1', 'E2', 'E3', 'E4', 'E5',
  'F1', 'F2', 'F3', 'F4', 'F5',
  'G1', 'G2', 'G3', 'G4', 'G5',
  'H1', 'H2', 'H3', 'H4', 'H5',
];
