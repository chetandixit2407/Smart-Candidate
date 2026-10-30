import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Eye,
  Trash2,
  Edit,
  ArrowUpDown,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  Armchair,
  QrCode,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { Employee, UserRole, DepartmentWithCounts } from '../types/index.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { api } from '../services/api.js';

interface EmployeesViewProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onOpenAddModal: () => void;
  onDeleteEmployee: (id: string) => Promise<void>;
  userRole: UserRole;
  departmentsList?: DepartmentWithCounts[];
  onOpenQrModal?: (emp: Employee) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  onSelectEmployee,
  onOpenAddModal,
  onDeleteEmployee,
  userRole,
  departmentsList = [],
  onOpenQrModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedMarket, setSelectedMarket] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [sortField, setSortField] = useState<'fullName' | 'employeeCode' | 'joiningDate' | 'profileCompletion'>('employeeCode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const canEdit = userRole === 'HR' || userRole === 'Co-Founder';

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    departmentsList.forEach(d => {
      if (d.name) set.add(d.name);
    });
    employees.forEach(e => {
      if (e.department) set.add(e.department);
    });
    return ['All', ...Array.from(set)];
  }, [employees, departmentsList]);

  // Filtered & Sorted employees
  const filteredEmployees = useMemo(() => {
    return employees
      .filter(e => {
        if (selectedDept !== 'All' && e.department !== selectedDept) return false;
        if (selectedMarket !== 'All' && e.market !== selectedMarket) return false;
        if (selectedStatus !== 'All' && e.employmentStatus !== selectedStatus) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const match =
            e.fullName.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.phone.toLowerCase().includes(q) ||
            e.designation.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q) ||
            (e.subDepartment && e.subDepartment.toLowerCase().includes(q)) ||
            (e.desk && e.desk.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [employees, selectedDept, selectedMarket, selectedStatus, searchTerm, sortField, sortDirection]);

  // Pagination slice
  const totalPages = Math.ceil(filteredEmployees.length / pageSize) || 1;
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = (e: React.MouseEvent, emp: Employee) => {
    e.stopPropagation();
    setDeleteTarget(emp);
  };

  return (
    <div className="space-y-4">
      {/* Control Bar: Filters & Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, code, desk, phone, role..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          {/* Quick Stats & Action Button */}
          <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 text-xs text-slate-500 w-full md:w-auto">
            <span className="text-[11px] sm:text-xs">
              Showing <strong className="font-mono text-slate-800">{filteredEmployees.length}</strong> of{' '}
              <span className="font-mono">{employees.length}</span> active employees
            </span>
            {canEdit && (
              <button
                onClick={onOpenAddModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Employee
              </button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          <select
            value={selectedDept}
            onChange={e => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 bg-white border border-slate-200 rounded text-slate-700 text-xs focus:ring-1 focus:ring-slate-900"
          >
            {departments.map(d => (
              <option key={d} value={d}>
                Dept: {d}
              </option>
            ))}
          </select>

          <select
            value={selectedMarket}
            onChange={e => {
              setSelectedMarket(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 bg-white border border-slate-200 rounded text-slate-700 text-xs focus:ring-1 focus:ring-slate-900"
          >
            <option value="All">Market: All Markets</option>
            <option value="Gurgaon">Market: Gurgaon (NCR)</option>
            <option value="Dubai">Market: Dubai (UAE)</option>
            <option value="Dual Market">Market: Dual Market</option>
          </select>

          <select
            value={selectedStatus}
            onChange={e => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 sm:flex-initial min-w-[120px] px-2.5 py-1.5 bg-white border border-slate-200 rounded text-slate-700 text-xs focus:ring-1 focus:ring-slate-900"
          >
            <option value="All">Status: All Statuses</option>
            <option value="Full-Time">Full-Time</option>
            <option value="Intern">Intern</option>
            <option value="Probation">Probation</option>
            <option value="Notice Period">Notice Period</option>
          </select>

          {(searchTerm || selectedDept !== 'All' || selectedMarket !== 'All' || selectedStatus !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDept('All');
                setSelectedMarket('All');
                setSelectedStatus('All');
                setCurrentPage(1);
              }}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium px-2 py-1 rounded hover:bg-amber-50 shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Employees Directory: Mobile Cards (hidden on md+) & Desktop Table (hidden on mobile) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs w-full min-w-0">
        {/* Mobile View: High-Usability Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {paginatedEmployees.map(emp => {
            const isChetan = emp.fullName.toLowerCase().includes('chetan');
            const avatar = isChetan ? '/src/assets/images/avatar_chetan_sharma_1793257665587.jpg' : null;

            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="p-3.5 hover:bg-slate-50/80 active:bg-slate-100 cursor-pointer transition-colors space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={emp.fullName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-amber-400 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {emp.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="overflow-hidden min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-xs truncate">
                        {emp.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        {emp.phone || emp.email}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px] shrink-0 border border-slate-200">
                    {emp.employeeCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100 min-w-0">
                    <span className="text-[10px] text-slate-400 block truncate">Role & Dept</span>
                    <span className="font-medium text-slate-800 text-[11px] truncate block">
                      {emp.designation}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate block">
                      {emp.department}
                      {emp.subDepartment ? ` · ${emp.subDepartment}` : ''}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100 min-w-0">
                    <span className="text-[10px] text-slate-400 block truncate">Desk & Market</span>
                    <span className="font-mono font-bold text-amber-800 text-[11px] truncate block">
                      {emp.desk ? `Desk ${emp.desk}` : 'Unassigned'}
                    </span>
                    <span className="text-[10px] text-slate-600 truncate block">
                      {emp.market}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Readiness:</span>
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          emp.profileCompletion >= 90
                            ? 'bg-emerald-500'
                            : emp.profileCompletion >= 70
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${emp.profileCompletion}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-slate-700 tabular-nums">
                      {emp.profileCompletion}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onOpenQrModal && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenQrModal(emp);
                        }}
                        className="px-2 py-1 text-[11px] text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded font-semibold flex items-center gap-1 transition-colors"
                        title="Generate 24-Hour Document QR"
                      >
                        <QrCode className="w-3 h-3 text-amber-600" />
                        <span>QR</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectEmployee(emp);
                      }}
                      className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded font-medium transition-colors"
                    >
                      Dossier
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={e => handleDelete(e, emp)}
                        className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {paginatedEmployees.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400">
              No employees matching the selected criteria.
            </div>
          )}
        </div>

        {/* Desktop View: Full-featured Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
              <tr>
                <th
                  onClick={() => toggleSort('employeeCode')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Emp Code</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('fullName')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Full Name & Contact</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3">Designation & Department</th>
                <th className="px-4 py-3">Desk</th>
                <th className="px-4 py-3">Market</th>
                <th
                  onClick={() => toggleSort('joiningDate')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Joining Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('profileCompletion')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Readiness</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedEmployees.map(emp => {
                const isChetan = emp.fullName.toLowerCase().includes('chetan');
                const avatar = isChetan ? '/src/assets/images/avatar_chetan_sharma_1793257665587.jpg' : null;

                return (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    {/* Code */}
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {emp.employeeCode}
                      </span>
                    </td>

                    {/* Name & Contact */}
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-3">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={emp.fullName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover border border-amber-400 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {emp.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="overflow-hidden min-w-0">
                          <p className="font-semibold text-slate-900 group-hover:text-amber-800 truncate">
                            {emp.fullName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            {emp.phone || emp.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Designation & Department */}
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="font-medium text-slate-800 truncate">{emp.designation}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {emp.department}
                        {emp.subDepartment ? ` · ${emp.subDepartment}` : ''}
                      </p>
                    </td>

                    {/* Desk */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {emp.desk ? (
                        <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                          {emp.desk}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Market */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          emp.market === 'Dual Market'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : emp.market === 'Dubai'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {emp.market}
                      </span>
                    </td>

                    {/* Joining Date */}
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {emp.joiningDate || '—'}
                    </td>

                    {/* Readiness */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              emp.profileCompletion >= 90
                                ? 'bg-emerald-500'
                                : emp.profileCompletion >= 70
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${emp.profileCompletion}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-slate-800 text-[11px] tabular-nums">
                          {emp.profileCompletion}%
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {onOpenQrModal && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onOpenQrModal(emp);
                            }}
                            title="Generate Document QR (24h)"
                            className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            try {
                              setExportingId(emp.id);
                              await api.downloadEmployeeProfileExcel(emp.id, emp.fullName, emp.employeeCode);
                            } catch (err: any) {
                              console.error('Export Excel failed:', err);
                            } finally {
                              setExportingId(null);
                            }
                          }}
                          disabled={exportingId === emp.id}
                          title="Export Full Profile (Excel)"
                          className="p-1 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {exportingId === emp.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectEmployee(emp);
                          }}
                          title="Open Dossier"
                          className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={e => handleDelete(e, emp)}
                            title="Delete Record"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedEmployees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-slate-400">
                    No employees matching the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs disabled:opacity-40 hover:bg-slate-100"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs disabled:opacity-40 hover:bg-slate-100"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Employee Record"
        message={`Are you sure you want to permanently delete the employee record for ${deleteTarget?.fullName} (${deleteTarget?.employeeCode})? This action will release any assigned desk and log an audit trail.`}
        confirmLabel="Delete Record"
        isDestructive={true}
        loading={deleteLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            setDeleteLoading(true);
            await onDeleteEmployee(deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleteLoading(false);
          }
        }}
      />
    </div>
  );
};
