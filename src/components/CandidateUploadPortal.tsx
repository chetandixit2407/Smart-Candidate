import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../services/api.js';

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

export const CandidateUploadPortal: React.FC<CandidateUploadPortalProps> = ({ token, onExitPortal }) => {
  const [loading, setLoading] = useState(true);
  const [candidateData, setCandidateData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [stagedFiles, setStagedFiles] = useState<Record<string, LocalFileItem>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [previewFile, setPreviewFile] = useState<LocalFileItem | null>(null);

  useEffect(() => {
    async function loadPortal() {
      try {
        setLoading(true);
        setErrorMsg('');
        const res = await api.getPublicCandidateByToken(token);
        if (res.valid && res.candidate) {
          setCandidateData(res.candidate);
        } else {
          setErrorMsg(res.error || 'Invalid or expired upload link.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to validate upload link';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    }
    loadPortal();
  }, [token]);

  const handleFileSelect = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the 15MB limit. Please choose a smaller PDF or image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const sizeStr = file.size < 1024 * 1024 
        ? `${Math.round(file.size / 1024)} KB` 
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      setStagedFiles(prev => ({
        ...prev,
        [key]: {
          key,
          file,
          fileName: file.name,
          fileSize: sizeStr,
          fileData: base64,
          mimeType: file.type || 'application/pdf',
        },
      }));
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
    const keys = Object.keys(stagedFiles);
    if (keys.length === 0) {
      setErrorMsg('Please select at least one document before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      const payload: Record<string, any> = {};
      Object.entries(stagedFiles).forEach(([k, item]) => {
        payload[k] = {
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileData: item.fileData,
          mimeType: item.mimeType,
          reviewNotes: item.reviewNotes,
        };
      });

      await api.submitCandidateUpload(token, payload);
      setSubmittedSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit documents';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Validating secure one-time onboarding link...</p>
        <p className="text-xs text-slate-500 mt-1">White Collar Realty HR Security Gateway</p>
      </div>
    );
  }

  if (errorMsg && !candidateData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Upload Link Inactive or Expired</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {errorMsg}
          </p>
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 text-left space-y-1">
            <p className="font-semibold text-amber-400">Security Notice:</p>
            <p>One-time links automatically expire once documents have been submitted or after their validity window has elapsed.</p>
          </div>
          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Return to HR Admin Console
            </button>
          )}
        </div>
      </div>
    );
  }

  if (submittedSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-lg w-full bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40 shadow-lg">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Documents Submitted Successfully!
            </h2>
            <p className="text-xs text-emerald-400 font-mono">
              Submission Confirmed · One-Time Link Is Now Closed
            </p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Thank you, <strong>{candidateData.fullName}</strong>. Your documents have been safely received by the White Collar Realty HR Verification Team. You will receive an update once our compliance officer verifies your submission.
          </p>

          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 text-left space-y-2 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              Submitted Items ({Object.keys(stagedFiles).length})
            </span>
            <div className="space-y-1 divide-y divide-slate-700/50">
              {Object.values(stagedFiles).map(item => (
                <div key={item.key} className="pt-1.5 first:pt-0 flex items-center justify-between text-[11px]">
                  <span className="text-slate-200 flex items-center gap-1.5 truncate">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {item.fileName}
                  </span>
                  <span className="font-mono text-slate-400 shrink-0">{item.fileSize}</span>
                </div>
              ))}
            </div>
          </div>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Return to HR Admin Console
            </button>
          )}
        </div>
      </div>
    );
  }

  const documentList = Object.values(candidateData.documents || {}) as any[];
  const requiredCount = documentList.filter(d => d.required).length;
  const stagedCount = Object.keys(stagedFiles).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-sm">
            WCR
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              White Collar Realty — Candidate Onboarding Portal
            </h1>
            <p className="text-[11px] text-slate-400">
              Encrypted One-Time Document Upload Link
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            TLS 256-bit Encrypted Session
          </span>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Exit Portal
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Candidate Banner Card */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-13 h-13 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
                {candidateData.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
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

          {/* Session Expiry Notice */}
          <div className="pt-3 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Link valid until: <strong>{new Date(candidateData.tokenInfo.expiresAt).toLocaleDateString()}</strong></span>
            </span>
            <span className="text-[11px] text-slate-400">
              Files Ready to Upload: <strong className="text-amber-300 font-mono">{stagedCount}</strong> / {documentList.length}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Upload Checklist */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              Document Upload Checklist
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Accepted formats: PDF, PNG, JPG (max 15MB each)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {documentList.map((doc: any) => {
              const staged = stagedFiles[doc.key];
              const isAlreadyVerified = doc.status === 'Verified';
              const isAlreadySubmitted = doc.status === 'Submitted' || doc.status === 'Under Review';

              return (
                <div
                  key={doc.key}
                  className={`p-4 rounded-xl border transition-all ${
                    staged
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-md'
                      : isAlreadyVerified
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-white">{doc.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({doc.category})</span>
                        {doc.required && (
                          <span className="text-[10px] text-rose-300 bg-rose-500/20 px-2 py-0.2 rounded border border-rose-500/30 font-medium">
                            Required
                          </span>
                        )}
                        {isAlreadyVerified && (
                          <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-2 py-0.2 rounded border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Already Verified
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
                        <p className="text-xs text-slate-400 pt-0.5">
                          Previously submitted: <span className="font-mono text-slate-300">{doc.fileName}</span> ({doc.status})
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 pt-0.5">
                          Attach a clear scanned copy or photo of your original document.
                        </p>
                      )}
                    </div>

                    {/* Action button */}
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
                            accept=".pdf,image/png,image/jpeg,image/jpg"
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
        </div>

        {/* Bottom Submission Bar */}
        <div className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky bottom-4 shadow-2xl backdrop-blur-md">
          <div className="text-xs text-slate-400 space-y-0.5">
            <div>
              Ready to submit: <strong className="text-white font-mono">{stagedCount}</strong> documents
            </div>
            <p className="text-[11px] text-slate-500">
              By submitting, your one-time link will expire immediately to protect your personal privacy.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={stagedCount === 0 || submitting}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Uploading & Closing Link...</span>
              </>
            ) : (
              <>
                <span>Submit All Documents for Verification</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </main>

      {/* Staged File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="font-bold text-xs text-white">{previewFile.fileName}</h4>
                <p className="text-[11px] text-slate-400 font-mono">{previewFile.fileSize} · {previewFile.mimeType}</p>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center min-h-[350px]">
              {previewFile.mimeType.startsWith('image/') ? (
                <img
                  src={previewFile.fileData}
                  alt={previewFile.fileName}
                  className="max-h-[60vh] object-contain rounded-lg mx-auto"
                />
              ) : (
                <iframe
                  src={previewFile.fileData}
                  title={previewFile.fileName}
                  className="w-full h-[60vh] rounded-lg border-0"
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
