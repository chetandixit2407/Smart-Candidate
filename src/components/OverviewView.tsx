import React from 'react';
import {
  Users,
  UserPlus,
  FileCheck,
  AlertTriangle,
  Armchair,
  Package,
  ArrowRight,
  Clock,
  CheckCircle2,
  Building2,
  Sparkles,
} from 'lucide-react';
import { Employee, DeskSlot, CompanyAsset, AuditLog, AlertItem } from '../types/index.js';
import { Cake, GraduationCap, Bell } from 'lucide-react';

interface OverviewViewProps {
  stats: {
    totalEmployees: number;
    upcomingJoiners: number;
    pendingDocuments: number;
    incompleteProfiles: number;
    assetsIssued: number;
    totalAssets: number;
    deskMetrics: {
      total: number;
      occupied: number;
      reserved: number;
      available: number;
    };
    recentLogs: AuditLog[];
  } | null;
  employees: Employee[];
  candidates: Employee[];
  desks: DeskSlot[];
  onSelectEmployee: (emp: Employee) => void;
  onNavigateTab: (tab: string) => void;
  alerts?: AlertItem[];
  onOpenAlertsModal?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  employees,
  candidates,
  desks,
  onSelectEmployee,
  onNavigateTab,
  alerts = [],
  onOpenAlertsModal,
}) => {
  if (!stats) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Loading executive metrics...
      </div>
    );
  }

  // Find Chetan Sharma for spotlight
  const chetan = employees.find(e => e.fullName.toLowerCase().includes('chetan'));

  // Calculate desk percentage
  const totalDesks = stats.deskMetrics.total || 37;
  const occupiedDesks = stats.deskMetrics.occupied || 0;
  const reservedDesks = stats.deskMetrics.reserved || 0;
  const deskOccupancyPercent = Math.round(((occupiedDesks + reservedDesks) / totalDesks) * 100);

  // Collect urgent missing/pending document items across all employees/candidates
  const pendingDocItems: Array<{ employee: Employee; docKey: string; docTitle: string; status: string }> = [];
  [...candidates, ...employees].forEach(emp => {
    if (emp.documents) {
      Object.values(emp.documents).forEach(d => {
        if (d.required && (d.status === 'Not Submitted' || d.status === 'Under Review' || d.status === 'Rejected')) {
          pendingDocItems.push({
            employee: emp,
            docKey: d.key,
            docTitle: d.title,
            status: d.status,
          });
        }
      });
    }
  });

  return (
    <div className="space-y-6">
      {/* 2-Day Advance Milestone Alert Notice Strip */}
      {alerts && alerts.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-blue-500/10 rounded-xl border border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-slate-950 font-bold shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900">
                  {alerts.length} Milestone {alerts.length === 1 ? 'Alert' : 'Alerts'} Scheduled in Next 2 Days
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                  Advance 2-Day Notice
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {alerts.map(a => `${a.fullName} (${a.type === 'BIRTHDAY' ? 'Birthday' : 'Internship Completion'} in ${a.daysRemaining === 0 ? 'Today' : `${a.daysRemaining}d`})`).join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onOpenAlertsModal && (
              <button
                onClick={onOpenAlertsModal}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                Review Upcoming Alerts
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div
          onClick={() => onNavigateTab('employees')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Total Employees</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {stats.totalEmployees}
            </span>
            <span className="text-[10px] text-emerald-600 font-medium">Active Team</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('candidates')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Upcoming Joiners</span>
            <UserPlus className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-blue-600 tabular-nums">
              {stats.upcomingJoiners}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Candidates</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('import')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Pending Documents</span>
            <FileCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-600 tabular-nums">
              {stats.pendingDocuments}
            </span>
            <span className="text-[10px] text-amber-700 font-medium">In Verification</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('employees')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Incomplete Profiles</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
              {stats.incompleteProfiles}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">&lt; 85% Score</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('desks')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Desks Allocated</span>
            <Armchair className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-indigo-600 tabular-nums">
              {occupiedDesks + reservedDesks} <span className="text-xs text-slate-400 font-normal">/ {totalDesks}</span>
            </span>
            <span className="text-[10px] text-indigo-600 font-mono font-medium">{deskOccupancyPercent}%</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('assets')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Assets Issued</span>
            <Package className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {stats.assetsIssued} <span className="text-xs text-slate-400 font-normal">/ {stats.totalAssets}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">In Use</span>
          </div>
        </div>
      </div>

      {/* Featured Dossier Spotlight: Chetan Dixit & Onboarding Profile */}
      {chetan && (
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-xl shadow-md border border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <img
                src="/src/assets/images/avatar_chetan_sharma_1793257665587.jpg"
                alt={chetan.fullName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border-2 border-amber-400 shadow-md shrink-0"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                    Source Dossier Spotlight · Chetan Information Sheet
                  </span>
                  <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-mono">
                    100% Verified Profile
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  {chetan.fullName} — {chetan.designation}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                  Unified with birthday roster and candidate information sheet. Assigned to <strong>Desk {chetan.desk || 'C2'}</strong> {chetan.sourceSpreadsheetSeat ? `(Spreadsheet Seat: ${chetan.sourceSpreadsheetSeat})` : ''}. All onboarding, banking, identity, and academic records verified.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => onSelectEmployee(chetan)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                Open Full Chetan Dossier
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Split: Pending Document Checklist vs Upcoming Joiners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Documents Queue */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Document Verification Backlog
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {pendingDocItems.length} Pending Actions
            </span>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-80">
            {pendingDocItems.slice(0, 8).map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {item.employee.fullName}
                    </p>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.employee.employeeCode}
                    </span>
                    {item.employee.isCandidate && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        Joiner
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {item.docTitle}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      item.status === 'Submitted'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : item.status === 'Under Review'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {item.status}
                  </span>
                  <button
                    onClick={() => onSelectEmployee(item.employee)}
                    className="text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 border border-slate-200"
                  >
                    Verify
                  </button>
                </div>
              </div>
            ))}

            {pendingDocItems.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                All employee and candidate documents are fully verified!
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Joiners Pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Upcoming Joiners Schedule
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('candidates')}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              View Pipeline
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-80">
            {candidates.map(cand => (
              <div
                key={cand.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {cand.fullName}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Joining: <strong>{cand.joiningDate}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {cand.designation} · {cand.department}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span>Reserved Desk: <strong className="text-slate-700 font-mono">{cand.desk || 'None'}</strong></span>
                    <span>·</span>
                    <span>Onboarding: <strong className="text-slate-700 font-mono">{cand.profileCompletion}%</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {cand.candidateStatus || 'Offer Accepted'}
                  </span>
                  <button
                    onClick={() => onSelectEmployee(cand)}
                    className="text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 border border-slate-200"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}

            {candidates.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                No upcoming joiners currently in the pipeline.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Log Strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
              Live Real-Time Activity Feed
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('audit')}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            Full Audit History →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.recentLogs.slice(0, 3).map(log => (
            <div
              key={log.id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold text-slate-800">{log.action}</span>
                <span className="font-mono text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-700 leading-snug line-clamp-2">{log.details}</p>
              <p className="text-[10px] text-slate-400 pt-1">
                By: <strong className="text-slate-600">{log.actor}</strong> ({log.actorRole})
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
