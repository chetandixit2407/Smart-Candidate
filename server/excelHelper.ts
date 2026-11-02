import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import type { Employee, CompanyAsset, AuditLog } from '../src/types/index.ts';
import { getBayFromDesk } from './seedData.ts';

/**
 * Safely format values for profile spreadsheet rows
 */
function fVal(v: unknown, fallback = '—'): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return fallback;
    return v
      .map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join('; ');
  }
  return String(v).trim() || fallback;
}

/**
 * Parses an uploaded XLSX or CSV file buffer and returns raw JSON rows + detected headers.
 */
export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  isCsvHint = false
): Promise<{ rawRows: Record<string, unknown>[]; headers: string[]; sheetName: string }> {
  const workbook = new ExcelJS.Workbook();

  let loaded = false;

  // Try loading as XLSX first, unless explicitly marked as CSV
  if (!isCsvHint) {
    try {
      await workbook.xlsx.load(buffer as any);
      loaded = true;
    } catch {
      // If XLSX parsing fails, fall back to CSV stream parsing
      loaded = false;
    }
  }

  if (!loaded) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    await workbook.csv.read(stream);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Uploaded workbook contains no accessible sheets.');
  }

  const headers: string[] = [];
  const rawRows: Record<string, unknown>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerText = String(cell.value ?? '').trim();
        headers[colNumber] = headerText;
      });
    } else {
      const rowObj: Record<string, unknown> = {};
      let hasData = false;

      headers.forEach((header, colNumber) => {
        if (!header) return;
        const cell = row.getCell(colNumber);
        let cellVal = cell.value;

        // Normalize cell values (formulas, rich text, dates)
        if (cellVal && typeof cellVal === 'object') {
          if ('result' in cellVal && cellVal.result !== undefined) {
            cellVal = cellVal.result;
          } else if ('text' in cellVal && typeof cellVal.text === 'string') {
            cellVal = cellVal.text;
          } else if (cellVal instanceof Date) {
            cellVal = cellVal.toISOString().split('T')[0];
          }
        }

        const stringVal = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
        if (stringVal !== '') {
          hasData = true;
        }
        rowObj[header] = stringVal;
      });

      if (hasData) {
        rawRows.push(rowObj);
      }
    }
  });

  // Filter out empty header entries
  const validHeaders = headers.filter(Boolean);
  return { rawRows, headers: validHeaders, sheetName: worksheet.name || 'Sheet1' };
}

/**
 * Generates single-sheet Master Personnel Directory Excel file
 */
export async function generateSingleSheetExcel(
  data: Record<string, unknown>[],
  sheetName = 'Master Personnel Directory'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'White Collar Realty HR';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    worksheet.columns = keys.map(key => ({
      header: key,
      key,
      width: Math.max(key.length + 4, 16),
    }));

    data.forEach(item => {
      worksheet.addRow(item);
    });

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FF0F172A' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    headerRow.height = 24;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates multi-tab Master HR Excel file
 */
export async function generateMultiSheetExcel(
  sheets: Array<{ name: string; data: Record<string, unknown>[] }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'White Collar Realty HR';
  workbook.created = new Date();

  sheets.forEach(sheetInfo => {
    const worksheet = workbook.addWorksheet(sheetInfo.name);
    if (sheetInfo.data.length > 0) {
      const keys = Object.keys(sheetInfo.data[0]);
      worksheet.columns = keys.map(key => ({
        header: key,
        key,
        width: Math.max(key.length + 4, 18),
      }));

      sheetInfo.data.forEach(item => {
        worksheet.addRow(item);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FF0F172A' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      headerRow.height = 24;
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates Chetan Information Sheet Sample Template (.xlsx)
 */
export async function generateChetanTemplateExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chetan Information Sheet');

  const headers = [
    'Full Name',
    'Contact Number',
    'Email Address',
    'Date of Birth',
    'Gender',
    'Nationality',
    'Current Residential Address',
    'Permanent Address',
    'Emergency Contact Name',
    'Emergency Contact Relation',
    'Emergency Contact Phone',
    'Father Name',
    'Father Contact',
    'Mother Name',
    'Previous Company',
    'Previous Designation',
    'Previous CTC',
    'Current Offered CTC',
    'Total Experience (Years)',
    'Gurgaon Market Experience',
    'Dubai Market Experience',
    'Highest Qualification',
    'Institution / College',
    'Passing Year',
    'Professional Reference Name',
    'Professional Reference Contact',
    'Designated Seat / Desk',
  ];

  const rows = [
    [
      'Chetan Sharma',
      '+91 98712 34567',
      'chetan.sharma@whitecollarrealty.com',
      '1996-08-14',
      'Male',
      'Indian',
      'DLF The Crest, Sector 54, Golf Course Road, Gurgaon',
      'Sector 14, Urban Estate, Gurgaon',
      'Ramesh Sharma',
      'Father',
      '+91 98101 23456',
      'Ramesh Sharma',
      '+91 98101 23456',
      'Sunita Sharma',
      'DLF Luxury Real Estate Advisors',
      'Investment Consultant',
      '₹8,40,000 p.a.',
      '₹13,50,000 p.a.',
      '5.2',
      '4.0 Years (Golf Course Rd & DLF Camellias)',
      '1.2 Years (Downtown Dubai & Dubai Hills)',
      'BBA + PG Diploma in Real Estate Investment',
      'Amity School of Business / RICS SBE',
      '2017',
      'Amit Singhania (VP Sales)',
      '+91 99100 88776',
      'B2',
    ],
    [
      'Aanya Kapoor',
      '+91 98112 00112',
      'aanya.kapoor97@gmail.com',
      '1997-02-19',
      'Female',
      'Indian',
      'The Belaire, Golf Course Road, Gurgaon',
      'The Belaire, Golf Course Road, Gurgaon',
      'Sanjay Kapoor',
      'Father',
      '+91 98112 00113',
      'Sanjay Kapoor',
      '+91 98112 00113',
      'Meena Kapoor',
      'Damac Hills Advisory Office',
      'Client Relationship Executive',
      '₹8,50,000 p.a.',
      '₹12,00,000 p.a.',
      '3.8',
      '1.5 Years',
      '2.0 Years (Dubai Marina, Palm Jumeirah)',
      'B.Sc Economics & Finance',
      'NMIMS Mumbai',
      '2019',
      'Farhan Zaidi (Sales Manager)',
      '+971 52 334 5566',
      'F2',
    ],
  ];

  worksheet.columns = headers.map(h => ({
    header: h,
    width: Math.max(h.length + 4, 18),
  }));

  rows.forEach(r => worksheet.addRow(r));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF0F172A' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' }, // Light gold accent
  };
  headerRow.height = 26;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates Employees Details (Birthday) Sample Template (.xlsx)
 */
export async function generateBirthdayTemplateExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Employees Details (Birthday)');

  const headers = [
    'Employee Code',
    'Employee Name',
    'Contact Number',
    'Official Email',
    'Designation',
    'Department',
    'Joining Date',
    'Internship Completion Date',
    'Date of Birth',
    'Designated Seat',
    'Reporting Manager',
    'Status',
  ];

  const rows = [
    ['WCR-001', 'Rohit Juneja', '+91 98110 54321', 'rohit.juneja@whitecollarrealty.com', 'Managing Director - Luxury Sales', 'Sales & Investments', '2021-01-15', '', '1987-03-22', 'A1', 'Board of Directors', 'Full-Time'],
    ['WCR-002', 'Priya Sehgal', '+91 98188 77665', 'priya.sehgal@whitecollarrealty.com', 'Associate Director - CRM & Operations', 'CRM & Client Relations', '2021-03-01', '', '1990-11-05', 'A2', 'Rohit Juneja', 'Full-Time'],
    ['WCR-003', 'Varun Batra', '+91 99990 12345', 'varun.batra@whitecollarrealty.com', 'Associate Director - Luxury Advisory', 'Sales & Investments', '2021-04-12', '', '1989-06-18', 'A3', 'Rohit Juneja', 'Full-Time'],
    ['WCR-004', 'Simran Kaur', '+91 98105 88990', 'simran.kaur@whitecollarrealty.com', 'Senior Manager - HR & People Operations', 'Human Resources', '2021-06-01', '', '1992-09-19', 'A4', 'Rohit Juneja', 'Full-Time'],
    ['WCR-018', 'Chetan Sharma', '+91 98712 34567', 'chetan.sharma@whitecollarrealty.com', 'Senior Portfolio Consultant - Dubai & Gurgaon', 'Luxury Residential & Investments', '2023-04-10', '', '1996-08-14', 'B2', 'Varun Batra', 'Full-Time'],
    ['WCR-017', 'Pranav Joshi', '+91 98719 44332', 'pranav.joshi@whitecollarrealty.com', 'Property Advisor Intern', 'Sales & Investments', '2026-06-15', '2026-12-15', '2001-12-08', 'E1', 'Chetan Sharma', 'Intern'],
  ];

  worksheet.columns = headers.map(h => ({
    header: h,
    width: Math.max(h.length + 4, 18),
  }));

  rows.forEach(r => worksheet.addRow(r));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF0F172A' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' }, // Light gold accent
  };
  headerRow.height = 26;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates Comprehensive 7-Sheet Employee/Candidate Dossier (.xlsx)
 */
export async function generateIndividualProfileExcel(
  emp: Employee,
  assignedAssets: CompanyAsset[],
  assetReminders: any[],
  auditLogs: AuditLog[],
  isInternAllowed: boolean
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'White Collar Realty HR';
  wb.created = new Date();

  // Helper for applying consistent styling to 2-column key-value sheets
  const setupKeyValueSheet = (
    sheetName: string,
    col1Header: string,
    col2Header: string,
    rows: Array<[string, string]>
  ) => {
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [
      { header: col1Header, key: 'field', width: 36 },
      { header: col2Header, key: 'value', width: 76 },
    ];

    rows.forEach(([field, value]) => {
      const addedRow = ws.addRow([field, value]);
      if (field.startsWith('SECTION:')) {
        addedRow.font = { bold: true, color: { argb: 'FFB45309' } };
        addedRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
      }
    });

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FF0F172A' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    headerRow.height = 24;
    return ws;
  };

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
  setupKeyValueSheet('Personal & Contact', 'Information Field', 'Recorded Profile Value', personalRows);

  // ------------------------------------------------------------------------
  // Sheet 2: Employment & Department
  // ------------------------------------------------------------------------
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
      isInternAllowed && emp.employmentCategory === 'Intern'
        ? fVal(emp.internshipCompletionDate, 'Not Set')
        : 'N/A (Employees Only)',
    ],
    ['Job End Date / Exit Date', fVal(emp.jobEndDate, 'N/A (Active in Service)')],
    ['', ''],
    ['SECTION: WORKPLACE & DESK PLACEMENT', ''],
    ['Designated Desk Slot', fVal(emp.desk, 'Unassigned')],
    ['Office Bay Location', emp.desk ? getBayFromDesk(emp.desk) : 'Unassigned'],
    ['Source Spreadsheet Seat Notation', fVal(emp.sourceSpreadsheetSeat, 'N/A')],
    ['', ''],
    ['SECTION: ATTENDANCE & WORKING STANDARDS', ''],
    ['Standard Operating Hours', '09:30 AM – 06:30 PM (Monday through Saturday)'],
    ['Workplace Attendance Status', emp.desk ? 'Active (Assigned to Designated Desk)' : 'Active (Desk Allocation Pending)'],
    ['Biometric & RFID Attendance Tracking', emp.desk ? `Enrolled (Station ${emp.desk})` : 'Enrolled (Reception/General RFID)'],
    ['Attendance & Punctuality Rating', emp.probation?.reviews?.[0]?.attendanceRating ? `${emp.probation.reviews[0].attendanceRating} (Latest Review)` : 'Good (Standard Compliance)'],
    ['Annual Leave Allocation', '18 Privilege Leaves + 12 Casual/Sick Leaves per annum'],
    ['Probation / Tenure Status', emp.probation?.status || (emp.isCandidate ? 'Pre-Onboarding' : 'Confirmed Active Service')],
    ['', ''],
    ['SECTION: SYSTEM METADATA', ''],
    ['Profile Readiness Score', `${emp.profileCompletion || 0}% Complete`],
    ['System Database Identifier', fVal(emp.id)],
    ['Record Created Timestamp', fVal(emp.createdAt)],
    ['Record Last Updated Timestamp', fVal(emp.updatedAt)],
  ];
  setupKeyValueSheet('Employment & Dept', 'Employment Field', 'Recorded Organizational Value', empRows);

  // ------------------------------------------------------------------------
  // Sheet 3: Compensation & Exp
  // ------------------------------------------------------------------------
  const sb = emp.offerLetter?.salaryBreakup;
  const expRows: Array<[string, string]> = [
    ['SECTION: PRIOR EXPERIENCE & COMPENSATION', ''],
    ['Previous Employer / Company', fVal(emp.previousCompany, 'Fresher / First Professional Role')],
    ['Previous Designation', fVal(emp.previousDesignation, 'Student / Trainee')],
    ['Total Professional Experience', `${fVal(emp.totalExperienceYears, '0')} Year(s), ${fVal(emp.totalExperienceMonths, '0')} Month(s)`],
    ['Gurgaon Market Real Estate Experience', fVal(emp.gurgaonMarketExperience, 'None / New to Micro-Market')],
    ['Dubai Market Real Estate Experience', fVal(emp.dubaiMarketExperience, 'None / New to Region')],
    ['Previous Verified CTC', fVal(emp.previousCTC, 'N/A (Fresher / Not Disclosed)')],
    ['Current Offered CTC (White Collar Realty)', fVal(emp.offeredCTC, 'As per Company Structure')],
    ['', ''],
    ['SECTION: DETAILED SALARY & COMPENSATION BREAKUP', ''],
    ['Currency of Compensation', fVal(sb?.currency, emp.market === 'Dubai' ? 'AED' : 'INR')],
    ['Annual Cost to Company (CTC)', sb?.annualCtc ? `₹${sb.annualCtc.toLocaleString('en-IN')}` : fVal(emp.offeredCTC)],
    ['Monthly Gross CTC', sb?.grossMonthly ? `₹${sb.grossMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['Monthly Basic Salary', sb?.basicMonthly ? `₹${sb.basicMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['Annual Basic Salary', sb?.basicAnnual ? `₹${sb.basicAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Monthly House Rent Allowance (HRA)', sb?.hraMonthly ? `₹${sb.hraMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['Annual House Rent Allowance (HRA)', sb?.hraAnnual ? `₹${sb.hraAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Monthly Special Allowance', sb?.specialAllowanceMonthly ? `₹${sb.specialAllowanceMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['Annual Special Allowance', sb?.specialAllowanceAnnual ? `₹${sb.specialAllowanceAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Monthly Employer PF Contribution', sb?.pfEmployerMonthly ? `₹${sb.pfEmployerMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['Annual Employer PF Contribution', sb?.pfEmployerAnnual ? `₹${sb.pfEmployerAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Statutory Bonus (Annual)', sb?.statutoryBonusAnnual ? `₹${sb.statutoryBonusAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Gratuity Contribution (Annual)', sb?.gratuityAnnual ? `₹${sb.gratuityAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Performance-Based Variable Pay (PBVP)', sb?.variableIncentiveAnnual ? `₹${sb.variableIncentiveAnnual.toLocaleString('en-IN')}` : 'N/A'],
    ['Approximate Monthly Net In-Hand Pay', sb?.approxNetInHandMonthly ? `₹${sb.approxNetInHandMonthly.toLocaleString('en-IN')}` : 'N/A'],
    ['', ''],
    ['SECTION: CAREER ASPIRATIONS & GOALS', ''],
    ['Why White Collar Realty', fVal(emp.aspirations?.whyWhiteCollarRealty, 'Not Recorded')],
    ['Association Duration Expectation', fVal(emp.aspirations?.associationDuration, 'Not Recorded')],
    ['Short-Term Career Goal', fVal(emp.aspirations?.shortTermGoal, 'Not Recorded')],
    ['Long-Term Career Goal', fVal(emp.aspirations?.longTermGoal, 'Not Recorded')],
  ];

  const wsComp = wb.addWorksheet('Compensation & Exp');
  wsComp.columns = [
    { header: 'Field / Component', width: 34 },
    { header: 'Compensation & Tenure Value', width: 34 },
    { header: '', width: 28 },
    { header: '', width: 18 },
    { header: '', width: 24 },
  ];

  expRows.forEach(([field, value]) => {
    const row = wsComp.addRow([field, value]);
    if (field.startsWith('SECTION:')) {
      row.font = { bold: true, color: { argb: 'FFB45309' } };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' },
      };
    }
  });

  // Academic table
  wsComp.addRow(['', '']);
  const academicHeaderRow = wsComp.addRow(['ACADEMIC & EDUCATIONAL BACKGROUND', '', '', '', '']);
  academicHeaderRow.font = { bold: true };
  const academicColRow = wsComp.addRow(['Degree / Qualification', 'Institution', 'Board / University', 'Passing Year', 'Grade / %']);
  academicColRow.font = { bold: true };
  academicColRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  if (emp.education && emp.education.length > 0) {
    emp.education.forEach(ed => {
      wsComp.addRow([
        fVal(ed.degree),
        fVal(ed.institution),
        fVal(ed.boardOrUniversity),
        fVal(ed.yearOfPassing),
        fVal(ed.gradeOrPercentage),
      ]);
    });
  } else {
    wsComp.addRow(['None Registered', 'N/A', 'N/A', 'N/A', 'N/A']);
  }

  // References table
  wsComp.addRow(['', '']);
  const refHeaderRow = wsComp.addRow(['PROFESSIONAL & PERSONAL REFERENCES', '', '', '', '']);
  refHeaderRow.font = { bold: true };
  const refColRow = wsComp.addRow(['Reference Name', 'Reference Type', 'Relationship / Title', 'Phone Number', 'Email / Organization']);
  refColRow.font = { bold: true };
  refColRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  if (emp.references && emp.references.length > 0) {
    emp.references.forEach(r => {
      wsComp.addRow([
        fVal(r.name),
        fVal(r.type),
        fVal(r.relationshipOrTitle),
        fVal(r.phone),
        fVal(r.company || r.email, 'N/A'),
      ]);
    });
  } else {
    wsComp.addRow(['None Registered', 'N/A', 'N/A', 'N/A', 'N/A']);
  }

  wsComp.getRow(1).font = { bold: true };
  wsComp.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  // ------------------------------------------------------------------------
  // Sheet 4: Documents & Status
  // ------------------------------------------------------------------------
  const wsDocs = wb.addWorksheet('Documents & Status');
  wsDocs.columns = [
    { header: 'Document Slot Key', key: 'key', width: 20 },
    { header: 'Document Title', key: 'title', width: 28 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Mandatory', key: 'required', width: 12 },
    { header: 'Verification Status', key: 'status', width: 18 },
    { header: 'Uploaded File Name', key: 'fileName', width: 32 },
    { header: 'File Size', key: 'fileSize', width: 14 },
    { header: 'File Type / MIME', key: 'mimeType', width: 20 },
    { header: 'Uploaded Timestamp', key: 'uploadedAt', width: 22 },
    { header: 'Uploaded Via', key: 'uploadedVia', width: 20 },
    { header: 'Verified By', key: 'verifiedBy', width: 20 },
    { header: 'Verified Timestamp', key: 'verifiedAt', width: 22 },
    { header: 'HR Review Notes', key: 'reviewNotes', width: 36 },
    { header: 'Stored On Server', key: 'stored', width: 16 },
  ];

  const docEntries = Object.values(emp.documents || {});
  if (docEntries.length > 0) {
    docEntries.forEach(d => {
      wsDocs.addRow({
        key: d.key,
        title: d.title,
        category: d.category,
        required: d.required ? 'Yes' : 'No',
        status: d.status,
        fileName: fVal(d.fileName, 'Not Uploaded'),
        fileSize: fVal(d.fileSize, '—'),
        mimeType: fVal(d.mimeType, '—'),
        uploadedAt: fVal(d.uploadedAt, '—'),
        uploadedVia: fVal(d.uploadedVia, d.fileName ? 'HR Admin / Portal' : '—'),
        verifiedBy: fVal(d.verifiedBy, 'Pending Verification'),
        verifiedAt: fVal(d.verifiedAt, '—'),
        reviewNotes: fVal(d.reviewNotes, 'None'),
        stored: d.storagePath || d.fileData ? 'Yes' : 'No',
      });
    });
  } else {
    wsDocs.addRow({ title: 'No documents configured for this profile' });
  }

  wsDocs.getRow(1).font = { bold: true };
  wsDocs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  wsDocs.getRow(1).height = 24;

  // ------------------------------------------------------------------------
  // Sheet 5: Offer & Lifecycle
  // ------------------------------------------------------------------------
  const off = emp.offerLetter;
  const offStatus = off?.status || 'Draft';
  const prob = emp.probation;
  const exit = emp.exitClearance;

  const lifecycleRows: Array<[string, string]> = [
    ['SECTION: EXECUTIVE OFFER LETTER SPECIFICATIONS', ''],
    ['Offer Letter Status', offStatus],
    ['Target Designation Offered', fVal(off?.designation, emp.designation)],
    ['Target Department', fVal(off?.department, emp.department)],
    ['Target Reporting Manager', fVal(off?.reportingManager, emp.reportingManager)],
    ['Annual Cost to Company (Offered)', off?.salaryBreakup?.annualCtc ? `₹${off.salaryBreakup.annualCtc.toLocaleString('en-IN')}` : fVal(emp.offeredCTC)],
    ['Proposed Joining Date', fVal(off?.joiningDate, emp.joiningDate)],
    ['Probation Period (Months)', String(off?.probationMonths || 6)],
    ['Notice Period during Probation (Days)', String(off?.noticePeriodDays || 15)],
    ['Notice Period post Confirmation (Days)', String(off?.noticePeriodDays || 30)],
    ['Offer Approved By HR Leadership', off?.approvedBy ? `${off.approvedBy} (${fVal(off.approvedAt)})` : 'Not Yet Approved'],
    ['Offer Formally Issued Date', fVal(off?.issuedAt, 'Not Yet Issued')],
    ['Offer Formally Accepted Date', fVal(off?.acceptedAt, 'Pending Candidate Acceptance')],
    ['Candidate Acceptance Signature', fVal(off?.candidateSignatureName, 'Unsigned')],
    ['10-Page Official Contract Generated', off?.pdfPath ? 'Yes (Archived in Record)' : 'Pending Generation'],
    ['Offer Contract Emailed to Candidate', off?.emailSentAt ? `Yes (Sent: ${off.emailSentAt})` : 'Not Emailed'],
    ['', ''],
    ['SECTION: FORMAL PROBATION & REVIEW STATUS', ''],
    ['Probation Current Status', fVal(prob?.status, emp.isCandidate ? 'Pre-Employment' : 'Active Service')],
    ['Probation Start Date', fVal(prob?.startDate, emp.joiningDate)],
    ['Scheduled Probation End Date', fVal(prob?.endDate)],
    ['Actual Confirmation Date', fVal(prob?.confirmedDate, 'Pending Confirmation')],
    ['Formal Reviews Conducted Count', String(prob?.reviews?.length || 0)],
    ['', ''],
    ['SECTION: EXIT CLEARANCE & FULL AND FINAL SETTLEMENT', ''],
    ['Resignation / Separation Date', fVal(exit?.resignationDate, 'Active Employee')],
    ['Last Working Day (LWD)', fVal(exit?.actualLwd || exit?.calculatedLwd, 'N/A')],
    ['Exit Clearance Status', fVal(exit?.exitType, 'N/A')],
    ['IT Equipment & Asset Clearance', exit?.departments?.itClearance?.status === 'Approved' ? 'Cleared' : 'Pending'],
    ['Admin & Workplace Clearance', exit?.departments?.deptHeadClearance?.status === 'Approved' ? 'Cleared' : 'Pending'],
    ['Finance & Accounts Clearance', exit?.departments?.financeClearance?.status === 'Approved' ? 'Cleared' : 'Pending'],
    ['HR Department Exit Clearance', exit?.departments?.hrClearance?.status === 'Approved' ? 'Cleared' : 'Pending'],
    ['Net Full & Final Payable (FnF)', emp.fnfSettlement?.netSettlementAmount ? `₹${emp.fnfSettlement.netSettlementAmount.toLocaleString('en-IN')}` : 'N/A'],
  ];
  setupKeyValueSheet('Offer & Lifecycle', 'Lifecycle Stage / Milestone', 'Status / Details', lifecycleRows);

  // ------------------------------------------------------------------------
  // Sheet 6: Assets & Inventory
  // ------------------------------------------------------------------------
  const wsAssets = wb.addWorksheet('Assets & Inventory');
  wsAssets.columns = [
    { header: 'Asset Tag', key: 'tag', width: 18 },
    { header: 'Asset Model / Name', key: 'name', width: 28 },
    { header: 'Category', key: 'type', width: 18 },
    { header: 'Serial Number', key: 'serial', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Condition', key: 'condition', width: 16 },
    { header: 'Issue Date', key: 'issueDate', width: 16 },
    { header: 'Expected Return', key: 'expectedReturn', width: 18 },
    { header: 'Return Date', key: 'returnDate', width: 18 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  if (assignedAssets.length > 0) {
    assignedAssets.forEach(a => {
      wsAssets.addRow({
        tag: a.assetTag,
        name: a.name,
        type: a.type,
        serial: fVal(a.serialNumber, 'N/A'),
        status: a.status,
        condition: a.condition,
        issueDate: fVal(a.issueDate, '—'),
        expectedReturn: fVal(a.expectedReturnDate, 'Not Specified'),
        returnDate: fVal(a.returnDate, 'Still in Possession'),
        notes: fVal(a.notes, 'None'),
      });
    });
  } else {
    wsAssets.addRow({ tag: 'N/A', name: 'No assets currently or historically assigned to this person' });
  }

  wsAssets.getRow(1).font = { bold: true };
  wsAssets.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  wsAssets.getRow(1).height = 24;

  // ------------------------------------------------------------------------
  // Sheet 7: Audit Trail
  // ------------------------------------------------------------------------
  const wsLogs = wb.addWorksheet('Audit Trail');
  wsLogs.columns = [
    { header: 'Timestamp', key: 'timestamp', width: 24 },
    { header: 'Action Taken', key: 'action', width: 28 },
    { header: 'Actor Name', key: 'actor', width: 20 },
    { header: 'Actor Role', key: 'role', width: 14 },
    { header: 'Entity Type', key: 'entityType', width: 18 },
    { header: 'Entity Name', key: 'entityName', width: 24 },
    { header: 'Detailed Log Message', key: 'details', width: 60 },
  ];

  if (auditLogs.length > 0) {
    auditLogs.forEach(l => {
      wsLogs.addRow({
        timestamp: l.timestamp,
        action: l.action,
        actor: l.actor,
        role: l.actorRole,
        entityType: l.entityType,
        entityName: l.entityName,
        details: l.details,
      });
    });
  } else {
    wsLogs.addRow({
      timestamp: fVal(emp.createdAt),
      action: 'Profile Created',
      actor: 'HR System',
      role: 'HR',
      entityType: 'Employee',
      entityName: emp.fullName,
      details: 'Initial record seeded in White Collar Realty directory.',
    });
  }

  wsLogs.getRow(1).font = { bold: true };
  wsLogs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  wsLogs.getRow(1).height = 24;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
