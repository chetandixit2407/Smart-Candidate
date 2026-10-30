import React, { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Mail,
  ArrowRight,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { AlertItem, UserRole } from '../types/index.js';

interface HRAlertsFloatingBannerProps {
  alerts: AlertItem[];
  onViewProfile: (personId: string) => void;
  onSendReminder: (candidateId: string, channel: 'EMAIL' | 'WHATSAPP') => void;
  onDismissAlert: (alertId: string) => Promise<void>;
  onDismissAllMissingDocs?: () => Promise<void>;
  userRole: UserRole;
  onOpenFullModal: () => void;
}

export const HRAlertsFloatingBanner: React.FC<HRAlertsFloatingBannerProps> = ({
  alerts,
  onViewProfile,
  onSendReminder,
  onDismissAlert,
  onDismissAllMissingDocs,
  userRole,
  onOpenFullModal,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissingAll, setDismissingAll] = useState(false);

  const canSendReminders = userRole === 'HR' || userRole === 'Co-Founder';

  // Filter specifically for candidates with missing required documents or overdue submissions
  const missingDocAlerts = alerts.filter(a => a.type === 'MISSING_DOCUMENTS');

  if (missingDocAlerts.length === 0) return null;

  const overdueCount = missingDocAlerts.filter(a => a.isOverdue).length;

  const handleDismiss = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    try {
      setDismissingId(alertId);
      await onDismissAlert(alertId);
    } finally {
      setDismissingId(null);
    }
  };

  const handleDismissBanner = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDismissingAll(true);
      if (onDismissAllMissingDocs) {
        await onDismissAllMissingDocs();
      } else {
        for (const a of missingDocAlerts) {
          await onDismissAlert(a.id);
        }
      }
    } finally {
      setDismissingAll(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full sm:w-[420px] bg-white rounded-2xl shadow-2xl border-2 border-amber-500 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header bar */}
      <div
        onClick={() => setIsMinimized(!isMinimized)}
        className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between cursor-pointer select-none border-b border-slate-800"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
            <AlertTriangle className="w-4 h-4 animate-bounce" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-2 truncate">
              HR Alert: Candidate Missing Documents
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                {missingDocAlerts.length} Pending
              </span>
            </h3>
            {overdueCount > 0 && (
              <p className="text-[10px] text-rose-300 font-semibold truncate">
                ⚠️ {overdueCount} candidate(s) overdue beyond 24h deadline!
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="p-1 text-slate-400 hover:text-white rounded"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleDismissBanner}
            disabled={dismissingAll}
            className="px-2 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white rounded border border-slate-700 hover:border-rose-500 flex items-center gap-1 transition-colors"
            title="Dismiss / Hide HR Alert: Candidate Missing Documents"
          >
            <X className="w-3 h-3" />
            <span>{dismissingAll ? 'Hiding...' : 'Dismiss'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Alert Content */}
      {!isMinimized && (
        <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 p-2 space-y-2 bg-slate-50">
          {missingDocAlerts.map(alert => {
            const isOverdue = alert.isOverdue;

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border transition-all ${
                  isOverdue
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
                }`}
              >
                {/* Top candidate summary row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {alert.fullName}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isOverdue
                            ? 'bg-rose-600 text-white'
                            : alert.remindersSentCount && alert.remindersSentCount > 0
                            ? 'bg-blue-100 text-blue-900 border border-blue-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {isOverdue ? 'OVERDUE >24H' : alert.submissionStatus || 'PENDING'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 truncate mt-0.5">
                      {alert.designation} · {alert.department}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={e => handleDismiss(e, alert.id)}
                    disabled={dismissingId === alert.id}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200/50 text-[10px] shrink-0"
                    title="Dismiss alert (prevents duplicates)"
                  >
                    {dismissingId === alert.id ? '...' : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Contact info */}
                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {alert.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {alert.email}
                  </span>
                </div>

                {/* Missing documents badges */}
                {alert.missingDocuments && alert.missingDocuments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                      Missing Checklist Items ({alert.missingDocuments.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {alert.missingDocuments.map((docTitle, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100/80 text-amber-950 font-medium border border-amber-200"
                        >
                          {docTitle}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deadline & Reminder count */}
                {alert.deadline && (
                  <div className="mt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Deadline: {new Date(alert.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>Reminders Sent: {alert.remindersSentCount || 0}</span>
                  </div>
                )}

                {/* Action Buttons: View Profile, Send Email, Send WhatsApp, Dismiss */}
                <div className={`grid ${canSendReminders ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 mt-2.5 pt-2 border-t border-slate-100`}>
                  {canSendReminders && (
                    <>
                      <button
                        type="button"
                        onClick={() => onSendReminder(alert.personId, 'WHATSAPP')}
                        className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                        title="Send WhatsApp 24-hour reminder"
                      >
                        <MessageSquare className="w-3 h-3" />
                        WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => onSendReminder(alert.personId, 'EMAIL')}
                        className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                        title="Send Email 24-hour reminder"
                      >
                        <Mail className="w-3 h-3" />
                        Email
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onViewProfile(alert.personId)}
                    className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                    title="Open Candidate Profile Dossier"
                  >
                    <User className="w-3 h-3" />
                    Profile
                  </button>

                  {!canSendReminders && (
                    <button
                      type="button"
                      onClick={e => handleDismiss(e, alert.id)}
                      disabled={dismissingId === alert.id}
                      className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors border border-slate-200"
                    >
                      <X className="w-3 h-3" />
                      {dismissingId === alert.id ? '...' : 'Hide Alert'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="p-1.5 text-center">
            <button
              type="button"
              onClick={onOpenFullModal}
              className="text-xs text-amber-700 hover:text-amber-900 font-bold hover:underline"
            >
              Open Full Compliance & Alerts Center →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
