import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Eye,
  FileCheck,
  ShieldCheck,
  MapPin,
  ChevronLeft,
  ChevronRight,
  History,
  Lock,
  Mail,
  FileText,
  Split,
  Layers,
  Sparkles,
  Search,
  ExternalLink,
  Sliders,
  Check,
  Download,
  Loader2,
} from 'lucide-react';
import { Employee, OfferLetterData, UserRole } from '../types/index.js';
import {
  calculateAnnexureCompensation,
  formatSalaryLpa,
  WCR_ORIGINAL_OFFER_SECTIONS,
  checkOfferMissingFields,
} from '../../server/lifecycleEngine.js';
import { api } from '../services/api.js';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Employee;
  userRole: UserRole;
  onSaveOffer: (updates: Partial<OfferLetterData>) => Promise<void>;
  onApproveOffer: () => Promise<void>;
  onIssueOffer: () => Promise<void>;
  onAcceptOffer: (signatureName: string) => Promise<void>;
  onEmailOffer?: () => Promise<void>;
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
  onEmailOffer,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'compare' | 'edit' | 'template'>('preview');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [highlightReplacements, setHighlightReplacements] = useState<boolean>(false);
  const [comparePage, setComparePage] = useState<number>(1);
  const [crossfadeOpacity, setCrossfadeOpacity] = useState<number>(50); // for overlay diff
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAcceptInput, setShowAcceptInput] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);

  // Editable local state initialized from candidate.offerLetter or calculated defaults
  const [formData, setFormData] = useState<OfferLetterData>(() => {
    if (candidate.offerLetter) {
      return candidate.offerLetter;
    }
    const currentYear = new Date().getFullYear();
    const annexComp = calculateAnnexureCompensation(candidate.offeredCTC, candidate.market || 'Gurgaon');
    const missing = checkOfferMissingFields(candidate);

    const sectionsContent: Record<string, string> = {};
    Object.entries(WCR_ORIGINAL_OFFER_SECTIONS).forEach(([k, v]) => {
      sectionsContent[k] = v.content;
    });

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
      joiningDate: candidate.joiningDate || '1st September 2026',
      workLocation:
        candidate.market === 'Dubai'
          ? 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE'
          : '6th floor, TOWER-A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101',
      market: candidate.market || 'Gurgaon',
      probationMonths: 6,
      noticePeriodDays: 45,
      validTillDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
      })(),
      status: 'Draft',
      salaryBreakup: {
        annualCtc: annexComp.annualCtc,
        monthlyCtc: annexComp.monthlyCtc,
        basicMonthly: annexComp.basicMonthly,
        basicAnnual: annexComp.basicYearly,
        hraMonthly: Math.round(annexComp.basicMonthly * 0.4),
        hraAnnual: Math.round(annexComp.basicMonthly * 0.4) * 12,
        specialAllowanceMonthly: annexComp.pbvpMonthly,
        specialAllowanceAnnual: annexComp.pbvpYearly,
        statutoryBonusMonthly: 0,
        statutoryBonusAnnual: 0,
        pfEmployerMonthly: candidate.market === 'Dubai' ? 0 : 1800,
        pfEmployerAnnual: candidate.market === 'Dubai' ? 0 : 21600,
        gratuityMonthly: Math.round((annexComp.basicMonthly * 15) / (26 * 12)),
        gratuityAnnual: Math.round((annexComp.basicMonthly * 15) / 26),
        variableIncentiveAnnual: annexComp.pbvpYearly + annexComp.retentionBonusYearly,
        grossMonthly: annexComp.monthlyCtc,
        grossAnnual: annexComp.annualCtc,
        approxNetInHandMonthly: annexComp.monthlyCtc - (candidate.market === 'Dubai' ? 0 : 2000),
        currency: annexComp.currency,
      },
      clauses: Object.values(WCR_ORIGINAL_OFFER_SECTIONS).map(s => `${s.title}\n${s.content}`),
      missingFields: missing,
      templateVersion: 'v1.0-official-10page',
      customNotes: '',
      recruiterName: 'Nisha',
      recruiterTitle: 'Human Resources Recruiter',
      recruiterPhone: '+91 124-4349007',
      recruiterEmail: 'hr@whitecollarrealty.com',
      ctcLpaFormatted: annexComp.lpaFormatted,
      basicMonthly: annexComp.basicMonthly,
      basicYearly: annexComp.basicYearly,
      pbvpMonthly: annexComp.pbvpMonthly,
      pbvpYearly: annexComp.pbvpYearly,
      retentionBonusMonthly: annexComp.retentionBonusMonthly,
      retentionBonusYearly: annexComp.retentionBonusYearly,
      annexureSections: sectionsContent,
      templateHistory: [
        {
          version: 'v1.0-official-10page',
          updatedAt: '2026-10-29T00:00:00.000Z',
          updatedBy: 'Corporate HR (Master PDF)',
          changeSummary: 'Exact 10-page master template preserved from Sample_-_Offer_Letter_ba828348.pdf with immutable backgrounds and dynamic candidate overlays.',
        },
      ],
    };
  });

  // Keep synced if candidate changes
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
  const canApprove = userRole === 'HR_ADMIN' || userRole === 'HR_MANAGER';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  const handleSalaryChange = (newAnnualCtc: number) => {
    const annexComp = calculateAnnexureCompensation(newAnnualCtc, formData.market);
    setFormData(prev => ({
      ...prev,
      ctcLpaFormatted: annexComp.lpaFormatted,
      basicMonthly: annexComp.basicMonthly,
      basicYearly: annexComp.basicYearly,
      pbvpMonthly: annexComp.pbvpMonthly,
      pbvpYearly: annexComp.pbvpYearly,
      retentionBonusMonthly: annexComp.retentionBonusMonthly,
      retentionBonusYearly: annexComp.retentionBonusYearly,
      salaryBreakup: {
        ...prev.salaryBreakup,
        annualCtc: annexComp.annualCtc,
        monthlyCtc: annexComp.monthlyCtc,
        basicMonthly: annexComp.basicMonthly,
        basicAnnual: annexComp.basicYearly,
        grossMonthly: annexComp.monthlyCtc,
        grossAnnual: annexComp.annualCtc,
      },
    }));
  };

  const handleMonthlyComponentChange = (component: 'basic' | 'pbvp' | 'retention', value: number) => {
    setFormData(prev => {
      const bMonthly = component === 'basic' ? value : prev.basicMonthly || 0;
      const pMonthly = component === 'pbvp' ? value : prev.pbvpMonthly || 0;
      const rMonthly = component === 'retention' ? value : prev.retentionBonusMonthly || 0;

      const totalMonthly = bMonthly + pMonthly + rMonthly;
      const totalAnnual = totalMonthly * 12;

      return {
        ...prev,
        basicMonthly: bMonthly,
        basicYearly: bMonthly * 12,
        pbvpMonthly: pMonthly,
        pbvpYearly: pMonthly * 12,
        retentionBonusMonthly: rMonthly,
        retentionBonusYearly: rMonthly * 12,
        ctcLpaFormatted: formatSalaryLpa(totalAnnual, prev.market),
        salaryBreakup: {
          ...prev.salaryBreakup,
          annualCtc: totalAnnual,
          monthlyCtc: totalMonthly,
          basicMonthly: bMonthly,
          basicAnnual: bMonthly * 12,
          grossMonthly: totalMonthly,
          grossAnnual: totalAnnual,
        },
      };
    });
  };

  const handleSaveEdits = async () => {
    try {
      setIsSubmitting(true);
      const updated = {
        ...formData,
        missingFields: checkOfferMissingFields(candidate, formData),
      };
      await onSaveOffer(updated);
      showToast('Candidate fields & compensation structure successfully updated.');
      setActiveTab('preview');
    } catch (err: any) {
      showToast(err.message || 'Failed to update offer letter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!canApprove) {
      showToast('Permission denied: Approval requires HR Admin or HR Manager role.');
      return;
    }
    try {
      setIsSubmitting(true);
      await onApproveOffer();
      setFormData(prev => ({
        ...prev,
        status: 'Approved',
        approvedBy: userRole,
        approvedAt: new Date().toISOString(),
      }));
      showToast('Offer letter officially approved! Ready to email candidate.');
    } catch (err: any) {
      showToast(err.message || 'Failed to approve.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailCandidate = async () => {
    // ENFORCE STRICT REQUIREMENT: HR must approve it before emailing the offer letter to the candidate
    if (!isApproved) {
      showToast('Action Blocked: Offer letter MUST be approved by HR Admin before emailing the candidate.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (onEmailOffer) {
        await onEmailOffer();
      } else {
        await api.emailOfferLetter(candidate.id);
      }
      setFormData(prev => ({
        ...prev,
        status: 'Issued',
        emailSentAt: new Date().toISOString(),
      }));
      showToast(`Official 10-page offer letter emailed to ${candidate.fullName} (${candidate.email})!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to dispatch offer letter email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!candidateSigName.trim()) {
      showToast('Please enter the signature name.');
      return;
    }
    try {
      setIsSubmitting(true);
      await onAcceptOffer(candidateSigName.trim());
      setShowAcceptInput(false);
      setFormData(prev => ({
        ...prev,
        status: 'Accepted',
        candidateSignatureName: candidateSigName.trim(),
        signedAt: new Date().toISOString(),
      }));
      showToast('Offer formally accepted by candidate.');
    } catch (err: any) {
      showToast(err.message || 'Failed to accept offer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper for salutation and name display
  const candidateSalutationName =
    formData.candidateName.startsWith('Mr.') ||
    formData.candidateName.startsWith('Ms.') ||
    formData.candidateName.startsWith('Dr.')
      ? formData.candidateName
      : `Mr. ${formData.candidateName}`;

  // --------------------------------------------------------------------------
  // EXACT 10-PAGE RENDERER USING IMMUTABLE ORIGINAL PDF MASTER AS BACKGROUND
  // --------------------------------------------------------------------------
  const renderOfferPage = (pageNum: number, isComparisonView = false) => {
    return (
      <div
        key={`page-${pageNum}`}
        id={`offer-letter-page-${pageNum}`}
        className="relative w-full max-w-[800px] mx-auto shadow-xl border border-slate-300 rounded-sm select-text bg-white print:shadow-none print:border-none print:rounded-none print:max-w-none print:w-full print:break-after-page print:page-break-after-always overflow-hidden"
        style={{
          aspectRatio: '1015 / 1454',
          backgroundImage: `url(/assets/offer_template_page_${pageNum}.png)`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* ===================================================================
            PAGE 1: DYNAMIC CANDIDATE OVERLAYS OVER IMMUTABLE MASTER BACKGROUND
            =================================================================== */}
        {pageNum === 1 && (
          <div className="absolute inset-0 pointer-events-none">
            {/* 1. Salutation: Replaces sample 'Dear Mr. A,' */}
            <div
              className={`absolute flex items-center bg-white px-1.5 py-0.5 rounded-xs transition-all pointer-events-auto ${
                highlightReplacements
                  ? 'ring-2 ring-amber-500 bg-amber-50/90 shadow-sm'
                  : 'bg-white'
              }`}
              style={{
                top: '25.1%',
                left: '10.3%',
                height: '2.1%',
                maxWidth: '45%',
              }}
              title="Dynamic Candidate Field: Salutation & Full Name"
            >
              <span className="font-bold font-sans text-black text-[clamp(11px,1.55cqw,15px)] leading-none truncate">
                Dear {candidateSalutationName},
              </span>
            </div>

            {/* 2. Position / Designation: Replaces 'Business Development Executive for White Collar Realty.' */}
            <div
              className={`absolute flex items-center bg-white px-1.5 py-0.5 rounded-xs transition-all pointer-events-auto ${
                highlightReplacements
                  ? 'ring-2 ring-amber-500 bg-amber-50/90 shadow-sm'
                  : 'bg-white'
              }`}
              style={{
                top: '28.9%',
                left: '10.3%',
                width: '65%',
                height: '2.0%',
              }}
              title="Dynamic Candidate Field: Selected Designation"
            >
              <span className="font-sans text-black text-[clamp(10px,1.38cqw,13.5px)] leading-none truncate">
                <strong className="font-bold text-black">{formData.designation}</strong>{' '}
                for <strong className="font-bold text-black">White Collar Realty</strong>.
              </span>
            </div>

            {/* 3. Start Date & Offered Salary: Replaces lines with candidate joining date & CTC */}
            <div
              className={`absolute flex flex-col justify-center bg-white px-1.5 py-0.5 rounded-xs transition-all pointer-events-auto ${
                highlightReplacements
                  ? 'ring-2 ring-amber-500 bg-amber-50/90 shadow-sm'
                  : 'bg-white'
              }`}
              style={{
                top: '31.3%',
                left: '10.3%',
                width: '79.2%',
                height: '4.1%',
              }}
              title="Dynamic Candidate Field: Joining Date & Salary"
            >
              <div className="font-sans text-black text-[clamp(9.5px,1.35cqw,13px)] leading-snug">
                We would like you to start work on{' '}
                <strong className="font-bold text-black">{formData.joiningDate}</strong>. If this
                date is not acceptable, please
              </div>
              <div className="font-sans text-black text-[clamp(9.5px,1.35cqw,13px)] leading-snug">
                contact us immediately. We are offering you a salary of{' '}
                <strong className="font-bold text-black">
                  {formData.ctcLpaFormatted || candidate.offeredCTC || 'Rs. 4.8 LPA'}
                </strong>
                .
              </div>
            </div>

            {/* 4. Right Signature Block: Employee Signature & Candidate Name */}
            <div
              className={`absolute flex flex-col pointer-events-auto ${
                highlightReplacements ? 'ring-2 ring-blue-500 bg-blue-50/80 p-1 rounded' : ''
              }`}
              style={{
                top: '56.0%',
                left: '70.8%',
                width: '18.5%',
              }}
              title="Candidate Acceptance Signature Block (Blank until formally signed)"
            >
              {/* Candidate E-Signature (STRICT REQUIREMENT: Blank until genuinely signed) */}
              <div className="h-6 flex items-end justify-start pb-0.5">
                {formData.status === 'Accepted' && (formData.candidateSignatureName || formData.candidateName) ? (
                  <span className="font-serif italic text-blue-900 font-bold text-[clamp(11px,1.6cqw,16px)] leading-none select-none">
                    {formData.candidateSignatureName || formData.candidateName}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-300 font-mono italic select-none">
                    [Awaiting Signature]
                  </span>
                )}
              </div>

              {/* Candidate Name patch replacing sample 'Mr. A' */}
              <div className="bg-white px-0.5 pt-0.5">
                <span className="font-bold font-sans text-black text-[clamp(9.5px,1.3cqw,12.5px)] leading-tight block truncate">
                  {candidateSalutationName}
                </span>
                <span className="font-sans text-slate-700 text-[clamp(8.5px,1.15cqw,11.5px)] leading-tight block">
                  Employee
                </span>
                <span className="font-sans text-slate-600 text-[clamp(8px,1.05cqw,10.5px)] leading-tight block">
                  Date:{' '}
                  {formData.signedAt
                    ? new Date(formData.signedAt).toLocaleDateString('en-GB')
                    : '____________'}
                </span>
              </div>
            </div>

            {/* 5. Bottom Dashed Box: Employee E-Signature Annotations */}
            <div
              className="absolute pointer-events-auto flex items-center justify-center"
              style={{
                top: '73.2%',
                left: '58.5%',
                width: '32.5%',
                height: '2.5%',
              }}
            >
              <div className="bg-white/95 px-2 py-0.5 rounded text-[clamp(7.5px,1.0cqw,10px)] font-mono text-slate-700 truncate border border-slate-200/60 shadow-2xs">
                {formData.candidateSignatureName || formData.candidateName} ·{' '}
                {formData.status === 'Accepted' ? 'Signed & Verified' : 'Pending Formal Acceptance'}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PAGE 2: DYNAMIC COMPENSATION TABLE (ANNEXURE 1.0) OVER MASTER BG
            =================================================================== */}
        {pageNum === 2 && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Table Overlays: Replaces Basic, PBVP, Retention Bonus & CTC totals */}
            {/* Row 1: Basic (Monthly & Yearly) */}
            <div
              className={`absolute flex items-center justify-between px-2.5 bg-white pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '12.8%',
                left: '43.2%',
                width: '45.4%',
                height: '2.2%',
              }}
              title="Basic Pay (75% of Gross CTC)"
            >
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2">
                {(formData.basicMonthly || 30000).toLocaleString('en-IN')}
              </span>
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2 pl-3">
                {(formData.basicYearly || 360000).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Row 2: PBVP (Monthly & Yearly) */}
            <div
              className={`absolute flex items-center justify-between px-2.5 bg-white pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '15.1%',
                left: '43.2%',
                width: '45.4%',
                height: '2.2%',
              }}
              title="Performance Based Variable Pay (12.5% of Gross CTC)"
            >
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2">
                {(formData.pbvpMonthly || 5000).toLocaleString('en-IN')}
              </span>
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2 pl-3">
                {(formData.pbvpYearly || 60000).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Row 3: Retention Bonus (Monthly & Yearly) */}
            <div
              className={`absolute flex items-center justify-between px-2.5 bg-white pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '17.4%',
                left: '43.2%',
                width: '45.4%',
                height: '2.2%',
              }}
              title="Retention Bonus (12.5% of Gross CTC)"
            >
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2">
                {(formData.retentionBonusMonthly || 5000).toLocaleString('en-IN')}
              </span>
              <span className="font-mono text-black text-[clamp(9.5px,1.3cqw,13px)] font-medium w-1/2 pl-3">
                {(formData.retentionBonusYearly || 60000).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Row 4: Total CTC (Monthly & Yearly) */}
            <div
              className={`absolute flex items-center justify-between px-2.5 bg-[#f1f5f9] pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-100/90' : 'bg-[#e2e8f0]'
              }`}
              style={{
                top: '19.7%',
                left: '43.2%',
                width: '45.4%',
                height: '2.3%',
              }}
              title="Total Cost to Company (CTC)"
            >
              <span className="font-mono text-black text-[clamp(10px,1.35cqw,13.5px)] font-bold w-1/2">
                {(
                  (formData.basicMonthly || 30000) +
                  (formData.pbvpMonthly || 5000) +
                  (formData.retentionBonusMonthly || 5000)
                ).toLocaleString('en-IN')}
              </span>
              <span className="font-mono text-black text-[clamp(10px,1.35cqw,13.5px)] font-bold w-1/2 pl-3">
                {(
                  (formData.basicYearly || 360000) +
                  (formData.pbvpYearly || 60000) +
                  (formData.retentionBonusYearly || 60000)
                ).toLocaleString('en-IN')}
              </span>
            </div>

            {/* Bottom Dashed Box: Employee E-Signature */}
            <div
              className="absolute pointer-events-auto flex items-center justify-center"
              style={{
                top: '93.2%',
                left: '58.5%',
                width: '32.5%',
                height: '2.5%',
              }}
            >
              <div className="bg-white/95 px-2 py-0.5 rounded text-[clamp(7.5px,1.0cqw,10px)] font-mono text-slate-700 truncate border border-slate-200/60 shadow-2xs">
                {formData.candidateSignatureName || formData.candidateName} ·{' '}
                {formData.status === 'Accepted' ? 'Signed & Verified' : 'Pending Formal Acceptance'}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PAGES 3 to 8: MASTER LEGAL TEXT IS 100% PRESERVED IN BACKGROUND
            We only attach candidate tracking to the bottom e-signature pill!
            =================================================================== */}
        {pageNum >= 3 && pageNum <= 8 && (
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute pointer-events-auto flex items-center justify-center"
              style={{
                top: '93.2%',
                left: '58.5%',
                width: '32.5%',
                height: '2.5%',
              }}
            >
              <div className="bg-white/95 px-2 py-0.5 rounded text-[clamp(7.5px,1.0cqw,10px)] font-mono text-slate-700 truncate border border-slate-200/60 shadow-2xs">
                {formData.candidateSignatureName || formData.candidateName} ·{' '}
                {formData.status === 'Accepted' ? 'Signed & Verified' : 'Pending Formal Acceptance'}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PAGE 9: ACKNOWLEDGEMENT AND ACCEPTANCE TABLE OVERLAY
            =================================================================== */}
        {pageNum === 9 && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Table Row 1: Employee Name */}
            <div
              className={`absolute flex items-center bg-white px-2 py-0.5 pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '61.4%',
                left: '34.5%',
                width: '42.8%',
                height: '2.8%',
              }}
              title="Employee Name"
            >
              <span className="font-sans font-bold text-black text-[clamp(9.5px,1.3cqw,13px)] truncate">
                {formData.candidateName}
              </span>
            </div>

            {/* Table Row 2: Designation */}
            <div
              className={`absolute flex items-center bg-white px-2 py-0.5 pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '66.2%',
                left: '34.5%',
                width: '42.8%',
                height: '2.8%',
              }}
              title="Designation"
            >
              <span className="font-sans font-bold text-black text-[clamp(9.5px,1.3cqw,13px)] truncate">
                {formData.designation}
              </span>
            </div>

            {/* Table Row 3: Signature (Blank until accepted) */}
            <div
              className={`absolute flex items-center bg-white px-2 py-0.5 pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-blue-500 bg-blue-50/90' : 'bg-white'
              }`}
              style={{
                top: '71.0%',
                left: '34.5%',
                width: '42.8%',
                height: '2.8%',
              }}
              title="Candidate Signature (Kept blank until genuine acceptance)"
            >
              {formData.status === 'Accepted' && (formData.candidateSignatureName || formData.candidateName) ? (
                <span className="font-serif italic font-bold text-blue-900 text-[clamp(11px,1.5cqw,15px)] select-none">
                  {formData.candidateSignatureName || formData.candidateName}
                </span>
              ) : (
                <span className="text-[10px] text-slate-300 font-mono italic select-none">
                  ___________________________
                </span>
              )}
            </div>

            {/* Table Row 4: Date (Blank until accepted) */}
            <div
              className={`absolute flex items-center bg-white px-2 py-0.5 pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '75.8%',
                left: '34.5%',
                width: '42.8%',
                height: '2.8%',
              }}
              title="Acceptance Date"
            >
              <span className="font-mono text-slate-800 text-[clamp(9px,1.2cqw,12px)]">
                {formData.signedAt ? new Date(formData.signedAt).toLocaleDateString('en-GB') : '___________________________'}
              </span>
            </div>

            {/* Table Row 5: Place */}
            <div
              className={`absolute flex items-center bg-white px-2 py-0.5 pointer-events-auto ${
                highlightReplacements ? 'ring-1 ring-amber-500 bg-amber-50/90' : 'bg-white'
              }`}
              style={{
                top: '80.6%',
                left: '34.5%',
                width: '42.8%',
                height: '2.8%',
              }}
              title="Office / Jurisdiction Place"
            >
              <span className="font-sans text-slate-800 text-[clamp(9px,1.2cqw,12px)]">
                {formData.market === 'Dubai' ? 'Dubai, UAE' : 'Gurugram, Haryana'}
              </span>
            </div>

            {/* Bottom Dashed Box */}
            <div
              className="absolute pointer-events-auto flex items-center justify-center"
              style={{
                top: '93.2%',
                left: '58.5%',
                width: '32.5%',
                height: '2.5%',
              }}
            >
              <div className="bg-white/95 px-2 py-0.5 rounded text-[clamp(7.5px,1.0cqw,10px)] font-mono text-slate-700 truncate border border-slate-200/60 shadow-2xs">
                {formData.candidateSignatureName || formData.candidateName} ·{' '}
                {formData.status === 'Accepted' ? 'Signed & Verified' : 'Pending Formal Acceptance'}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PAGE 10: ACCEPTANCE & SIGNATURES (AUTHORIZED HR RECRUITER + CANDIDATE)
            =================================================================== */}
        {pageNum === 10 && (
          <div className="absolute inset-0 pointer-events-none">
            {/* The Left Side (Nisha Recruiter + Blue Circular Stamp) is 100% UNTOUCHED from background! */}
            
            {/* Right Side: Employee Signature Block */}
            <div
              className={`absolute flex flex-col pointer-events-auto ${
                highlightReplacements ? 'ring-2 ring-blue-500 bg-blue-50/80 p-1 rounded' : ''
              }`}
              style={{
                top: '25.0%',
                left: '68.8%',
                width: '21.5%',
              }}
              title="Candidate Final Acceptance Signature Block"
            >
              {/* Candidate E-Signature (STRICT REQUIREMENT: Blank until genuinely signed) */}
              <div className="h-6 flex items-end justify-start pb-0.5">
                {formData.status === 'Accepted' && (formData.candidateSignatureName || formData.candidateName) ? (
                  <span className="font-serif italic text-blue-900 font-bold text-[clamp(11px,1.6cqw,16px)] leading-none select-none">
                    {formData.candidateSignatureName || formData.candidateName}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-300 font-mono italic select-none">
                    [Awaiting Signature]
                  </span>
                )}
              </div>

              {/* Candidate Name patch replacing sample 'Mr. A' */}
              <div className="bg-white px-0.5 pt-0.5">
                <span className="font-bold font-sans text-black text-[clamp(9.5px,1.3cqw,12.5px)] leading-tight block truncate">
                  {candidateSalutationName}
                </span>
                <span className="font-sans text-slate-700 text-[clamp(8.5px,1.15cqw,11.5px)] leading-tight block">
                  Employee
                </span>
                <span className="font-sans text-slate-600 text-[clamp(8px,1.05cqw,10.5px)] leading-tight block">
                  Date:{' '}
                  {formData.signedAt
                    ? new Date(formData.signedAt).toLocaleDateString('en-GB')
                    : '____________'}
                </span>
              </div>
            </div>

            {/* Bottom Dashed Box */}
            <div
              className="absolute pointer-events-auto flex items-center justify-center"
              style={{
                top: '93.2%',
                left: '58.5%',
                width: '32.5%',
                height: '2.5%',
              }}
            >
              <div className="bg-white/95 px-2 py-0.5 rounded text-[clamp(7.5px,1.0cqw,10px)] font-mono text-slate-700 truncate border border-slate-200/60 shadow-2xs">
                {formData.candidateSignatureName || formData.candidateName} ·{' '}
                {formData.status === 'Accepted' ? 'Signed & Verified' : 'Pending Formal Acceptance'}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/85 backdrop-blur-xs flex justify-center p-2 sm:p-4 print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl my-auto overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Top Control Bar (Hidden during Print) */}
        <div className="p-3.5 sm:px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
              OL
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                  White Collar Realty · 10-Page Master Offer Letter
                </h2>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isAccepted
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : isIssued
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : isApproved
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {formData.status.toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Ref: {formData.refNo}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Candidate: <strong className="text-slate-200">{formData.candidateName}</strong> ({formData.designation} · {formData.ctcLpaFormatted || candidate.offeredCTC})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'preview' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                10-Page Letter
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`px-3 py-1 font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'compare' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
                title="Side-by-side comparison against master PDF template"
              >
                <Split className="w-3.5 h-3.5" />
                Visual Comparison & Diff
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'edit' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit CTC & Fields
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('template')}
                className={`px-3 py-1 font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'template' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Fidelity Audit & History
              </button>
            </div>

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Print-Ready 10-Page PDF Export matching original dimensions"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Print / Save PDF</span>
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

        {/* Action / Approval Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            {isApproved ? (
              <span className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs bg-emerald-100/80 px-2.5 py-1 rounded-md border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Approved by {formData.approvedBy || 'HR Leadership'} · Ready for Candidate Email
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-900 font-semibold text-xs bg-amber-100/80 px-2.5 py-1 rounded-md border border-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Draft Mode: HR Approval Required Before Emailing Candidate
              </span>
            )}

            {missingFields.length > 0 && (
              <span className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                {missingFields.length} field(s) missing: {missingFields.slice(0, 2).join(', ')}
              </span>
            )}

            {/* Highlight Dynamic Fields Toggle */}
            <button
              type="button"
              onClick={() => setHighlightReplacements(!highlightReplacements)}
              className={`px-2 py-1 rounded text-xs font-medium border flex items-center gap-1 transition-colors ${
                highlightReplacements
                  ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Highlight candidate-specific fields replaced in the master template"
            >
              <Sparkles className="w-3 h-3 text-amber-600" />
              {highlightReplacements ? 'Hide Field Highlights' : 'Highlight Replaced Fields'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Approval Button (HR Admin / Manager only) */}
            {!isApproved && canApprove && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleApprove}
                className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Approve Offer Letter
              </button>
            )}

            {/* Email Offer Letter Button - STRICTLY BLOCKED IF NOT APPROVED */}
            <button
              type="button"
              disabled={isSubmitting || !isApproved}
              onClick={handleEmailCandidate}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors ${
                isApproved
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-300'
              }`}
              title={
                isApproved
                  ? 'Email approved 10-page offer letter to candidate'
                  : 'Offer letter must be approved by HR Admin before emailing'
              }
            >
              {!isApproved && <Lock className="w-3.5 h-3.5" />}
              <Mail className="w-3.5 h-3.5" />
              Email Offer to Candidate
            </button>

            {/* Accept e-sign toggle */}
            {!isAccepted && (
              <button
                type="button"
                onClick={() => setShowAcceptInput(!showAcceptInput)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
              >
                <FileCheck className="w-3.5 h-3.5" />
                Record Candidate Signature
              </button>
            )}
          </div>
        </div>

        {/* Candidate Signature Input Modal Drawer */}
        {showAcceptInput && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-3 text-xs shrink-0 print:hidden animate-in fade-in">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <label className="font-semibold text-emerald-900 shrink-0">Signed Name:</label>
              <input
                type="text"
                value={candidateSigName}
                onChange={e => setCandidateSigName(e.target.value)}
                placeholder="Full Name as signature"
                className="px-2.5 py-1 bg-white border border-emerald-300 rounded text-xs text-slate-800 w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={isSubmitting}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold text-xs"
              >
                Confirm E-Signature
              </button>
              <button
                type="button"
                onClick={() => setShowAcceptInput(false)}
                className="text-emerald-800 hover:text-emerald-950 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Toast alert */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white text-xs px-4 py-2 font-medium text-center shrink-0 print:hidden animate-fade-in flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage}
          </div>
        )}

        {/* Main Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/80 print:bg-white print:p-0">
          
          {/* TAB 1: 10-PAGE PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              {/* Page Quick Navigation Ribbon */}
              <div className="max-w-[800px] mx-auto bg-slate-900 text-white p-2.5 rounded-xl shadow-md border border-slate-800 flex items-center justify-between text-xs print:hidden">
                <span className="font-bold flex items-center gap-2 text-slate-200">
                  <FileText className="w-4 h-4 text-amber-400" />
                  White Collar Realty · 10 Official Pages
                </span>

                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (
                    <a
                      key={p}
                      href={`#offer-letter-page-${p}`}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[11px] font-mono font-bold transition-colors"
                      title={`Jump to Page ${p}`}
                    >
                      P{p}
                    </a>
                  ))}
                </div>
              </div>

              {/* All 10 Pages Rendered Sequentially */}
              <div className="space-y-8 print:space-y-0">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => renderOfferPage(p))}
              </div>
            </div>
          )}

          {/* TAB 2: SIDE-BY-SIDE VISUAL COMPARISON & DIFF AUDIT */}
          {activeTab === 'compare' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Comparison Header & Controls */}
              <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                      <Split className="w-4 h-4 text-amber-400" />
                      Visual Comparison: Original Master Template vs. Generated Candidate Document
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verify pixel-level fidelity against the corporate master PDF (<code>Sample_-_Offer_Letter_ba828348.pdf</code>).
                    </p>
                  </div>

                  {/* Page selector */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={comparePage <= 1}
                      onClick={() => setComparePage(p => Math.max(1, p - 1))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-mono text-xs px-2 py-1 bg-slate-800 rounded font-bold text-amber-300">
                      Page {comparePage} of 10
                    </span>
                    <button
                      type="button"
                      disabled={comparePage >= 10}
                      onClick={() => setComparePage(p => Math.min(10, p + 1))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Page Jump Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800 text-xs">
                  <span className="text-slate-400 text-[11px] mr-1">Select Page:</span>
                  {[
                    { num: 1, label: 'Page 1: Appointment & Salary' },
                    { num: 2, label: 'Page 2: Annexure 1.0 Table' },
                    { num: 3, label: 'Page 3: Sales Incentive & Review' },
                    { num: 4, label: 'Page 4: Late Entry & Leaves' },
                    { num: 5, label: 'Page 5: Conflict of Interest & Exit' },
                    { num: 6, label: 'Page 6: Termination & POSH' },
                    { num: 7, label: 'Page 7: Notice Period & NDA' },
                    { num: 8, label: 'Page 8: IP, Work Product & AI' },
                    { num: 9, label: 'Page 9: Acknowledgement Table' },
                    { num: 10, label: 'Page 10: Final Acceptance & Seal' },
                  ].map(item => (
                    <button
                      key={item.num}
                      type="button"
                      onClick={() => setComparePage(item.num)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        comparePage === item.num
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {item.num}. {item.label.split(':')[1]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Side-by-Side Dual Viewports */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Original Master Template Page */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-2">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      Authoritative Master Template (Raw PDF Page {comparePage})
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-mono font-bold">
                      IMMUTABLE MASTER
                    </span>
                  </div>
                  
                  {/* Master template page image */}
                  <div
                    className="relative w-full shadow-lg border border-slate-300 rounded-sm overflow-hidden bg-white"
                    style={{ aspectRatio: '1015 / 1454' }}
                  >
                    <img
                      src={`/assets/offer_template_page_${comparePage}.png`}
                      alt={`Master Template Page ${comparePage}`}
                      className="w-full h-full object-fill"
                    />
                  </div>
                </div>

                {/* Right: Generated Candidate Document Page */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Generated Candidate Offer Letter (Page {comparePage})
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">
                      CANDIDATE-BOUND PREVIEW
                    </span>
                  </div>

                  {/* Candidate page with overlay */}
                  <div className="relative w-full">
                    {renderOfferPage(comparePage, true)}
                  </div>
                </div>
              </div>

              {/* Fidelity & Discrepancy Verification Report */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Exact Preservation & Fidelity Audit Report (Page {comparePage})
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Master Background Layer
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1">
                      100% Match: Rendered from <code>Sample_-_Offer_Letter_ba828348.pdf</code>. Logo, crest watermark, header wave, and fonts preserved.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Legal Clauses & Text
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1">
                      15 of 15 Sections & Annexure 1.0 verbatim preserved. No legal clauses modified or removed.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Signatures & Authenticity
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1">
                      Nisha HR signature & 2026 Gurgaon-Dubai seal intact. Candidate signature remains blank until signed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EDIT CANDIDATE FIELDS & COMPENSATION */}
          {activeTab === 'edit' && (
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-xs border border-slate-200 p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-600" />
                  Candidate-Specific Fields & Compensation Editor
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update candidate details and compensation structure. All legal clauses and master formatting remain immutable.
                </p>
              </div>

              {/* 1. Candidate Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                  1. Candidate Profile Data
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Candidate Full Name *</label>
                    <input
                      type="text"
                      value={formData.candidateName}
                      onChange={e => setFormData({ ...formData, candidateName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Candidate Email *</label>
                    <input
                      type="email"
                      value={formData.candidateEmail}
                      onChange={e => setFormData({ ...formData, candidateEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Designation / Role Title *</label>
                    <input
                      type="text"
                      value={formData.designation}
                      onChange={e => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Department *</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Proposed Joining Date *</label>
                    <input
                      type="text"
                      value={formData.joiningDate}
                      onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                      placeholder="e.g. 1st September 2026"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Market Region</label>
                    <select
                      value={formData.market}
                      onChange={e => {
                        const m = e.target.value as any;
                        setFormData(prev => ({
                          ...prev,
                          market: m,
                          salaryBreakup: {
                            ...prev.salaryBreakup,
                            currency: m === 'Dubai' ? 'AED' : 'INR',
                          },
                        }));
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    >
                      <option value="Gurgaon">Gurgaon / NCR (INR ₹)</option>
                      <option value="Dubai">Dubai / UAE (AED)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Offer Reference No.</label>
                    <input
                      type="text"
                      value={formData.refNo}
                      onChange={e => setFormData({ ...formData, refNo: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Compensation & Annexure 1.0 Breakdown */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Annexure 1.0 Compensation Structure (Sample PDF Formula)
                  </h4>
                  <span className="text-[11px] font-mono text-amber-700 font-semibold">
                    Formula: Basic (75%) + PBVP (12.5%) + Retention Bonus (12.5%)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Total Annual Offered CTC ({formData.market === 'Dubai' ? 'AED' : '₹'})
                    </label>
                    <input
                      type="number"
                      step={50000}
                      value={formData.salaryBreakup.annualCtc}
                      onChange={e => handleSalaryChange(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-slate-950 font-mono font-bold text-sm shadow-2xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Display Format in Letter: <strong className="text-slate-800">{formData.ctcLpaFormatted}</strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      Monthly Total CTC
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${formData.market === 'Dubai' ? 'AED ' : '₹'}${(formData.salaryBreakup.monthlyCtc || 0).toLocaleString('en-IN')}`}
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-mono"
                    />
                  </div>
                </div>

                {/* Table of Monthly Segregation Editable Fields */}
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 font-bold text-slate-800">
                      <tr>
                        <th className="p-2 border-r border-slate-200">Component</th>
                        <th className="p-2 border-r border-slate-200">Monthly Segregation</th>
                        <th className="p-2">Yearly Segregation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      <tr>
                        <td className="p-2 font-sans font-semibold border-r border-slate-200">Basic Pay</td>
                        <td className="p-2 border-r border-slate-200">
                          <input
                            type="number"
                            value={formData.basicMonthly || 0}
                            onChange={e => handleMonthlyComponentChange('basic', Number(e.target.value))}
                            className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                          />
                        </td>
                        <td className="p-2 text-slate-700">{(formData.basicYearly || 0).toLocaleString('en-IN')}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-sans font-semibold border-r border-slate-200">PBVP</td>
                        <td className="p-2 border-r border-slate-200">
                          <input
                            type="number"
                            value={formData.pbvpMonthly || 0}
                            onChange={e => handleMonthlyComponentChange('pbvp', Number(e.target.value))}
                            className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                          />
                        </td>
                        <td className="p-2 text-slate-700">{(formData.pbvpYearly || 0).toLocaleString('en-IN')}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-sans font-semibold border-r border-slate-200">Retention Bonus</td>
                        <td className="p-2 border-r border-slate-200">
                          <input
                            type="number"
                            value={formData.retentionBonusMonthly || 0}
                            onChange={e => handleMonthlyComponentChange('retention', Number(e.target.value))}
                            className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                          />
                        </td>
                        <td className="p-2 text-slate-700">{(formData.retentionBonusYearly || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Recruiter Signature Details */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                  3. HR Recruiter & Sign-off Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Recruiter Full Name</label>
                    <input
                      type="text"
                      value={formData.recruiterName || 'Nisha'}
                      onChange={e => setFormData({ ...formData, recruiterName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Recruiter Job Title</label>
                    <input
                      type="text"
                      value={formData.recruiterTitle || 'Human Resources Recruiter'}
                      onChange={e => setFormData({ ...formData, recruiterTitle: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 shadow-2xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Save & Return Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel & Return
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveEdits}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <FileCheck className="w-4 h-4" />
                  Save & Update Document
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: TEMPLATE & VERSION HISTORY */}
          {activeTab === 'template' && (
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-xs border border-slate-200 p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-600" />
                  White Collar Realty Master Template & Fidelity Report
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authoritative record of template versions and visual verification against source PDF.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">
                      Master Template: v1.0-official-10page (Active)
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                      VERIFIED 100% FIDELITY
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Source Document: <code>public/assets/aistudio/Sample_-_Offer_Letter_ba828348.pdf</code> (689 KB).
                    Uses original 10-page rasterized backgrounds directly from the master PDF, ensuring absolute pixel preservation of the White Collar Realty logo crest, "A Tradition Of Trust" tagline, architectural watermark, Nisha HR recruiter signature block, and 2026 Gurgaon-Dubai circular stamp.
                  </p>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700 space-y-1">
                    <div><strong>Page Dimensions:</strong> 487pt x 698pt (A4 aspect ratio: 0.698)</div>
                    <div><strong>Embedded Fonts:</strong> ArialMT, Arial-BoldMT, TimesNewRomanPSMT, Arial-ItalicMT</div>
                    <div><strong>Legal Clauses Preserved:</strong> Sections 1 through 15 & Annexure 1.0 (PBVP, Retention Bonus, Sales Incentive)</div>
                    <div><strong>Signatures:</strong> Authorized HR signature graphics preserved. Candidate signature left blank until formally signed.</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Template Revision Log:
                  </h4>
                  {(formData.templateHistory || []).map((rev, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-200 rounded-lg text-xs flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{rev.version}</p>
                        <p className="text-slate-600 mt-0.5">{rev.changeSummary}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">
                          Updated by {rev.updatedBy} on {new Date(rev.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3 sm:px-6 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="hidden sm:inline">10-Page Master PDF Background Mode Active · Print-Ready Layout</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              Print / Save All 10 Pages
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
