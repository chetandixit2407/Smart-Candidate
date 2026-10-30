import React, { useState } from 'react';
import {
  UserPlus,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Armchair,
  FileCheck,
  UserCheck,
  Share2,
  ExternalLink,
  Copy,
  Check,
  KeyRound,
  Ban,
  X,
  AlertCircle,
  AlertTriangle,
  Eye,
  FileText,
  Send,
  QrCode,
} from 'lucide-react';
import { Employee, UserRole, UploadToken } from '../types/index.js';

interface CandidatesViewProps {
  candidates: Employee[];
  onSelectCandidate: (candidate: Employee) => void;
  onOpenAddModal: () => void;
  onConvertCandidate: (id: string, params: { employeeCode?: string; joiningDate?: string; desk?: string }) => Promise<void>;
  userRole: UserRole;
  onGenerateUploadLink?: (candidateId: string, options?: { expiryDays?: number; isOneTime?: boolean }) => Promise<{ success: boolean; token: UploadToken; message: string }>;
  onRevokeUploadLink?: (candidateId: string) => Promise<{ success: boolean; message: string }>;
  onOpenCandidatePortal?: (token: string) => void;
  onOpenOfferLetter?: (candidate: Employee) => void;
  onSendReminder?: (candidateId: string, channel?: 'EMAIL' | 'WHATSAPP' | 'BOTH') => void;
  onOpenQrModal?: (candidate: Employee) => void;
}

export const CandidatesView: React.FC<CandidatesViewProps> = ({
  candidates,
  onSelectCandidate,
  onOpenAddModal,
  onConvertCandidate,
  userRole,
  onGenerateUploadLink,
  onRevokeUploadLink,
  onOpenCandidatePortal,
  onOpenOfferLetter,
  onSendReminder,
  onOpenQrModal,
}) => {
  const [convertingCand, setConvertingCand] = useState<Employee | null>(null);
  const [assignedCode, setAssignedCode] = useState('');
  const [assignedDesk, setAssignedDesk] = useState('');
  const [confirmedDoj, setConfirmedDoj] = useState('');
  const [converting, setConverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Quick 1-click copy toast
  const [copiedTokenCandId, setCopiedTokenCandId] = useState<string | null>(null);

  // Link Management Modal State
  const [managingLinkCand, setManagingLinkCand] = useState<Employee | null>(null);
  const [linkExpiryDays, setLinkExpiryDays] = useState<number>(7);
  const [linkIsOneTime, setLinkIsOneTime] = useState<boolean>(true);
  const [linkLoading, setLinkLoading] = useState<boolean>(false);
  const [linkModalCopied, setLinkModalCopied] = useState<boolean>(false);
  const [linkModalMsg, setLinkModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canEdit = userRole === 'HR' || userRole === 'Co-Founder';

  const openConvertModal = (e: React.MouseEvent, cand: Employee) => {
    e.stopPropagation();
    setConvertingCand(cand);
    setAssignedCode(`WCR-${String(20 + candidates.indexOf(cand) + 1).padStart(3, '0')}`);
    setAssignedDesk(cand.desk || 'F1');
    setConfirmedDoj(cand.joiningDate || new Date().toISOString().split('T')[0]);
    setErrorMsg('');
  };

  const handleConfirmConversion = async () => {
    if (!convertingCand) return;
    try {
      setConverting(true);
      setErrorMsg('');
      await onConvertCandidate(convertingCand.id, {
        employeeCode: assignedCode,
        joiningDate: confirmedDoj,
        desk: assignedDesk,
      });
      setConvertingCand(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to convert candidate';
      setErrorMsg(msg);
    } finally {
      setConverting(false);
    }
  };

  const handleGenerateLinkInModal = async () => {
    if (!managingLinkCand || !onGenerateUploadLink) return;
    try {
      setLinkLoading(true);
      setLinkModalMsg(null);
      const res = await onGenerateUploadLink(managingLinkCand.id, {
        expiryDays: linkExpiryDays,
        isOneTime: linkIsOneTime,
      });
      if (res.token) {
        setManagingLinkCand(prev => prev ? { ...prev, uploadToken: res.token } : null);
      }
      setLinkModalMsg({ type: 'success', text: res.message || 'Upload link successfully created.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate link';
      setLinkModalMsg({ type: 'error', text: msg });
    } finally {
      setLinkLoading(false);
    }
  };

  const handleRevokeLinkInModal = async () => {
    if (!managingLinkCand || !onRevokeUploadLink) return;
    try {
      setLinkLoading(true);
      setLinkModalMsg(null);
      const res = await onRevokeUploadLink(managingLinkCand.id);
      setManagingLinkCand(prev => {
        if (!prev || !prev.uploadToken) return prev;
        return {
          ...prev,
          uploadToken: { ...prev.uploadToken, revoked: true, isRevoked: true },
        };
      });
      setLinkModalMsg({ type: 'success', text: res.message || 'Link revoked.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke link';
      setLinkModalMsg({ type: 'error', text: msg });
    } finally {
      setLinkLoading(false);
    }
  };

  // Keep managing candidate up-to-date with candidates prop
  const currentSelectedCand = managingLinkCand
    ? candidates.find(c => c.id === managingLinkCand.id) || managingLinkCand
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Candidate Onboarding Pipeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage incoming hires, track pre-boarding document verification, share secure upload links, reserve desks, and convert to active employee records.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && candidates.length > 0 && onOpenOfferLetter && (
            <button
              type="button"
              onClick={() => onOpenOfferLetter(candidates[0])}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              Generate Offer Letter
            </button>
          )}
          {canEdit && (
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register New Candidate
            </button>
          )}
        </div>
      </div>

      {/* Candidates Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {candidates.map(cand => {
          // Document stats
          const docValues = Object.values(cand.documents || {});
          const verifiedDocs = docValues.filter(d => d.status === 'Verified').length;
          const submittedDocs = docValues.filter(
            d => d.status === 'Uploaded' || d.status === 'Submitted' || d.status === 'Under Review'
          ).length;
          const missingDocs = docValues.filter(
            d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
          );
          const missingDocsCount = missingDocs.length;
          const totalDocs = docValues.length;

          const hasActiveToken =
            cand.uploadToken &&
            !cand.uploadToken.isUsed &&
            !cand.uploadToken.isRevoked &&
            new Date(cand.uploadToken.expiresAt).getTime() > Date.now();

          const hasActiveQr =
            Boolean(cand.documentQrMeta?.isActive && cand.documentQrMeta?.expiresAt) &&
            new Date(cand.documentQrMeta!.expiresAt!).getTime() > Date.now();

          const lastReminder = cand.documentReminders && cand.documentReminders.length > 0
            ? cand.documentReminders[cand.documentReminders.length - 1]
            : null;

          return (
            <div
              key={cand.id}
              onClick={() => onSelectCandidate(cand)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                      {cand.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900">{cand.fullName}</h3>
                      <p className="text-xs text-slate-500">{cand.designation}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {hasActiveQr && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                        <QrCode className="w-3 h-3 text-indigo-600" />
                        24h QR Active
                      </span>
                    )}
                    {hasActiveToken && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-amber-600" />
                        Link Active
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {cand.candidateStatus || 'Offer Accepted'}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Department</span>
                    <span className="font-medium text-slate-800 truncate block">
                      {cand.department}
                      {cand.subDepartment ? ` · ${cand.subDepartment}` : ''}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Expected Joining Date</span>
                    <span className="font-mono font-semibold text-blue-700 block">{cand.joiningDate}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Reserved Desk</span>
                    <span className="font-mono font-bold text-amber-800 block">
                      {cand.desk ? `Desk ${cand.desk} (Reserved)` : 'Not Reserved'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Offered CTC</span>
                    <span className="font-mono font-semibold text-slate-800 block">
                      {cand.offeredCTC || 'Confidential'}
                    </span>
                  </div>
                </div>

                {/* Onboarding Readiness Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">Onboarding Dossier Readiness</span>
                    <span className="font-mono font-bold text-slate-800 tabular-nums">
                      {cand.profileCompletion}% ({verifiedDocs} Verified{submittedDocs > 0 ? ` · ${submittedDocs} Submitted` : ''} / {totalDocs} Total)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        cand.profileCompletion >= 80
                          ? 'bg-emerald-500'
                          : cand.profileCompletion >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${cand.profileCompletion}%` }}
                    />
                  </div>
                </div>

                {/* Missing Required Documents Alert Banner */}
                {missingDocsCount > 0 && (
                  <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                    cand.isDocumentSubmissionOverdue
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${cand.isDocumentSubmissionOverdue ? 'text-rose-600' : 'text-amber-600'}`} />
                      <div className="truncate">
                        <div className="font-semibold text-[11px] flex items-center gap-1.5">
                          <span>{missingDocsCount} required {missingDocsCount === 1 ? 'doc' : 'docs'} missing</span>
                          {cand.isDocumentSubmissionOverdue ? (
                            <span className="px-1.5 py-0.2 bg-rose-200 text-rose-800 rounded text-[9px] font-bold uppercase tracking-wider">
                              Overdue
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-normal">
                              (24h deadline)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-80 truncate">
                          {missingDocs.map(d => d.title).join(', ')}
                        </div>
                      </div>
                    </div>

                    {onSendReminder && canEdit && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onSendReminder(cand.id, 'BOTH');
                        }}
                        className={`shrink-0 px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors ${
                          cand.isDocumentSubmissionOverdue
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}
                        title="Send personalized WhatsApp and Email reminder"
                      >
                        <Send className="w-3 h-3" />
                        <span>Remind</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Last reminder info if exists */}
                {lastReminder && (
                  <div className="text-[10px] text-slate-500 flex items-center justify-between px-1">
                    <span className="truncate">
                      Last reminder: {lastReminder.channel} ({new Date(lastReminder.sentAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                    </span>
                    <span className="font-medium text-slate-700 shrink-0">
                      Sent {cand.documentReminders?.length || 1}x
                    </span>
                  </div>
                )}

                {cand.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded">
                    &ldquo;{cand.notes}&rdquo;
                  </p>
                )}
              </div>

              {/* Bottom Card Actions */}
              <div className="pt-3 border-t border-slate-100 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2.5">
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  {cand.employeeCode}
                </span>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {/* Individual 24h Document QR Button */}
                  {onOpenQrModal && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenQrModal(cand);
                      }}
                      className="px-2.5 py-1.5 text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="Inspect missing documents & generate 24-hour candidate QR code"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Generate Document QR</span>
                    </button>
                  )}

                  {/* Dedicated Link Control Trigger */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setManagingLinkCand(cand);
                        setLinkExpiryDays(cand.uploadToken?.expiryDays || 7);
                        setLinkIsOneTime(cand.uploadToken?.isOneTime !== false);
                        setLinkModalMsg(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs rounded font-medium flex items-center gap-1 transition-colors border ${
                        hasActiveToken
                          ? 'text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300'
                          : 'text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200'
                      }`}
                      title="Manage secure document upload link for this candidate"
                    >
                      <Share2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>{hasActiveToken ? 'Portal Link' : 'Link'}</span>
                    </button>
                  )}

                  {/* Quick Copy Link Button if already active */}
                  {hasActiveToken && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        const url = `${window.location.origin}/?uploadToken=${cand.uploadToken?.token}`;
                        navigator.clipboard.writeText(url);
                        setCopiedTokenCandId(cand.id);
                        setTimeout(() => setCopiedTokenCandId(null), 2000);
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors"
                      title="Quick Copy Portal URL"
                    >
                      {copiedTokenCandId === cand.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                  )}

                  {onSendReminder && canEdit && missingDocsCount > 0 && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onSendReminder(cand.id, 'BOTH');
                      }}
                      className="px-2.5 py-1.5 text-xs text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded font-medium flex items-center gap-1 transition-colors"
                      title="Send WhatsApp & Email missing document reminder"
                    >
                      <Send className="w-3.5 h-3.5 text-amber-600" />
                      <span>Remind</span>
                    </button>
                  )}

                  {onOpenOfferLetter && (canEdit || Boolean(cand.offerLetter || (cand.savedOfferLetters && cand.savedOfferLetters.length > 0))) && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenOfferLetter(cand);
                      }}
                      className="px-2.5 py-1.5 text-xs text-slate-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded font-medium flex items-center gap-1 transition-colors"
                      title={canEdit ? 'Open or generate executive offer letter' : 'Preview & download saved offer letter'}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        {canEdit
                          ? cand.offerLetter || (cand.savedOfferLetters && cand.savedOfferLetters.length > 0)
                            ? 'Offer Letter'
                            : 'Draft Offer'
                          : 'Preview Offer'}
                      </span>
                      {cand.savedOfferLetters && cand.savedOfferLetters.length > 0 && (
                        <span className="px-1 py-0.2 rounded bg-amber-200/80 text-amber-950 font-mono text-[9px] font-bold">
                          {cand.savedOfferLetters.length} .docx
                        </span>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => onSelectCandidate(cand)}
                    className="px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 border border-slate-200 rounded hover:bg-slate-50 font-medium transition-colors"
                  >
                    View Dossier
                  </button>

                  {canEdit && (
                    <button
                      onClick={e => openConvertModal(e, cand)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Convert</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {candidates.length === 0 && (
          <div className="col-span-1 md:col-span-2 p-12 bg-white rounded-xl border border-slate-200 text-center text-xs text-slate-400">
            No candidates in pipeline. Use &ldquo;Register New Candidate&rdquo; to add upcoming joiners.
          </div>
        )}
      </div>

      {/* Upload Link Management & Generation Modal */}
      {currentSelectedCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Candidate Document Upload Portal Link
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    For <strong>{currentSelectedCand.fullName}</strong> ({currentSelectedCand.employeeCode})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setManagingLinkCand(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification alert */}
            {linkModalMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  linkModalMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}
              >
                {linkModalMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{linkModalMsg.text}</span>
              </div>
            )}

            {/* Current Token State */}
            {currentSelectedCand.uploadToken ? (
              <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Current Link Status
                  </span>
                  {currentSelectedCand.uploadToken.isUsed ? (
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Submitted & Expired (Used)
                    </span>
                  ) : currentSelectedCand.uploadToken.isRevoked || currentSelectedCand.uploadToken.revoked ? (
                    <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-400/30 flex items-center gap-1">
                      <Ban className="w-3 h-3" /> Revoked by HR
                    </span>
                  ) : new Date(currentSelectedCand.uploadToken.expiresAt).getTime() < Date.now() ? (
                    <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Expired
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active & Waiting for Candidate
                    </span>
                  )}
                </div>

                {/* Portal Link URL Input */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-300 block font-medium">
                    Secure Shareable Link URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/?uploadToken=${currentSelectedCand.uploadToken.token}`}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-amber-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/?uploadToken=${currentSelectedCand.uploadToken?.token}`;
                        navigator.clipboard.writeText(url);
                        setLinkModalCopied(true);
                        setTimeout(() => setLinkModalCopied(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
                    >
                      {linkModalCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                  <div>
                    <span>Expires: </span>
                    <strong className="text-slate-200">
                      {new Date(currentSelectedCand.uploadToken.expiresAt).toLocaleDateString()}
                    </strong>
                  </div>
                  <div>
                    <span>Mode: </span>
                    <strong className="text-amber-300">
                      {currentSelectedCand.uploadToken.isOneTime !== false ? 'Single-Use (One-Time)' : 'Multi-Use'}
                    </strong>
                  </div>
                </div>

                {/* Submissions count */}
                {typeof currentSelectedCand.uploadToken.submissionCount === 'number' && (
                  <div className="text-[11px] text-slate-400">
                    Submissions completed:{' '}
                    <strong className="text-white font-mono">
                      {currentSelectedCand.uploadToken.submissionCount}
                    </strong>
                  </div>
                )}

                {/* Active Action Buttons */}
                <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2 flex-wrap">
                  {onOpenCandidatePortal && (
                    <button
                      type="button"
                      onClick={() => {
                        if (currentSelectedCand.uploadToken) {
                          onOpenCandidatePortal(currentSelectedCand.uploadToken.token);
                          setManagingLinkCand(null);
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Portal As Candidate</span>
                    </button>
                  )}

                  {canEdit &&
                    !currentSelectedCand.uploadToken.isRevoked &&
                    !currentSelectedCand.uploadToken.revoked &&
                    !currentSelectedCand.uploadToken.isUsed && (
                      <button
                        type="button"
                        onClick={handleRevokeLinkInModal}
                        disabled={linkLoading}
                        className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Revoke Link Now</span>
                      </button>
                    )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                No active document upload link has been generated yet for this candidate.
              </div>
            )}

            {/* Generation & Configuration Section */}
            {canEdit && (
              <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/60 space-y-3.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {currentSelectedCand.uploadToken ? 'Regenerate Fresh Link' : 'Generate New Upload Link'}
                  </span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Validity Window Duration */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium block">Validity Duration</label>
                    <select
                      value={linkExpiryDays}
                      onChange={e => setLinkExpiryDays(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value={1}>24 Hours (1 Day)</option>
                      <option value={3}>3 Days</option>
                      <option value={7}>7 Days (Standard)</option>
                      <option value={14}>14 Days (2 Weeks)</option>
                      <option value={30}>30 Days (1 Month)</option>
                    </select>
                  </div>

                  {/* Single-Use vs Multi-Use Mode */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium block">Submission Expiry Rule</label>
                    <select
                      value={linkIsOneTime ? 'true' : 'false'}
                      onChange={e => setLinkIsOneTime(e.target.value === 'true')}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value="true">Single-Use (Auto-expire immediately upon submit)</option>
                      <option value="false">Multi-Use (Candidate can update until expiry)</option>
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  {linkIsOneTime
                    ? '🔒 High Security: Once the candidate submits their required documents, this link immediately closes to prevent unauthorized re-access.'
                    : '🔄 Flexible Mode: Candidate can return to this link anytime during the validity window to review or submit additional files.'}
                </p>

                <button
                  type="button"
                  onClick={handleGenerateLinkInModal}
                  disabled={linkLoading}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {linkLoading
                      ? 'Generating Link...'
                      : currentSelectedCand.uploadToken
                      ? 'Regenerate Fresh Link Anytime'
                      : 'Create & Activate Upload Link'}
                  </span>
                </button>
              </div>
            )}

            {/* Bottom Modal Close */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setManagingLinkCand(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Employee Modal */}
      {convertingCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-semibold text-sm text-slate-900">
                Confirm Official Onboarding & Employee Code
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Converting <strong>{convertingCand.fullName}</strong> from candidate status to active employee directory.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Official Employee Code</label>
                <input
                  type="text"
                  value={assignedCode}
                  onChange={e => setAssignedCode(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  placeholder="e.g. WCR-021"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Official Joining Date</label>
                <input
                  type="date"
                  value={confirmedDoj}
                  onChange={e => setConfirmedDoj(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Designated Desk Allocation</label>
                <input
                  type="text"
                  value={assignedDesk}
                  onChange={e => setAssignedDesk(e.target.value.toUpperCase())}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  placeholder="e.g. F1, F2, B3..."
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setConvertingCand(null)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmConversion}
                disabled={converting || !assignedCode}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {converting ? 'Converting...' : 'Confirm & Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
