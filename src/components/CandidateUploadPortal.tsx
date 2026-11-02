import React, { useState, useEffect, useId } from 'react';
import {
  FileCheck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  Lock,
  Building,
  User,
  ArrowRight,
  Eye,
  Trash2,
  Clock,
  ShieldCheck,
  ChevronLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  CreditCard,
  HeartHandshake,
} from 'lucide-react';
import { api } from '../services/api.js';
import { SecurePdfCanvasViewer } from './SecurePdfCanvasViewer.js';
import { COMPANY_CONFIG } from '../config/company.js';

interface CandidateUploadPortalProps {
  token: string;
  onExitPortal?: () => void;
}

interface LocalFileItem {
  key: string;
  file: File;
  fileName: string;
  fileSize: string;
  fileData: string; // base64
  mimeType: string;
  reviewNotes?: string;
}

interface CandidateFormState {
  fullName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  nationality: string;
  currentAddress: string;
  permanentAddress: string;
  sameAddress: boolean;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  aadhaarNo: string;
  panNo: string;
}

export const CandidateUploadPortal: React.FC<CandidateUploadPortalProps> = ({ token, onExitPortal }) => {
  const [loading, setLoading] = useState(true);
  const [candidateData, setCandidateData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [missingDocTitles, setMissingDocTitles] = useState<string[]>([]);
  const [stagedFiles, setStagedFiles] = useState<Record<string, LocalFileItem>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState<any>(null);
  const [previewFile, setPreviewFile] = useState<LocalFileItem | null>(null);
  const [alreadyUsedNotice, setAlreadyUsedNotice] = useState<{ candidateName?: string; submittedAt?: string } | null>(null);
  const [stagedDocxHtml, setStagedDocxHtml] = useState<string | null>(null);
  const [loadingDocx, setLoadingDocx] = useState<boolean>(false);
  const [docxError, setDocxError] = useState<string | null>(null);

  // Load DOCX preview HTML when previewFile changes
  useEffect(() => {
    if (!previewFile) {
      setStagedDocxHtml(null);
      setDocxError(null);
      return;
    }
    const isDoc =
      previewFile.fileName?.toLowerCase().endsWith('.docx') ||
      previewFile.mimeType?.includes('wordprocessingml');

    if (isDoc) {
      setLoadingDocx(true);
      setDocxError(null);
      setStagedDocxHtml(null);

      if (previewFile.fileData?.startsWith('data:')) {
        api
          .previewDocxBase64(previewFile.fileData, previewFile.fileName)
          .then(res => setStagedDocxHtml(res.html))
          .catch(err => setDocxError(err.message || 'Failed to render Word document preview'))
          .finally(() => setLoadingDocx(false));
      } else if (candidateData?.id) {
        api
          .fetchDocxHtml(candidateData.id, previewFile.key, token)
          .then(res => setStagedDocxHtml(res.html))
          .catch(err => setDocxError(err.message || 'Failed to render Word document preview'))
          .finally(() => setLoadingDocx(false));
      } else {
        setLoadingDocx(false);
      }
    }
  }, [previewFile, candidateData?.id, token]);

  // Stable idempotency key per browser session
  const [idempotencyKey] = useState<string>(() => `cand-sub-${token.slice(0, 8)}-${Date.now()}`);

  // Candidate Information Form State
  const [formData, setFormData] = useState<CandidateFormState>({
    fullName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    dateOfBirth: '',
    gender: 'Male',
    nationality: 'Indian',
    currentAddress: '',
    permanentAddress: '',
    sameAddress: false,
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    bankName: '',
    accountNo: '',
    ifscCode: '',
    aadhaarNo: '',
    panNo: '',
  });

  useEffect(() => {
    async function loadPortal() {
      try {
        setLoading(true);
        setErrorMsg('');
        const res = await api.getPublicCandidateByToken(token);
        if (res.isAlreadyUsed) {
          setAlreadyUsedNotice({
            candidateName: res.candidateName,
            submittedAt: res.submittedAt,
          });
          return;
        }

        if (res.valid && res.candidate) {
          const c = res.candidate;
          setCandidateData(c);
          setFormData({
            fullName: c.fullName || '',
            phone: c.phone || '',
            alternatePhone: c.alternatePhone || '',
            email: c.email || '',
            dateOfBirth: c.dateOfBirth || '',
            gender: c.gender || 'Male',
            nationality: c.nationality || 'Indian',
            currentAddress: c.currentAddress || '',
            permanentAddress: c.permanentAddress || '',
            sameAddress: Boolean(c.currentAddress && c.currentAddress === c.permanentAddress),
            emergencyContactName: c.emergencyContact?.name || '',
            emergencyContactRelation: c.emergencyContact?.relation || '',
            emergencyContactPhone: c.emergencyContact?.phone || '',
            bankName: c.bankDetails?.bankName || '',
            accountNo: c.bankDetails?.accountNo || '',
            ifscCode: c.bankDetails?.ifscCode || '',
            aadhaarNo: c.identityDetails?.aadhaarNo || '',
            panNo: c.identityDetails?.panNo || '',
          });
        } else {
          setErrorMsg(res.error || 'Invalid or expired upload link.');
        }
      } catch (err: any) {
        if (err.code === 'LINK_ALREADY_USED' || err.status === 409) {
          setAlreadyUsedNotice({
            candidateName: err.candidateName,
            submittedAt: err.submittedAt,
          });
        } else {
          const msg = err instanceof Error ? err.message : 'Failed to validate upload link';
          setErrorMsg(msg);
        }
      } finally {
        setLoading(false);
      }
    }
    loadPortal();
  }, [token]);

  const handleInputChange = (field: keyof CandidateFormState, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'sameAddress' && value === true) {
        next.permanentAddress = next.currentAddress;
      }
      if (field === 'currentAddress' && prev.sameAddress) {
        next.permanentAddress = value;
      }
      return next;
    });
    // Clear inline error notice on change
    if (formErrors.length > 0) setFormErrors([]);
  };

  const handleFileSelect = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('File size exceeds the 15MB limit. Please choose a smaller PDF or image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const sizeStr =
        file.size < 1024 * 1024
          ? `${Math.round(file.size / 1024)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      const isDocx = file.name.toLowerCase().endsWith('.docx');
      const isDoc = file.name.toLowerCase().endsWith('.doc');
      const detectedMime =
        file.type ||
        (isDocx
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : isDoc
          ? 'application/msword'
          : 'application/pdf');

      setStagedFiles(prev => ({
        ...prev,
        [key]: {
          key,
          file,
          fileName: file.name,
          fileSize: sizeStr,
          fileData: base64,
          mimeType: detectedMime,
        },
      }));

      // Remove from missing documents error list if present
      const doc = candidateData?.documents?.[key];
      if (doc?.title) {
        setMissingDocTitles(prev => prev.filter(t => t !== doc.title));
      }
      setErrorMsg('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = (key: string) => {
    setStagedFiles(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmitAll = async () => {
    setErrorMsg('');
    setFormErrors([]);
    setMissingDocTitles([]);

    // 1. Client-Side Form Validation
    const validationErrors: string[] = [];
    if (!formData.phone.trim()) {
      validationErrors.push('Contact phone number is required.');
    } else if (formData.phone.replace(/\D/g, '').length < 8) {
      validationErrors.push('Please enter a valid phone number (at least 8 digits).');
    }

    if (!formData.currentAddress.trim()) {
      validationErrors.push('Current residential address is required.');
    }

    if (!formData.dateOfBirth.trim()) {
      validationErrors.push('Date of birth is required.');
    }

    if (!formData.emergencyContactName.trim() || !formData.emergencyContactPhone.trim()) {
      validationErrors.push('Emergency contact person name and phone are required.');
    }

    // 2. Client-Side Mandatory Documents Validation
    const documentList = Object.values(candidateData?.documents || {}) as any[];
    const missingMandatory: string[] = [];
    documentList.forEach(doc => {
      if (!doc.required) return;
      const alreadyHasFile = Boolean(
        doc.fileName && (doc.fileData || doc.storagePath || doc.hasFile) && doc.status !== 'Missing' && doc.status !== 'Rejected'
      );
      const isStaged = Boolean(stagedFiles[doc.key]);
      if (!alreadyHasFile && !isStaged) {
        missingMandatory.push(doc.title);
      }
    });

    if (validationErrors.length > 0 || missingMandatory.length > 0) {
      setFormErrors(validationErrors);
      setMissingDocTitles(missingMandatory);
      if (missingMandatory.length > 0) {
        setErrorMsg(
          `Please upload all mandatory documents before submitting: ${missingMandatory.join(', ')}.`
        );
      } else {
        setErrorMsg('Please complete all mandatory information fields highlighted below.');
      }
      // Scroll to top of form so candidate sees errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');

      const docPayload: Record<string, any> = {};
      Object.entries(stagedFiles).forEach(([k, item]) => {
        docPayload[k] = {
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileData: item.fileData,
          mimeType: item.mimeType,
          reviewNotes: item.reviewNotes,
        };
      });

      const candidateInfoPayload = {
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        alternatePhone: formData.alternatePhone.trim(),
        dateOfBirth: formData.dateOfBirth.trim(),
        gender: formData.gender,
        nationality: formData.nationality.trim(),
        currentAddress: formData.currentAddress.trim(),
        permanentAddress: formData.sameAddress
          ? formData.currentAddress.trim()
          : (formData.permanentAddress.trim() || formData.currentAddress.trim()),
        emergencyContact: {
          name: formData.emergencyContactName.trim(),
          relation: formData.emergencyContactRelation.trim() || 'Next of Kin',
          phone: formData.emergencyContactPhone.trim(),
        },
        bankDetails: {
          bankName: formData.bankName.trim(),
          accountNo: formData.accountNo.trim(),
          ifscCode: formData.ifscCode.trim(),
        },
        identityDetails: {
          aadhaarNo: formData.aadhaarNo.trim(),
          panNo: formData.panNo.trim(),
        },
      };

      const res = await api.submitCandidateUpload(token, {
        documents: docPayload,
        candidateInfo: candidateInfoPayload,
        idempotencyKey,
      });

      setSubmissionSummary({
        submissionRef: res.submissionRef || `WCR-SUB-${Date.now().toString(36).toUpperCase()}`,
        submittedAt: new Date().toISOString(),
        candidateName: candidateData.fullName,
        candidateCode: candidateData.employeeCode,
        designation: candidateData.designation,
        department: candidateData.department,
        filesCount: Object.keys(stagedFiles).length,
        submittedFiles: Object.values(stagedFiles).map(f => ({ name: f.fileName, size: f.fileSize })),
      });
      setSubmittedSuccess(true);
    } catch (err: any) {
      // In case of error, candidate stays on the page with entered information and uploaded files preserved
      const msg = err.message || 'Failed to submit candidate documents';
      setErrorMsg(msg);
      if (err.missingDocuments) {
        setMissingDocTitles(err.missingDocuments);
      }
      if (err.validationErrors) {
        setFormErrors(err.validationErrors);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Validating secure onboarding registration link...</p>
        <p className="text-xs text-slate-500 mt-1">{COMPANY_CONFIG.legalName}</p>
        <p className="text-[11px] text-slate-600 mt-0.5">{COMPANY_CONFIG.officialAddress}</p>
      </div>
    );
  }

  // Already Completed Screen (prevents duplicate submission & confirms status)
  if (alreadyUsedNotice) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-white">
        <div className="max-w-lg w-full bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40 shadow-lg">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Onboarding Registration Already Completed
            </h2>
            <p className="text-xs text-emerald-400 font-mono">
              Submission Received & Under HR Compliance Review
            </p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {alreadyUsedNotice.candidateName ? (
              <>Dear <strong>{alreadyUsedNotice.candidateName}</strong>, your</>
            ) : (
              'Your'
            )}{' '}
            candidate dossier and onboarding documents have already been successfully submitted
            {alreadyUsedNotice.submittedAt
              ? ` on ${new Date(alreadyUsedNotice.submittedAt).toLocaleDateString()} at ${new Date(alreadyUsedNotice.submittedAt).toLocaleTimeString()}`
              : ''}
            .
          </p>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 text-left text-xs text-slate-300 space-y-2">
            <p className="font-semibold text-amber-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Security Notice:
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              This one-time registration link was permanently closed after your successful submission to protect your sensitive personal and identity records.
            </p>
            <div className="pt-2 border-t border-slate-700/60 text-[11px] text-slate-400 space-y-0.5 font-mono">
              <p>For inquiries or supplementary documents, contact HR:</p>
              <p className="text-slate-200">Email: {COMPANY_CONFIG.hrEmail}</p>
              <p className="text-slate-200">Phone: {COMPANY_CONFIG.corporatePhone}</p>
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-500">
            {COMPANY_CONFIG.legalName} · {COMPANY_CONFIG.officialAddress}
          </div>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Close Admin Preview
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expired / Invalid Token Screen
  if (errorMsg && !candidateData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Registration Link Inactive or Expired</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{errorMsg}</p>
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 text-left space-y-1">
            <p className="font-semibold text-amber-400">Security Notice:</p>
            <p>
              One-time registration links expire once submitted or after their validity window elapses.
              Please reach out to your HR coordinator at White Collar Realty for an updated link.
            </p>
          </div>
          <div className="text-[10px] text-slate-500 pt-1">
            {COMPANY_CONFIG.legalName} · {COMPANY_CONFIG.officialAddress}
          </div>
          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Close Admin Preview
            </button>
          )}
        </div>
      </div>
    );
  }

  // Successful Submission Confirmation Screen
  if (submittedSuccess && submissionSummary) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-white">
        <div className="max-w-xl w-full bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/50 shadow-lg">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Transaction Verified & Locked
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Onboarding Submission Confirmed!
            </h2>
            <p className="text-xs text-slate-300">
              Thank you, <strong>{submissionSummary.candidateName}</strong>. Your candidate registration details and
              mandatory documents have been securely recorded in the White Collar Realty compliance archive.
            </p>
          </div>

          {/* Transaction Metadata Card */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60 font-mono text-[11px]">
              <span className="text-slate-400">Reference ID:</span>
              <span className="font-bold text-amber-300">{submissionSummary.submissionRef}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Candidate Code:</span>
              <span className="font-mono text-slate-200">{submissionSummary.candidateCode}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Designation & Dept:</span>
              <span className="text-slate-200">
                {submissionSummary.designation} · {submissionSummary.department}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Submitted Timestamp:</span>
              <span className="font-mono text-slate-200">
                {new Date(submissionSummary.submittedAt).toLocaleString()}
              </span>
            </div>

            {/* Submitted Files List */}
            {submissionSummary.submittedFiles?.length > 0 && (
              <div className="pt-2 border-t border-slate-700/60">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Uploaded Dossier Documents ({submissionSummary.submittedFiles.length})
                </span>
                <div className="space-y-1">
                  {submissionSummary.submittedFiles.map((file: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                      <span className="flex items-center gap-1.5 truncate">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {file.name}
                      </span>
                      <span className="font-mono text-slate-500 shrink-0">{file.size}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Corporate Office & Next Steps */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-left space-y-2 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-amber-400" />
              Corporate Headquarters:
            </p>
            <p className="text-slate-300">{COMPANY_CONFIG.legalName}</p>
            <p>{COMPANY_CONFIG.officialAddress}</p>
            <p className="pt-1 text-slate-500">
              Our Human Resources compliance team will review your dossier and designate your seating bay and corporate credentials prior to your joining date.
            </p>
          </div>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Close Admin Preview
            </button>
          )}
        </div>
      </div>
    );
  }

  const documentList = Object.values(candidateData?.documents || {}) as any[];
  const requiredCount = documentList.filter(d => d.required).length;
  const stagedCount = Object.keys(stagedFiles).length;

  // Calculate count of ready mandatory documents
  const completedMandatoryCount = documentList.filter(d => {
    if (!d.required) return false;
    const hasExisting = Boolean(d.fileName && (d.fileData || d.storagePath || d.hasFile) && d.status !== 'Missing' && d.status !== 'Rejected');
    return hasExisting || Boolean(stagedFiles[d.key]);
  }).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Header with Official Company Branding & Address */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 px-3.5 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-sm shrink-0">
            {COMPANY_CONFIG.shortName}
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
              {COMPANY_CONFIG.name} — Candidate Onboarding Portal
            </h1>
            <p className="text-[10px] text-slate-400 truncate">
              Corporate HR · {COMPANY_CONFIG.officialAddress}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            TLS 256-Bit Encrypted
          </span>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Close Preview</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-6 space-y-5">
        {/* Candidate Banner Card */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-13 h-13 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
                {candidateData.fullName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white">{candidateData.fullName}</h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    {candidateData.employeeCode}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    Upcoming Joiner
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {candidateData.designation} · {candidateData.department} · {candidateData.market} Market
                </p>
              </div>
            </div>

            <div className="sm:text-right shrink-0">
              <div className="text-[11px] text-slate-400">Target Joining Date</div>
              <div className="text-xs font-mono font-semibold text-amber-300 mt-0.5">
                {candidateData.joiningDate || 'Immediate Joining'}
              </div>
            </div>
          </div>

          {/* Session Security Ribbon */}
          <div className="pt-3 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Link Active Until:{' '}
                <strong>
                  {candidateData.tokenInfo?.expiresAt
                    ? new Date(candidateData.tokenInfo.expiresAt).toLocaleDateString()
                    : '24 Hours'}
                </strong>
              </span>
            </span>
            <span className="text-[11px] text-slate-400">
              Mandatory Documents Ready:{' '}
              <strong className="text-amber-300 font-mono">
                {completedMandatoryCount} / {requiredCount}
              </strong>
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/15 border border-rose-500/40 text-rose-200 rounded-2xl text-xs space-y-1.5 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Submission Blocked — Requirements Pending</span>
            </div>
            <p className="leading-relaxed pl-6">{errorMsg}</p>
            {missingDocTitles.length > 0 && (
              <div className="pl-6 pt-1">
                <span className="text-amber-300 font-semibold block text-[11px]">
                  Missing Mandatory Document(s):
                </span>
                <ul className="list-disc list-inside text-[11px] text-slate-300 mt-0.5 space-y-0.5">
                  {missingDocTitles.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {formErrors.length > 0 && (
              <div className="pl-6 pt-1">
                <span className="text-amber-300 font-semibold block text-[11px]">
                  Required Candidate Fields:
                </span>
                <ul className="list-disc list-inside text-[11px] text-slate-300 mt-0.5 space-y-0.5">
                  {formErrors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="pl-6 text-[11px] text-slate-400 pt-1">
              Your uploaded documents and entered form details remain saved in this form. Complete the highlighted items below and click Submit again.
            </p>
          </div>
        )}

        {/* STEP 1: Candidate Information Form */}
        <section className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Step 1: Verify & Complete Your Personal Information
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">* Required fields</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={e => handleInputChange('fullName', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400"
                placeholder="Candidate Full Name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Official / Primary Email *
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 cursor-not-allowed font-mono"
                placeholder="email@example.com"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Primary Contact Phone *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                placeholder="+91 98765 43210"
              />
            </div>

            {/* Alternate Phone */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Alternate Phone / WhatsApp
              </label>
              <input
                type="tel"
                value={formData.alternatePhone}
                onChange={e => handleInputChange('alternatePhone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                placeholder="Optional secondary phone"
              />
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Date of Birth *
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={e => handleInputChange('dateOfBirth', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Gender</label>
              <select
                value={formData.gender}
                onChange={e => handleInputChange('gender', e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Residential Address Section */}
          <div className="pt-2 border-t border-slate-700/60 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Residential Address (Do NOT use company address)
            </h4>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Current Residential Address *
              </label>
              <textarea
                rows={2}
                value={formData.currentAddress}
                onChange={e => handleInputChange('currentAddress', e.target.value)}
                placeholder="House/Flat No., Society/Building, Street, Area, City, State, PIN Code"
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 text-xs leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="sameAddressCheck"
                type="checkbox"
                checked={formData.sameAddress}
                onChange={e => handleInputChange('sameAddress', e.target.checked)}
                className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
              />
              <label htmlFor="sameAddressCheck" className="text-xs text-slate-300 cursor-pointer">
                Permanent address is same as current residential address
              </label>
            </div>

            {!formData.sameAddress && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Permanent Residential Address
                </label>
                <textarea
                  rows={2}
                  value={formData.permanentAddress}
                  onChange={e => handleInputChange('permanentAddress', e.target.value)}
                  placeholder="Permanent family address if different from current"
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 text-xs leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* Emergency Contact */}
          <div className="pt-2 border-t border-slate-700/60 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <HeartHandshake className="w-3.5 h-3.5" />
              Emergency & Next of Kin Contact *
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Contact Person Name *
                </label>
                <input
                  type="text"
                  value={formData.emergencyContactName}
                  onChange={e => handleInputChange('emergencyContactName', e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Relationship</label>
                <input
                  type="text"
                  value={formData.emergencyContactRelation}
                  onChange={e => handleInputChange('emergencyContactRelation', e.target.value)}
                  placeholder="e.g. Father / Spouse / Sibling"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Emergency Phone *
                </label>
                <input
                  type="tel"
                  value={formData.emergencyContactPhone}
                  onChange={e => handleInputChange('emergencyContactPhone', e.target.value)}
                  placeholder="+91 98111 22334"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Statutory Identity & Bank Information */}
          <div className="pt-2 border-t border-slate-700/60 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Statutory Identity & Payroll Bank Details (Optional / Pre-fill)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">PAN Number</label>
                <input
                  type="text"
                  value={formData.panNo}
                  onChange={e => handleInputChange('panNo', e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Aadhaar Number</label>
                <input
                  type="text"
                  value={formData.aadhaarNo}
                  onChange={e => handleInputChange('aadhaarNo', e.target.value)}
                  placeholder="12-digit Aadhaar"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={e => handleInputChange('bankName', e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Account / IFSC</label>
                <input
                  type="text"
                  value={formData.ifscCode}
                  onChange={e => handleInputChange('ifscCode', e.target.value.toUpperCase())}
                  placeholder="IFSC Code"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-400 font-mono uppercase"
                />
              </div>
            </div>
          </div>
        </section>

        {/* STEP 2: Document Upload Checklist */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              Step 2: Upload Mandatory Onboarding Documents
            </h3>
            <span className="text-xs text-slate-400 font-mono">PDF, PNG, JPG (max 15MB each)</span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {documentList.map((doc: any) => {
              const staged = stagedFiles[doc.key];
              const isAlreadyVerified = doc.status === 'Verified';
              const isAlreadySubmitted =
                (doc.status === 'Submitted' || doc.status === 'Under Review' || doc.status === 'Uploaded') &&
                Boolean(doc.fileName);
              const isMissingMandatory =
                doc.required && !isAlreadyVerified && !isAlreadySubmitted && !staged;

              return (
                <div
                  key={doc.key}
                  className={`p-4 rounded-xl border transition-all ${
                    staged
                      ? 'bg-slate-800/90 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                      : isAlreadyVerified
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : isAlreadySubmitted
                      ? 'bg-indigo-950/20 border-indigo-500/30'
                      : isMissingMandatory
                      ? 'bg-slate-800/60 border-rose-500/40 hover:border-rose-400'
                      : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-white">{doc.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({doc.category})</span>
                        {doc.required ? (
                          <span className="text-[10px] text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30 font-semibold">
                            Mandatory *
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                            Optional
                          </span>
                        )}

                        {isAlreadyVerified && (
                          <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified by HR
                          </span>
                        )}

                        {isAlreadySubmitted && !isAlreadyVerified && (
                          <span className="text-[10px] text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            On Record ({doc.status})
                          </span>
                        )}
                      </div>

                      {staged ? (
                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <span className="text-amber-300 font-mono font-medium flex items-center gap-1">
                            📄 {staged.fileName} ({staged.fileSize})
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewFile(staged)}
                            className="text-blue-400 hover:text-blue-300 underline text-[11px] flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                        </div>
                      ) : doc.fileName ? (
                        <div className="flex items-center gap-3 pt-1 text-xs flex-wrap">
                          <span className="text-slate-200 font-mono font-medium flex items-center gap-1">
                            📄 {doc.fileName} {doc.fileSize ? `(${doc.fileSize})` : ''}
                          </span>
                          {doc.hasFile && (
                            <button
                              type="button"
                              onClick={() => {
                                const isDocx =
                                  doc.fileName?.toLowerCase().endsWith('.docx') ||
                                  doc.mimeType?.includes('wordprocessingml');
                                setPreviewFile({
                                  key: doc.key,
                                  file: null as any,
                                  fileName: doc.fileName,
                                  fileSize: doc.fileSize || '',
                                  fileData: `/api/employees/${candidateData.id}/documents/${doc.key}/file?token=${token}`,
                                  mimeType:
                                    doc.mimeType ||
                                    (isDocx
                                      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                      : doc.fileName.endsWith('.png')
                                      ? 'image/png'
                                      : doc.fileName.endsWith('.jpg') || doc.fileName.endsWith('.jpeg')
                                      ? 'image/jpeg'
                                      : 'application/pdf'),
                                });
                              }}
                              className="text-blue-400 hover:text-blue-300 underline text-[11px] flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              Preview Document
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 pt-0.5">
                          Attach a clear scanned copy or high-resolution document photo.
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {staged ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(doc.key)}
                          className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      ) : (
                        <label className="cursor-pointer px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border border-slate-600 shadow-xs">
                          <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                          <span>{doc.fileName ? 'Replace File' : 'Choose File'}</span>
                          <input
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/jpg,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={e => handleFileSelect(doc.key, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Submission Bar */}
        <div className="p-4 sm:p-5 bg-slate-950/95 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky bottom-2 sm:bottom-4 shadow-2xl backdrop-blur-md">
          <div className="text-xs text-slate-400 space-y-0.5">
            <div>
              Mandatory Checklist Progress:{' '}
              <strong className="text-white font-mono">
                {completedMandatoryCount} / {requiredCount}
              </strong>{' '}
              completed ({stagedCount} files staged for upload)
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500">
              Link will be validated and closed only after all mandatory details and files are confirmed by the server.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Validating & Submitting Dossier...</span>
              </>
            ) : (
              <>
                <span>Submit Candidate Dossier</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Corporate Address Footer */}
        <footer className="pt-4 pb-8 text-center text-[11px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-400">{COMPANY_CONFIG.legalName}</p>
          <p>{COMPANY_CONFIG.officialAddress}</p>
          <p className="text-[10px] text-slate-600 font-mono">
            {COMPANY_CONFIG.hrEmail} · {COMPANY_CONFIG.corporatePhone}
          </p>
        </footer>
      </main>

      {/* Staged File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="font-bold text-xs text-white">{previewFile.fileName}</h4>
                <p className="text-[11px] text-slate-400 font-mono">
                  {previewFile.fileSize} · {previewFile.mimeType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950 rounded-xl border border-slate-800 p-2 min-h-[400px] flex flex-col">
              {previewFile.mimeType.startsWith('image/') ? (
                <div className="min-w-full min-h-full flex flex-col items-center justify-start my-auto py-2">
                  <img
                    src={previewFile.fileData}
                    alt={previewFile.fileName}
                    className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : previewFile.fileName?.toLowerCase().endsWith('.docx') ||
                previewFile.mimeType?.includes('wordprocessingml') ? (
                loadingDocx ? (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-400 my-auto">
                    <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs">Rendering Word document preview...</p>
                  </div>
                ) : docxError ? (
                  <div className="p-8 text-center text-rose-400 text-xs my-auto">
                    <p>{docxError}</p>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-y-auto bg-slate-900/70 p-4 flex justify-center">
                    <div className="bg-white text-slate-900 rounded shadow-lg max-w-3xl w-full p-8 text-xs sm:text-sm font-sans leading-relaxed prose prose-slate">
                      <div dangerouslySetInnerHTML={{ __html: stagedDocxHtml || '' }} />
                    </div>
                  </div>
                )
              ) : (
                <SecurePdfCanvasViewer
                  source={previewFile.fileData}
                  fileName={previewFile.fileName}
                  className="w-full h-[65vh] rounded-lg"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
