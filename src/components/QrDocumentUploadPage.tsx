import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  Clock,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  RefreshCw,
  Send,
  Loader2,
  Building,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';
import { PublicQrSessionData, PublicQrDocumentSlot } from '../types/index.js';
import { api } from '../services/api.js';
import { COMPANY_CONFIG } from '../config/company.js';

interface QrDocumentUploadPageProps {
  token: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
}

export const QrDocumentUploadPage: React.FC<QrDocumentUploadPageProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PublicQrSessionData | null>(null);
  const [fatalError, setFatalError] = useState<{ code: string; message: string } | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  // Per-document upload progress & inline validation error states
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<string, number>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});
  const [slotSuccess, setSlotSuccess] = useState<Record<string, string>>({});

  // Final Registration Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [missingMandatoryDocs, setMissingMandatoryDocs] = useState<string[]>([]);
  const [submissionConfirmation, setSubmissionConfirmation] = useState<{
    submissionRef: string;
    candidateName: string;
    candidateCode?: string;
    designation: string;
    department: string;
    submittedAt: string;
    documentsCount: number;
    documents: Array<{ key: string; title: string; fileName?: string; fileSize?: string }>;
  } | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchSession = useCallback(
    async (silent = false) => {
      try {
        const data = await api.getPublicQrSession(token, silent);
        setSession(data);

        if (data.isSubmitted) {
          setSubmissionConfirmation({
            submissionRef: data.submissionRef || `WCR-QR-SUB-${token.slice(0, 8).toUpperCase()}`,
            candidateName: data.recipientName,
            designation: data.designation,
            department: data.department,
            submittedAt: data.submittedAt || new Date().toISOString(),
            documentsCount: (data.documents || []).length,
            documents: (data.documents || []).map(d => ({
              key: d.key,
              title: d.title,
              fileName: d.fileName,
              fileSize: d.fileSize,
            })),
          });
          return;
        }

        const diff = Math.max(0, new Date(data.expiresAt).getTime() - Date.now());
        setRemainingMs(diff);
        if (diff <= 0) {
          setFatalError({
            code: 'QR_EXPIRED',
            message:
              'This QR upload link expired after its 24-hour security window. Please contact White Collar Realty HR for a regenerated QR code.',
          });
        } else {
          setFatalError(null);
        }
      } catch (err: any) {
        if (err.code === 'ALREADY_SUBMITTED' || err.status === 409) {
          setFatalError(null);
          setSubmissionConfirmation({
            submissionRef: `WCR-QR-SUB-${token.slice(0, 8).toUpperCase()}`,
            candidateName: session?.recipientName || 'Candidate',
            designation: session?.designation || '',
            department: session?.department || '',
            submittedAt: new Date().toISOString(),
            documentsCount: 0,
            documents: [],
          });
          return;
        }

        setFatalError({
          code: err.code || (err.status === 410 ? 'QR_EXPIRED' : 'INVALID_TOKEN'),
          message:
            err.message ||
            'This QR code is expired or invalid. Please ask White Collar Realty HR to share a fresh QR code.',
        });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, session?.recipientName, session?.designation, session?.department]
  );

  useEffect(() => {
    fetchSession(false);
  }, [fetchSession]);

  // Poll silently every 10 seconds so HR verification reflects automatically
  useEffect(() => {
    if (!session || fatalError || submissionConfirmation) return;
    const poll = setInterval(() => {
      fetchSession(true);
    }, 10000);
    return () => clearInterval(poll);
  }, [session, fatalError, submissionConfirmation, fetchSession]);

  // Exact 1-second countdown that stops when remainingMs reaches 0
  useEffect(() => {
    if (!session?.expiresAt || fatalError || submissionConfirmation) return;
    const tick = () => {
      const diff = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
      setRemainingMs(diff);
      if (diff <= 0) {
        setFatalError({
          code: 'QR_EXPIRED',
          message:
            'This QR upload link has reached its 24-hour expiry limit and is now closed. Please contact White Collar Realty HR to regenerate a new QR code.',
        });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.expiresAt, fatalError, submissionConfirmation]);

  const validateSelectedFile = (file: File): string | null => {
    if (!file || file.size === 0) {
      return 'Selected file is empty. Please choose a valid PDF, JPG, or PNG file.';
    }
    if (file.size > MAX_BYTES) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB maximum limit.`;
    }
    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    if (!hasValidExt) {
      return 'Invalid file format. Only PDF, JPG, and PNG files are allowed.';
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type.toLowerCase())) {
      return 'Unsupported file type. Please upload a genuine PDF, JPG, or PNG document.';
    }
    return null;
  };

  const handleFileSelection = async (slot: PublicQrDocumentSlot, file?: File | null) => {
    if (!file) return;

    if (fileInputRefs.current[slot.key]) {
      fileInputRefs.current[slot.key]!.value = '';
    }

    if (remainingMs <= 0 || fatalError) {
      setFatalError({
        code: 'QR_EXPIRED',
        message: 'This QR upload link has expired and can no longer accept uploads.',
      });
      return;
    }

    if (slot.isLocked || slot.status !== 'Missing') {
      setSlotErrors(prev => ({
        ...prev,
        [slot.key]: `'${slot.title}' has already been uploaded. Duplicate uploads are locked.`,
      }));
      return;
    }

    const clientValidationError = validateSelectedFile(file);
    if (clientValidationError) {
      setSlotErrors(prev => ({ ...prev, [slot.key]: clientValidationError }));
      return;
    }

    setSlotErrors(prev => {
      const next = { ...prev };
      delete next[slot.key];
      return next;
    });
    setUploadingKeys(prev => ({ ...prev, [slot.key]: true }));
    setUploadProgressMap(prev => ({ ...prev, [slot.key]: 8 }));

    try {
      const res = await api.uploadPublicQrDocument(token, slot.key, file, pct => {
        setUploadProgressMap(prev => ({ ...prev, [slot.key]: pct }));
      });

      setSession(res.session);
      setSlotSuccess(prev => ({
        ...prev,
        [slot.key]: `Uploaded '${res.slot.fileName}' (${res.slot.fileSize})`,
      }));
      // Clear missing document error if this document was pending
      setMissingMandatoryDocs(prev => prev.filter(t => t !== slot.title && t !== slot.key));
      setSubmissionError(null);
    } catch (err: any) {
      if (err.status === 410 || err.code === 'QR_EXPIRED' || err.code === 'QR_REVOKED') {
        setFatalError({
          code: err.code || 'QR_EXPIRED',
          message: err.message || 'This QR link has expired and no longer accepts uploads.',
        });
      } else {
        setSlotErrors(prev => ({
          ...prev,
          [slot.key]: err.message || 'Upload failed. Please try again.',
        }));
      }
    } finally {
      setUploadingKeys(prev => ({ ...prev, [slot.key]: false }));
    }
  };

  // Submit All Uploaded Documents and Finalize Registration
  const handleSubmitRegistration = async () => {
    if (!session) return;

    // 1. Client-Side Mandatory Documents Validation
    const docs = session.documents || [];
    const missing: string[] = [];
    docs.forEach(doc => {
      if (doc.required && doc.status === 'Missing') {
        missing.push(doc.title);
      }
    });

    if (missing.length > 0) {
      setMissingMandatoryDocs(missing);
      setSubmissionError(
        `Please upload all required documents before final submission: ${missing.join(', ')}.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Check if any upload is currently in progress
    const anyUploading = Object.values(uploadingKeys).some(Boolean);
    if (anyUploading) {
      setSubmissionError('Please wait for current file uploads to complete before submitting.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmissionError(null);
      setMissingMandatoryDocs([]);

      const result = await api.submitPublicQrRegistration(token);

      setSubmissionConfirmation({
        submissionRef: result.submissionRef,
        candidateName: result.candidateName || session.recipientName,
        candidateCode: result.candidateCode,
        designation: result.designation || session.designation,
        department: result.department || session.department,
        submittedAt: result.submittedAt || new Date().toISOString(),
        documentsCount: result.documentsCount || docs.length,
        documents: result.documents || docs.map(d => ({
          key: d.key,
          title: d.title,
          fileName: d.fileName,
          fileSize: d.fileSize,
        })),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      const msg = err.message || 'Failed to submit onboarding documents. Please try again.';
      setSubmissionError(msg);
      if (err.missingDocuments && Array.isArray(err.missingDocuments)) {
        setMissingMandatoryDocs(err.missingDocuments);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Validating 24-hour candidate QR session...</p>
        <p className="text-xs text-slate-500 mt-1">{COMPANY_CONFIG.legalName}</p>
        <p className="text-[11px] text-slate-600 mt-0.5">{COMPANY_CONFIG.officialAddress}</p>
      </div>
    );
  }

  // Submission Confirmation Screen (Successful Final Submission or Already Completed)
  if (submissionConfirmation) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-white">
        <div className="max-w-xl w-full bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/50 shadow-lg">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Registration Finalized & Locked
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Onboarding Submission Confirmed!
            </h2>
            <p className="text-xs text-slate-300">
              Thank you, <strong>{submissionConfirmation.candidateName}</strong>. Your onboarding documents
              have been securely uploaded and recorded in the White Collar Realty compliance archive.
            </p>
          </div>

          {/* Submission Receipt Card */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60 font-mono text-[11px]">
              <span className="text-slate-400">Reference ID:</span>
              <span className="font-bold text-amber-300">{submissionConfirmation.submissionRef}</span>
            </div>
            {submissionConfirmation.candidateCode && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Candidate Code:</span>
                <span className="font-mono text-slate-200">{submissionConfirmation.candidateCode}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Designation & Department:</span>
              <span className="text-slate-200">
                {submissionConfirmation.designation} · {submissionConfirmation.department}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Submission Timestamp:</span>
              <span className="font-mono text-slate-300">
                {new Date(submissionConfirmation.submittedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Documents Archived:</span>
              <span className="font-semibold text-emerald-400">
                {submissionConfirmation.documentsCount || submissionConfirmation.documents.length} Document(s)
              </span>
            </div>
          </div>

          {/* Documents Archived Checklist */}
          {submissionConfirmation.documents.length > 0 && (
            <div className="text-left space-y-2">
              <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                Submitted Document Archive:
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                {submissionConfirmation.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300 py-1 border-b border-slate-800/60 last:border-0">
                    <span className="font-medium text-slate-200">{doc.title}</span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {doc.fileName ? `${doc.fileName} (${doc.fileSize || 'Saved'})` : 'Received & Verified'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 text-left text-xs text-slate-300 space-y-1.5">
            <p className="font-semibold text-amber-400 flex items-center gap-1.5 text-xs">
              <ShieldCheck className="w-4 h-4" />
              Security Notice
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              This 24-hour QR session is now completed and locked against duplicate uploads to protect
              your personal and identity data. Our HR compliance team is auditing your dossier and will
              update you on the next onboarding steps.
            </p>
          </div>

          <div className="pt-2 text-[10px] text-slate-500 font-mono">
            {COMPANY_CONFIG.legalName} · {COMPANY_CONFIG.officialAddress}
          </div>
        </div>
      </div>
    );
  }

  // Fatal Error Screen (Expired or Revoked)
  if (fatalError || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">QR Upload Link Inactive</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {fatalError?.message || 'This QR document link is expired or invalid.'}
          </p>
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 text-left space-y-1">
            <p className="font-semibold text-amber-400">Security Note:</p>
            <p>
              White Collar Realty individual QR links are valid for strictly 24 hours. If your link has
              expired, please contact your HR recruiter or manager to generate a new QR code.
            </p>
          </div>
          <div className="text-[10px] text-slate-500 pt-1">
            {COMPANY_CONFIG.legalName} · {COMPANY_CONFIG.officialAddress}
          </div>
        </div>
      </div>
    );
  }

  // Calculate Upload Progress Stats
  const documentSlots = session.documents || [];
  const requiredDocs = documentSlots.filter(d => d.required);
  const uploadedCount = documentSlots.filter(
    d => d.status === 'Uploaded' || d.status === 'Verified'
  ).length;
  const missingRequiredCount = requiredDocs.filter(d => d.status === 'Missing').length;
  const allRequiredUploaded = missingRequiredCount === 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Corporate Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-sm">
              WCR
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white leading-tight">
                White Collar Realty
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                Candidate Document Registration
              </p>
            </div>
          </div>

          {/* 24-Hour Expiry Countdown */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
              {formatCountdown(remainingMs)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5">
        {/* Candidate Information Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 font-bold">
                Designated Personnel
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                {session.recipientName}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Role: <strong>{session.designation}</strong> · Dept: <strong>{session.department}</strong>
                {session.subDepartment ? ` (${session.subDepartment})` : ''}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-center shrink-0">
              <span className="text-[10px] block font-mono text-slate-400 uppercase">Documents</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {uploadedCount} / {documentSlots.length}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
              <span>Overall Onboarding Progress</span>
              <span className="font-mono font-bold text-slate-800">
                {Math.round((uploadedCount / Math.max(1, documentSlots.length)) * 100)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((uploadedCount / Math.max(1, documentSlots.length)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-[11px] leading-tight">
              Documents uploaded here are validated for authenticity and encrypted securely in White Collar Realty records.
            </span>
          </div>
        </section>

        {/* Submission Error Banner */}
        {submissionError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs sm:text-sm space-y-2 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Submission Blocked — Missing Mandatory Documents</span>
            </div>
            <p className="text-xs text-rose-700 leading-relaxed">{submissionError}</p>
            {missingMandatoryDocs.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-rose-800 space-y-0.5 font-medium">
                {missingMandatoryDocs.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Document Upload Slots Checklist */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Required Document Checklist</h3>
            <span className="text-xs font-mono text-slate-500">
              {missingRequiredCount === 0 ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All Mandatory Ready
                </span>
              ) : (
                <span className="text-rose-600 font-semibold">
                  {missingRequiredCount} Required Pending
                </span>
              )}
            </span>
          </div>

          {documentSlots.map(doc => {
            const isUploading = Boolean(uploadingKeys[doc.key]);
            const pct = uploadProgressMap[doc.key] || 0;
            const errorMsg = slotErrors[doc.key];
            const successMsg = slotSuccess[doc.key];
            const isMissingMandatory = missingMandatoryDocs.includes(doc.title);

            return (
              <div
                key={doc.key}
                className={`bg-white rounded-2xl border p-4 shadow-xs transition-colors ${
                  isMissingMandatory
                    ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-400'
                    : doc.status === 'Verified'
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : doc.status === 'Uploaded'
                    ? 'border-indigo-200 bg-indigo-50/15'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        doc.status === 'Verified'
                          ? 'bg-emerald-100 text-emerald-700'
                          : doc.status === 'Uploaded'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {doc.status === 'Verified' || doc.status === 'Uploaded' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 leading-snug">{doc.title}</h4>
                        {doc.required && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{doc.category}</p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${
                      doc.status === 'Verified'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : doc.status === 'Uploaded'
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {doc.status}
                  </span>
                </div>

                {/* Upload Progress Bar */}
                {isUploading && (
                  <div className="mt-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-900" />
                        Uploading securely to HR profile...
                      </span>
                      <span className="font-mono font-bold tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-900 transition-all duration-150 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Inline Error */}
                {errorMsg && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Action / Metadata */}
                {doc.status === 'Missing' && !doc.isLocked ? (
                  <div className="mt-3.5">
                    <input
                      ref={el => {
                        fileInputRefs.current[doc.key] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      disabled={isUploading || isSubmitting}
                      onChange={e => handleFileSelection(doc, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={isUploading || isSubmitting}
                      onClick={() => fileInputRefs.current[doc.key]?.click()}
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-all"
                    >
                      <Upload className="w-4 h-4 text-amber-400" />
                      {isUploading ? `Uploading (${pct}%)...` : 'Select PDF, JPG or PNG to Upload'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="min-w-0 truncate">
                      {doc.fileName ? (
                        <span className="font-medium text-slate-800 truncate block">
                          {doc.fileName} {doc.fileSize ? `(${doc.fileSize})` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-600">{successMsg || 'Document received by HR'}</span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                      <Lock className="w-3 h-3" />
                      {doc.status === 'Verified' ? 'HR Verified' : 'Uploaded (Pending Submission)'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* PRIMARY SUBMIT ACTION SECTION */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Finalize & Submit Registration
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Once you have uploaded all mandatory onboarding documents, click the button below to submit your dossier.
              Your one-time registration link will be securely finalized and sent to White Collar Realty HR.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmitRegistration}
            disabled={isSubmitting || Object.values(uploadingKeys).some(Boolean)}
            className="w-full min-h-[50px] py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Submitting & Finalizing Registration...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-emerald-200" />
                <span>Submit All Documents ({uploadedCount} Uploaded)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {!allRequiredUploaded && (
            <p className="text-[11px] text-amber-700 text-center font-medium">
              Note: {missingRequiredCount} mandatory document(s) still pending. Upload all required items to enable submission.
            </p>
          )}
        </section>

        {/* Footer Security Note */}
        <footer className="pt-2 text-center text-[11px] text-slate-500 space-y-1">
          <p className="flex items-center justify-center gap-1.5 font-medium text-slate-600">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            End-to-End Candidate-Scoped Registration · White Collar Realty HR
          </p>
          <p>
            Official Address: {COMPANY_CONFIG.officialAddress}
          </p>
        </footer>
      </main>
    </div>
  );
};
