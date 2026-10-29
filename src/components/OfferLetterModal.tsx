import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Eye,
  Send,
  FileCheck,
  Building2,
  ShieldCheck,
  MapPin,
  Calendar,
  DollarSign,
  UserCheck,
  Upload,
  RefreshCw,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Employee, OfferLetterData, UserRole } from '../types/index.js';
import { calculateSalaryBreakup, checkOfferMissingFields, DEFAULT_OFFER_CLAUSES } from '../../server/lifecycleEngine.js';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Employee;
  userRole: UserRole;
  onSaveOffer: (updates: Partial<OfferLetterData>) => Promise<void>;
  onApproveOffer: () => Promise<void>;
  onIssueOffer: () => Promise<void>;
  onAcceptOffer: (signatureName: string) => Promise<void>;
}

export const OfferLetterModal: React.FC<OfferLetterModalProps> = ({
  isOpen,
  onClose,
  candidate,
  userRole,
  onSaveOffer,
  onApproveOffer,
  onIssueOffer,
  onAcceptOffer,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'template'>('preview');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAcceptInput, setShowAcceptInput] = useState(false);
  const [candidateSigName, setCandidateSigName] = useState(candidate.fullName);
  const [toastMessage, setToastMessage] = useState('');

  // Editable local state initialized from candidate.offerLetter or calculated defaults
  const [formData, setFormData] = useState<OfferLetterData>(() => {
    if (candidate.offerLetter) {
      return candidate.offerLetter;
    }
    const currentYear = new Date().getFullYear();
    const breakup = calculateSalaryBreakup(candidate.offeredCTC, candidate.market || 'Gurgaon');
    const missing = checkOfferMissingFields(candidate);
    return {
      refNo: `WCR/HR/OL/${currentYear}/${candidate.employeeCode || Math.floor(100 + Math.random() * 900)}`,
      issueDate: new Date().toISOString().split('T')[0],
      candidateName: candidate.fullName,
      candidateAddress: candidate.currentAddress || candidate.permanentAddress || '',
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      designation: candidate.designation,
      department: candidate.department,
      reportingManager: candidate.reportingManager || '',
      joiningDate: candidate.joiningDate || '',
      workLocation:
        candidate.market === 'Dubai'
          ? 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE'
          : 'White Collar Realty HQ, Golf Course Ext Road, Sector 65, Gurugram, Haryana - 122018',
      market: candidate.market || 'Gurgaon',
      probationMonths: 3,
      noticePeriodDays: 30,
      validTillDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
      })(),
      status: 'Draft',
      salaryBreakup: breakup,
      clauses: DEFAULT_OFFER_CLAUSES,
      missingFields: missing,
      templateVersion: 'v2.4-corporate-standard',
      customNotes: '',
    };
  });

  // Sync when candidate prop updates
  useEffect(() => {
    if (candidate.offerLetter) {
      setFormData(candidate.offerLetter);
    }
  }, [candidate]);

  if (!isOpen) return null;

  const missingFields = checkOfferMissingFields(candidate, formData);
  const isApproved = formData.status === 'Approved' || formData.status === 'Issued' || formData.status === 'Accepted';
  const isIssued = formData.status === 'Issued' || formData.status === 'Accepted';
  const isAccepted = formData.status === 'Accepted';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSalaryChange = (newAnnualCtc: number) => {
    const newBreakup = calculateSalaryBreakup(newAnnualCtc, formData.market);
    setFormData(prev => ({
      ...prev,
      salaryBreakup: newBreakup,
    }));
  };

  const handleSaveEdits = async () => {
    try {
      setIsSubmitting(true);
      const updated = {
        ...formData,
        missingFields: checkOfferMissingFields(candidate, formData),
      };
      await onSaveOffer(updated);
      showToast('Offer letter updated successfully.');
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to update offer letter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      await onApproveOffer();
      showToast('Offer letter officially approved.');
    } catch (err: any) {
      showToast(err.message || 'Failed to approve.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssue = async () => {
    try {
      setIsSubmitting(true);
      await onIssueOffer();
      showToast('Offer letter issued to candidate.');
    } catch (err: any) {
      showToast(err.message || 'Failed to issue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!candidateSigName.trim()) {
      showToast('Please enter the candidate signature name.');
      return;
    }
    try {
      setIsSubmitting(true);
      await onAcceptOffer(candidateSigName.trim());
      setShowAcceptInput(false);
      showToast('Offer formally accepted.');
    } catch (err: any) {
      showToast(err.message || 'Failed to accept offer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (val: number) => {
    const prefix = formData.salaryBreakup.currency === 'AED' ? 'AED ' : '₹';
    return `${prefix}${val.toLocaleString()}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex justify-center p-2 sm:p-4 print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-auto overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Bar (Hidden during print) */}
        <div className="p-4 sm:px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-lg shrink-0">
              OL
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">
                  Executive Offer Letter & Compensation Annexure
                </h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    isAccepted
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : isIssued
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : isApproved
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  Status: {formData.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Candidate: <strong className="text-slate-200">{candidate.fullName}</strong> ({formData.designation} · {formData.department}) · Ref: <span className="font-mono text-amber-300">{formData.refNo}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Toggles */}
            <div className="hidden sm:flex bg-slate-800 p-1 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'preview' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Document
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'edit' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Clauses & CTC
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Print or Save as PDF"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Missing Fields Warning Banner */}
        {missingFields.length > 0 && activeTab === 'preview' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Profile Completeness Notice:</strong> Missing {missingFields.length} critical field(s):{' '}
                <span className="font-semibold text-amber-800">{missingFields.join(', ')}</span>. Values are flagged to prevent inventing data.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 shrink-0 text-xs transition-colors"
            >
              Complete Now
            </button>
          </div>
        )}

        {/* Toast alert */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white text-xs px-4 py-2 font-medium text-center shrink-0 print:hidden animate-fade-in">
            {toastMessage}
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50 print:bg-white print:p-0">
          {activeTab === 'preview' ? (
            /* PRINT-READY EXECUTIVE WHITE COLLAR REALTY OFFER LETTER */
            <div
              id="printable-offer-letter"
              className="bg-white mx-auto shadow-sm border border-slate-200 rounded-xl p-8 sm:p-12 text-slate-800 max-w-4xl text-sm leading-relaxed space-y-8 font-sans print:shadow-none print:border-none print:p-6 print:rounded-none"
            >
              {/* PAGE 1: Corporate Header & Appointment */}
              <div className="space-y-6 border-b border-slate-200 pb-8">
                {/* Letterhead */}
                <div className="flex items-start justify-between border-b-2 border-amber-500/70 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-lg tracking-wider">
                        WCR
                      </div>
                      <div>
                        <h1 className="text-xl font-bold uppercase tracking-tight text-slate-900">
                          White Collar Realty
                        </h1>
                        <p className="text-[11px] text-slate-500 tracking-wider uppercase font-semibold">
                          Private Limited · Corporate HR Division
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 space-y-0.5 font-mono">
                    <p className="font-semibold text-slate-800">Corporate Headquarters:</p>
                    <p>Golf Course Extension Road, Sector 65</p>
                    <p>Gurugram, Haryana - 122018, India</p>
                    <p className="text-amber-700 font-medium">Dubai Branch: DIFC Gate Precinct 4, UAE</p>
                    <p>contact@whitecollarrealty.com · +91 124 4920000</p>
                  </div>
                </div>

                {/* Reference & Date */}
                <div className="flex justify-between items-center text-xs font-mono text-slate-600 bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400">Ref No: </span>
                    <strong className="text-slate-900 font-bold">{formData.refNo}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Date of Issuance: </span>
                    <strong className="text-slate-900">{new Date(formData.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                  </div>
                </div>

                {/* Candidate Address Block */}
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Strictly Confidential & Personal</p>
                  <p className="text-base font-bold text-slate-900">{formData.candidateName}</p>
                  {formData.candidateAddress ? (
                    <p className="text-slate-600 whitespace-pre-line">{formData.candidateAddress}</p>
                  ) : (
                    <p className="text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200 font-mono">
                      ⚠️ [Residential Address pending candidate completion]
                    </p>
                  )}
                  <p className="text-slate-500 font-mono text-[11px]">Email: {formData.candidateEmail} · Phone: {formData.candidatePhone}</p>
                </div>

                {/* Subject Line */}
                <div className="pt-2">
                  <p className="font-bold text-slate-900 text-sm border-l-4 border-amber-500 pl-3">
                    SUB: FORMAL OFFER OF EMPLOYMENT AS &ldquo;{formData.designation.toUpperCase()}&rdquo;
                  </p>
                </div>

                {/* Opening Salutation & Offer Statement */}
                <div className="space-y-3 text-slate-700 text-xs sm:text-sm">
                  <p>Dear <strong>{formData.candidateName}</strong>,</p>
                  <p>
                    On behalf of <strong>White Collar Realty Private Limited</strong>, we are pleased to extend this formal offer of employment for the position of <strong>{formData.designation}</strong> within our <strong>{formData.department}</strong> division. We were thoroughly impressed by your professional acumen, industry orientation, and enthusiasm for premium real estate advisory during our evaluation rounds.
                  </p>
                  <p>
                    Your total annualized Cost to Company (CTC) will be <strong>{formatCurrency(formData.salaryBreakup.annualCtc)}</strong> ({formData.salaryBreakup.currency === 'AED' ? 'UAE Dirhams' : 'Rupees'} {formData.salaryBreakup.annualCtc.toLocaleString()} per annum), structured in accordance with the detailed compensation breakup attached in <strong>Annexure A</strong>.
                  </p>
                </div>

                {/* Key Appointment Highlights Card */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Designation / Role:</span>
                    <strong className="text-slate-900 text-sm">{formData.designation}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Department / Unit:</span>
                    <strong className="text-slate-900 text-sm">{formData.department}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Proposed Joining Date:</span>
                    <strong className="text-slate-900">
                      {formData.joiningDate ? new Date(formData.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '⚠️ [Pending HR Confirmation]'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Reporting Manager:</span>
                    <strong className="text-slate-900">{formData.reportingManager || '⚠️ [To Be Assigned by Department Head]'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Work Location / Market:</span>
                    <span className="text-slate-800 font-medium">{formData.workLocation} ({formData.market} Market)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Probation & Notice Period:</span>
                    <span className="text-slate-800 font-medium">{formData.probationMonths} Months Probation · {formData.noticePeriodDays} Days Notice</span>
                  </div>
                </div>
              </div>

              {/* PAGE 2: ANNEXURE A - SALARY BREAKUP & COMPENSATION */}
              <div className="space-y-4 pt-4 border-b border-slate-200 pb-8 page-break-before">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs">A</span>
                    ANNEXURE A: Detailed Compensation & Benefits Structure
                  </h3>
                  <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded border border-slate-300">
                    Total CTC: {formatCurrency(formData.salaryBreakup.annualCtc)} / year
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-white font-semibold">
                      <tr>
                        <th className="p-2.5">Salary Component</th>
                        <th className="p-2.5 text-right">Monthly ({formData.salaryBreakup.currency})</th>
                        <th className="p-2.5 text-right">Annual ({formData.salaryBreakup.currency})</th>
                        <th className="p-2.5 text-slate-300">Notes / Statutory Provision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-medium text-slate-900">Basic Salary</td>
                        <td className="p-2.5 text-right font-bold">{formData.salaryBreakup.basicMonthly.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold">{formData.salaryBreakup.basicAnnual.toLocaleString()}</td>
                        <td className="p-2.5 font-sans text-slate-500">Core taxable earnings (40% of CTC)</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-medium text-slate-900">House Rent Allowance (HRA)</td>
                        <td className="p-2.5 text-right font-semibold">{formData.salaryBreakup.hraMonthly.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold">{formData.salaryBreakup.hraAnnual.toLocaleString()}</td>
                        <td className="p-2.5 font-sans text-slate-500">50% of Basic as per IT rules</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-medium text-slate-900">Special / Executive Allowance</td>
                        <td className="p-2.5 text-right font-semibold">{formData.salaryBreakup.specialAllowanceMonthly.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold">{formData.salaryBreakup.specialAllowanceAnnual.toLocaleString()}</td>
                        <td className="p-2.5 font-sans text-slate-500">Flexible executive compensation</td>
                      </tr>
                      {formData.salaryBreakup.statutoryBonusAnnual > 0 && (
                        <tr className="hover:bg-slate-50">
                          <td className="p-2.5 font-sans font-medium text-slate-900">Statutory Bonus / Ex-Gratia</td>
                          <td className="p-2.5 text-right">{formData.salaryBreakup.statutoryBonusMonthly.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{formData.salaryBreakup.statutoryBonusAnnual.toLocaleString()}</td>
                          <td className="p-2.5 font-sans text-slate-500">Statutory bonus under Payment of Bonus Act</td>
                        </tr>
                      )}
                      <tr className="bg-amber-50/70 font-bold border-t border-b border-amber-200">
                        <td className="p-2.5 font-sans text-slate-900">GROSS EARNINGS (A)</td>
                        <td className="p-2.5 text-right text-amber-900">{formData.salaryBreakup.grossMonthly.toLocaleString()}</td>
                        <td className="p-2.5 text-right text-amber-900">{formData.salaryBreakup.grossAnnual.toLocaleString()}</td>
                        <td className="p-2.5 font-sans text-slate-600 font-normal">Monthly taxable cash earnings</td>
                      </tr>
                      {formData.salaryBreakup.pfEmployerAnnual > 0 && (
                        <tr className="hover:bg-slate-50">
                          <td className="p-2.5 font-sans font-medium text-slate-900">Employer Provident Fund (PF)</td>
                          <td className="p-2.5 text-right">{formData.salaryBreakup.pfEmployerMonthly.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{formData.salaryBreakup.pfEmployerAnnual.toLocaleString()}</td>
                          <td className="p-2.5 font-sans text-slate-500">12% statutory employer contribution</td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-medium text-slate-900">Gratuity Provision</td>
                        <td className="p-2.5 text-right">{formData.salaryBreakup.gratuityMonthly.toLocaleString()}</td>
                        <td className="p-2.5 text-right">{formData.salaryBreakup.gratuityAnnual.toLocaleString()}</td>
                        <td className="p-2.5 font-sans text-slate-500">Payable as per Payment of Gratuity Act</td>
                      </tr>
                      {formData.salaryBreakup.variableIncentiveAnnual > 0 && (
                        <tr className="hover:bg-slate-50">
                          <td className="p-2.5 font-sans font-medium text-slate-900">Performance Linked Incentive (PLI)</td>
                          <td className="p-2.5 text-right text-slate-400">-</td>
                          <td className="p-2.5 text-right font-semibold text-emerald-800">{formData.salaryBreakup.variableIncentiveAnnual.toLocaleString()}</td>
                          <td className="p-2.5 font-sans text-slate-500">Annual target-linked incentive</td>
                        </tr>
                      )}
                      <tr className="bg-slate-900 text-white font-bold text-xs">
                        <td className="p-3 font-sans">TOTAL COST TO COMPANY (CTC)</td>
                        <td className="p-3 text-right font-mono text-amber-300">{formData.salaryBreakup.monthlyCtc.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-amber-300">{formData.salaryBreakup.annualCtc.toLocaleString()}</td>
                        <td className="p-3 font-sans text-slate-300 font-normal">Complete annualized package</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900 flex items-center justify-between">
                  <span>
                    <strong>Estimated Monthly Net Take-Home:</strong> Approx{' '}
                    <strong className="text-blue-950 font-mono text-sm">{formatCurrency(formData.salaryBreakup.approxNetInHandMonthly)}</strong>{' '}
                    (after Employee PF & Professional Tax deductions, subject to individual income tax declarations).
                  </span>
                  <span className="text-[11px] text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 font-mono">
                    Confidential
                  </span>
                </div>
              </div>

              {/* PAGE 3: ANNEXURE B - TERMS & CONDITIONS */}
              <div className="space-y-4 pt-4 border-b border-slate-200 pb-8 page-break-before">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs">B</span>
                  ANNEXURE B: Terms and Conditions of Employment
                </h3>

                <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                  {formData.clauses.map((clause, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p>{clause}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* PAGE 4: ANNEXURE C - PRE-EMPLOYMENT DOCUMENTS & ACCEPTANCE */}
              <div className="space-y-6 pt-4 page-break-before">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs">C</span>
                  ANNEXURE C: Pre-Employment Verification & Joining Checklist
                </h3>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                  <p className="font-semibold text-slate-800">Please ensure the following verified original documents are submitted via our Secure Candidate Portal prior to your date of joining:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 list-disc list-inside">
                    <li>Government ID: Aadhaar Card & PAN Card</li>
                    <li>Passport (Mandatory for Dubai / International operations)</li>
                    <li>10th, 12th & Graduation Degree Certificates & Marksheets</li>
                    <li>Previous Company Appointment / Relieving / Experience Letter</li>
                    <li>Last 3 Months Salary Slips & Bank Statement showing salary credit</li>
                    <li>Recent Passport Size Photographs (White background)</li>
                  </ul>
                </div>

                {/* Candidate Acceptance Declaration Clause */}
                <div className="border-2 border-slate-800 p-5 rounded-xl bg-slate-50/70 space-y-3 text-xs">
                  <p className="font-bold uppercase tracking-wider text-slate-900">FORMAL CANDIDATE ACCEPTANCE DECLARATION</p>
                  <p className="text-slate-700 italic leading-relaxed">
                    &ldquo;I, <strong>{formData.candidateName}</strong>, hereby acknowledge that I have carefully read, understood, and agreed to all the terms, compensation structures, policies, and covenants outlined in this Offer Letter and its Annexures. I confirm my acceptance of this offer and commit to report on my joining date: <strong>{formData.joiningDate || 'as confirmed'}</strong>.&rdquo;
                  </p>

                  <div className="pt-4 grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-500">Candidate Signature:</span>
                      <div className="h-10 border-b border-slate-400 flex items-end font-serif font-bold text-slate-900 text-base">
                        {formData.candidateSignatureName || formData.candidateName}
                      </div>
                      <p className="text-[10px] text-slate-500">Name: {formData.candidateName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">Date: {formData.acceptedAt ? new Date(formData.acceptedAt).toLocaleDateString() : '____ / ____ / 2026'}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-500">Place:</span>
                      <div className="h-10 border-b border-slate-400 flex items-end text-slate-800 text-xs">
                        {formData.market === 'Dubai' ? 'Dubai, United Arab Emirates' : 'Gurugram, Haryana, India'}
                      </div>
                      <p className="text-[10px] text-slate-500">Status: {formData.status}</p>
                    </div>
                  </div>
                </div>

                {/* Authorized Company Signatures */}
                <div className="pt-6 border-t border-slate-300 flex justify-between items-end">
                  <div className="space-y-1">
                    <div className="w-24 h-12 flex items-center justify-center border border-dashed border-amber-400 bg-amber-50/50 rounded text-[10px] font-mono text-amber-800">
                      [HR SEAL / STAMP]
                    </div>
                    <p className="font-bold text-slate-900 text-xs">Simran Kaur</p>
                    <p className="text-[11px] text-slate-600">Head of Human Resources & Operations</p>
                    <p className="text-[10px] text-slate-500">White Collar Realty Private Limited</p>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="w-24 h-12 ml-auto flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 rounded text-[10px] font-mono text-slate-500">
                      [OFFICIAL STAMP]
                    </div>
                    <p className="font-bold text-slate-900 text-xs">Authorized Signatory</p>
                    <p className="text-[11px] text-slate-600">Managing Director / Partner</p>
                    <p className="text-[10px] text-slate-500">Gurugram · Dubai</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: EDIT CLAUSES & OVERRIDES */
            <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Custom Offer & Compensation Parameters</h3>
                  <p className="text-xs text-slate-500">Adjust compensation, clauses, joining dates, or reporting managers prior to official approval.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
                >
                  Return to Preview
                </button>
              </div>

              {/* Compensation Input */}
              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Annualized CTC & Salary Calculation
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Annual CTC ({formData.salaryBreakup.currency})</label>
                    <input
                      type="number"
                      value={formData.salaryBreakup.annualCtc}
                      onChange={e => handleSalaryChange(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      = {(formData.salaryBreakup.annualCtc / 100000).toFixed(2)} LPA
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Calculated Monthly CTC</label>
                    <input
                      type="text"
                      disabled
                      value={formatCurrency(formData.salaryBreakup.monthlyCtc)}
                      className="w-full px-3 py-2 text-sm font-mono bg-slate-100 border border-slate-300 rounded-lg text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Est. Monthly Net Take-Home</label>
                    <input
                      type="text"
                      disabled
                      value={formatCurrency(formData.salaryBreakup.approxNetInHandMonthly)}
                      className="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Core Offer Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={e => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={e => setFormData(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Proposed Joining Date</label>
                  <input
                    type="date"
                    value={formData.joiningDate}
                    onChange={e => setFormData(prev => ({ ...prev, joiningDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reporting Manager</label>
                  <input
                    type="text"
                    value={formData.reportingManager}
                    placeholder="e.g. Varun Batra (Sales Director)"
                    onChange={e => setFormData(prev => ({ ...prev, reportingManager: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Candidate Residential Address</label>
                  <textarea
                    rows={2}
                    value={formData.candidateAddress}
                    placeholder="Complete address for formal postal and legal dispatch..."
                    onChange={e => setFormData(prev => ({ ...prev, candidateAddress: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Location</label>
                  <input
                    type="text"
                    value={formData.workLocation}
                    onChange={e => setFormData(prev => ({ ...prev, workLocation: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Offer Acceptance Deadline</label>
                  <input
                    type="date"
                    value={formData.validTillDate}
                    onChange={e => setFormData(prev => ({ ...prev, validTillDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Clauses Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Employment Clauses (Annexure B)</label>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, clauses: DEFAULT_OFFER_CLAUSES }))}
                    className="text-xs text-amber-700 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset to Standard Clauses
                  </button>
                </div>
                {formData.clauses.map((clause, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="font-mono text-xs text-slate-400 mt-2 font-bold">{idx + 1}.</span>
                    <textarea
                      rows={2}
                      value={clause}
                      onChange={e => {
                        const next = [...formData.clauses];
                        next[idx] = e.target.value;
                        setFormData(prev => ({ ...prev, clauses: next }));
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
                >
                  Save & Update Preview
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar (Hidden during print) */}
        <div className="p-4 sm:px-6 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">Current Lifecycle Step:</span>
            {!isApproved ? (
              <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full font-medium border border-amber-200">
                1. Internal HR Review & Approval Needed
              </span>
            ) : !isIssued ? (
              <span className="text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full font-medium border border-purple-200">
                2. Approved · Ready to Dispatch to Candidate
              </span>
            ) : !isAccepted ? (
              <span className="text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full font-medium border border-blue-200">
                3. Issued to Candidate · Awaiting Formal Acceptance
              </span>
            ) : (
              <span className="text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                4. Offer Accepted · Ready for Onboarding Day 1
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Step 1: Approve Button (for HR Admin / HR Manager) */}
            {!isApproved && (userRole === 'HR_ADMIN' || userRole === 'HR_MANAGER') && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve Offer
              </button>
            )}

            {/* Step 2: Issue to Candidate */}
            {isApproved && !isIssued && userRole !== 'DEPT_HEAD_VIEWER' && (
              <button
                type="button"
                onClick={handleIssue}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Send className="w-4 h-4" />
                Issue Offer to Candidate
              </button>
            )}

            {/* Step 3: Record Acceptance */}
            {isIssued && !isAccepted && (
              <>
                {!showAcceptInput ? (
                  <button
                    type="button"
                    onClick={() => setShowAcceptInput(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    Record Acceptance
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                    <input
                      type="text"
                      placeholder="Candidate signature name"
                      value={candidateSigName}
                      onChange={e => setCandidateSigName(e.target.value)}
                      className="px-2 py-1 text-xs bg-white border border-emerald-300 rounded font-medium focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAccept}
                      disabled={isSubmitting}
                      className="px-3 py-1 bg-emerald-700 text-white text-xs font-semibold rounded hover:bg-emerald-800"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAcceptInput(false)}
                      className="p-1 text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
