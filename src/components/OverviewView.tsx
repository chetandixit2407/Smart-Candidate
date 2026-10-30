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
  QrCode,
  UploadCloud,
} from 'lucide-react';
import {
  Employee,
  DeskSlot,
  CompanyAsset,
  AuditLog,
  AlertItem,
  DepartmentWithCounts,
  LiveQrUploadEvent,
} from '../types/index.js';
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
  onDismissMissingDocAlerts?: () => Promise<void>;
  departments?: DepartmentWithCounts[];
  liveQrFeed?: LiveQrUploadEvent[];
  onOpenQrModal?: (emp: Employee) => void;
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
  onDismissMissingDocAlerts,
  departments = [],
  liveQrFeed = [],
  onOpenQrModal,
}) => {
  const [dismissingMissingDocs, setDismissingMissingDocs] = React.useState(false);
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

  // Collect urgent missing/pending/uploaded document items across all employees/candidates
  const pendingDocItems: Array<{ employee: Employee; docKey: string; docTitle: string; status: string }> = [];
  [...candidates, ...employees].forEach(emp => {
    if (emp.documents) {
      Object.values(emp.documents).forEach(d => {
        if (
          d.status === 'Uploaded' ||
          d.status === 'Submitted' ||
          (d.required &&
            (d.status === 'Missing' ||
              d.status === 'Not Submitted' ||
              d.status === 'Under Review' ||
              d.status === 'Rejected'))
        ) {
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
  pendingDocItems.sort((a, b) => {
    const score = (s: string) => (s === 'Uploaded' ? 0 : s === 'Submitted' ? 1 : 2);
    return score(a.status) - score(b.status);
  });

  const missingDocAlerts = alerts.filter(a => a.type === 'MISSING_DOCUMENTS');

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      {/* Real-Time Live QR Document Upload Feed & Notifications */}
      {liveQrFeed.length > 0 && (
        <div className="p-4 bg-slate-900 text-white rounded-xl border border-indigo-500/40 shadow-md space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <span>Live 24-Hour QR Document Upload Monitor</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Real-Time Sync
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Live candidate QR scans, streaming file upload progress, and instant status updates (Missing → Uploaded → Verified).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {liveQrFeed.slice(0, 4).map(ev => {
              const matchedPerson = [...candidates, ...employees].find(p => p.id === ev.employeeId);
              return (
                <div
                  key={`${ev.employeeId}-${ev.docKey || 'open'}-${ev.timestamp}`}
                  className="p-3 bg-slate-800/90 rounded-lg border border-slate-700 flex flex-col justify-between gap-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-white truncate">{ev.employeeName}</span>
                        <span className="text-[10px] font-mono text-slate-400">({ev.department})</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                        {ev.status === 'OPENED'
                          ? 'Opened mobile 24h QR upload page'
                          : ev.status === 'UPLOADING'
                            ? `Uploading ${ev.docTitle || 'document'} (${ev.fileName || ''})`
                            : `Uploaded ${ev.docTitle || 'document'} — Status: Uploaded`}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 tabular-nums ${
                        ev.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : ev.status === 'UPLOADING'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                      }`}
                    >
                      {ev.status === 'UPLOADING'
                        ? `${ev.progress}%`
                        : ev.status === 'COMPLETED'
                          ? 'Uploaded'
                          : 'QR Scanned'}
                    </span>
                  </div>

                  {ev.status === 'UPLOADING' && (
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 transition-all duration-150"
                        style={{ width: `${ev.progress}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                    <span className="font-mono tabular-nums">
                      {new Date(ev.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    {matchedPerson && (
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(matchedPerson)}
                        className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <span>Review & Verify</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Dismissible Dashboard HR Alert: Candidate Missing Documents */}
      {missingDocAlerts.length > 0 && (
        <div className="p-3.5 sm:p-4 bg-amber-50 rounded-xl border border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-800 border border-amber-400/50 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900">
                  HR Alert: Candidate Missing Documents
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                  {missingDocAlerts.length} Pending
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5 break-words">
                {missingDocAlerts.map(a => `${a.fullName} (${a.missingDocuments?.length || 0} missing)`).join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {onOpenAlertsModal && (
              <button
                type="button"
                onClick={onOpenAlertsModal}
                className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                View Details
              </button>
            )}
            {onDismissMissingDocAlerts && (
              <button
                type="button"
                disabled={dismissingMissingDocs}
                onClick={async () => {
                  try {
                    setDismissingMissingDocs(true);
                    await onDismissMissingDocAlerts();
                  } finally {
                    setDismissingMissingDocs(false);
                  }
                }}
                className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
                title="Dismiss / Hide HR Alert: Candidate Missing Documents"
              >
                {dismissingMissingDocs ? 'Hiding...' : 'Dismiss / Hide'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2-Day Advance Milestone Alert Notice Strip */}
      {alerts && alerts.length > 0 && (
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-blue-500/10 rounded-xl border border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-amber-500 text-slate-950 font-bold shrink-0 mt-0.5 sm:mt-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900">
                  {alerts.length} Compliance / Milestone {alerts.length === 1 ? 'Alert' : 'Alerts'} Active
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0">
                  Advance 2-Day Notice
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 break-words line-clamp-2 sm:line-clamp-none">
                {alerts
                  .map(a =>
                    a.type === 'MISSING_DOCUMENTS'
                      ? `${a.fullName} (Missing Documents)`
                      : `${a.fullName} (${a.type === 'BIRTHDAY' ? 'Birthday' : 'Internship Completion'} in ${a.daysRemaining === 0 ? 'Today' : `${a.daysRemaining}d`})`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {onOpenAlertsModal && (
              <button
                onClick={onOpenAlertsModal}
                className="w-full sm:w-auto justify-center px-3.5 py-2 sm:py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>Review Upcoming Alerts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
        <div
          onClick={() => onNavigateTab('employees')}
          className="p-3 sm:p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs min-w-0"
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
          onClick={() => onNavigateTab('candidates')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-xs"
          title="Manage issued assets inside each candidate or employee profile"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Assets Issued</span>
            <Package className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {stats.assetsIssued} <span className="text-xs text-slate-400 font-normal">/ {stats.totalAssets}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">In Profiles</span>
          </div>
        </div>
      </div>

      {/* Department-Wise Headcount & Quick Access Strip */}
      {departments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Department-Wise Roster Breakdown
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('departments')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Departments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {departments.map(dept => (
              <button
                key={dept.id}
                type="button"
                onClick={() => onNavigateTab('departments')}
                className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-left transition-colors cursor-pointer"
              >
                <p className="text-[11px] font-semibold text-slate-900 truncate">{dept.name}</p>
                <div className="mt-1 flex items-baseline justify-between gap-1 font-mono tabular-nums">
                  <span className="text-sm font-bold text-slate-900">{dept.totalCount}</span>
                  <span className="text-[10px] text-slate-500">
                    {dept.employeeCount}E · {dept.candidateCount}C
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Featured Dossier Spotlight: Chetan Dixit & Onboarding Profile */}
      {chetan && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-xl shadow-md border border-slate-800 w-full min-w-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 min-w-0">
            <div className="flex flex-col xs:flex-row items-start gap-3 sm:gap-4 min-w-0 flex-1">
              <img
                src="/src/assets/images/avatar_chetan_sharma_1793257665587.jpg"
                alt={chetan.fullName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border-2 border-amber-400 shadow-md shrink-0"
              />
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                    Source Dossier Spotlight · Chetan Information Sheet
                  </span>
                  <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-mono shrink-0">
                    100% Verified Profile
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {chetan.fullName} — {chetan.designation}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-3xl break-words">
                  Unified with birthday roster and candidate information sheet. Assigned to <strong>Desk {chetan.desk || 'C2'}</strong> {chetan.sourceSpreadsheetSeat ? `(Spreadsheet Seat: ${chetan.sourceSpreadsheetSeat})` : ''}. All onboarding, banking, identity, and academic records verified.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 w-full lg:w-auto">
              <button
                onClick={() => onSelectEmployee(chetan)}
                className="w-full lg:w-auto justify-center px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span>Open Full Chetan Dossier</span>
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
                className="px-3.5 sm:px-5 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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
                      item.status === 'Uploaded'
                        ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold'
                        : item.status === 'Submitted'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : item.status === 'Under Review'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {item.status}
                  </span>
                  {onOpenQrModal && (item.status === 'Missing' || item.status === 'Not Submitted' || item.status === 'Rejected') && (
                    <button
                      type="button"
                      onClick={() => onOpenQrModal(item.employee)}
                      className="p-1 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition-colors cursor-pointer"
                      title="Generate 24h Document QR"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onSelectEmployee(item.employee)}
                    className="text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 border border-slate-200 transition-colors"
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
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
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
                className="px-3.5 sm:px-5 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                    <span>Reserved Desk: <strong className="text-slate-700 font-mono">{cand.desk || 'None'}</strong></span>
                    <span className="hidden sm:inline">·</span>
                    <span>Onboarding: <strong className="text-slate-700 font-mono">{cand.profileCompletion}%</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {cand.candidateStatus || 'Offer Accepted'}
                  </span>
                  <button
                    onClick={() => onSelectEmployee(cand)}
                    className="text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 border border-slate-200 transition-colors"
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
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-5 shadow-xs w-full min-w-0">
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
              className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1 min-w-0"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold text-slate-800">{log.action}</span>
                <span className="font-mono text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-700 leading-snug line-clamp-2 break-words">{log.details}</p>
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
