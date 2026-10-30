import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  MessageSquare,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Copy,
  ExternalLink,
  Calendar,
  Sparkles,
  Phone,
  User,
  History,
} from 'lucide-react';
import { Employee, DocumentRecord, UserRole } from '../types/index.js';
import { api } from '../services/api.js';

interface CandidateReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Employee;
  userRole: UserRole;
  initialChannel?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  onReminderSent?: (updatedCandidate: Employee) => void;
}

export const CandidateReminderModal: React.FC<CandidateReminderModalProps> = ({
  isOpen,
  onClose,
  candidate,
  userRole,
  initialChannel = 'BOTH',
  onReminderSent,
}) => {
  const [channel, setChannel] = useState<'EMAIL' | 'WHATSAPP' | 'BOTH'>(initialChannel);
  const [deadlineHours, setDeadlineHours] = useState<number>(24);
  const [selectedDocKeys, setSelectedDocKeys] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [messageBody, setMessageBody] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>(candidate.email || '');
  const [recipientPhone, setRecipientPhone] = useState<string>(candidate.phone || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [dispatchedResult, setDispatchedResult] = useState<{
    deliveryResults?: {
      email?: { ok: boolean; provider: string; recipient: string; messageId?: string; error?: string };
      whatsapp?: { ok: boolean; provider: string; recipient: string; messageId?: string; error?: string };
    };
    uploadUrl?: string;
    message?: string;
  } | null>(null);
  const canSend = userRole === 'HR' || userRole === 'Co-Founder';

  // Identify missing required documents
  const allDocs = Object.values(candidate.documents || {});
  const missingRequiredDocs: DocumentRecord[] = allDocs.filter(
    d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
  );

  useEffect(() => {
    if (initialChannel) setChannel(initialChannel);
  }, [initialChannel]);

  useEffect(() => {
    setSelectedDocKeys(missingRequiredDocs.map(d => d.key));
    setRecipientEmail(candidate.email || '');
    setRecipientPhone(candidate.phone || '');
    setDispatchedResult(null);
  }, [candidate]);

  // Construct message template whenever dependencies change
  useEffect(() => {
    const selectedTitles = missingRequiredDocs
      .filter(d => selectedDocKeys.includes(d.key))
      .map(d => d.title);

    const docListFormatted =
      selectedTitles.length > 0
        ? selectedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : '• All required documents currently on file.';

    const host = window.location.origin;
    const token = candidate.uploadToken?.token || '';
    const portalUrl = token ? `${host}/upload-portal/${token}` : `${host}?uploadToken=pending`;

    const deadlineDate = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
    const formattedDeadline = deadlineDate.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `Action Required: Missing Onboarding Documents (${candidate.fullName}) - White Collar Realty`;
    const body =
      `Dear ${candidate.fullName},\n\n` +
      `Congratulations on your upcoming role as ${candidate.designation} in ${candidate.department} at White Collar Realty!\n\n` +
      `Our HR compliance team has reviewed your pre-onboarding dossier and noticed that the following mandatory document(s) are still pending submission:\n\n` +
      `${docListFormatted}\n\n` +
      `To ensure timely preparation of your appointment docket and designated office desk, please upload high-resolution scanned copies within ${deadlineHours} hours via your private upload link:\n` +
      `${portalUrl}\n\n` +
      `Strict Submission Deadline: ${formattedDeadline}\n\n` +
      `For any questions or clarification, please reply directly to this message or contact HR at hr@whitecollarrealty.com / +91 124-4349007.\n\n` +
      `Warm regards,\n` +
      `Corporate HR Team\n` +
      `White Collar Realty Private Limited\n` +
      `6th floor, TOWER-A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana`;

    setEmailSubject(subject);
    setMessageBody(body);
  }, [candidate, selectedDocKeys, deadlineHours]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const toggleDocSelection = (key: string) => {
    setSelectedDocKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleCopyLink = () => {
    const host = window.location.origin;
    const token = candidate.uploadToken?.token;
    const link = token ? `${host}/upload-portal/${token}` : `${host}?uploadToken=pending`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
    showToast('Secure candidate upload link copied to clipboard.');
  };

  const handleSendReminder = async () => {
    if (!canSend) {
      showToast('Only HR and Co-Founder roles can dispatch candidate reminders.');
      return;
    }
    if (!recipientEmail && (channel === 'EMAIL' || channel === 'BOTH')) {
      showToast('Please provide a valid recipient email address.');
      return;
    }
    if (!recipientPhone && (channel === 'WHATSAPP' || channel === 'BOTH')) {
      showToast('Please provide a valid recipient phone number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.sendDocumentReminder(candidate.id, {
        channel,
        missingDocumentKeys: selectedDocKeys,
        deadlineHours,
        messageBody,
        emailSubject,
        recipientEmail,
        recipientPhone,
      });

      setDispatchedResult({
        deliveryResults: res.deliveryResults,
        uploadUrl: res.uploadUrl,
        message: res.message,
      });

      if (onReminderSent && res.candidate) {
        onReminderSent(res.candidate);
      }

      const emailOk = res.deliveryResults?.email ? res.deliveryResults.email.ok : true;
      const waOk = res.deliveryResults?.whatsapp ? res.deliveryResults.whatsapp.ok : true;

      if (emailOk && waOk) {
        showToast(`Reminder dispatched via real ${channel} API and logged!`);
      } else {
        showToast('Reminder logged; check real API provider credentials / delivery status below.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to dispatch document reminder.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reminderHistory = candidate.documentReminders || [];

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-auto overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 truncate">
                Missing Document Reminder
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                  24-Hour Notice
                </span>
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Candidate: <strong className="text-white">{candidate.fullName}</strong> ({candidate.designation} · {candidate.department})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-4 sm:px-6 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('compose')}
              className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'compose'
                  ? 'border-amber-600 text-slate-900 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-amber-600" />
              Compose & Dispatch
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-amber-600 text-slate-900 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              Reminder Audit History ({reminderHistory.length})
            </button>
          </div>

          <button
            onClick={handleCopyLink}
            className="text-[11px] font-semibold text-slate-700 hover:text-slate-950 flex items-center gap-1 bg-white px-2.5 py-1 rounded border border-slate-300 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <Copy className="w-3 h-3 text-slate-500" />
            {copiedLink ? 'Copied Link!' : 'Copy Upload Link'}
          </button>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold text-center shrink-0 animate-fade-in flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'compose' ? (
            <>
              {/* Dispatched Results Banner (Real Email & WhatsApp API Status) */}
              {dispatchedResult && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Reminder Recorded & Real API Dispatch Executed</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {dispatchedResult.deliveryResults?.email && (
                      <div
                        className={`p-2 rounded-lg border flex items-start justify-between gap-2 ${
                          dispatchedResult.deliveryResults.email.ok
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <div>
                          <strong>Email ({dispatchedResult.deliveryResults.email.provider}):</strong>{' '}
                          {dispatchedResult.deliveryResults.email.ok
                            ? `SENT to ${dispatchedResult.deliveryResults.email.recipient}`
                            : `FAILED — ${dispatchedResult.deliveryResults.email.error || 'Provider error'}`}
                        </div>
                        <span className="font-mono font-bold shrink-0">
                          {dispatchedResult.deliveryResults.email.ok ? 'SENT' : 'FAILED'}
                        </span>
                      </div>
                    )}
                    {dispatchedResult.deliveryResults?.whatsapp && (
                      <div
                        className={`p-2 rounded-lg border flex items-start justify-between gap-2 ${
                          dispatchedResult.deliveryResults.whatsapp.ok
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <div>
                          <strong>WhatsApp ({dispatchedResult.deliveryResults.whatsapp.provider}):</strong>{' '}
                          {dispatchedResult.deliveryResults.whatsapp.ok
                            ? `SENT to ${dispatchedResult.deliveryResults.whatsapp.recipient}`
                            : `FAILED — ${dispatchedResult.deliveryResults.whatsapp.error || 'Provider error'}`}
                        </div>
                        <span className="font-mono font-bold shrink-0">
                          {dispatchedResult.deliveryResults.whatsapp.ok ? 'SENT' : 'FAILED'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 1. Missing Documents Checklist Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                    Pending Mandatory Documents ({missingRequiredDocs.length})
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Checked items will be listed in the message
                  </span>
                </div>

                {missingRequiredDocs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {missingRequiredDocs.map(doc => {
                      const isChecked = selectedDocKeys.includes(doc.key);
                      return (
                        <div
                          key={doc.key}
                          onClick={() => toggleDocSelection(doc.key)}
                          className={`p-2 rounded-lg border text-xs cursor-pointer flex items-start gap-2.5 transition-colors select-none ${
                            isChecked
                              ? 'bg-amber-50/80 border-amber-300 text-slate-900 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{doc.title}</p>
                            <span className="text-[10px] text-amber-700 font-mono">
                              Status: {doc.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>All required documents for this candidate are currently verified or submitted!</span>
                  </div>
                )}
              </div>

              {/* 2. Dispatch Channel & Deadline Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Channel Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Dispatch Channel</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setChannel('WHATSAPP')}
                      className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                        channel === 'WHATSAPP'
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('EMAIL')}
                      className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                        channel === 'EMAIL'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('BOTH')}
                      className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                        channel === 'BOTH'
                          ? 'bg-slate-900 text-amber-400 border-slate-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Both
                    </button>
                  </div>
                </div>

                {/* Deadline Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Submission Window</span>
                    <span className="text-[10px] text-amber-700 font-mono font-normal">
                      Default: 24 Hours
                    </span>
                  </label>
                  <select
                    value={deadlineHours}
                    onChange={e => setDeadlineHours(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value={24}>24 Hours (Standard Urgent Notice)</option>
                    <option value={48}>48 Hours (2 Days Window)</option>
                    <option value={72}>72 Hours (3 Days Window)</option>
                  </select>
                </div>
              </div>

              {/* 3. Recipient Verification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    placeholder="candidate@example.com"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    Recipient Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={e => setRecipientPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* 4. Subject Line (for Email) */}
              {(channel === 'EMAIL' || channel === 'BOTH') && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Email Subject Line</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* 5. Message Body */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center justify-between">
                  <span>Personalized Message Content</span>
                  <span className="text-[10px] text-slate-400">Editable template text</span>
                </label>
                <textarea
                  rows={8}
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs font-mono leading-relaxed text-slate-800 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-y"
                />
              </div>

              {/* Disclaimer */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Real API Delivery & Audit Log:</strong> Dispatches execute server-side via configured SMTP / Resend Email API and Meta WhatsApp Cloud / Twilio WhatsApp API, recording exact provider message IDs, HTTP status codes, and delivery logs.
                </p>
              </div>
            </>
          ) : (
            /* Reminder Audit History Tab */
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Historical Reminders Sent to {candidate.fullName}
              </h3>
              {reminderHistory.length > 0 ? (
                <div className="space-y-2.5">
                  {reminderHistory.map((rem, idx) => (
                    <div
                      key={rem.id || idx}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          {new Date(rem.sentAt).toLocaleString()}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
                          Channel: {rem.channel}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        Dispatched by: <strong className="text-slate-800">{rem.sentBy}</strong> ({rem.sentByRole}) to {rem.recipientEmail || rem.recipientPhone}
                      </p>
                      <div className="text-[11px] text-slate-500">
                        Pending Documents Listed:{' '}
                        <span className="font-semibold text-slate-700">
                          {rem.missingDocumentTitles?.join(', ') || 'Standard checklist'}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                        Deadline: {new Date(rem.deadline).toLocaleString()} · Status: {rem.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2 text-slate-500">
                  <Clock className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700">No Reminders Sent Yet</p>
                  <p className="text-[11px]">
                    Use the compose tab to dispatch the first 24-hour missing document notice.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-6 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          {activeTab === 'compose' && canSend && (
            <button
              type="button"
              disabled={isSubmitting || selectedDocKeys.length === 0}
              onClick={handleSendReminder}
              className={`px-5 py-2 rounded-lg text-xs font-bold text-white shadow-xs flex items-center gap-1.5 transition-all ${
                channel === 'WHATSAPP'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : channel === 'EMAIL'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-400'
              } disabled:opacity-50`}
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting ? 'Dispatching...' : `Dispatch ${channel} Reminder (24h)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
