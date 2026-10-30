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
  const [isMinimized, setIsMinimized] = useState(true);
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
    <div className="w-full bg-amber-50/90 border-b border-amber-300 shadow-xs shrink-0 z-20 transition-all overflow-hidden">
      {/* Header Bar - strictly within the main content area, never overlapping sidebar or top navigation */}
      <div
        onClick={() => setIsMinimized(!isMinimized)}
        className="px-3 sm:px-6 py-2.5 bg-gradient-to-r from-amber-100/90 via-amber-50 to-orange-50/80 text-slate-900 flex items-center justify-between cursor-pointer select-none gap-2"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="p-1 sm:p-1.5 rounded-lg bg-amber-500/20 text-amber-800 border border-amber-500/40 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-700 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1 flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2">
            <h3 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5 sm:gap-2 truncate">
              <span className="truncate">HR Alert: Candidate Missing Documents</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                {missingDocAlerts.length} Pending
              </span>
            </h3>
            {overdueCount > 0 && (
              <span className="text-[10px] sm:text-xs text-rose-700 font-semibold truncate bg-rose-100/80 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                ⚠️ {overdueCount} overdue beyond 24h deadline!
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="px-2 py-1 text-[11px] font-medium text-amber-900 bg-amber-200/60 hover:bg-amber-200 rounded flex items-center gap-1 transition-colors"
            title={isMinimized ? 'Expand notification details' : 'Minimize notification'}
          >
            <span>{isMinimized ? 'Show Candidates' : 'Hide'}</span>
            {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDismissBanner}
            disabled={dismissingAll}
            className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded border border-slate-300 hover:border-rose-300 flex items-center gap-1 transition-colors"
            title="Dismiss / Hide HR Alert: Candidate Missing Documents"
          >
            <X className="w-3 h-3" />
            <span className="hidden sm:inline">{dismissingAll ? 'Hiding...' : 'Dismiss'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Alert Content - Clean Grid of Candidate Cards */}
      {!isMinimized && (
        <div className="p-3 sm:p-5 max-h-[380px] overflow-y-auto space-y-3 bg-white/70 border-t border-amber-200">
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
            <span>The following candidates have pending mandatory checklist documents:</span>
            <button
              type="button"
              onClick={onOpenFullModal}
              className="text-xs text-amber-800 hover:text-amber-950 font-bold hover:underline"
            >
              Open Full Compliance Center →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {missingDocAlerts.map(alert => {
              const isOverdue = alert.isOverdue;

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                    isOverdue
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
                  }`}
                >
                  {/* Top candidate summary row */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                        title="Dismiss alert"
                      >
                        {dismissingId === alert.id ? '...' : <X className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Contact info */}
                    <div className="flex items-center gap-2.5 text-[10px] font-mono text-slate-600 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 truncate">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        {alert.phone}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        {alert.email}
                      </span>
                    </div>

                    {/* Missing documents badges */}
                    {alert.missingDocuments && alert.missingDocuments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                          Missing ({alert.missingDocuments.length}):
                        </p>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {alert.missingDocuments.map((docTitle, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-950 font-medium border border-amber-200 truncate max-w-[200px]"
                            >
                              {docTitle}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Deadline */}
                    {alert.deadline && (
                      <div className="mt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Deadline: {new Date(alert.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>Reminders: {alert.remindersSentCount || 0}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: WhatsApp, Email, Profile */}
                  <div className={`grid ${canSendReminders ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 pt-2 border-t border-slate-100`}>
                    {canSendReminders && (
                      <>
                        <button
                          type="button"
                          onClick={() => onSendReminder(alert.personId, 'WHATSAPP')}
                          className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                          title="Send WhatsApp 24-hour reminder"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSendReminder(alert.personId, 'EMAIL')}
                          className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                          title="Send Email 24-hour reminder"
                        >
                          <Mail className="w-3 h-3" />
                          <span>Email</span>
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
                      <span>Profile</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
