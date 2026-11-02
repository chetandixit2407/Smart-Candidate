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
  Building2,
  QrCode,
  Bell,
} from 'lucide-react';
import {
  Employee,
  DeskSlot,
  AuditLog,
  AlertItem,
  DepartmentWithCounts,
  LiveQrUploadEvent,
} from '../types/index.js';

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
  desks: _desks,
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
    <div className="space-y-5 sm:space-y-6 w-full min-w-0 perspective-container">
      {/* Real-Time Live QR Document Upload Feed & Notifications with 3D Glass Depth */}
      {liveQrFeed.length > 0 && (
        <div className="p-4 sm:p-5 card-3d-dark text-white rounded-2xl space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 flex-wrap relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/30 to-indigo-700/20 text-indigo-300 border border-indigo-400/40 shadow-inner">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <span>Live 24-Hour QR Document Upload Monitor</span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono badge-3d">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Real-Time Sync
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300">
                  Live candidate QR scans, streaming file upload progress, and instant status updates (Missing → Uploaded → Verified).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
            {liveQrFeed.slice(0, 4).map(ev => {
              const matchedPerson = [...candidates, ...employees].find(p => p.id === ev.employeeId);
              return (
                <div
                  key={`${ev.employeeId}-${ev.docKey || 'open'}-${ev.timestamp}`}
                  className="p-3.5 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700/80 hover:border-slate-600 transition-all duration-200 flex flex-col justify-between gap-2 text-xs shadow-md"
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
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 tabular-nums badge-3d ${
                        ev.status === 'COMPLETED'
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                          : ev.status === 'UPLOADING'
                            ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-400/40'
                            : 'bg-amber-500/25 text-amber-300 border border-amber-400/40'
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
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-150"
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
                        className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 cursor-pointer transition-transform hover:translate-x-0.5"
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
        <div className="p-3.5 sm:p-4 bg-amber-50/90 rounded-2xl border border-amber-300/90 shadow-3d-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-800 border border-amber-400/60 shadow-inner shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900">
                  HR Alert: Candidate Missing Documents
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0 badge-3d">
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
                className="btn-3d-dark flex-1 sm:flex-none px-3.5 py-1.5 text-xs"
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
                className="btn-3d-white flex-1 sm:flex-none px-3 py-1.5 text-xs"
                title="Dismiss / Hide HR Alert: Candidate Missing Documents"
              >
                {dismissingMissingDocs ? 'Hiding...' : 'Dismiss / Hide'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2-Day Advance Milestone Alert Notice Strip with Glass Depth */}
      {alerts && alerts.length > 0 && (
        <div className="p-3.5 sm:p-4 glass-panel-gold rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold shrink-0 mt-0.5 sm:mt-0 shadow-[0_2px_8px_rgba(217,119,6,0.35),inset_0_1px_0_rgba(255,255,255,0.4)]">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900">
                  {alerts.length} Compliance / Milestone {alerts.length === 1 ? 'Alert' : 'Alerts'} Active
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 shrink-0 badge-3d">
                  Advance 2-Day Notice
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5 break-words line-clamp-2 sm:line-clamp-none">
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
                className="btn-3d-dark w-full sm:w-auto px-4 py-2 text-xs flex items-center gap-1.5"
              >
                <span>Review Upcoming Alerts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3D Elevated KPI Cards Strip with Tactile Hover Lift & Realistic Shadows */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Employees */}
        <div
          onClick={() => onNavigateTab('employees')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Total Employees</span>
            <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-amber-100 group-hover:text-amber-700 text-slate-500 transition-colors shadow-xs">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums tracking-tight">
              {stats.totalEmployees}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              Active Team
            </span>
          </div>
        </div>

        {/* Upcoming Joiners */}
        <div
          onClick={() => onNavigateTab('candidates')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Upcoming Joiners</span>
            <div className="p-1.5 rounded-lg bg-blue-50 group-hover:bg-blue-100 text-blue-600 transition-colors shadow-xs">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-blue-600 tabular-nums tracking-tight">
              {stats.upcomingJoiners}
            </span>
            <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              Candidates
            </span>
          </div>
        </div>

        {/* Pending Documents */}
        <div
          onClick={() => onNavigateTab('import')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Pending Documents</span>
            <div className="p-1.5 rounded-lg bg-amber-50 group-hover:bg-amber-100 text-amber-600 transition-colors shadow-xs">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-600 tabular-nums tracking-tight">
              {stats.pendingDocuments}
            </span>
            <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Verification
            </span>
          </div>
        </div>

        {/* Incomplete Profiles */}
        <div
          onClick={() => onNavigateTab('employees')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Incomplete Profiles</span>
            <div className="p-1.5 rounded-lg bg-rose-50 group-hover:bg-rose-100 text-rose-500 transition-colors shadow-xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-600 tabular-nums tracking-tight">
              {stats.incompleteProfiles}
            </span>
            <span className="text-[10px] text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              &lt; 85%
            </span>
          </div>
        </div>

        {/* Desks Allocated */}
        <div
          onClick={() => onNavigateTab('desks')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Desks Allocated</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 transition-colors shadow-xs">
              <Armchair className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-600 tabular-nums tracking-tight">
              {occupiedDesks + reservedDesks}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ {totalDesks}</span>
            <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 ml-auto">
              {deskOccupancyPercent}%
            </span>
          </div>
        </div>

        {/* Assets Issued */}
        <div
          onClick={() => onNavigateTab('candidates')}
          className="card-3d-interactive p-3.5 sm:p-4.5 flex flex-col justify-between group"
          title="Manage issued assets inside each candidate or employee profile"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold group-hover:text-slate-900 transition-colors">Assets Issued</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 transition-colors shadow-xs">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums tracking-tight">
              {stats.assetsIssued}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ {stats.totalAssets}</span>
            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 ml-auto">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Department-Wise Headcount & Quick Access Strip */}
      {departments.length > 0 && (
        <div className="card-3d p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80 shadow-xs">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Department-Wise Roster Breakdown
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('departments')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer transition-transform hover:translate-x-0.5"
            >
              <span>Manage Departments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2.5">
            {departments.map(dept => (
              <button
                key={dept.id}
                type="button"
                onClick={() => onNavigateTab('departments')}
                className="p-3 bg-gradient-to-b from-slate-50 to-slate-100/60 hover:from-white hover:to-amber-50/50 rounded-xl border border-slate-200/90 hover:border-amber-300 text-left transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 group"
              >
                <p className="text-[11px] font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                  {dept.name}
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-1 font-mono tabular-nums">
                  <span className="text-base font-extrabold text-slate-900">{dept.totalCount}</span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {dept.employeeCount}E · {dept.candidateCount}C
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Featured Dossier Spotlight: Chetan Dixit & Onboarding Profile with 3D Depth */}
      {chetan && (
        <div className="card-3d-dark p-4 sm:p-6 text-white rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-500/15 via-transparent to-transparent pointer-events-none rounded-full blur-2xl" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 min-w-0 relative z-10">
            <div className="flex flex-col xs:flex-row items-start gap-3 sm:gap-4.5 min-w-0 flex-1">
              <div className="relative">
                <img
                  src="/src/assets/images/avatar_chetan_sharma_1793257665587.jpg"
                  alt={chetan.fullName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-[0_6px_16px_rgba(245,158,11,0.35)] shrink-0"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-xs" />
              </div>
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Source Dossier Spotlight · Chetan Information Sheet
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-mono shrink-0 badge-3d">
                    100% Verified Profile
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
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
                className="btn-3d-gold w-full lg:w-auto px-5 py-2.5 text-xs flex items-center gap-2"
              >
                <span>Open Full Chetan Dossier</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Split: Pending Document Checklist vs Upcoming Joiners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Pending Documents Queue with 3D Card Depth */}
        <div className="card-3d overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200/90 bg-gradient-to-r from-slate-50 via-slate-50/80 to-amber-50/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-amber-100 text-amber-700 shadow-2xs">
                <FileCheck className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Document Verification Backlog
              </h3>
            </div>
            <span className="text-xs text-amber-800 font-mono font-semibold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full badge-3d">
              {pendingDocItems.length} Pending Actions
            </span>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-80 no-scrollbar">
            {pendingDocItems.slice(0, 8).map((item, idx) => (
              <div
                key={idx}
                className="px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {item.employee.fullName}
                    </p>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.employee.employeeCode}
                    </span>
                    {item.employee.isCandidate && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-md font-semibold bg-blue-50 text-blue-700 border border-blue-200">
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
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold badge-3d ${
                      item.status === 'Uploaded'
                        ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
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
                      className="p-1.5 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors cursor-pointer shadow-xs"
                      title="Generate 24h Document QR"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onSelectEmployee(item.employee)}
                    className="btn-3d-white px-2.5 py-1 text-xs"
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
        <div className="card-3d overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200/90 bg-gradient-to-r from-slate-50 via-slate-50/80 to-blue-50/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-100 text-blue-700 shadow-2xs">
                <UserPlus className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Upcoming Joiners Schedule
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('candidates')}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold cursor-pointer"
            >
              View Pipeline →
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-80 no-scrollbar">
            {candidates.map(cand => (
              <div
                key={cand.id}
                className="px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-slate-900 truncate">
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
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 badge-3d">
                    {cand.candidateStatus || 'Offer Accepted'}
                  </span>
                  <button
                    onClick={() => onSelectEmployee(cand)}
                    className="btn-3d-white px-2.5 py-1 text-xs"
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

      {/* Recent Activity Log Strip with 3D Depth */}
      <div className="card-3d p-4 sm:p-5 w-full min-w-0">
        <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 shadow-2xs">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Live Real-Time Activity Feed
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('audit')}
            className="text-xs font-semibold text-slate-600 hover:text-amber-700 transition-colors cursor-pointer"
          >
            Full Audit History →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.recentLogs.slice(0, 3).map(log => (
            <div
              key={log.id}
              className="p-3.5 bg-gradient-to-b from-slate-50/90 to-slate-100/40 rounded-xl border border-slate-200 text-xs space-y-1.5 min-w-0 shadow-2xs hover:shadow-xs transition-shadow"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-bold text-slate-800">{log.action}</span>
                <span className="font-mono text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-700 leading-snug line-clamp-2 break-words">{log.details}</p>
              <p className="text-[10px] text-slate-400 pt-0.5">
                By: <strong className="text-slate-700">{log.actor}</strong> ({log.actorRole})
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
