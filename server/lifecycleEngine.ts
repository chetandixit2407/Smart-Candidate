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
  CompensationLineItem,
  RoleSalaryStructure,
  RoleSalaryStructureRule,
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
 * Standard WCR Master Template Rule Set (Basic 75%, PBVP 12.5%, Retention Bonus 12.5%, plus optional Allowances & Deductions)
 */
function createWcrSalesRules(
  basicPct = 75,
  pbvpPct = 12.5,
  retentionPct = 12.5,
  hraPctOfCtc = 0,
  enableHra = false,
  isDubai = false
): RoleSalaryStructureRule[] {
  const rules: RoleSalaryStructureRule[] = [
    { code: 'basic', label: 'Basic', category: 'BASIC', calcType: 'PERCENT_OF_CTC', value: basicPct, enabled: true },
  ];
  if (hraPctOfCtc > 0 || !enableHra) {
    rules.push({
      code: 'hra',
      label: isDubai ? 'Housing & Transport Allowance' : 'House Rent Allowance (HRA)',
      category: 'ALLOWANCE',
      calcType: 'PERCENT_OF_CTC',
      value: hraPctOfCtc || 15,
      enabled: enableHra,
    });
  }
  rules.push(
    {
      code: 'special_allowance',
      label: 'Special Allowance',
      category: 'ALLOWANCE',
      calcType: 'FIXED_MONTHLY',
      value: 0,
      enabled: false,
    },
    {
      code: 'conveyance',
      label: 'Conveyance Allowance',
      category: 'ALLOWANCE',
      calcType: 'FIXED_MONTHLY',
      value: isDubai ? 0 : 1600,
      enabled: false,
    },
    { code: 'pbvp', label: 'PBVP', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: pbvpPct, enabled: true },
    {
      code: 'retention_bonus',
      label: 'Retention Bonus',
      category: 'VARIABLE',
      calcType: 'REMAINDER_OF_CTC',
      value: retentionPct,
      enabled: true,
    }
  );
  if (!isDubai) {
    rules.push(
      { code: 'pf_employee', label: 'Employee PF Contribution', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 1800, enabled: false },
      { code: 'prof_tax', label: 'Professional Tax (PT)', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 200, enabled: false },
      { code: 'tds', label: 'TDS (Income Tax)', category: 'DEDUCTION', calcType: 'PERCENT_OF_CTC', value: 5, enabled: false }
    );
  }
  return rules;
}

/**
 * Configurable Role-Based Salary Structures for White Collar Realty.
 * Stored in the database and editable by HR Admin / HR Manager via UI & API.
 */
export const DEFAULT_ROLE_SALARY_STRUCTURES: RoleSalaryStructure[] = [
  {
    id: 'role-bde',
    designation: 'Business Development Executive',
    department: 'Sales & Investments',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 480000,
    rules: createWcrSalesRules(75, 12.5, 12.5, 0, false, false),
  },
  {
    id: 'role-assoc-director',
    designation: 'Associate Director - Luxury Brokerage',
    department: 'Sales & Investments',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 2400000,
    rules: createWcrSalesRules(60, 10, 10, 20, true, false),
  },
  {
    id: 'role-sr-prop-consultant',
    designation: 'Senior Property Consultant - Golf Course Road',
    department: 'Sales & Investments',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 1200000,
    rules: createWcrSalesRules(70, 15, 15, 0, false, false),
  },
  {
    id: 'role-dubai-luxury-advisor',
    designation: 'Luxury Portfolio Advisor - Dubai International Desk',
    department: 'Luxury Residential & Investments',
    employmentType: 'Full-Time',
    market: 'Dubai',
    defaultAnnualCtc: 180000,
    rules: createWcrSalesRules(60, 10, 5, 25, true, true),
  },
  {
    id: 'role-gurgaon-consultant',
    designation: 'Gurgoan Team Consultant',
    department: 'Sales & Investments',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 720000,
    rules: createWcrSalesRules(75, 12.5, 12.5, 0, false, false),
  },
  {
    id: 'role-dubai-consultant',
    designation: 'Dubai Team Consultant',
    department: 'Sales & Investments',
    employmentType: 'Full-Time',
    market: 'Dubai',
    defaultAnnualCtc: 144000,
    rules: createWcrSalesRules(65, 10, 5, 20, true, true),
  },
  {
    id: 'role-prop-trainee',
    designation: 'Property Advisor Trainee',
    department: 'Sales & Investments',
    employmentType: 'Probation',
    market: 'Gurgaon',
    defaultAnnualCtc: 360000,
    rules: createWcrSalesRules(75, 12.5, 12.5, 0, false, false),
  },
  {
    id: 'role-hr-lead',
    designation: 'HR Lead & Onboarding Specialist',
    department: 'Human Resources',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 900000,
    rules: [
      { code: 'basic', label: 'Basic', category: 'BASIC', calcType: 'PERCENT_OF_CTC', value: 60, enabled: true },
      { code: 'hra', label: 'House Rent Allowance (HRA)', category: 'ALLOWANCE', calcType: 'PERCENT_OF_CTC', value: 25, enabled: true },
      { code: 'special_allowance', label: 'Special Allowance', category: 'ALLOWANCE', calcType: 'REMAINDER_OF_CTC', value: 15, enabled: true },
      { code: 'pbvp', label: 'PBVP', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
      { code: 'retention_bonus', label: 'Retention Bonus', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
      { code: 'pf_employee', label: 'Employee PF Contribution', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 1800, enabled: false },
      { code: 'prof_tax', label: 'Professional Tax (PT)', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 200, enabled: false },
    ],
  },
  {
    id: 'role-dm-lead',
    designation: 'DM (Digital Marketing Lead)',
    department: 'Marketing & Digital Media',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 840000,
    rules: [
      { code: 'basic', label: 'Basic', category: 'BASIC', calcType: 'PERCENT_OF_CTC', value: 65, enabled: true },
      { code: 'hra', label: 'House Rent Allowance (HRA)', category: 'ALLOWANCE', calcType: 'PERCENT_OF_CTC', value: 20, enabled: true },
      { code: 'retention_bonus', label: 'Retention Bonus', category: 'VARIABLE', calcType: 'REMAINDER_OF_CTC', value: 15, enabled: true },
      { code: 'pbvp', label: 'PBVP', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
      { code: 'pf_employee', label: 'Employee PF Contribution', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 1800, enabled: false },
    ],
  },
  {
    id: 'role-admin-mgr',
    designation: 'Admin Manager',
    department: 'Administration & Facilities',
    employmentType: 'Full-Time',
    market: 'Gurgaon',
    defaultAnnualCtc: 600000,
    rules: [
      { code: 'basic', label: 'Basic', category: 'BASIC', calcType: 'PERCENT_OF_CTC', value: 65, enabled: true },
      { code: 'hra', label: 'House Rent Allowance (HRA)', category: 'ALLOWANCE', calcType: 'PERCENT_OF_CTC', value: 20, enabled: true },
      { code: 'special_allowance', label: 'Special Allowance', category: 'ALLOWANCE', calcType: 'REMAINDER_OF_CTC', value: 15, enabled: true },
      { code: 'pf_employee', label: 'Employee PF Contribution', category: 'DEDUCTION', calcType: 'FIXED_MONTHLY', value: 1800, enabled: false },
    ],
  },
  {
    id: 'role-intern',
    designation: 'AI Data Research Intern',
    department: 'Research & Data',
    employmentType: 'Intern',
    market: 'Gurgaon',
    defaultAnnualCtc: 240000,
    rules: [
      { code: 'basic', label: 'Basic / Monthly Stipend', category: 'BASIC', calcType: 'REMAINDER_OF_CTC', value: 100, enabled: true },
      { code: 'pbvp', label: 'PBVP', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
      { code: 'retention_bonus', label: 'Retention Bonus', category: 'VARIABLE', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
      { code: 'tds', label: 'TDS Deduction', category: 'DEDUCTION', calcType: 'PERCENT_OF_CTC', value: 0, enabled: false },
    ],
  },
];

/**
 * Matches a candidate's designation/role to the best-fitting configurable salary structure.
 */
export function findMatchingRoleStructure(
  designation: string | undefined,
  structures: RoleSalaryStructure[] = DEFAULT_ROLE_SALARY_STRUCTURES,
  market: MarketType = 'Gurgaon',
  employmentType?: string
): RoleSalaryStructure {
  const list = structures.length > 0 ? structures : DEFAULT_ROLE_SALARY_STRUCTURES;
  const cleanDesig = (designation || '').trim().toLowerCase();

  if (cleanDesig) {
    const exact = list.find(s => s.designation.trim().toLowerCase() === cleanDesig);
    if (exact) return exact;

    if (cleanDesig.includes('intern') || employmentType === 'Intern') {
      const internMatch = list.find(s => s.employmentType === 'Intern' || s.designation.toLowerCase().includes('intern'));
      if (internMatch) return internMatch;
    }
    if (cleanDesig.includes('dubai') || market === 'Dubai') {
      const dubaiExact = list.find(
        s => s.market === 'Dubai' && cleanDesig.split(/\s+/).some(w => w.length > 3 && s.designation.toLowerCase().includes(w))
      );
      if (dubaiExact) return dubaiExact;
      const dubaiFallback = list.find(s => s.market === 'Dubai');
      if (dubaiFallback) return dubaiFallback;
    }
    if (cleanDesig.includes('director') || cleanDesig.includes('vp') || cleanDesig.includes('head')) {
      const dir = list.find(s => s.designation.toLowerCase().includes('director'));
      if (dir) return dir;
    }
    if (cleanDesig.includes('senior')) {
      const sr = list.find(s => s.designation.toLowerCase().includes('senior'));
      if (sr) return sr;
    }
    if (cleanDesig.includes('trainee')) {
      const tr = list.find(s => s.designation.toLowerCase().includes('trainee'));
      if (tr) return tr;
    }
    if (cleanDesig.includes('hr') || cleanDesig.includes('human resource') || cleanDesig.includes('recruiter')) {
      const hr = list.find(s => s.department.toLowerCase().includes('human resources'));
      if (hr) return hr;
    }
    if (cleanDesig.includes('marketing') || cleanDesig.includes('dm')) {
      const dm = list.find(s => s.department.toLowerCase().includes('marketing'));
      if (dm) return dm;
    }
    if (cleanDesig.includes('admin')) {
      const adm = list.find(s => s.department.toLowerCase().includes('admin'));
      if (adm) return adm;
    }
    if (cleanDesig.includes('consultant') || cleanDesig.includes('advisor')) {
      const cons = list.find(s => s.designation.toLowerCase().includes('consultant') && s.market !== 'Dubai');
      if (cons) return cons;
    }
  }

  return list.find(s => s.market === market) || list[0];
}

/**
 * Generates editable CompensationLineItem rows from an Annual CTC and a RoleSalaryStructure.
 */
export function buildComponentsFromStructure(
  annualCtc: number,
  structure: RoleSalaryStructure
): CompensationLineItem[] {
  const safeAnnual = Math.max(0, Math.round(annualCtc));
  const monthlyCtc = Math.round(safeAnnual / 12);

  // Pass 1: find basic monthly/yearly
  let basicMonthly = Math.round(monthlyCtc * 0.75);
  const basicRule = structure.rules.find(r => r.category === 'BASIC' && r.calcType !== 'REMAINDER_OF_CTC');
  if (basicRule) {
    if (basicRule.calcType === 'PERCENT_OF_CTC') {
      basicMonthly = Math.round((monthlyCtc * basicRule.value) / 100);
    } else if (basicRule.calcType === 'FIXED_MONTHLY') {
      basicMonthly = Math.round(basicRule.value);
    }
  }

  const items: CompensationLineItem[] = structure.rules.map((rule, idx) => {
    let monthly = 0;
    if (rule.calcType === 'PERCENT_OF_CTC') {
      monthly = Math.round((monthlyCtc * rule.value) / 100);
    } else if (rule.calcType === 'PERCENT_OF_BASIC') {
      monthly = Math.round((basicMonthly * rule.value) / 100);
    } else if (rule.calcType === 'FIXED_MONTHLY') {
      monthly = Math.round(rule.value);
    }
    return {
      id: `comp-${rule.code}-${idx}`,
      code: rule.code,
      label: rule.label,
      category: rule.category,
      monthlyAmount: monthly,
      yearlyAmount: monthly * 12,
      enabled: rule.enabled,
      isCustom: false,
    };
  });

  // Pass 2: assign remainder to REMAINDER_OF_CTC rule (or reconcile last enabled earning row)
  const remainderIdx = items.findIndex(
    (item, idx) => item.enabled && item.category !== 'DEDUCTION' && structure.rules[idx]?.calcType === 'REMAINDER_OF_CTC'
  );

  if (remainderIdx >= 0) {
    const otherMonthly = items.reduce(
      (sum, it, i) => (i !== remainderIdx && it.enabled && it.category !== 'DEDUCTION' ? sum + it.monthlyAmount : sum),
      0
    );
    const otherYearly = items.reduce(
      (sum, it, i) => (i !== remainderIdx && it.enabled && it.category !== 'DEDUCTION' ? sum + it.yearlyAmount : sum),
      0
    );
    items[remainderIdx].monthlyAmount = Math.max(0, monthlyCtc - otherMonthly);
    items[remainderIdx].yearlyAmount = Math.max(0, safeAnnual - otherYearly);
  } else {
    const enabledEarningIndices = items
      .map((it, i) => (it.enabled && it.category !== 'DEDUCTION' ? i : -1))
      .filter(i => i >= 0);
    if (enabledEarningIndices.length > 0) {
      const lastIdx = enabledEarningIndices[enabledEarningIndices.length - 1];
      const otherMonthly = enabledEarningIndices
        .slice(0, -1)
        .reduce((sum, idx) => sum + items[idx].monthlyAmount, 0);
      const otherYearly = enabledEarningIndices
        .slice(0, -1)
        .reduce((sum, idx) => sum + items[idx].yearlyAmount, 0);
      items[lastIdx].monthlyAmount = Math.max(0, monthlyCtc - otherMonthly);
      items[lastIdx].yearlyAmount = Math.max(0, safeAnnual - otherYearly);
    }
  }

  return items;
}

/**
 * Proportionally scales enabled earnings when HR changes Total Annual CTC while preserving custom rows and deductions.
 */
export function recalculateComponentsForNewCtc(
  newAnnualCtc: number,
  currentComponents: CompensationLineItem[],
  structure?: RoleSalaryStructure
): CompensationLineItem[] {
  const safeAnnual = Math.max(0, Math.round(newAnnualCtc));
  const newMonthlyCtc = Math.round(safeAnnual / 12);
  if (!currentComponents || currentComponents.length === 0) {
    return buildComponentsFromStructure(safeAnnual, structure || DEFAULT_ROLE_SALARY_STRUCTURES[0]);
  }

  const currentEarningsAnnual = currentComponents
    .filter(c => c.enabled && c.category !== 'DEDUCTION')
    .reduce((s, c) => s + c.yearlyAmount, 0);

  if (currentEarningsAnnual <= 0) {
    return buildComponentsFromStructure(safeAnnual, structure || DEFAULT_ROLE_SALARY_STRUCTURES[0]);
  }

  const ratio = safeAnnual / currentEarningsAnnual;
  const updated = currentComponents.map(comp => {
    if (!comp.enabled || comp.category === 'DEDUCTION') {
      return { ...comp };
    }
    const monthly = Math.round((comp.monthlyAmount * ratio));
    return {
      ...comp,
      monthlyAmount: monthly,
      yearlyAmount: monthly * 12,
    };
  });

  // Reconcile rounding on last enabled earning component
  const enabledEarningIndices = updated
    .map((it, i) => (it.enabled && it.category !== 'DEDUCTION' ? i : -1))
    .filter(i => i >= 0);
  if (enabledEarningIndices.length > 0) {
    const lastIdx = enabledEarningIndices[enabledEarningIndices.length - 1];
    const otherMonthly = enabledEarningIndices.slice(0, -1).reduce((s, i) => s + updated[i].monthlyAmount, 0);
    const otherYearly = enabledEarningIndices.slice(0, -1).reduce((s, i) => s + updated[i].yearlyAmount, 0);
    updated[lastIdx] = {
      ...updated[lastIdx],
      monthlyAmount: Math.max(0, newMonthlyCtc - otherMonthly),
      yearlyAmount: Math.max(0, safeAnnual - otherYearly),
    };
  }

  return updated;
}

/**
 * Summarizes CompensationLineItem[] into CTC, Basic, PBVP, Retention Bonus, Deductions, and Net Pay.
 */
export function summarizeCompensationComponents(
  components: CompensationLineItem[],
  market: MarketType = 'Gurgaon'
) {
  const enabledEarnings = components.filter(c => c.enabled && c.category !== 'DEDUCTION');
  const enabledDeductions = components.filter(c => c.enabled && c.category === 'DEDUCTION');

  const monthlyCtc = enabledEarnings.reduce((sum, c) => sum + (Number(c.monthlyAmount) || 0), 0);
  const annualCtc = enabledEarnings.reduce((sum, c) => sum + (Number(c.yearlyAmount) || 0), 0);

  const basicItem = enabledEarnings.find(c => c.code === 'basic' || c.category === 'BASIC');
  const pbvpItem = enabledEarnings.find(c => c.code === 'pbvp');
  const retentionItem = enabledEarnings.find(c => c.code === 'retention_bonus');

  const totalDeductionsMonthly = enabledDeductions.reduce((sum, c) => sum + (Number(c.monthlyAmount) || 0), 0);
  const totalDeductionsYearly = enabledDeductions.reduce((sum, c) => sum + (Number(c.yearlyAmount) || 0), 0);

  const netPayMonthly = Math.max(0, monthlyCtc - totalDeductionsMonthly);
  const netPayYearly = Math.max(0, annualCtc - totalDeductionsYearly);

  return {
    annualCtc,
    monthlyCtc,
    basicMonthly: basicItem ? basicItem.monthlyAmount : 0,
    basicYearly: basicItem ? basicItem.yearlyAmount : 0,
    pbvpMonthly: pbvpItem ? pbvpItem.monthlyAmount : 0,
    pbvpYearly: pbvpItem ? pbvpItem.yearlyAmount : 0,
    retentionBonusMonthly: retentionItem ? retentionItem.monthlyAmount : 0,
    retentionBonusYearly: retentionItem ? retentionItem.yearlyAmount : 0,
    totalDeductionsMonthly,
    totalDeductionsYearly,
    netPayMonthly,
    netPayYearly,
    currency: market === 'Dubai' ? ('AED' as const) : ('INR' as const),
    ctcLpaFormatted: formatSalaryLpa(annualCtc, market),
  };
}

/**
 * Formats an ISO date (YYYY-MM-DD) into official offer letter format (e.g. "1st September 2026")
 * while keeping human-formatted strings intact and never inventing a missing date.
 */
export function formatOfferJoiningDate(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  const trimmed = dateStr.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return trimmed;

  const year = parseInt(isoMatch[1], 10);
  const monthIdx = parseInt(isoMatch[2], 10) - 1;
  const day = parseInt(isoMatch[3], 10);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return trimmed;

  const mod10 = day % 10;
  const mod100 = day % 100;
  let suffix = 'th';
  if (mod10 === 1 && mod100 !== 11) suffix = 'st';
  else if (mod10 === 2 && mod100 !== 12) suffix = 'nd';
  else if (mod10 === 3 && mod100 !== 13) suffix = 'rd';

  return `${day}${suffix} ${months[monthIdx]} ${year}`;
}

export function inferCandidateSalutation(candidate?: Partial<Employee>, explicitSalutation?: string): string {
  if (explicitSalutation !== undefined) return explicitSalutation;
  const rawName = (candidate?.fullName || '').trim();
  if (/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i.test(rawName)) return '';
  if (candidate?.gender === 'Female') return 'Ms.';
  if (candidate?.gender === 'Male') return 'Mr.';
  return '';
}

export function formatSalutationName(name: string, salutation?: string): string {
  const cleanName = (name || '').trim();
  if (!cleanName) return '';
  if (/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i.test(cleanName)) {
    if (salutation !== undefined && salutation !== '') {
      const stripped = cleanName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i, '');
      return `${salutation.trim()} ${stripped}`.trim();
    }
    return cleanName;
  }
  const cleanSal = (salutation ?? '').trim();
  return cleanSal ? `${cleanSal} ${cleanName}` : cleanName;
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

  const name = custom?.candidateName ?? candidate.fullName;
  if (!name || name.trim() === '') missing.push('Candidate Full Name');

  const designation = custom?.designation ?? candidate.designation;
  if (!designation || designation.trim() === '') missing.push('Designation / Role Title');

  const department = custom?.department ?? candidate.department;
  if (!department || department.trim() === '') missing.push('Department');

  const joiningDate = custom?.joiningDate ?? candidate.joiningDate;
  if (!joiningDate || joiningDate.trim() === '') missing.push('Proposed Joining Date');

  const workLoc = custom?.workLocation;
  if (workLoc !== undefined && workLoc.trim() === '') missing.push('Work Location');

  const empType = custom?.employmentType ?? candidate.employmentStatus;
  if (!empType || empType.trim() === '') missing.push('Employment Type');

  const email = custom?.candidateEmail ?? candidate.email;
  if (!email || email.trim() === '') missing.push('Email Address');

  const phone = custom?.candidatePhone ?? candidate.phone;
  if (!phone || phone.trim() === '') missing.push('Phone Number');

  const compSummaryCtc = custom?.compensationComponents
    ? custom.compensationComponents.filter(c => c.enabled && c.category !== 'DEDUCTION').reduce((s, c) => s + c.yearlyAmount, 0)
    : 0;
  const ctc = compSummaryCtc || custom?.salaryBreakup?.annualCtc || candidate.offeredCTC;
  if (!ctc) missing.push('Offered Annual CTC');

  return missing;
}

/**
 * Calculates the exact 3-component White Collar Realty compensation structure
 * from the attached sample offer letter (Basic 75%, PBVP 12.5%, Retention Bonus 12.5%).
 */
export function calculateAnnexureCompensation(
  ctcInput: number | string | undefined,
  market: MarketType = 'Gurgaon'
) {
  const isDubai = market === 'Dubai';
  const defaultAmount = isDubai ? 180000 : 480000;
  const annualCtc = parseAnnualCtc(ctcInput, defaultAmount);
  const monthlyCtc = Math.round(annualCtc / 12);

  const basicMonthly = Math.round(monthlyCtc * 0.75);
  const basicYearly = basicMonthly * 12;

  const pbvpMonthly = Math.round(monthlyCtc * 0.125);
  const pbvpYearly = pbvpMonthly * 12;

  const retentionBonusMonthly = Math.max(0, monthlyCtc - basicMonthly - pbvpMonthly);
  const retentionBonusYearly = annualCtc - basicYearly - pbvpYearly;

  return {
    annualCtc,
    monthlyCtc,
    basicMonthly,
    basicYearly,
    pbvpMonthly,
    pbvpYearly,
    retentionBonusMonthly,
    retentionBonusYearly,
    currency: isDubai ? ('AED' as const) : ('INR' as const),
    lpaFormatted: formatSalaryLpa(annualCtc, market),
  };
}

/**
 * Formats annual CTC into human-readable LPA / AED format matching the offer letter
 */
export function formatSalaryLpa(annualCtc: number, market: MarketType = 'Gurgaon'): string {
  if (market === 'Dubai') {
    return `AED ${Math.round(annualCtc).toLocaleString('en-IN')} per annum`;
  }
  const lpaNum = Number((annualCtc / 100000).toFixed(2));
  return `Rs. ${lpaNum} LPA`;
}

/**
 * The pristine, immutable original text of all 15 sections from the 10-page White Collar Realty Offer Letter PDF.
 * Never silently modified; used as the benchmark template.
 */
export const WCR_ORIGINAL_OFFER_SECTIONS: Record<string, { title: string; page: number; content: string }> = {
  section_1: {
    title: '1. Performance Based Variable Pay (PBVP)',
    page: 2,
    content:
      'PBVP is a performance-linked variable component of your CTC and is not a fixed monthly entitlement.\n' +
      '● Eligibility: Becomes payable only if monthly revenue of AED 50,000 is earned.\n' +
      '● Exclusions: Cancelled bookings, refunded bookings, fraudulent transactions, transactions violating Company policy, or bookings later found to be ineligible do not qualify.\n' +
      '● Verification & Discretion: PBVP shall be processed only after internal verification. The Company reserves the right to withhold, adjust, recover, or reverse PBVP in the event of cancellation, fraud, customer refund, policy violation, or duplicate claims. It does not create any permanent entitlement, and the Company’s decision shall be final and binding.',
  },
  section_2: {
    title: '2. Retention Bonus',
    page: 2,
    content:
      '● Eligibility: Payable only after completion of one year of service, on yearly revenue of AED 5,00,000\n' +
      '● Exceptions & Notice Period: Employees who resign, abandon employment, or are terminated before completing one year will not be eligible. Employees serving a notice period beyond one year must satisfy all exit formalities and policy requirements.\n' +
      '● Forfeiture: Disciplinary proceedings, fraud, misconduct, policy violation, or financial liability towards the Company may result in withholding or forfeiture. The policy may be modified or discontinued prospectively.',
  },
  section_3: {
    title: '3. Sales Incentive Policy',
    page: 2, // spans pages 2 and 3
    content:
      'The Employee shall become eligible for any Sales Incentive, Performance Bonus, Commission, or any other performance-linked payout only after the Company has successfully received its brokerage/commission from the respective transaction. Accordingly, no incentive, commission, or performance-linked payment shall be payable under, including but not limited to, the following circumstances:\n' +
      '● The customer cancels, terminates, withdraws, or fails to proceed with the booking/transaction for any reason whatsoever.\n' +
      '● The customer defaults, delays, or fails to make the payment(s) required under the payment plan or as demanded by the developer.\n' +
      '● The transaction is put on hold, remains incomplete, or is not successfully concluded.\n' +
      '● The Company has not received its brokerage, commission, revenue share, or any other receivable from the developer, channel partner, or any other concerned party, irrespective of the reason.\n' +
      '● Any booking is subsequently reversed, refunded, cancelled, or declared ineligible by the developer or any competent authority.\n' +
      'The Company’s records regarding receipt of brokerage/commission and the successful completion of the transaction shall be final and binding for determining the Employee’s eligibility for incentive payouts. No incentive shall accrue merely on the basis of booking generation or booking confirmation unless the Company’s brokerage/commission has been duly realized.',
  },
  section_4: {
    title: '4. Review, Probation & Confirmation',
    page: 3,
    content:
      '● 10-Day Reviewal Period: You will be on a reviewal period for 10 days from your date of joining. Underperformance, inappropriate behavior, disciplinary issues, experience mismatch, false documents, or gross misconduct during this time may result in immediate termination without salary. Appointment letters are issued post-review.\n' +
      '● Probation Duration: Initially, you will be on probation for six (6) months. Evaluation covers performance, attendance, conduct, technical learning, discipline, and communication skills.\n' +
      '● Confirmation & Extension: Confirmation is subject to satisfactory results and formal written approval; it is not automatic upon time completion. Probation may be extended if performance does not meet organizational standards.\n' +
      '● Performance Improvement Plan (PIP): The Company may place an underperforming employee on a PIP. Failure to complete the PIP successfully within the prescribed timeline may result in termination.\n' +
      '● Termination During Probation: Notice for termination during probation is as stated under Section 9 (Termination & Summary Dismissal).',
  },
  section_5: {
    title: '5. Working Hours & Office Discipline',
    page: 3,
    content:
      '● Schedule: Standard working hours are 10:00 AM to 7:00 PM, Tuesday to Sunday (6 days a week), inclusive of a 30-minute lunch break, a 15-minute morning break, and a 15-minute evening break.\n' +
      '● Weekly Off: The designated weekly off is Monday. If a client meeting, site visit, or transaction-related work falls on the weekly off, the employee shall attend as per the client\'s availability, at the office or on-site. Such attendance does not carry overtime. Compensatory off, if any, is at the reporting manager\'s discretion.\n' +
      '● Flexibility & Overtime: Schedules may require working early, late, or occasionally on week-offs/holidays depending on business requirements. No overtime payment will be provided.\n' +
      '● Dress Code / Formal Wear Policy: Formal business attire is mandatory during office hours.\n' +
      '● Code of Conduct: Employees must maintain professional behavior, workplace ethics, business etiquette, and respect for colleagues/clients. Employees shall follow instructions from reporting managers and refrain from office politics, rumor spreading, disruptive behavior, discrimination, harassment, unauthorized photography/videography, or damaging the Company\'s reputation.',
  },
  section_6: {
    title: '6. Late Entry & Early Leaving Policy',
    page: 4,
    content:
      '● Standard Reporting Time: Strictly 10:00 AM.\n' +
      '● Late Penalty: Arrival after 10:15 AM results in a half-day leave deduction. There is no flexibility beyond 10:15 AM.\n' +
      '● Exceptions: A maximum of three (3) monthly exceptions for late entry/early exit are permitted, subject to department head approval.\n' +
      '● Procedure: Any late arrival requires written permission from the manager and an update in the designated group stating the reason and estimated time of arrival (ETA).',
  },
  section_7: {
    title: '7. Leave Policy',
    page: 4, // spans pages 4 and 5
    content:
      '7.1. Casual Leave (CL)\n' +
      '● Entitlement: 12 CLs per year (1 paid leave per month) awarded only after probation completion. This is inclusive of all casual and medical leaves.\n\n' +
      '7.2. Carry Forward Leaves (CFL)\n' +
      '● Carry Forward: Unused CL can be carried forward up to the end of that financial year. Leave encashment is available after the financial year completes. Taking CFL requires written approval from the manager 2 days prior.\n\n' +
      '7.3. Probation Paid Leave\n' +
      '● No paid leaves are granted during probation.\n\n' +
      '7.4. Emergency Leave\n' +
      '● Must be informed and acknowledged before 10:00 AM on the same working day via call/official message to the Reporting Manager and HR.\n' +
      '● Intimation after office hours begin or absence without confirmation will be treated as unapproved leave. A written email with reason and proof must be submitted on the next working day.\n\n' +
      '7.5. Sick Leave\n' +
      '● Sick Leave is availed from the Casual Leave entitlement under 7.1 (no separate sick-leave quota). Sick leave exceeding 2 days requires submission of medical records for approval.\n\n' +
      '7.6. Unplanned Leave & Sandwich Policy\n' +
      '● Sandwich Policy: Unplanned leave taken immediately before and/or after a weekly off (Monday)/holiday shall cause the weekly off/holiday to be counted as unpaid leave (2 days\' deduction). Leave must be pre-approved via email at least 10 days in advance.\n' +
      '● Extended Absence: Absences exceeding 5 days void paid week-off salary.\n' +
      '● Restricted Period: No leave is allowed for 3 days immediately before and after salary release; any taken will be marked unapproved.\n' +
      '● Advance Notice Requirements:\n' +
      '  ○ 1 day leave: Apply at least 1–2 days prior.\n' +
      '  ○ 2 days leave: Apply at least 4 days in advance.\n\n' +
      '7.7. Planned Leave\n' +
      '● Planned leaves (travel, marriage, exams) must be applied for at least 30 days in advance. Unapproved leaves are treated as unauthorized.',
  },
  section_8: {
    title: '8. Conflict of Interest, Non-Solicitation & Client Diversion',
    page: 5,
    content:
      '● Exclusive Employment & Office-Hours Discipline: The employee shall devote full working time to the Company. Personal calls and personal WhatsApp/messaging are not permitted during office hours; any employee found engaged in personal calls or chats during office hours shall face disciplinary action. During the tenure of employment, the employee shall not freelance or take up any secondary work (paid or unpaid), and shall not book, close, route, or process any property transaction, booking, or payment outside the Company, whether directly with any developer or with any other broker or channel partner. Any such act shall be treated as a fundamental breach, and the Company may terminate employment with immediate effect, without notice, with forfeiture of all pending incentives.\n' +
      '● Professional Integrity & Client Relations: Diverting Company clients, enquiries, or leads to any external party or builder, or accepting any unauthorized external commission, is a breach of professional ethics and may lead to disciplinary action up to and including termination and legal measures.\n' +
      '● Non-Solicitation & Enforcement (Post-Separation): For 12 months following separation, the former employee is strictly prohibited from contacting, soliciting, or servicing any clients, leads, or business contacts associated with White Collar Realty for personal gain or the benefit of any other entity. Any such misuse or diversion constitutes a material breach of this agreement. The Company reserves the right to seek injunctive relief and claim financial damages for any such breach.\n' +
      '● Client Communication Channels: All client, investor, and lead communication (calls, WhatsApp, messages, email) shall be conducted only through the Company-provided number, email, and CRM. Use of a personal mobile number, personal WhatsApp, or personal email for client contact is prohibited. All clients, contacts, and chat histories generated through Company work are Company property and shall be handed over in full, along with the Company number, on exit.',
  },
  section_9: {
    title: '9. Termination & Summary Dismissal',
    page: 5, // spans pages 5 and 6
    content:
      '● Notice by the Company: Where the Company terminates employment (other than summary dismissal):\n' +
      '  1. Regular Employees: 7 days\' prior notice.\n' +
      '  2. Probationary Employees: 24 hours\' notice.\n' +
      '● Performance Benchmark (First 3 Months): Failure to achieve at least one (1) sales closure within the first three (3) months of joining entitles the Company to terminate employment immediately without further obligation.\n' +
      '● Summary Dismissal (Immediate Termination Without Notice): Accumulating three (3) written warnings may trigger termination. However, immediate termination without notice may occur for:\n' +
      '  1. Gross misconduct, gross negligence, or fundamental breach of contract.\n' +
      '  2. Unlawful communication of confidential Company business or data theft.\n' +
      '  3. Dishonesty, moral turpitude, or financial fraud/misconduct.\n' +
      '  4. Falsification or concealment of resume details or background documents.\n' +
      '  5. Physical or mental medical unfitness.\n' +
      '  6. Absconding or unauthorized absence as defined under Section 10 (Unannounced Absence Policy).\n' +
      '  7. Engaging in unauthorized side employment/business, freelancing, or routing any property transaction outside the Company (directly with a developer, broker, or channel partner).\n' +
      '  8. Unethical behavior, harassment, violence, client diversion, or damaging the Company\'s image/reputation.\n' +
      '  9. Habitual indiscipline, repeated late reporting, or failure of PIP.',
  },
  section_10: {
    title: '10. Unannounced Absence Policy',
    page: 6,
    content:
      '● Definition: An absence of three (3) or more consecutive working days without prior approval or communication shall be treated as voluntary departure from the role. This includes failure to participate in transition responsibilities or leaving before the first salary credit during the initial training period.\n' +
      '● Consequences: Such departure shall be treated as job abandonment, resulting in termination of employment and forfeiture of pending dues and incentives. No relieving documentation shall be issued. All Company property must be returned within 7 days, failing which the Company may initiate legal recovery.',
  },
  section_11: {
    title: '11. Prevention of Sexual Harassment (POSH)',
    page: 6,
    content:
      'White Collar Realty enforces a strict zero-tolerance policy against workplace sexual harassment. Mandatory compliance with the Company’s POSH Policy and participation in POSH awareness training are required for all employees.',
  },
  section_12: {
    title: '12. Document Verification & Company Property',
    page: 6,
    content:
      '● Document Verification: Employment is subject to satisfactory background verification of identity, education, experience, address, and employment history. Submitting false information will result in immediate offer withdrawal or termination.\n' +
      '● Return of Property: Upon resignation, termination, or exit clearance, the employee must return all Company assets including laptops, SIM cards, official emails, CRM access, keys, access cards, marketing materials, and physical files, in good working condition. If any Company asset is not returned, or is lost, stolen, broken, or damaged (beyond normal wear and tear) while in the employee\'s custody, the employee shall be liable to pay its replacement or repair cost as determined by the Company, and the Company may recover this amount from the employee\'s salary, incentives, or Full & Final settlement, to the extent permitted by law.',
  },
  section_13: {
    title: '13. Exit Process, Notice Period & Full & Final (F&F) Settlement',
    page: 6, // spans pages 6 and 7
    content:
      '● Notice by the Employee: Resigning employees must provide 45 working days\' written notice. No leaves are permitted during the notice period (granted leaves will extend the notice period by the same duration).\n' +
      '● Early Release & Buyout: Early release is solely at the Company\'s discretion, subject to deducting salary equivalent to the unserved days or charging 45 working days\' salary as compensation for financial loss.\n' +
      '● Garden Leave: The Company may place the employee on Garden Leave during the notice period, during which confidentiality and non-solicitation obligations remain active.\n' +
      '● F&F Settlement: Full and Final settlement is processed after 45 working days from leaving, subject to complete exit clearance, department clearance, handover completion, and full asset return. Failure to serve the notice period, absconding, or failing to return Company assets gives the Company the right to withhold F&F settlements, relieving letters, and unpaid salaries.',
  },
  section_14: {
    title: '14. Confidentiality, Client data protection and non-disclosure obligations',
    page: 7, // spans pages 7, 8, 9
    content:
      'As part of your role with White Collar Realty, you may be provided access to sensitive and confidential information relating to the Company, its clients, investors, prospects, employees, channel partners, developers, vendors and business operations. You acknowledge that such access is provided strictly for authorised Company work and is subject to the following obligations.\n\n' +
      '14.1 Confidential Information\n' +
      '“Confidential Information” includes, without limitation, client and investor names, phone numbers, email addresses, contact details, identity information, investment history, properties owned or considered, budgets, transaction values, booking or payment information, portfolio information, investor classification, CRM records, lead databases, cold data, buyer data, spreadsheets, reports, dashboards, call notes, WhatsApp or email records, recordings, meeting notes, site-visit records, internal remarks, project-wise client lists, pricing intelligence, inventories, negotiated terms, brokerage information, business information, source data, analytics, formulas, scripts, system access details, credentials, internal procedures and any information that is marked confidential or would reasonably be understood to be confidential or non-public.\n\n' +
      '14.2 Strict Need-to-Know Access and Internal Confidentiality\n' +
      'You shall access and use Confidential Information only to the minimum extent required for the task assigned to you. You shall not disclose, discuss, show, forward, copy or otherwise make Confidential Information available to any unauthorised person, including any colleague, intern, employee, manager, contractor or other person within the office unless that person is specifically authorised and requires the information for a legitimate assigned business purpose.\n\n' +
      '14.3 No External Disclosure or Personal Use\n' +
      'You shall not share, disclose, transfer, sell, exploit or use Confidential Information for your own benefit or for the benefit of any relative, friend, competitor, broker, agent, employer, future employer, business, developer, channel partner, client or third party. You shall not independently contact, solicit, divert, approach, market to, transact with or attempt to monetise any Company client, investor, lead or prospect except where expressly instructed and authorised as part of your Company duties.\n\n' +
      '14.4 No Unauthorised Copying, Downloading or Storage\n' +
      'Unless specifically authorised in writing by the Company, you shall not copy, export, download, print, photograph, screenshot, screen-record, email, WhatsApp, AirDrop, upload, sync, back up, transfer or store Confidential Information on any personal phone, personal laptop, personal email account, personal cloud drive, USB device, messaging application, external storage, public website or any other unapproved system.\n\n' +
      '14.5 Use of AI Tools, Analytics Platforms and Third-Party Applications\n' +
      'You shall not upload, paste, enter or expose identifiable client or investor data, CRM exports, phone numbers, email addresses, financial or investment information, passwords, Company datasets or proprietary information into any public or unapproved artificial-intelligence tool, analytics platform, code repository, file-sharing service or third-party application. Any Company-approved tool may be used only within the scope and safeguards specifically authorised by the Company.\n\n' +
      '14.6 Data Minimisation, Masking and Security\n' +
      'Where full client identity is not required for analysis or testing, you shall use masked, pseudonymised or dummy values as directed by the Company. You shall comply with all Company access controls, password requirements, security instructions and data-handling procedures and shall not attempt to bypass permissions or access data outside your assigned scope.\n\n' +
      '14.7 No Unauthorised Client or Investor Contact\n' +
      'Client or investor contact details obtained through Company work shall not be used for personal calls, messages, social-media contact, referrals, introductions, independent sales, future business or any other purpose not expressly authorised by the Company.\n\n' +
      '14.8 Immediate Reporting of Data or Security Incidents\n' +
      'You must immediately report to the Company any suspected or actual loss, unauthorised access, accidental disclosure, misdirected message or email, stolen or lost device, compromised password, unauthorised download or export, phishing incident or any other event that may affect Confidential Information. You shall preserve relevant evidence and fully cooperate with the Company in investigation, containment, remediation and any legal or compliance action.\n\n' +
      '14.9 Return, Deletion and Cessation of Access\n' +
      'Upon completion of an assigned task, suspension, resignation, termination, expiry of employment, or whenever requested by the Company, you shall immediately cease access to Company systems, return all Company property and records, and permanently delete any Company data stored in any authorised temporary location. You shall not retain any copy, extract, summary, photograph, screenshot, client contact, report, dataset, derivative data, model or reconstruction of Company information and shall provide written confirmation of deletion or return if required.\n\n' +
      '14.10 Continuing Obligation After Exit\n' +
      'These confidentiality and data-protection obligations shall continue during your employment and shall survive resignation, termination, completion or expiry of your engagement. You shall continue to protect client and investor information, credentials, trade secrets and other non-public Company information for so long as such information remains confidential, proprietary or legally protected.\n\n' +
      '14.11 Ownership of Data and Work Product\n' +
      'All Company-provided data and all datasets, cleaned or merged files, analyses, dashboards, reports, findings, data dictionaries, scripts, queries, transformations, documentation and other work product created by you in the course of Company work shall belong to the Company to the extent permitted by applicable law and the terms of your engagement. You shall have no right to retain, reuse, publish, disclose, sell or commercially exploit such material.\n\n' +
      '14.12 Breach, Disciplinary Action and Legal Remedies\n' +
      'Any actual or suspected breach of these obligations may result in immediate restriction or suspension of access, disciplinary action, termination of employment, preservation of digital evidence, internal investigation and legal action as permitted by applicable law. The Company may seek appropriate civil, contractual, statutory and equitable remedies, including injunctions or other preventive relief, recovery of legally recoverable losses or damages and any other remedy available under law.\n\n' +
      '14.13 Indemnity\n' +
      'To the extent permitted by applicable law, you shall be responsible for and shall indemnify the Company against direct losses, liabilities, claims, costs and expenses actually arising from your wilful misconduct, fraud, unauthorised disclosure, unauthorised use, deliberate data misuse or material breach of these obligations, subject to determination under applicable law.\n\n' +
      '14.14 Lawful Disclosures\n' +
      'Nothing in these obligations prevents a disclosure expressly required by applicable law, a binding order of a competent court or lawful authority, or a protected disclosure that cannot legally be restricted. Where legally permitted, you shall promptly inform the Company before such disclosure and shall disclose only the minimum information legally required.\n\n' +
      '14.15 Future Employment\n' +
      'Nothing in these clauses is intended to prohibit you from pursuing lawful future employment, profession, trade or business. However, no future employment or engagement gives you any right to use, retain, disclose or exploit White Collar Realty’s Confidential Information, client or investor information, proprietary data or trade secrets.\n\n' +
      '14.16 Applicable Law and Jurisdiction\n' +
      'You shall comply with applicable Indian data-protection, privacy, information-technology, cybersecurity and contractual requirements, together with Company policies and instructions. These obligations shall be governed by the laws of India and, subject to any dispute-resolution provision elsewhere in your offer letter or employment/internship terms, courts having competent jurisdiction at Gurugram, Haryana shall have jurisdiction.',
  },
  section_15: {
    title: '15. Acceptance & Signatures',
    page: 10,
    content:
      'By signing below, the employee confirms that he has read, understood, and accepted all the terms and conditions of this offer letter.',
  },
};

/**
 * Standard legal and operational clauses for White Collar Realty Executive Offer Letter.
 */
export const DEFAULT_OFFER_CLAUSES = Object.values(WCR_ORIGINAL_OFFER_SECTIONS).map(
  sec => `${sec.title}\n${sec.content}`
);

/**
 * Creates or updates an OfferLetterData object for a candidate using configurable role-based salary structures.
 * Never invents missing candidate details.
 */
export function buildOfferLetterData(
  candidate: Employee,
  customOverrides?: Partial<OfferLetterData>,
  salaryStructures: RoleSalaryStructure[] = DEFAULT_ROLE_SALARY_STRUCTURES
): OfferLetterData {
  const existing = candidate.offerLetter;
  const mergedInput: Partial<OfferLetterData> = {
    ...(existing || {}),
    ...(customOverrides || {}),
  };

  const currentYear = new Date().getFullYear();
  const sequenceNum = Math.floor(100 + Math.random() * 900);
  const refNo = mergedInput.refNo || `WCR/HR/OL/${currentYear}/${candidate.employeeCode || sequenceNum}`;

  const issueDate = mergedInput.issueDate || new Date().toISOString().split('T')[0];
  const market = mergedInput.market || candidate.market || 'Gurgaon';
  const isDubai = market === 'Dubai';

  const designation = mergedInput.designation !== undefined ? mergedInput.designation : (candidate.designation || '');
  const department = mergedInput.department !== undefined ? mergedInput.department : (candidate.department || '');
  const employmentType =
    mergedInput.employmentType ||
    (candidate.employmentStatus === 'Upcoming Joiner' ? 'Full-Time' : candidate.employmentStatus) ||
    'Full-Time';

  const workLocation =
    mergedInput.workLocation !== undefined
      ? mergedInput.workLocation
      : isDubai
        ? 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE'
        : '6th floor, TOWER-A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101';

  const place =
    mergedInput.place !== undefined
      ? mergedInput.place
      : isDubai
        ? 'Dubai, UAE'
        : 'Gurugram, Haryana';

  const matchedStructure =
    (mergedInput.roleStructureId && salaryStructures.find(s => s.id === mergedInput.roleStructureId)) ||
    findMatchingRoleStructure(designation, salaryStructures, market, employmentType);

  let compensationComponents: CompensationLineItem[];
  if (customOverrides?.compensationComponents && customOverrides.compensationComponents.length > 0) {
    compensationComponents = customOverrides.compensationComponents.map(c => ({
      ...c,
      monthlyAmount: Math.round(Number(c.monthlyAmount) || 0),
      yearlyAmount: Math.round(Number(c.yearlyAmount) || 0),
    }));
  } else if (existing?.compensationComponents && existing.compensationComponents.length > 0 && !customOverrides?.salaryBreakup?.annualCtc) {
    compensationComponents = existing.compensationComponents;
  } else {
    const rawCandidateCtc =
      customOverrides?.salaryBreakup?.annualCtc ||
      (candidate.offeredCTC && !candidate.offeredCTC.includes('RESTRICTED')
        ? parseAnnualCtc(candidate.offeredCTC, matchedStructure.defaultAnnualCtc)
        : matchedStructure.defaultAnnualCtc);
    compensationComponents = buildComponentsFromStructure(rawCandidateCtc, matchedStructure);
    // Preserve legacy 3-component custom edits if present without compensationComponents
    if (!customOverrides?.compensationComponents && (customOverrides?.basicMonthly !== undefined || customOverrides?.pbvpMonthly !== undefined || customOverrides?.retentionBonusMonthly !== undefined)) {
      compensationComponents = compensationComponents.map(item => {
        if (item.code === 'basic' && customOverrides.basicMonthly !== undefined) {
          return { ...item, monthlyAmount: customOverrides.basicMonthly, yearlyAmount: customOverrides.basicYearly ?? customOverrides.basicMonthly * 12, enabled: true };
        }
        if (item.code === 'pbvp' && customOverrides.pbvpMonthly !== undefined) {
          return { ...item, monthlyAmount: customOverrides.pbvpMonthly, yearlyAmount: customOverrides.pbvpYearly ?? customOverrides.pbvpMonthly * 12, enabled: true };
        }
        if (item.code === 'retention_bonus' && customOverrides.retentionBonusMonthly !== undefined) {
          return { ...item, monthlyAmount: customOverrides.retentionBonusMonthly, yearlyAmount: customOverrides.retentionBonusYearly ?? customOverrides.retentionBonusMonthly * 12, enabled: true };
        }
        return item;
      });
    }
  }

  const compSummary = summarizeCompensationComponents(compensationComponents, market);
  const salaryBreakup: SalaryBreakup = {
    ...(calculateSalaryBreakup(compSummary.annualCtc, market)),
    ...(mergedInput.salaryBreakup || {}),
    annualCtc: compSummary.annualCtc,
    monthlyCtc: compSummary.monthlyCtc,
    basicMonthly: compSummary.basicMonthly,
    basicAnnual: compSummary.basicYearly,
    grossMonthly: compSummary.monthlyCtc,
    grossAnnual: compSummary.annualCtc,
    approxNetInHandMonthly: compSummary.netPayMonthly,
    currency: compSummary.currency,
  };

  //Valid till 14 days from issue date
  const issueDateObj = new Date(issueDate);
  if (!isNaN(issueDateObj.getTime())) {
    issueDateObj.setDate(issueDateObj.getDate() + 14);
  }
  const validTillDate =
    mergedInput.validTillDate ||
    (!isNaN(issueDateObj.getTime()) ? issueDateObj.toISOString().split('T')[0] : issueDate);

  const sectionsContent: Record<string, string> = {};
  Object.entries(WCR_ORIGINAL_OFFER_SECTIONS).forEach(([k, v]) => {
    sectionsContent[k] = mergedInput.annexureSections?.[k] || v.content;
  });

  const rawJoiningDate =
    customOverrides?.joiningDate !== undefined
      ? customOverrides.joiningDate
      : existing?.joiningDate || candidate.joiningDate || '';
  const joiningDate = formatOfferJoiningDate(rawJoiningDate);

  const salutation = inferCandidateSalutation(candidate, mergedInput.salutation);

  const missingFields = checkOfferMissingFields(candidate, {
    ...mergedInput,
    candidateName: mergedInput.candidateName !== undefined ? mergedInput.candidateName : candidate.fullName,
    designation,
    department,
    employmentType,
    joiningDate,
    workLocation,
    compensationComponents,
    salaryBreakup,
  });

  return {
    refNo,
    issueDate,
    salutation,
    candidateName: mergedInput.candidateName !== undefined ? mergedInput.candidateName : candidate.fullName,
    candidateAddress: mergedInput.candidateAddress !== undefined ? mergedInput.candidateAddress : (candidate.currentAddress || candidate.permanentAddress || ''),
    candidateEmail: mergedInput.candidateEmail !== undefined ? mergedInput.candidateEmail : candidate.email,
    candidatePhone: mergedInput.candidatePhone !== undefined ? mergedInput.candidatePhone : candidate.phone,
    designation,
    department,
    employmentType,
    reportingManager: mergedInput.reportingManager !== undefined ? mergedInput.reportingManager : (candidate.reportingManager || ''),
    joiningDate,
    workLocation,
    place,
    market,
    probationMonths: mergedInput.probationMonths || 6,
    noticePeriodDays: mergedInput.noticePeriodDays || 45,
    validTillDate,
    status: mergedInput.status || 'Draft',
    salaryBreakup,
    roleStructureId: matchedStructure.id,
    compensationComponents,
    totalDeductionsMonthly: compSummary.totalDeductionsMonthly,
    totalDeductionsYearly: compSummary.totalDeductionsYearly,
    netPayMonthly: compSummary.netPayMonthly,
    netPayYearly: compSummary.netPayYearly,
    clauses: mergedInput.clauses && mergedInput.clauses.length > 0 ? mergedInput.clauses : DEFAULT_OFFER_CLAUSES,
    missingFields,
    approvedBy: mergedInput.approvedBy,
    approvedAt: mergedInput.approvedAt,
    issuedAt: mergedInput.issuedAt,
    acceptedAt: mergedInput.acceptedAt,
    candidateSignatureName: mergedInput.candidateSignatureName,
    signedAt: mergedInput.signedAt,
    pdfPath: mergedInput.pdfPath,
    templateVersion: mergedInput.templateVersion || 'v1.0-official-10page',
    customNotes: mergedInput.customNotes || '',
    recruiterName: mergedInput.recruiterName || 'Nisha',
    recruiterTitle: mergedInput.recruiterTitle || 'Human Resources Recruiter',
    recruiterPhone: mergedInput.recruiterPhone || '+91 124-4349007',
    recruiterEmail: mergedInput.recruiterEmail || 'hr@whitecollarrealty.com',
    ctcLpaFormatted: customOverrides?.ctcLpaFormatted || compSummary.ctcLpaFormatted,
    basicMonthly: compSummary.basicMonthly,
    basicYearly: compSummary.basicYearly,
    pbvpMonthly: compSummary.pbvpMonthly,
    pbvpYearly: compSummary.pbvpYearly,
    retentionBonusMonthly: compSummary.retentionBonusMonthly,
    retentionBonusYearly: compSummary.retentionBonusYearly,
    annexureSections: sectionsContent,
    templateHistory: mergedInput.templateHistory || [
      {
        version: 'v1.0-official-10page',
        updatedAt: '2026-10-29T00:00:00.000Z',
        updatedBy: 'Corporate HR (System Master)',
        changeSummary: 'Exact 10-page master template digitized from corporate Sample Offer Letter.',
      },
    ],
    emailSentAt: mergedInput.emailSentAt,
    emailSentBy: mergedInput.emailSentBy,
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
