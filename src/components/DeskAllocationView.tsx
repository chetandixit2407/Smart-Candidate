import React, { useState } from 'react';
import {
  Armchair,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Plus,
  ArrowRight,
  Filter,
  Building2,
  X,
} from 'lucide-react';
import { DeskSlot, Employee, UserRole, ALL_DESK_CODES } from '../types/index.js';
import { ConfirmDialog } from './ConfirmDialog.js';

interface DeskAllocationViewProps {
  desks: DeskSlot[];
  allPeople: Employee[]; // employees and candidates
  onAssignDesk: (deskCode: string, employeeId: string) => Promise<void>;
  onReleaseDesk: (deskCode: string) => Promise<void>;
  onSelectEmployee: (emp: Employee) => void;
  userRole: UserRole;
}

export const DeskAllocationView: React.FC<DeskAllocationViewProps> = ({
  desks,
  allPeople,
  onAssignDesk,
  onReleaseDesk,
  onSelectEmployee,
  userRole,
}) => {
  const [selectedBay, setSelectedBay] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [assignModalDesk, setAssignModalDesk] = useState<DeskSlot | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);

  const canEdit = userRole === 'HR' || userRole === 'Co-Founder';

  // Bay definitions
  const bays = [
    { id: 'Bay A', label: 'Bay A: Leadership & Directors', range: ['A1', 'A2', 'A3', 'A4', 'A5'] },
    { id: 'Bay B', label: 'Bay B: Luxury Brokerage & Dubai Desk', range: ['B1', 'B2', 'B3', 'B4', 'B5'] },
    { id: 'Bay C', label: 'Bay C: Commercial Leasing & Accounts', range: ['C1', 'C2', 'C3'] },
    { id: 'Bay D', label: 'Bay D: Investment Advisors & CRM', range: ['D1', 'D2', 'D3', 'D4'] },
    { id: 'Bay E', label: 'Bay E: Market Research & Interns', range: ['E1', 'E2', 'E3', 'E4', 'E5'] },
    { id: 'Bay F', label: 'Bay F: Onboarding & Upcoming Joiners', range: ['F1', 'F2', 'F3', 'F4', 'F5'] },
    { id: 'Bay G', label: 'Bay G: Expansion Advisory Bay', range: ['G1', 'G2', 'G3', 'G4', 'G5'] },
    { id: 'Bay H', label: 'Bay H: International Visiting Partners', range: ['H1', 'H2', 'H3', 'H4', 'H5'] },
  ];

  // Stats calculation
  const totalDesks = desks.length;
  const occupiedCount = desks.filter(d => d.status === 'Occupied').length;
  const reservedCount = desks.filter(d => d.status === 'Reserved').length;
  const availableCount = desks.filter(d => d.status === 'Available').length;

  const handleOpenAssignModal = (slot: DeskSlot) => {
    if (!canEdit) return;
    setAssignModalDesk(slot);
    setSelectedPersonId('');
    setActionMsg(null);
  };

  const handleConfirmAssignment = async () => {
    if (!assignModalDesk || !selectedPersonId) return;
    try {
      setSaving(true);
      await onAssignDesk(assignModalDesk.code, selectedPersonId);
      setActionMsg({ type: 'success', text: `Desk ${assignModalDesk.code} successfully assigned.` });
      setAssignModalDesk(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign desk';
      setActionMsg({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = (deskCode: string) => {
    if (!canEdit) return;
    setReleaseTarget(deskCode);
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      {/* Top Banner & Metrics */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 w-full min-w-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
              White Collar Realty — Floorplan & Desk Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Exact configured desks: A1–A5, B1–B5, C1–C3, D1–D4, E1–E5, F1–F5, G1–G5, H1–H5 (Total 37 Desks).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs w-full md:w-auto">
            <div className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center sm:justify-start gap-1.5 text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Available: <strong>{availableCount}</strong></span>
            </div>
            <div className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center sm:justify-start gap-1.5 text-slate-800">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span>Occupied: <strong>{occupiedCount}</strong></span>
            </div>
            <div className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center sm:justify-start gap-1.5 text-amber-800">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Reserved: <strong>{reservedCount}</strong></span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Filter Bays:
          </span>

          <select
            value={selectedBay}
            onChange={e => setSelectedBay(e.target.value)}
            className="flex-1 sm:flex-initial min-w-[130px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs"
          >
            <option value="All">All Bays (A–H)</option>
            {bays.map(b => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs"
          >
            <option value="All">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Occupied">Occupied</option>
            <option value="Reserved">Reserved (Candidates)</option>
          </select>
        </div>
      </div>

      {actionMsg && (
        <div
          className={`px-4 py-2.5 rounded-lg text-xs flex items-center justify-between ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Visual Bay Cards */}
      <div className="space-y-4 sm:space-y-6 w-full min-w-0">
        {bays
          .filter(b => selectedBay === 'All' || selectedBay === b.id)
          .map(bay => {
            const bayDesks = desks.filter(d => bay.range.includes(d.code));
            const filteredBayDesks = bayDesks.filter(
              d => selectedStatus === 'All' || d.status === selectedStatus
            );

            if (filteredBayDesks.length === 0) return null;

            return (
              <div key={bay.id} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3 w-full min-w-0">
                <div className="flex flex-col xs:flex-row xs:items-center justify-between pb-2 border-b border-slate-100 gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider truncate">
                      {bay.label}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {bayDesks.filter(d => d.status === 'Occupied').length} Occupied · {bayDesks.filter(d => d.status === 'Available').length} Available
                  </span>
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                  {filteredBayDesks.map(slot => {
                    const occupantPerson = slot.assignedEmployeeId
                      ? allPeople.find(p => p.id === slot.assignedEmployeeId)
                      : null;

                    const isChetan = slot.assignedEmployeeName?.toLowerCase().includes('chetan');

                    return (
                      <div
                        key={slot.code}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between min-h-[140px] ${
                          slot.status === 'Available'
                            ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                            : slot.status === 'Reserved'
                            ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div>
                          {/* Desk Header */}
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-base font-bold text-slate-900 tracking-tight">
                              Desk {slot.code}
                            </span>
                            <span
                              className={`text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                                slot.status === 'Available'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : slot.status === 'Reserved'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {slot.status}
                            </span>
                          </div>

                          {/* Occupant Details */}
                          <div className="mt-2.5">
                            {slot.assignedEmployeeName ? (
                              <div
                                onClick={() => occupantPerson && onSelectEmployee(occupantPerson)}
                                className="cursor-pointer group"
                              >
                                <div className="flex items-center gap-1.5">
                                  {isChetan && (
                                    <span className="text-amber-500 text-xs">⭐</span>
                                  )}
                                  <p className="font-semibold text-xs text-slate-900 group-hover:text-amber-800 truncate">
                                    {slot.assignedEmployeeName}
                                  </p>
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                                  {slot.assignedEmployeeCode}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {slot.assignedEmployeeDesignation || slot.assignedEmployeeDepartment}
                                </p>
                                {occupantPerson?.sourceSpreadsheetSeat && (
                                  <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono border border-slate-200" title="Original seat code from source spreadsheet">
                                    Sheet Seat: {occupantPerson.sourceSpreadsheetSeat}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="py-2 text-[11px] text-emerald-700 font-medium">
                                Ready for Allocation
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Desk Actions */}
                        {canEdit && (
                          <div className="pt-2 border-t border-slate-100/80 mt-2 flex items-center justify-between text-[11px]">
                            {slot.assignedEmployeeId ? (
                              <>
                                <button
                                  onClick={() => handleOpenAssignModal(slot)}
                                  className="text-slate-600 hover:text-slate-900 font-medium hover:underline"
                                >
                                  Reassign
                                </button>
                                <button
                                  onClick={() => handleRelease(slot.code)}
                                  className="text-rose-600 hover:text-rose-800 font-medium"
                                >
                                  Release
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleOpenAssignModal(slot)}
                                className="w-full py-1 text-center font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-100/80 hover:bg-emerald-200/80 rounded transition-colors"
                              >
                                + Assign Seat
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Special Workstations: Reception & Non-Bay Assignments */}
      {allPeople.some(p => p.sourceSpreadsheetSeat?.toLowerCase().includes('reception')) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Front Office & Reception Workstations
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Preserved from Spreadsheet Roster
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {allPeople
              .filter(p => p.sourceSpreadsheetSeat?.toLowerCase().includes('reception'))
              .map(p => (
                <div
                  key={p.id}
                  onClick={() => onSelectEmployee(p)}
                  className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 hover:border-amber-300 transition-all cursor-pointer shadow-xs flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      Reception Desk
                    </span>
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider bg-amber-100 text-amber-800">
                      Front Desk
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <p className="font-semibold text-xs text-slate-900 hover:text-amber-800">
                      {p.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {p.employeeCode} · {p.designation}
                    </p>
                    <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-white text-amber-800 rounded text-[9px] font-mono border border-amber-200">
                      Sheet Seat: {p.sourceSpreadsheetSeat}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Desk Assignment Modal */}
      {assignModalDesk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">
                  Assign Employee to Desk {assignModalDesk.code}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {assignModalDesk.bay} · Current Status: <strong>{assignModalDesk.status}</strong>
                </p>
              </div>
              <button onClick={() => setAssignModalDesk(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            {assignModalDesk.assignedEmployeeName && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                <strong>Notice:</strong> This desk is currently occupied by <strong>{assignModalDesk.assignedEmployeeName}</strong>. Assigning a new person will automatically release the previous occupant.
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700">Select Employee or Upcoming Joiner</label>
              <select
                value={selectedPersonId}
                onChange={e => setSelectedPersonId(e.target.value)}
                className="mt-1.5 w-full p-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- Choose person to assign --</option>
                {allPeople.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.employeeCode}) — {p.isCandidate ? 'Candidate' : 'Employee'} {p.desk ? `[Current: ${p.desk}]` : '[Unassigned]'}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setAssignModalDesk(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssignment}
                disabled={saving || !selectedPersonId}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Desk Release Modal */}
      <ConfirmDialog
        isOpen={!!releaseTarget}
        title="Release Desk Allocation"
        message={`Are you sure you want to release Desk ${releaseTarget}? The current occupant will be set to unassigned desk status.`}
        confirmLabel="Release Desk"
        isDestructive={true}
        loading={releaseLoading}
        onCancel={() => setReleaseTarget(null)}
        onConfirm={async () => {
          if (!releaseTarget) return;
          try {
            setReleaseLoading(true);
            await onReleaseDesk(releaseTarget);
            setActionMsg({ type: 'success', text: `Desk ${releaseTarget} is now available.` });
            setReleaseTarget(null);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to release desk';
            setActionMsg({ type: 'error', text: msg });
          } finally {
            setReleaseLoading(false);
          }
        }}
      />
    </div>
  );
};
