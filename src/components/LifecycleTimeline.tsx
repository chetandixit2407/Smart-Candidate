import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  UserCheck,
  FileText,
  AlertCircle,
  Briefcase,
  Award,
  LogOut,
  DollarSign,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Employee, LifecycleHistoryEntry, LifecycleStage } from '../types/index.js';

interface LifecycleTimelineProps {
  employee: Employee;
}

export const LifecycleTimeline: React.FC<LifecycleTimelineProps> = ({ employee }) => {
  const history: LifecycleHistoryEntry[] = employee.lifecycleHistory || [];

  // If no history has been populated yet, generate synthesized milestones from candidate/employee fields
  const displayEvents: Array<{
    id: string;
    timestamp: string;
    stage: string;
    title: string;
    description: string;
    actor: string;
    icon: any;
    color: string;
  }> = [];

  if (history.length > 0) {
    history.forEach(h => {
      displayEvents.push({
        id: h.id,
        timestamp: h.timestamp,
        stage: h.stage,
        title: h.title,
        description: h.description,
        actor: h.actor,
        icon: getStageIcon(h.stage),
        color: getStageColor(h.stage),
      });
    });
  } else {
    // Generate chronological milestone projections from existing data
    if (employee.createdAt) {
      displayEvents.push({
        id: 'evt-created',
        timestamp: employee.createdAt,
        stage: employee.isCandidate ? 'Application' : 'Onboarded',
        title: employee.isCandidate ? 'Candidate Application Received' : 'Personnel Record Enrolled',
        description: `Profile created in White Collar Realty directory for ${employee.designation} (${employee.department}).`,
        actor: 'HR System',
        icon: Briefcase,
        color: 'text-blue-500 bg-blue-50 border-blue-200',
      });
    }

    if (employee.offerLetter) {
      displayEvents.push({
        id: 'evt-offer',
        timestamp: employee.offerLetter.approvedAt || employee.offerLetter.issueDate,
        stage: 'Offer Extended',
        title: `Offer Letter Ref: ${employee.offerLetter.refNo}`,
        description: `Offered Annual CTC of ${employee.offerLetter.salaryBreakup.currency} ${employee.offerLetter.salaryBreakup.annualCtc.toLocaleString()}. Status: ${employee.offerLetter.status}.`,
        actor: employee.offerLetter.approvedBy || 'HR Leadership',
        icon: FileText,
        color: 'text-amber-500 bg-amber-50 border-amber-200',
      });
    }

    if (employee.joiningDate) {
      displayEvents.push({
        id: 'evt-joining',
        timestamp: employee.joiningDate,
        stage: 'Joining Confirmed',
        title: `Formal Joining Date: ${employee.joiningDate}`,
        description: `Assigned desk: ${employee.desk || 'General Office'} · Market: ${employee.market}.`,
        actor: 'Simran Kaur (HR Head)',
        icon: UserCheck,
        color: 'text-emerald-500 bg-emerald-50 border-emerald-200',
      });
    }

    if (employee.probation) {
      displayEvents.push({
        id: 'evt-probation',
        timestamp: employee.probation.startDate,
        stage: 'Probation',
        title: `Probation Period: ${employee.probation.durationMonths} Months`,
        description: `Status: ${employee.probation.status} (Ends: ${employee.probation.endDate}).`,
        actor: 'Operations Team',
        icon: Clock,
        color: 'text-indigo-500 bg-indigo-50 border-indigo-200',
      });
    }

    if (employee.exitClearance) {
      displayEvents.push({
        id: 'evt-exit',
        timestamp: employee.exitClearance.resignationDate,
        stage: 'Notice Period',
        title: `Exit Initiated (${employee.exitClearance.exitType})`,
        description: `Resignation submitted. Calculated Last Working Day: ${employee.exitClearance.calculatedLwd}.`,
        actor: 'HR Operations',
        icon: LogOut,
        color: 'text-rose-500 bg-rose-50 border-rose-200',
      });
    }

    if (employee.fnfSettlement) {
      displayEvents.push({
        id: 'evt-fnf',
        timestamp: employee.fnfSettlement.settlementDate,
        stage: 'FnF Settled',
        title: `Full & Final Settlement: ${employee.fnfSettlement.currency} ${employee.fnfSettlement.netSettlementAmount.toLocaleString()}`,
        description: `Settlement Status: ${employee.fnfSettlement.status} (Ref: ${employee.fnfSettlement.paymentReference || 'Draft'}).`,
        actor: 'Finance & Accounts',
        icon: DollarSign,
        color: 'text-emerald-600 bg-emerald-50 border-emerald-300',
      });
    }
  }

  function getStageIcon(stage: string) {
    switch (stage) {
      case 'Application':
      case 'Screening':
        return Briefcase;
      case 'Interview':
        return UserCheck;
      case 'Selected':
      case 'Offer Extended':
      case 'Offer Accepted':
        return FileText;
      case 'Joining Confirmed':
      case 'Onboarded':
        return CheckCircle2;
      case 'Probation':
        return Clock;
      case 'Confirmed':
        return Award;
      case 'Notice Period':
      case 'Exit Clearance':
        return LogOut;
      case 'FnF Settled':
      case 'Ex-Employee':
        return DollarSign;
      default:
        return ShieldCheck;
    }
  }

  function getStageColor(stage: string) {
    switch (stage) {
      case 'Application':
      case 'Screening':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Interview':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'Selected':
      case 'Offer Extended':
      case 'Offer Accepted':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'Joining Confirmed':
      case 'Onboarded':
      case 'Confirmed':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'Probation':
        return 'text-indigo-600 bg-indigo-50 border-indigo-200';
      case 'Notice Period':
      case 'Exit Clearance':
        return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'FnF Settled':
      case 'Ex-Employee':
        return 'text-teal-600 bg-teal-50 border-teal-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            End-to-End Lifecycle Journey & Audit History
          </h4>
          <p className="text-xs text-slate-500">
            Chronological progression from recruitment and interview rounds to exit and final settlement.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
          {displayEvents.length} Milestone{displayEvents.length === 1 ? '' : 's'}
        </span>
      </div>

      {displayEvents.length === 0 ? (
        <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-xs">No lifecycle events recorded yet.</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {displayEvents.map((evt, idx) => {
            const Icon = evt.icon;
            return (
              <div key={evt.id || idx} className="relative group">
                {/* Node icon */}
                <div
                  className={`absolute -left-6 top-0.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${evt.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-shadow hover:shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">{evt.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(evt.timestamp).toLocaleString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{evt.description}</p>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">Actor:</span>
                    <span>{evt.actor}</span>
                    <span className="text-slate-300">·</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                      {evt.stage}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
