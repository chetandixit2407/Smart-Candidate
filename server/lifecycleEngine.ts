import type {
  Employee,
  SalaryBreakup,
  OfferLetterData,
  MarketType,
  FullAndFinalSettlement,
  LifecycleStage,
  InterviewRound,
  ProbationRecord,
  ExitClearanceRecord,
} from '../src/types/index.ts';

/**
 * Parses any user-entered CTC string or number into a standard annual integer.
 * Handles formats like:
 * - 1500000
 * - "1500000"
 * - "15 LPA" -> 1500000
 * - "₹12,00,000" -> 1200000
 * - "1,50,000 / month" -> 1800000
 * - "120000 AED" -> 120000
 */
export function parseAnnualCtc(ctcInput: number | string | undefined, defaultAmount = 900000): number {
  if (typeof ctcInput === 'number' && !isNaN(ctcInput) && ctcInput > 0) {
    return Math.round(ctcInput);
  }
  if (!ctcInput) return defaultAmount;

  const raw = String(ctcInput).trim();
  const cleaned = raw.replace(/[₹,]/g, '').toLowerCase();

  // If in LPA e.g. "12 lpa", "9.5 lpa", "15 lacs", "18 lakhs"
  const lpaMatch = cleaned.match(/^([\d.]+)\s*(?:lpa|lacs?|lakhs?)/);
  if (lpaMatch) {
    const val = parseFloat(lpaMatch[1]);
    if (!isNaN(val)) return Math.round(val * 100000);
  }

  // If monthly e.g. "100000/mo", "85000 per month"
  const monthlyMatch = cleaned.match(/^([\d.]+)\s*(?:\/mo|per month|\/month)/);
  if (monthlyMatch) {
    const val = parseFloat(monthlyMatch[1]);
    if (!isNaN(val)) return Math.round(val * 12);
  }

  // Pure digits or digits with decimals
  const pureNum = parseFloat(cleaned.replace(/[^\d.]/g, ''));
  if (!isNaN(pureNum) && pureNum > 0) {
    if (pureNum < 100) {
      // User entered 12 meaning 12 LPA
      return Math.round(pureNum * 100000);
    }
    return Math.round(pureNum);
  }

  return defaultAmount;
}

/**
 * Calculates a complete, mathematically precise salary breakup.
 * All annual components sum to exact annual CTC.
 */
export function calculateSalaryBreakup(
  ctcInput: number | string | undefined,
  market: MarketType = 'Gurgaon'
): SalaryBreakup {
  const isDubai = market === 'Dubai';
  const currency: 'INR' | 'AED' = isDubai ? 'AED' : 'INR';
  const defaultCtc = isDubai ? 180000 : 960000;
  const annualCtc = parseAnnualCtc(ctcInput, defaultCtc);
  const monthlyCtc = Math.round(annualCtc / 12);

  if (isDubai) {
    // Dubai / UAE Structure
    const basicAnnual = Math.round(annualCtc * 0.50);
    const basicMonthly = Math.round(basicAnnual / 12);

    const hraAnnual = Math.round(annualCtc * 0.30); // Housing Allowance
    const hraMonthly = Math.round(hraAnnual / 12);

    const variableIncentiveAnnual = Math.round(annualCtc * 0.10);

    const specialAllowanceAnnual = Math.max(0, annualCtc - basicAnnual - hraAnnual - variableIncentiveAnnual);
    const specialAllowanceMonthly = Math.round(specialAllowanceAnnual / 12);

    const gratuityAnnual = Math.round((basicAnnual * 21) / 365); // UAE Labour Law ~21 days basic pay
    const gratuityMonthly = Math.round(gratuityAnnual / 12);

    const grossMonthly = basicMonthly + hraMonthly + specialAllowanceMonthly;
    const grossAnnual = grossMonthly * 12;

    return {
      annualCtc,
      monthlyCtc,
      basicMonthly,
      basicAnnual,
      hraMonthly,
      hraAnnual,
      specialAllowanceMonthly,
      specialAllowanceAnnual,
      statutoryBonusMonthly: 0,
      statutoryBonusAnnual: 0,
      pfEmployerMonthly: 0,
      pfEmployerAnnual: 0,
      gratuityMonthly,
      gratuityAnnual,
      variableIncentiveAnnual,
      grossMonthly,
      grossAnnual,
      approxNetInHandMonthly: grossMonthly, // No personal tax in UAE
      currency,
    };
  }

  // India / Gurgaon Structure
  // Basic: 40% of CTC
  const basicAnnual = Math.round(annualCtc * 0.40);
  const basicMonthly = Math.round(basicAnnual / 12);

  // HRA: 50% of Basic (20% of CTC)
  const hraAnnual = Math.round(basicAnnual * 0.50);
  const hraMonthly = Math.round(hraAnnual / 12);

  // Employer PF: 12% of basic up to statutory threshold (cap at ₹1800/mo or standard)
  const pfEmployerMonthly = Math.min(1800, Math.round(basicMonthly * 0.12));
  const pfEmployerAnnual = pfEmployerMonthly * 12;

  // Gratuity provision: 15/26 days per year (approx 4.81% of basic)
  const gratuityAnnual = Math.round((basicAnnual * 15) / 26);
  const gratuityMonthly = Math.round(gratuityAnnual / 12);

  // Statutory Bonus: 8.33% capped at ₹7000/mo or ₹583/mo
  const statutoryBonusMonthly = Math.round(Math.min(basicMonthly, 7000) * 0.0833);
  const statutoryBonusAnnual = statutoryBonusMonthly * 12;

  // Performance-Linked Incentive (Variable component): 10% of CTC
  const variableIncentiveAnnual = Math.round(annualCtc * 0.10);

  // Special Allowance absorbs remainder so components match 100% of annual CTC
  const fixedRemainderAnnual =
    annualCtc -
    basicAnnual -
    hraAnnual -
    pfEmployerAnnual -
    gratuityAnnual -
    statutoryBonusAnnual -
    variableIncentiveAnnual;

  const specialAllowanceAnnual = Math.max(0, fixedRemainderAnnual);
  const specialAllowanceMonthly = Math.round(specialAllowanceAnnual / 12);

  // Gross Pay (cash in earnings)
  const grossMonthly = basicMonthly + hraMonthly + specialAllowanceMonthly + statutoryBonusMonthly;
  const grossAnnual = grossMonthly * 12;

  // Approx Net in Hand: Gross minus Employee PF (₹1,800) and Professional Tax (₹200)
  const approxNetInHandMonthly = Math.max(0, grossMonthly - pfEmployerMonthly - 200);

  return {
    annualCtc,
    monthlyCtc,
    basicMonthly,
    basicAnnual,
    hraMonthly,
    hraAnnual,
    specialAllowanceMonthly,
    specialAllowanceAnnual,
    statutoryBonusMonthly,
    statutoryBonusAnnual,
    pfEmployerMonthly,
    pfEmployerAnnual,
    gratuityMonthly,
    gratuityAnnual,
    variableIncentiveAnnual,
    grossMonthly,
    grossAnnual,
    approxNetInHandMonthly,
    currency,
  };
}

/**
 * Checks for missing required candidate profile fields for generating the offer letter.
 * Returns array of human-readable labels so HR never invents missing information.
 */
export function checkOfferMissingFields(
  candidate: Partial<Employee>,
  custom?: Partial<OfferLetterData>
): string[] {
  const missing: string[] = [];

  const name = custom?.candidateName || candidate.fullName;
  if (!name || name.trim() === '') missing.push('Candidate Full Name');

  const designation = custom?.designation || candidate.designation;
  if (!designation || designation.trim() === '') missing.push('Designation / Role Title');

  const department = custom?.department || candidate.department;
  if (!department || department.trim() === '') missing.push('Department');

  const joiningDate = custom?.joiningDate || candidate.joiningDate;
  if (!joiningDate || joiningDate.trim() === '') missing.push('Proposed Joining Date');

  const manager = custom?.reportingManager || candidate.reportingManager;
  if (!manager || manager.trim() === '' || manager.toLowerCase().includes('unassigned')) {
    missing.push('Reporting Manager');
  }

  const address = custom?.candidateAddress || candidate.currentAddress || candidate.permanentAddress;
  if (!address || address.trim() === '') missing.push('Current / Permanent Residential Address');

  const email = custom?.candidateEmail || candidate.email;
  if (!email || email.trim() === '') missing.push('Email Address');

  const phone = custom?.candidatePhone || candidate.phone;
  if (!phone || phone.trim() === '') missing.push('Phone Number');

  const ctc = custom?.salaryBreakup?.annualCtc || candidate.offeredCTC;
  if (!ctc) missing.push('Offered Annual CTC');

  return missing;
}

/**
 * Standard legal and operational clauses for White Collar Realty Executive Offer Letter.
 * Modeled after enterprise real estate appointment letters.
 */
export const DEFAULT_OFFER_CLAUSES = [
  '1. APPOINTMENT & EFFECTIVE DATE: Your appointment will become effective upon your formal date of joining at White Collar Realty Private Limited. You are required to report to the designated office by 9:30 AM on your joining date.',
  '2. PROBATION & CONFIRMATION: You shall be on probation for a period of 3 (three) months from your date of joining. During probation, your performance, attendance, and professional conduct will be reviewed. Upon satisfactory completion, you will receive written confirmation of your employment.',
  '3. HOURS OF WORK & BIOMETRIC ATTENDANCE: Standard office working hours are Monday through Saturday, 9:30 AM to 6:30 PM. The 1st and 3rd Saturdays of every month are observed as working Saturdays unless otherwise specified by your Department Head. Biometric/system check-in is mandatory.',
  '4. CODE OF CONDUCT & REAL ESTATE COMPLIANCE: You agree to adhere strictly to White Collar Realty company policies, ethical sales standards, and all statutory regulations governing real estate brokerage under Haryana Real Estate Regulatory Authority (HARERA) and Dubai Land Department (DLD) protocols.',
  '5. CONFIDENTIALITY & PROPRIETARY INFORMATION: You shall maintain strictest confidentiality regarding client leads, high-net-worth investor dossiers, developer pricing matrices, commissions, internal software, and business strategies. This obligation survives termination of employment indefinitely.',
  '6. NON-COMPETE & NON-SOLICITATION: For a period of 12 (twelve) months following cessation of your employment, you shall not directly or indirectly solicit any client, developer partner, channel associate, or employee of White Collar Realty.',
  '7. SEPARATION & NOTICE PERIOD: During the probation period, either party may terminate this employment by giving 30 (thirty) days written notice or gross salary in lieu thereof. Post-confirmation, the notice period shall be 60 (sixty) days.',
  '8. ASSET RECOVERY & ACCESS REVOCATION: Upon separation, all company property—including laptop, mobile SIM, CRM access, security passes, and physical keys—must be surrendered immediately to HR and IT departments prior to exit clearance.',
  '9. BACKGROUND & DOCUMENT VERIFICATION: This offer is strictly contingent upon successful verification of your educational credentials, identity cards (Aadhaar/PAN/Passport), previous employment relieving certificates, and reference checks. Any false declaration will result in immediate termination for cause.',
];

/**
 * Creates or updates an OfferLetterData object for a candidate.
 */
export function buildOfferLetterData(
  candidate: Employee,
  customOverrides?: Partial<OfferLetterData>
): OfferLetterData {
  const currentYear = new Date().getFullYear();
  const sequenceNum = Math.floor(100 + Math.random() * 900);
  const refNo = customOverrides?.refNo || `WCR/HR/OL/${currentYear}/${candidate.employeeCode || sequenceNum}`;

  const issueDate = customOverrides?.issueDate || new Date().toISOString().split('T')[0];
  const market = customOverrides?.market || candidate.market || 'Gurgaon';
  const isDubai = market === 'Dubai';

  const workLocation =
    customOverrides?.workLocation ||
    (isDubai
      ? 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE'
      : 'White Collar Realty HQ, Golf Course Ext Road, Sector 65, Gurugram, Haryana - 122018');

  const salaryBreakup =
    customOverrides?.salaryBreakup ||
    calculateSalaryBreakup(customOverrides?.salaryBreakup?.annualCtc || candidate.offeredCTC, market);

  const missingFields = checkOfferMissingFields(candidate, customOverrides);

  // Valid till 14 days from issue date
  const issueDateObj = new Date(issueDate);
  issueDateObj.setDate(issueDateObj.getDate() + 14);
  const validTillDate = customOverrides?.validTillDate || issueDateObj.toISOString().split('T')[0];

  return {
    refNo,
    issueDate,
    candidateName: customOverrides?.candidateName || candidate.fullName,
    candidateAddress: customOverrides?.candidateAddress || candidate.currentAddress || candidate.permanentAddress || '',
    candidateEmail: customOverrides?.candidateEmail || candidate.email,
    candidatePhone: customOverrides?.candidatePhone || candidate.phone,
    designation: customOverrides?.designation || candidate.designation,
    department: customOverrides?.department || candidate.department,
    reportingManager: customOverrides?.reportingManager || candidate.reportingManager || '',
    joiningDate: customOverrides?.joiningDate || candidate.joiningDate || '',
    workLocation,
    market,
    probationMonths: customOverrides?.probationMonths || 3,
    noticePeriodDays: customOverrides?.noticePeriodDays || 30,
    validTillDate,
    status: customOverrides?.status || 'Draft',
    salaryBreakup,
    clauses: customOverrides?.clauses && customOverrides.clauses.length > 0 ? customOverrides.clauses : DEFAULT_OFFER_CLAUSES,
    missingFields,
    approvedBy: customOverrides?.approvedBy,
    approvedAt: customOverrides?.approvedAt,
    issuedAt: customOverrides?.issuedAt,
    acceptedAt: customOverrides?.acceptedAt,
    candidateSignatureName: customOverrides?.candidateSignatureName,
    signedAt: customOverrides?.signedAt,
    templateVersion: 'v2.4-corporate-standard',
    customNotes: customOverrides?.customNotes || '',
  };
}

/**
 * Calculates Full & Final (FnF) Settlement with day-accurate accounting.
 */
export function calculateFullAndFinalSettlement(
  employee: Employee,
  overrides?: Partial<FullAndFinalSettlement>
): FullAndFinalSettlement {
  const currentYear = new Date().getFullYear();
  const settlementId = overrides?.settlementId || `FNF-${currentYear}-${employee.employeeCode || employee.id.slice(-4).toUpperCase()}`;

  const lastWorkingDay = overrides?.lastWorkingDay || employee.exitClearance?.actualLwd || employee.exitClearance?.calculatedLwd || new Date().toISOString().split('T')[0];
  const joiningDate = overrides?.joiningDate || employee.joiningDate || '2024-01-01';

  // Calculate tenure
  const joinDt = new Date(joiningDate);
  const lwdDt = new Date(lastWorkingDay);
  const diffTime = Math.max(0, lwdDt.getTime() - joinDt.getTime());
  const diffDaysTotal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const tenureYears = Math.floor(diffDaysTotal / 365);
  const tenureMonths = Math.floor((diffDaysTotal % 365) / 30);
  const totalServiceDuration = `${tenureYears} Years, ${tenureMonths} Months (${diffDaysTotal} days)`;

  // Base monthly salary computation
  const salaryBreakup = employee.offerLetter?.salaryBreakup || calculateSalaryBreakup(employee.offeredCTC, employee.market);
  const monthlyGross = salaryBreakup.grossMonthly || 80000;
  const basicMonthly = salaryBreakup.basicMonthly || Math.round(monthlyGross * 0.4);

  // Final month working days calculation
  const lwdMonthDays = new Date(lwdDt.getFullYear(), lwdDt.getMonth() + 1, 0).getDate();
  const workingDaysInFinalMonth = overrides?.workingDaysInFinalMonth !== undefined ? overrides.workingDaysInFinalMonth : lwdMonthDays;
  const workedDays = overrides?.workedDays !== undefined ? overrides.workedDays : Math.min(lwdDt.getDate(), workingDaysInFinalMonth);

  const perDayPay = Math.round(monthlyGross / workingDaysInFinalMonth);
  const earnedBasicAndAllowance = overrides?.earnedBasicAndAllowance !== undefined ? overrides.earnedBasicAndAllowance : Math.round(perDayPay * workedDays);

  // Leave Encashment: leaveBalanceDays * (basicMonthly / 26 or monthlyGross / 30)
  const leaveBalanceDays = overrides?.leaveBalanceDays !== undefined ? overrides.leaveBalanceDays : 8;
  const leaveEncashmentRatePerDay = overrides?.leaveEncashmentRatePerDay !== undefined ? overrides.leaveEncashmentRatePerDay : Math.round(basicMonthly / 26);
  const leaveEncashmentAmount = overrides?.leaveEncashmentAmount !== undefined ? overrides.leaveEncashmentAmount : Math.round(leaveBalanceDays * leaveEncashmentRatePerDay);

  const pendingIncentivesOrBonus = overrides?.pendingIncentivesOrBonus !== undefined ? overrides.pendingIncentivesOrBonus : 15000;

  // Gratuity: Eligible if tenure >= 5 years (or UAE End of Service)
  let gratuityAmount = overrides?.gratuityAmount !== undefined ? overrides.gratuityAmount : 0;
  if (overrides?.gratuityAmount === undefined) {
    if (employee.market === 'Dubai') {
      gratuityAmount = Math.round((basicMonthly * 21 / 30) * Math.max(0.5, tenureYears + tenureMonths / 12));
    } else if (tenureYears >= 5) {
      gratuityAmount = Math.round((15 * basicMonthly * tenureYears) / 26);
    }
  }

  const otherAllowances = overrides?.otherAllowances !== undefined ? overrides.otherAllowances : 0;
  const totalGrossEarnings = earnedBasicAndAllowance + leaveEncashmentAmount + pendingIncentivesOrBonus + gratuityAmount + otherAllowances;

  // Deductions
  const noticeShortfallDays = overrides?.noticeShortfallDays !== undefined ? overrides.noticeShortfallDays : (employee.exitClearance?.shortfallNoticeDays || 0);
  const noticeShortfallDeduction = overrides?.noticeShortfallDeduction !== undefined ? overrides.noticeShortfallDeduction : Math.round(noticeShortfallDays * perDayPay);

  const unreturnedAssetDeduction = overrides?.unreturnedAssetDeduction !== undefined ? overrides.unreturnedAssetDeduction : 0;
  const salaryAdvanceDeduction = overrides?.salaryAdvanceDeduction !== undefined ? overrides.salaryAdvanceDeduction : 0;
  const providentFundEmployeeDeduction = overrides?.providentFundEmployeeDeduction !== undefined ? overrides.providentFundEmployeeDeduction : (employee.market === 'Dubai' ? 0 : 1800);
  const professionalTaxDeduction = overrides?.professionalTaxDeduction !== undefined ? overrides.professionalTaxDeduction : (employee.market === 'Dubai' ? 0 : 200);
  const tdsIncomeTaxDeduction = overrides?.tdsIncomeTaxDeduction !== undefined ? overrides.tdsIncomeTaxDeduction : Math.round(totalGrossEarnings * 0.05);
  const otherDeductions = overrides?.otherDeductions !== undefined ? overrides.otherDeductions : 0;

  const totalDeductions =
    noticeShortfallDeduction +
    unreturnedAssetDeduction +
    salaryAdvanceDeduction +
    providentFundEmployeeDeduction +
    professionalTaxDeduction +
    tdsIncomeTaxDeduction +
    otherDeductions;

  const netSettlementAmount = totalGrossEarnings - totalDeductions;

  return {
    settlementId,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    settlementDate: overrides?.settlementDate || new Date().toISOString().split('T')[0],
    lastWorkingDay,
    joiningDate,
    totalServiceDuration,
    workingDaysInFinalMonth,
    workedDays,
    earnedBasicAndAllowance,
    leaveBalanceDays,
    leaveEncashmentRatePerDay,
    leaveEncashmentAmount,
    pendingIncentivesOrBonus,
    gratuityAmount,
    otherAllowances,
    totalGrossEarnings,
    noticeShortfallDays,
    noticeShortfallDeduction,
    unreturnedAssetDeduction,
    salaryAdvanceDeduction,
    providentFundEmployeeDeduction,
    professionalTaxDeduction,
    tdsIncomeTaxDeduction,
    otherDeductions,
    totalDeductions,
    netSettlementAmount,
    currency: salaryBreakup.currency,
    status: overrides?.status || 'Draft',
    paymentReference: overrides?.paymentReference,
    paymentMode: overrides?.paymentMode || 'NEFT',
    paymentDate: overrides?.paymentDate,
    approvedByFinance: overrides?.approvedByFinance,
    approvedAt: overrides?.approvedAt,
    remarks: overrides?.remarks || 'Calculated as per White Collar Realty employment agreement and exit clearance protocol.',
  };
}
