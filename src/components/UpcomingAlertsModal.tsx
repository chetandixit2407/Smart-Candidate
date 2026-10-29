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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-start sm:items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5 sm:mt-0">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-white truncate sm:text-clip">
                  Compliance & Milestone Alerts
                </h2>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                  {alerts.length} Active
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 line-clamp-1 sm:line-clamp-none">
                2-day advance notifications for birthdays and candidate internship completions.
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

        {/* Status Toast Banner */}
        {statusMsg && (
          <div className="px-4 sm:px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-[11px] sm:text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {statusMsg}
            </span>
            <button onClick={() => setStatusMsg('')} className="text-emerald-600 hover:text-emerald-900 ml-2">✕</button>
          </div>
        )}

        {/* Date Testing & Filter Control Bar */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 text-xs shrink-0">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 sm:px-3 py-1 rounded-md font-medium text-[11px] sm:text-xs whitespace-nowrap transition-colors ${
                filterType === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setFilterType('BIRTHDAY')}
              className={`px-2.5 sm:px-3 py-1 rounded-md font-medium text-[11px] sm:text-xs flex items-center gap-1 whitespace-nowrap transition-colors ${
                filterType === 'BIRTHDAY'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cake className="w-3 h-3 text-amber-700" />
              Birthdays ({birthdayAlertsCount})
            </button>
            <button
              onClick={() => setFilterType('INTERNSHIP_COMPLETION')}
              className={`px-2.5 sm:px-3 py-1 rounded-md font-medium text-[11px] sm:text-xs flex items-center gap-1 whitespace-nowrap transition-colors ${
                filterType === 'INTERNSHIP_COMPLETION'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3 h-3" />
              Internships ({internshipAlertsCount})
            </button>
          </div>

          {/* Reference Date Simulator */}
          <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
            <label className="text-slate-500 font-medium text-[11px] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Simulate Date:
            </label>
            <div className="flex items-center gap-1.5">
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
                  className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Alerts List Container */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3 sm:space-y-4">
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
                    <div className="flex flex-row sm:flex-col items-stretch sm:items-end justify-between sm:justify-start gap-2 shrink-0 pt-2 sm:pt-0 w-full sm:w-auto border-t sm:border-t-0 border-slate-100">
                      <button
                        onClick={() => {
                          onViewProfile(alert.personId);
                          onClose();
                        }}
                        className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors ${
                          isBirthday
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        View Profile
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDismiss(alert.id)}
                        disabled={dismissingId === alert.id}
                        className="px-3 py-2 sm:py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 whitespace-nowrap"
                        title="Dismiss alert for this year / milestone (prevents duplicate alerts)"
                      >
                        {dismissingId === alert.id ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-5 sm:p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
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
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  <button
                    onClick={() => onReferenceDateChange('2026-10-29')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors text-left"
                  >
                    📅 2026-10-29 (Aryan & Simran in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-08')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors text-left"
                  >
                    📅 2026-11-08 (Pooja Intern in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-19')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors text-left"
                  >
                    📅 2026-11-19 (Kimmi Mam Birthday in 2 Days)
                  </button>
                  <button
                    onClick={() => onReferenceDateChange('2026-11-28')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 rounded text-xs text-slate-700 font-mono transition-colors text-left"
                  >
                    📅 2026-11-28 (Chetan AI Intern in 2 Days)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 text-xs text-slate-500">
          <div className="flex items-center gap-2 text-center sm:text-left text-[11px] sm:text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>2-day reminder engine active. Duplicate notifications prevented.</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 sm:py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs text-center"
          >
            Close Alerts
          </button>
        </div>
      </div>
    </div>
  );
};
