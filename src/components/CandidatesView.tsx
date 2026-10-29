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
} from 'lucide-react';
import { Employee, UserRole } from '../types/index.js';

interface CandidatesViewProps {
  candidates: Employee[];
  onSelectCandidate: (candidate: Employee) => void;
  onOpenAddModal: () => void;
  onConvertCandidate: (id: string, params: { employeeCode?: string; joiningDate?: string; desk?: string }) => Promise<void>;
  userRole: UserRole;
}

export const CandidatesView: React.FC<CandidatesViewProps> = ({
  candidates,
  onSelectCandidate,
  onOpenAddModal,
  onConvertCandidate,
  userRole,
}) => {
  const [convertingCand, setConvertingCand] = useState<Employee | null>(null);
  const [assignedCode, setAssignedCode] = useState('');
  const [assignedDesk, setAssignedDesk] = useState('');
  const [confirmedDoj, setConfirmedDoj] = useState('');
  const [converting, setConverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Candidate Onboarding Pipeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage incoming hires, track pre-boarding document verification, reserve office desks, and convert to active employee records.
          </p>
        </div>

        {userRole !== 'DEPT_HEAD_VIEWER' && (
          <button
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register New Candidate
          </button>
        )}
      </div>

      {/* Candidates Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {candidates.map(cand => {
          // Document stats
          const docValues = Object.values(cand.documents || {});
          const verifiedDocs = docValues.filter(d => d.status === 'Verified').length;
          const totalDocs = docValues.length;

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

                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {cand.candidateStatus || 'Offer Accepted'}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block">Department</span>
                    <span className="font-medium text-slate-800 truncate block">{cand.department}</span>
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
                      {cand.profileCompletion}% ({verifiedDocs}/{totalDocs} Docs Verified)
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

                {cand.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded">
                    &ldquo;{cand.notes}&rdquo;
                  </p>
                )}
              </div>

              {/* Bottom Card Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">
                  {cand.employeeCode}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectCandidate(cand)}
                    className="px-3 py-1 text-xs text-slate-700 hover:text-slate-900 border border-slate-200 rounded hover:bg-slate-50 font-medium"
                  >
                    View Dossier
                  </button>

                  {userRole !== 'DEPT_HEAD_VIEWER' && (
                    <button
                      onClick={e => openConvertModal(e, cand)}
                      className="px-3 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Convert to Employee
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {candidates.length === 0 && (
          <div className="col-span-2 p-12 bg-white rounded-xl border border-slate-200 text-center text-xs text-slate-400">
            No candidates in pipeline. Use &ldquo;Register New Candidate&rdquo; to add upcoming joiners.
          </div>
        )}
      </div>

      {/* Convert to Employee Modal */}
      {convertingCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
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
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  placeholder="e.g. WCR-021"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Official Joining Date</label>
                <input
                  type="date"
                  value={confirmedDoj}
                  onChange={e => setConfirmedDoj(e.target.value)}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Designated Desk Allocation</label>
                <input
                  type="text"
                  value={assignedDesk}
                  onChange={e => setAssignedDesk(e.target.value.toUpperCase())}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  placeholder="e.g. F1, F2, B3..."
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setConvertingCand(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmConversion}
                disabled={converting || !assignedCode}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {converting ? 'Converting...' : 'Confirm & Add to Directory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
