import React, { useState } from 'react';
import {
  X,
  Cake,
  GraduationCap,
  Bell,
  Calendar,
  User,
  Phone,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Building,
  Armchair,
} from 'lucide-react';
import { AlertItem, UserRole } from '../types/index.js';

interface UpcomingAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: AlertItem[];
  onDismissAlert: (alertId: string) => Promise<void>;
  onViewProfile: (personId: string) => void;
  referenceDate: string;
  onReferenceDateChange: (dateStr: string) => void;
  onResetDismissed: () => Promise<void>;
  userRole: UserRole;
}

export const UpcomingAlertsModal: React.FC<UpcomingAlertsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onDismissAlert,
  onViewProfile,
  referenceDate,
  onReferenceDateChange,
  onResetDismissed,
  userRole,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'BIRTHDAY' | 'INTERNSHIP_COMPLETION'>('ALL');
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const isViewer = userRole === 'DEPT_HEAD_VIEWER';

  const filteredAlerts = alerts.filter(a => {
    if (filterType === 'ALL') return true;
    return a.type === filterType;
  });

  const birthdayAlertsCount = alerts.filter(a => a.type === 'BIRTHDAY').length;
  const internshipAlertsCount = alerts.filter(a => a.type === 'INTERNSHIP_COMPLETION').length;

  const handleDismiss = async (alertId: string) => {
    try {
      setDismissingId(alertId);
      await onDismissAlert(alertId);
      setStatusMsg('Alert dismissed. Duplicate notifications for this event are prevented.');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch {
      setStatusMsg('Failed to dismiss alert.');
    } finally {
      setDismissingId(null);
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      await onResetDismissed();
      setStatusMsg('All dismissed alerts have been reset for testing.');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch {
      setStatusMsg('Failed to reset alerts.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Compliance & Milestone Alerts (2-Day Advance Notice)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                  {alerts.length} Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Automated on-screen notifications for upcoming employee birthdays and candidate internship completions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusMsg && (
          <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {statusMsg}
            </span>
            <button onClick={() => setStatusMsg('')} className="text-emerald-600 hover:text-emerald-900">✕</button>
          </div>
        )}

        {/* Date Testing & Filter Control Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-lg">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                filterType === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Alerts ({alerts.length})
            </button>
            <button
              onClick={() => setFilterType('BIRTHDAY')}
              className={`px-3 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors ${
                filterType === 'BIRTHDAY'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cake className="w-3.5 h-3.5 text-amber-600" />
              Birthdays ({birthdayAlertsCount})
            </button>
            <button
              onClick={() => setFilterType('INTERNSHIP_COMPLETION')}
              className={`px-3 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-colors ${
                filterType === 'INTERNSHIP_COMPLETION'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Internships ({internshipAlertsCount})
            </button>
          </div>

          {/* Reference Date Simulator */}
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium text-[11px] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Simulate Reference Date:
            </label>
            <input
              type="date"
              value={referenceDate}
              onChange={e => e.target.value && onReferenceDateChange(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 shadow-2xs"
            />
            {!isViewer && (
              <button
                onClick={handleReset}
                disabled={resetting}
                title="Reset all dismissed alerts to test duplicate prevention"
                className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Dismissed
              </button>
            )}
          </div>
        </div>

        {/* Alerts List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map(alert => {
              const isBirthday = alert.type === 'BIRTHDAY';

              return (
                <div
                  key={alert.id}
                  className={`p-5 rounded-xl border transition-all ${
                    isBirthday
                      ? 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 border-amber-300/80 shadow-xs'
                      : 'bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/40 border-blue-300/80 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Avatar & Profile Overview */}
                    <div className="flex items-start gap-4">
                      {/* Avatar / Photo */}
                      {alert.photoUrl ? (
                        <img
                          src={alert.photoUrl}
                          alt={alert.fullName}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-xl object-cover border-2 border-amber-400 shadow-sm shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold font-mono shadow-xs shrink-0 ${
                            isBirthday
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-100 text-blue-900 border border-blue-300'
                          }`}
                        >
                          {alert.fullName.charAt(0)}
                        </div>
                      )}

                      {/* Info Body */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 ${
                              isBirthday
                                ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                : 'bg-blue-100 text-blue-950 border border-blue-300'
                            }`}
                          >
                            {isBirthday ? (
                              <>
                                <Cake className="w-3 h-3 text-amber-700" />
                                Employee Birthday · Repeats Annually
                              </>
                            ) : (
                              <>
                                <GraduationCap className="w-3 h-3 text-blue-700" />
                                Candidate Internship Completion · Action Required
                              </>
                            )}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              alert.daysRemaining === 0
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : alert.daysRemaining === 1
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}
                          >
                            {alert.daysRemaining === 0
                              ? '⚠️ Today!'
                              : alert.daysRemaining === 1
                              ? '⏳ 1 Day Remaining (Tomorrow)'
                              : '🔔 Exactly 2 Days Remaining'}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          {alert.fullName}
                          {isBirthday && (
                            <span className="text-sm">🎂</span>
                          )}
                        </h3>

                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          <span className="font-semibold text-slate-800">{alert.designation}</span>
                          <span className="text-slate-300">·</span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <Building className="w-3 h-3 text-slate-400" />
                            {alert.department}
                          </span>
                          {alert.desk && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="flex items-center gap-1 font-mono text-slate-700">
                                <Armchair className="w-3 h-3 text-indigo-500" />
                                Desk {alert.desk}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Contact details */}
                        <div className="pt-1.5 flex items-center gap-4 text-xs font-mono text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {isViewer ? '••••••••••' : alert.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {alert.email}
                          </span>
                          {alert.joiningDate && (
                            <span className="text-slate-500 font-sans text-[11px]">
                              Joining: <strong className="font-mono">{alert.joiningDate}</strong>
                            </span>
                          )}
                        </div>

                        {/* Summary Narrative */}
                        <p className="text-xs text-slate-700 mt-2 bg-white/80 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                          {alert.summary}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 pt-2 sm:pt-0">
                      <button
                        onClick={() => {
                          onViewProfile(alert.personId);
                          onClose();
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors ${
                          isBirthday
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        View Full Profile
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDismiss(alert.id)}
                        disabled={dismissingId === alert.id}
                        className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                        title="Dismiss alert for this year / milestone (prevents duplicate alerts)"
                      >
                        {dismissingId === alert.id ? 'Dismissing...' : 'Dismiss Alert'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">
                No Active Alerts for {new Date(referenceDate).toLocaleDateString(undefined, { dateStyle: 'full' })}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No employee birthdays or internship completions are scheduled within the next 2 days from this reference date.
              </p>

              {/* Quick simulation dates */}
              <div className="pt-3 border-t border-slate-200/80 max-w-lg mx-auto">
                <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Test & Verify Dates from Actual Imported Sheets:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => onReferenceDateChange('2026-10-29')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors"
                  >
                    📅 2026-10-29 (Aryan Birthday & Simran Completion in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-08')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors"
                  >
                    📅 2026-11-08 (Pooja DM Intern Completion in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-19')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors"
                  >
                    📅 2026-11-19 (Kimmi Mam Birthday in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-28')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors"
                  >
                    📅 2026-11-28 (Chetan Dixit AI Completion in 2 Days)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Automated 2-day reminder engine active. Duplicate notifications prevented.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
          >
            Close Notification Center
          </button>
        </div>
      </div>
    </div>
  );
};
