import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Info,
} from 'lucide-react';
import { ImportPreviewRow, ImportSummary, Employee, UserRole } from '../types/index.js';

interface SpreadsheetImportViewProps {
  onPreviewImport: (payload: { fileBase64?: string; csvText?: string; targetType?: string }) => Promise<{
    sheetName: string;
    totalRows: number;
    headers: string[];
    preview: ImportPreviewRow[];
  }>;
  onCommitImport: (rows: Partial<Employee>[], mode: 'merge' | 'create_all') => Promise<ImportSummary>;
  userRole: UserRole;
}

export const SpreadsheetImportView: React.FC<SpreadsheetImportViewProps> = ({
  onPreviewImport,
  onCommitImport,
  userRole,
}) => {
  const [sheetType, setSheetType] = useState<'employee' | 'candidate'>('employee');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{
    sheetName: string;
    totalRows: number;
    headers: string[];
    preview: ImportPreviewRow[];
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'create_all'>('merge');
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [summaryReport, setSummaryReport] = useState<ImportSummary | null>(null);

  const canEdit = userRole === 'HR' || userRole === 'Co-Founder';

  // 1. Generate & Download Sample Template: Chetan Information Sheet
  const handleDownloadChetanTemplate = () => {
    const wsData = [
      [
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
      ],
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

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Chetan Information Sheet');
    XLSX.writeFile(wb, 'Chetan_Information_Sheet_Template.xlsx');
  };

  // 2. Generate & Download Sample Template: Employee Details (Birthday)
  const handleDownloadBirthdayTemplate = () => {
    const wsData = [
      [
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
      ],
      ['WCR-001', 'Rohit Juneja', '+91 98110 54321', 'rohit.juneja@whitecollarrealty.com', 'Managing Director - Luxury Sales', 'Sales & Investments', '2021-01-15', '', '1987-03-22', 'A1', 'Board of Directors', 'Full-Time'],
      ['WCR-002', 'Priya Sehgal', '+91 98188 77665', 'priya.sehgal@whitecollarrealty.com', 'Associate Director - CRM & Operations', 'CRM & Client Relations', '2021-03-01', '', '1990-11-05', 'A2', 'Rohit Juneja', 'Full-Time'],
      ['WCR-003', 'Varun Batra', '+91 99990 12345', 'varun.batra@whitecollarrealty.com', 'Associate Director - Sales & NRI Desk', 'Sales & Investments', '2021-04-12', '', '1989-06-18', 'A3', 'Rohit Juneja', 'Full-Time'],
      ['WCR-004', 'Simran Kaur', '+91 98105 88990', 'simran.kaur@whitecollarrealty.com', 'Senior Manager - HR & People Operations', 'Human Resources', '2021-06-01', '', '1992-09-19', 'A4', 'Rohit Juneja', 'Full-Time'],
      ['WCR-018', 'Chetan Sharma', '+91 98712 34567', 'chetan.sharma@whitecollarrealty.com', 'Senior Portfolio Consultant - Dubai & Gurgaon', 'Luxury Residential & Investments', '2023-04-10', '', '1996-08-14', 'B2', 'Varun Batra', 'Full-Time'],
      ['WCR-017', 'Pranav Joshi', '+91 98719 44332', 'pranav.joshi@whitecollarrealty.com', 'Property Advisor Intern', 'Sales & Investments', '2026-06-15', '2026-12-15', '2001-12-08', 'E1', 'Chetan Sharma', 'Intern'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Employees Details (Birthday)');
    XLSX.writeFile(wb, 'Employees_Details_Birthday_Template.xlsx');
  };

  // Handle file selection and preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setErrorMsg('');
    setSummaryReport(null);
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async event => {
        try {
          const base64 = event.target?.result as string;
          const result = await onPreviewImport({
            fileBase64: base64,
            targetType: sheetType,
          });
          setPreviewData(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to parse spreadsheet file';
          setErrorMsg(msg);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reading file';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  // Commit parsed rows
  const handleCommit = async () => {
    if (!previewData || previewData.preview.length === 0) return;

    try {
      setCommitting(true);
      setErrorMsg('');
      const rowsToCommit = previewData.preview.map(p => p.mapped);
      const summary = await onCommitImport(rowsToCommit, importMode);
      setSummaryReport(summary);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import commit failed';
      setErrorMsg(msg);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Introduction Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            White Collar Realty — Spreadsheet Integration & Synchronization
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Import initial and updated records from your two core spreadsheets: <strong>Chetan Information Sheet</strong> (candidate personal, family, education, references, and documents) and <strong>Employees Details (Birthday)</strong> (workforce directory, DOJ, designated desks, DOB, and reporting managers).
          </p>
        </div>

        {/* Template Downloads */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-amber-600" />
              Standardized Spreadsheet Templates
            </span>
            <p className="text-[11px] text-slate-500">
              Download the official Excel templates matching the initial spreadsheet structure.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadChetanTemplate}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Chetan Information Sheet (.xlsx)
            </button>
            <button
              onClick={handleDownloadBirthdayTemplate}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              Employees Details (Birthday) (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      {!previewData && !summaryReport && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Step 1: Choose Source Spreadsheet Format
            </span>
            <div className="flex flex-col xs:flex-row xs:items-center gap-2 sm:gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="sheetType"
                  value="employee"
                  checked={sheetType === 'employee'}
                  onChange={() => setSheetType('employee')}
                  className="text-slate-900"
                />
                <span>Employee Details (Directory)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="sheetType"
                  value="candidate"
                  checked={sheetType === 'candidate'}
                  onChange={() => setSheetType('candidate')}
                  className="text-slate-900"
                />
                <span>Chetan Information Sheet (Dossier)</span>
              </label>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div className="relative border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              disabled={!canEdit || loading}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="p-3 bg-white rounded-full shadow-xs border border-slate-200 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-6 h-6 text-slate-700" />
            </div>
            <p className="text-xs font-semibold text-slate-800 mt-3">
              {loading ? 'Reading & Parsing File...' : 'Drop your Excel or CSV file here, or browse files'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports .xlsx, .xls, or .csv (Spreadsheet structure will be automatically mapped)
            </p>
          </div>

          {!canEdit && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Executive Read-Only Notice: CEO role has read-only access to directory imports. Switch to HR or Co-Founder in the sidebar to perform spreadsheet imports.</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="text-rose-500">✕</button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Mapping & Preview Table */}
      {previewData && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
                  Sheet: {previewData.sheetName}
                </span>
                <span className="text-xs text-slate-500">
                  Total Parsed Rows: <strong className="font-mono text-slate-900">{previewData.totalRows}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Review matched columns and duplicate detection flags before committing to the database.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-2 text-xs">
                <span className="text-slate-500 whitespace-nowrap">Merge Strategy:</span>
                <select
                  value={importMode}
                  onChange={e => setImportMode(e.target.value as 'merge' | 'create_all')}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 flex-1 sm:flex-none"
                >
                  <option value="merge">Smart Merge</option>
                  <option value="create_all">Create New</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewData(null)}
                  className="flex-1 sm:flex-none px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg text-center"
                >
                  Discard
                </button>

                <button
                  onClick={handleCommit}
                  disabled={committing}
                  className="flex-1 sm:flex-none px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {committing ? 'Committing...' : `Commit ${previewData.totalRows} Records`}
                </button>
              </div>
            </div>
          </div>

          {/* Preview Grid */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                <tr>
                  <th className="px-3 py-2.5">Row</th>
                  <th className="px-3 py-2.5">Match Status</th>
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Full Name</th>
                  <th className="px-3 py-2.5">Designation</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Desk</th>
                  <th className="px-3 py-2.5">Joining Date</th>
                  <th className="px-3 py-2.5">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.preview.map(row => {
                  return (
                    <tr key={row.rowNumber} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-slate-400">{row.rowNumber}</td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            row.matchStatus === 'Exact Match'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : row.matchStatus === 'Potential Duplicate'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {row.matchStatus}
                        </span>
                        {row.matchedExistingName && (
                          <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">
                            → {row.matchedExistingName}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {row.mapped.employeeCode || '—'}
                      </td>

                      <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        {row.mapped.fullName}
                      </td>

                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        {row.mapped.designation || '—'}
                      </td>

                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {row.mapped.department || '—'}
                      </td>

                      <td className="px-3 py-2.5 font-mono text-amber-800 font-bold whitespace-nowrap">
                        {row.mapped.desk || '—'}
                      </td>

                      <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                        {row.mapped.joiningDate || '—'}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.validationErrors.length > 0 ? (
                          <span className="text-rose-600 font-medium text-[10px]">
                            {row.validationErrors.join(', ')}
                          </span>
                        ) : (
                          <span className="text-emerald-600 text-[10px] font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3: Import Summary Report */}
      {summaryReport && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm">Spreadsheet Import Completed Successfully</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Total Rows Processed</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                {summaryReport.totalRows}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-[11px] text-emerald-700 block">New Records Created</span>
              <span className="text-xl font-bold font-mono text-emerald-800 mt-1 block">
                {summaryReport.newRecordsCreated}
              </span>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-[11px] text-blue-700 block">Records Merged / Updated</span>
              <span className="text-xl font-bold font-mono text-blue-800 mt-1 block">
                {summaryReport.recordsMerged}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Records Skipped</span>
              <span className="text-xl font-bold font-mono text-slate-500 mt-1 block">
                {summaryReport.recordsSkipped}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 pt-1">
            Data has been written to the persistent database and synchronized in real time across active sessions.
          </p>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setSummaryReport(null)}
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
            >
              Done / Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
