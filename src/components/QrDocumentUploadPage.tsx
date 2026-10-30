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
  FileCheck2,
  XCircle,
} from 'lucide-react';
import { PublicQrSessionData, PublicQrDocumentSlot } from '../types/index.js';
import { api } from '../services/api.js';

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

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchSession = useCallback(
    async (silent = false) => {
      try {
        const data = await api.getPublicQrSession(token, silent);
        setSession(data);
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
    [token]
  );

  useEffect(() => {
    fetchSession(false);
  }, [fetchSession]);

  // Poll silently every 10 seconds so HR verification (Uploaded -> Verified) or revocation reflects automatically
  useEffect(() => {
    if (!session || fatalError) return;
    const poll = setInterval(() => {
      fetchSession(true);
    }, 10000);
    return () => clearInterval(poll);
  }, [session, fatalError, fetchSession]);

  // Exact 1-second expiry countdown that immediately locks uploads when 24 hours elapse
  useEffect(() => {
    if (!session?.expiresAt || fatalError) return;
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
  }, [session?.expiresAt, fatalError]);

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

    // Reset input so choosing the same file after fixing an error re-triggers onChange
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
    setUploadProgressMap(prev => ({ ...prev, [slot.key]: 4 }));

    try {
      const res = await api.uploadPublicQrDocument(token, slot.key, file, pct => {
        setUploadProgressMap(prev => ({ ...prev, [slot.key]: pct }));
      });

      setSession(res.session);
      setSlotSuccess(prev => ({
        ...prev,
        [slot.key]: `Uploaded '${res.slot.fileName}' (${res.slot.fileSize})`,
      }));
    } catch (err: any) {
      if (err.status === 410 || err.code === 'QR_EXPIRED' || err.code === 'QR_REVOKED') {
        setFatalError({
          code: err.code || 'QR_EXPIRED',
          message: err.message || 'This QR link has expired and no longer accepts uploads.',
        });
      } else {
        setSlotErrors(prev => ({
          ...prev,
          [slot.key]: err.message || 'Failed to upload file. Ensure it is a valid PDF, JPG, or PNG under 10 MB.',
        }));
      }
    } finally {
      setUploadingKeys(prev => ({ ...prev, [slot.key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-slate-800 animate-spin mx-auto" />
          <h1 className="text-base font-bold text-slate-900">Verifying Secure QR Session</h1>
          <p className="text-xs text-slate-500">Checking 24-hour cryptographic token & loading your required checklist...</p>
        </div>
      </div>
    );
  }

  if (fatalError || !session) {
    const isExpired = fatalError?.code === 'QR_EXPIRED' || fatalError?.code === 'QR_REVOKED';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="bg-slate-900 px-5 py-4 text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 font-bold text-sm">
              WC
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">White Collar Realty</p>
              <p className="text-[11px] text-slate-400">Secure Onboarding Document Portal</p>
            </div>
          </div>

          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              {isExpired ? <Clock className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-slate-900">
                {fatalError?.code === 'QR_REVOKED'
                  ? 'QR Link Replaced or Deactivated'
                  : isExpired
                  ? '24-Hour QR Link Expired'
                  : 'Invalid QR Upload Link'}
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                {fatalError?.message ||
                  'This QR document upload link is no longer active. Uploads are immediately blocked after expiration.'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Need to submit your documents?</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Contact your White Collar Realty HR representative to regenerate and reshare a fresh 24-hour Document QR code.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalDocs = session.documents.length;
  const completedCount = session.documents.filter(d => d.status === 'Uploaded' || d.status === 'Verified').length;
  const missingCount = session.documents.filter(d => d.status === 'Missing').length;
  const completionPct = totalDocs > 0 ? Math.round((completedCount / totalDocs) * 100) : 100;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      {/* Sticky Mobile Brand & Countdown Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 font-bold text-sm shrink-0">
              WC
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight truncate">{session.companyName}</h1>
              <p className="text-[11px] text-slate-400 truncate">Secure QR Document Submission</p>
            </div>
          </div>

          <div className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 flex items-center gap-1.5 shrink-0">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
              {formatCountdown(remainingMs)}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {/* Candidate Context Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" />
                Verified Candidate Session
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1.5">{session.recipientName}</h2>
              <p className="text-xs text-slate-600">
                {session.designation} · <span className="font-medium text-slate-800">{session.department}</span>
                {session.subDepartment ? ` (${session.subDepartment})` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                {completedCount}/{totalDocs}
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Submitted</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Allowed: PDF, JPG, PNG (Max 10 MB each)</span>
              <span className="font-mono font-semibold text-slate-700 tabular-nums">{completionPct}% Complete</span>
            </div>
          </div>
        </section>

        {/* All Completed Banner */}
        {missingCount === 0 && totalDocs > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-emerald-900 shadow-xs">
            <FileCheck2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm">All Requested Documents Uploaded!</p>
              <p className="text-emerald-800 leading-relaxed">
                Your files have been saved directly to your White Collar Realty onboarding profile. HR has been notified in real time for verification.
              </p>
            </div>
          </div>
        )}

        {/* Document Upload Cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Required / Missing Documents ({totalDocs})
            </h3>
            <span className="text-[11px] text-slate-500">Missing → Uploaded → Verified</span>
          </div>

          {session.documents.map(doc => {
            const isUploading = Boolean(uploadingKeys[doc.key]);
            const pct = uploadProgressMap[doc.key] || 0;
            const errorMsg = slotErrors[doc.key];
            const successMsg = slotSuccess[doc.key];

            return (
              <div
                key={doc.key}
                className={`bg-white rounded-2xl border p-4 shadow-xs transition-all ${
                  doc.status === 'Verified'
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

                  {/* Status Badge: Missing -> Uploaded -> Verified */}
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

                {/* Live Upload Progress Bar */}
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

                {/* Inline Validation Error */}
                {errorMsg && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Uploaded / Verified Metadata or Touch-Friendly Upload Trigger */}
                {doc.status === 'Missing' && !doc.isLocked ? (
                  <div className="mt-3.5">
                    <input
                      ref={el => {
                        fileInputRefs.current[doc.key] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => handleFileSelection(doc, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRefs.current[doc.key]?.click()}
                      className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-all"
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
                      {doc.status === 'Verified' ? 'HR Verified' : 'Pending HR Review'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Footer Security Note */}
        <footer className="pt-2 text-center text-[11px] text-slate-500 space-y-1">
          <p className="flex items-center justify-center gap-1.5 font-medium text-slate-600">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            End-to-End Candidate-Scoped Upload · White Collar Realty HR
          </p>
          <p>Link automatically deactivates at {new Date(session.expiresAt).toLocaleString()}.</p>
        </footer>
      </main>
    </div>
  );
};
