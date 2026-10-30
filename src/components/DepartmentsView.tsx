import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Users,
  UserPlus,
  QrCode,
  Edit3,
  Trash2,
  FolderTree,
  Check,
  X,
  FileWarning,
  FileCheck2,
  Sparkles,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  DepartmentWithCounts,
  Employee,
  MarketType,
  UserRole,
} from '../types/index.js';
import { api } from '../services/api.js';

import {
  Tag,
} from 'lucide-react';

interface DepartmentsViewProps {
  departments: DepartmentWithCounts[];
  employees: Employee[];
  userRole: UserRole;
  activeDeptId?: string;
  activeSubDept?: string;
  onSelectDeptAndSub?: (deptId: string, subDept: string) => void;
  openCreateDeptTrigger?: number;
  onSelectPerson: (person: Employee) => void;
  onOpenQrModal: (person: Employee) => void;
  onOpenAddPersonInDepartment: (isCandidate: boolean, departmentName: string, subDepartmentName?: string) => void;
  onDepartmentsChanged: (updated: DepartmentWithCounts[]) => void;
  onEmployeesRefresh: () => void;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({
  departments,
  employees,
  userRole,
  activeDeptId,
  activeSubDept,
  onSelectDeptAndSub,
  openCreateDeptTrigger,
  onSelectPerson,
  onOpenQrModal,
  onOpenAddPersonInDepartment,
  onDepartmentsChanged,
  onEmployeesRefresh,
}) => {
  const canManage = userRole === 'HR' || userRole === 'Co-Founder';

  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => activeDeptId || departments[0]?.id || '');
  const [selectedSubDept, setSelectedSubDept] = useState<string>(() => activeSubDept || 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [personTypeFilter, setPersonTypeFilter] = useState<'ALL' | 'EMPLOYEE' | 'CANDIDATE'>('ALL');
  const [docFilter, setDocFilter] = useState<'ALL' | 'MISSING' | 'UPLOADED_REVIEW' | 'VERIFIED'>('ALL');

  // Dynamic Employment Categories Management
  const [categories, setCategories] = useState<string[]>(['Employee', 'Intern', 'Consultant', 'Contractor']);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Modals / Inline Forms for Department & Sub-Department CRUD
  const [showCreateDeptModal, setShowCreateDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [newDeptMarket, setNewDeptMarket] = useState<MarketType>('Gurgaon');
  const [newDeptSubList, setNewDeptSubList] = useState('');

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptDesc, setEditDeptDesc] = useState('');
  const [editDeptMarket, setEditDeptMarket] = useState<MarketType>('Gurgaon');

  const [deletingDept, setDeletingDept] = useState<DepartmentWithCounts | null>(null);
  const [reassignTargetDeptId, setReassignTargetDeptId] = useState<string>('');

  const [addingSubDept, setAddingSubDept] = useState(false);
  const [newSubDeptName, setNewSubDeptName] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState('');

  const [busy, setBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Load employment categories on mount
  useEffect(() => {
    api.getEmploymentCategories()
      .then(cats => {
        if (cats && cats.length > 0) setCategories(cats);
      })
      .catch(() => {});
  }, []);

  // Listen to openCreateDeptTrigger from Sidebar
  useEffect(() => {
    if (openCreateDeptTrigger) {
      setFeedbackError(null);
      setShowCreateDeptModal(true);
    }
  }, [openCreateDeptTrigger]);

  // Sync when activeDeptId or activeSubDept passed from Sidebar
  useEffect(() => {
    if (activeDeptId && departments.some(d => d.id === activeDeptId)) {
      setSelectedDeptId(activeDeptId);
    }
    if (activeSubDept !== undefined) {
      setSelectedSubDept(activeSubDept);
    }
  }, [activeDeptId, activeSubDept, departments]);

  useEffect(() => {
    if (departments.length > 0 && !departments.some(d => d.id === selectedDeptId)) {
      setSelectedDeptId(departments[0].id);
      setSelectedSubDept('All');
    }
  }, [departments, selectedDeptId]);

  const activeDepartment = useMemo(
    () => departments.find(d => d.id === selectedDeptId) || departments[0] || null,
    [departments, selectedDeptId]
  );

  // Roster scoped strictly to the selected department
  const departmentMembers = useMemo(() => {
    if (!activeDepartment) return [];
    return employees.filter(
      e =>
        e.departmentId === activeDepartment.id ||
        e.department.toLowerCase() === activeDepartment.name.toLowerCase()
    );
  }, [employees, activeDepartment]);

  const filteredMembers = useMemo(() => {
    return departmentMembers.filter(person => {
      if (selectedSubDept !== 'All') {
        if (selectedSubDept === '__unassigned__') {
          if (person.subDepartment) return false;
        } else if ((person.subDepartment || '').toLowerCase() !== selectedSubDept.toLowerCase()) {
          return false;
        }
      }

      if (personTypeFilter === 'EMPLOYEE' && person.isCandidate) return false;
      if (personTypeFilter === 'CANDIDATE' && !person.isCandidate) return false;

      if (docFilter !== 'ALL') {
        const docs = Object.values(person.documents || {});
        const hasMissingReq = docs.some(
          d => d.required && (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
        );
        const hasUploadedPending = docs.some(
          d => d.status === 'Uploaded' || d.status === 'Submitted' || d.status === 'Under Review'
        );
        if (docFilter === 'MISSING' && !hasMissingReq) return false;
        if (docFilter === 'UPLOADED_REVIEW' && !hasUploadedPending) return false;
        if (docFilter === 'VERIFIED' && (hasMissingReq || hasUploadedPending)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          person.fullName.toLowerCase().includes(q) ||
          person.employeeCode.toLowerCase().includes(q) ||
          person.designation.toLowerCase().includes(q) ||
          person.email.toLowerCase().includes(q) ||
          person.phone.toLowerCase().includes(q) ||
          (person.subDepartment && person.subDepartment.toLowerCase().includes(q)) ||
          (person.desk && person.desk.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [departmentMembers, selectedSubDept, personTypeFilter, docFilter, searchQuery]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const subs = newDeptSubList
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const res = await api.createDepartment({
        name: newDeptName.trim(),
        description: newDeptDesc.trim() || undefined,
        marketFocus: newDeptMarket,
        subDepartments: subs,
      });
      onDepartmentsChanged(res.departments);
      if (res.department) {
        setSelectedDeptId(res.department.id);
        setSelectedSubDept('All');
      }
      setNewDeptName('');
      setNewDeptDesc('');
      setNewDeptSubList('');
      setShowCreateDeptModal(false);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to create department');
    } finally {
      setBusy(false);
    }
  };

  const startEditingDept = (dept: DepartmentWithCounts) => {
    setEditingDeptId(dept.id);
    setEditDeptName(dept.name);
    setEditDeptDesc(dept.description || '');
    setEditDeptMarket(dept.marketFocus || 'Gurgaon');
    setFeedbackError(null);
  };

  const handleSaveDeptEdit = async () => {
    if (!editingDeptId || !editDeptName.trim()) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const res = await api.updateDepartment(editingDeptId, {
        name: editDeptName.trim(),
        description: editDeptDesc.trim(),
        marketFocus: editDeptMarket,
      });
      onDepartmentsChanged(res.departments);
      onEmployeesRefresh();
      setEditingDeptId(null);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to rename department');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteDept = async () => {
    if (!deletingDept) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const res = await api.deleteDepartment(
        deletingDept.id,
        deletingDept.totalCount > 0 ? reassignTargetDeptId : undefined
      );
      onDepartmentsChanged(res.departments);
      onEmployeesRefresh();
      setDeletingDept(null);
      setReassignTargetDeptId('');
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to delete department');
    } finally {
      setBusy(false);
    }
  };

  const handleAddSubDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDepartment || !newSubDeptName.trim()) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const res = await api.addSubDepartment(activeDepartment.id, { name: newSubDeptName.trim() });
      onDepartmentsChanged(res.departments);
      setNewSubDeptName('');
      setAddingSubDept(false);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to add sub-department');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSubDeptRename = async (subId: string) => {
    if (!activeDepartment || !editSubName.trim()) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const res = await api.updateSubDepartment(activeDepartment.id, subId, { name: editSubName.trim() });
      onDepartmentsChanged(res.departments);
      onEmployeesRefresh();
      setEditingSubId(null);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to rename sub-department');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSubDept = async (subId: string, subName: string) => {
    if (!activeDepartment) return;
    setBusy(true);
    setFeedbackError(null);
    try {
      const res = await api.deleteSubDepartment(activeDepartment.id, subId);
      onDepartmentsChanged(res.departments);
      onEmployeesRefresh();
      if (selectedSubDept.toLowerCase() === subName.toLowerCase()) {
        setSelectedSubDept('All');
      }
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to delete sub-department');
    } finally {
      setBusy(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategoryLoading(true);
    setFeedbackError(null);
    try {
      const updated = await api.createEmploymentCategory(newCategoryName.trim());
      setCategories(updated);
      setNewCategoryName('');
      onEmployeesRefresh();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to add category');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    setCategoryLoading(true);
    setFeedbackError(null);
    try {
      const updated = await api.deleteEmploymentCategory(catName);
      setCategories(updated);
      onEmployeesRefresh();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to delete category');
    } finally {
      setCategoryLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Summary Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-800" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Configurable Departments & Sub-Departments
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Dedicated rosters, counts, search, filters, and 24-hour Document QR controls across Dubai Market, Gurgaon Market, AI Department, DA Department, and corporate units.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setFeedbackError(null);
                setShowCategoryModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Manage Dynamic Employment Categories (Employee, Intern, Consultant, Contractor)"
            >
              <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Employment Categories ({categories.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFeedbackError(null);
                setShowCreateDeptModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Create Department
            </button>
          </div>
        )}
      </div>

      {feedbackError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            {feedbackError}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="p-1 rounded hover:bg-rose-100 text-rose-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Layout: Left Department Directory | Right Selected Department Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Rail: Department Cards */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="px-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>All Departments ({departments.length})</span>
            <span className="font-mono tabular-nums">{employees.length} Total Profiles</span>
          </div>

          <div className="space-y-2">
            {departments.map(dept => {
              const isSelected = activeDepartment?.id === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => {
                    setSelectedDeptId(dept.id);
                    setSelectedSubDept('All');
                    setEditingDeptId(null);
                  }}
                  className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{dept.name}</span>
                        {dept.marketFocus && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                              isSelected
                                ? 'bg-slate-800 text-amber-300 border border-slate-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {dept.marketFocus}
                          </span>
                        )}
                      </div>
                      {dept.description && (
                        <p
                          className={`text-[11px] mt-0.5 line-clamp-1 ${
                            isSelected ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {dept.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold tabular-nums ${
                          isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {dept.totalCount}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}
                      />
                    </div>
                  </div>

                  {/* Breakdown Counts */}
                  <div
                    className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] font-mono tabular-nums ${
                      isSelected ? 'border-slate-800 text-slate-300' : 'border-slate-100 text-slate-500'
                    }`}
                  >
                    <span>{dept.employeeCount} Emp · {dept.candidateCount} Cand</span>
                    <span>{dept.subDepartments.length} Sub-dept</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Workspace: Selected Department Header, Sub-Departments, Filters & Separate Roster */}
        <div className="lg:col-span-8 space-y-4">
          {activeDepartment ? (
            <>
              {/* Department Header & Management Controls */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
                {editingDeptId === activeDepartment.id ? (
                  <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Department Name
                        </label>
                        <input
                          type="text"
                          value={editDeptName}
                          onChange={e => setEditDeptName(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Market Focus
                        </label>
                        <select
                          value={editDeptMarket}
                          onChange={e => setEditDeptMarket(e.target.value as MarketType)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        >
                          <option value="Gurgaon">Gurgaon</option>
                          <option value="Dubai">Dubai</option>
                          <option value="Dual Market">Dual Market</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={editDeptDesc}
                        onChange={e => setEditDeptDesc(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingDeptId(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || !editDeptName.trim()}
                        onClick={handleSaveDeptEdit}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                      >
                        Save & Sync Profiles
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-slate-900">{activeDepartment.name}</h3>
                        {activeDepartment.marketFocus && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                            {activeDepartment.marketFocus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activeDepartment.description || `${activeDepartment.name} personnel & onboarding pipeline`}
                      </p>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenAddPersonInDepartment(
                              false,
                              activeDepartment.name,
                              selectedSubDept !== 'All' && selectedSubDept !== '__unassigned__'
                                ? selectedSubDept
                                : undefined
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                          + Employee
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenAddPersonInDepartment(
                              true,
                              activeDepartment.name,
                              selectedSubDept !== 'All' && selectedSubDept !== '__unassigned__'
                                ? selectedSubDept
                                : undefined
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-medium transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          + Candidate
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingDept(activeDepartment)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                          title="Rename or Edit Department"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {departments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const fallback = departments.find(d => d.id !== activeDepartment.id);
                              setReassignTargetDeptId(fallback?.id || '');
                              setDeletingDept(activeDepartment);
                            }}
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600"
                            title="Delete Department"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Department KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Total Roster</span>
                    <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                      {activeDepartment.totalCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Active Employees</span>
                    <p className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
                      {activeDepartment.employeeCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Candidates</span>
                    <p className="text-lg font-bold text-amber-700 font-mono tabular-nums">
                      {activeDepartment.candidateCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Missing Docs</span>
                    <p className="text-lg font-bold text-rose-600 font-mono tabular-nums">
                      {activeDepartment.missingDocsCount}
                    </p>
                  </div>
                </div>

                {/* Sub-Department Management & Selector Bar */}
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                      Sub-Departments ({activeDepartment.subDepartments.length})
                    </span>
                    {canManage && !addingSubDept && (
                      <button
                        type="button"
                        onClick={() => setAddingSubDept(true)}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Sub-Department
                      </button>
                    )}
                  </div>

                  {addingSubDept && canManage && (
                    <form onSubmit={handleAddSubDepartment} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Downtown Luxury Desk or LLM Automation..."
                        value={newSubDeptName}
                        onChange={e => setNewSubDeptName(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={busy || !newSubDeptName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingSubDept(false);
                          setNewSubDeptName('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </form>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedSubDept('All')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selectedSubDept === 'All'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All ({activeDepartment.totalCount})
                    </button>

                    {activeDepartment.subDepartments.map(sub => {
                      const count = activeDepartment.subDepartmentCounts[sub.name] || 0;
                      const isActiveSub = selectedSubDept.toLowerCase() === sub.name.toLowerCase();

                      if (editingSubId === sub.id && canManage) {
                        return (
                          <div
                            key={sub.id}
                            className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-lg px-2 py-1"
                          >
                            <input
                              type="text"
                              value={editSubName}
                              onChange={e => setEditSubName(e.target.value)}
                              className="px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded w-36 text-slate-900"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveSubDeptRename(sub.id)}
                              className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                              title="Save Sub-Department Name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSubId(null)}
                              className="p-1 text-slate-600 hover:bg-slate-200 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={sub.id}
                          className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                            isActiveSub
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedSubDept(sub.name)}
                            className="px-2.5 py-1.5 font-medium inline-flex items-center gap-1.5"
                          >
                            <span>{sub.name}</span>
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.2 rounded tabular-nums ${
                                isActiveSub ? 'bg-slate-700 text-amber-300' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                          {canManage && (
                            <div className="flex items-center pr-1 border-l border-slate-200/40 ml-0.5 pl-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubId(sub.id);
                                  setEditSubName(sub.name);
                                }}
                                className={`p-1 rounded ${
                                  isActiveSub
                                    ? 'text-slate-300 hover:text-white'
                                    : 'text-slate-400 hover:text-slate-800'
                                }`}
                                title="Rename Sub-Department"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubDept(sub.id, sub.name)}
                                className={`p-1 rounded ${
                                  isActiveSub
                                    ? 'text-rose-300 hover:text-rose-200'
                                    : 'text-slate-400 hover:text-rose-600'
                                }`}
                                title="Remove Sub-Department"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(activeDepartment.subDepartmentCounts['__unassigned__'] || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSubDept('__unassigned__')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          selectedSubDept === '__unassigned__'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        General / Unassigned ({activeDepartment.subDepartmentCounts['__unassigned__']})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Department-Scoped Search & Filters */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={`Search inside ${activeDepartment.name} by name, code, role, email, desk...`}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-400 text-slate-900"
                  />
                </div>

                <select
                  value={personTypeFilter}
                  onChange={e => setPersonTypeFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
                >
                  <option value="ALL">All Profiles</option>
                  <option value="EMPLOYEE">Active Employees Only</option>
                  <option value="CANDIDATE">Upcoming Candidates Only</option>
                </select>

                <select
                  value={docFilter}
                  onChange={e => setDocFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
                >
                  <option value="ALL">All Document States</option>
                  <option value="MISSING">Missing Required Docs</option>
                  <option value="UPLOADED_REVIEW">Uploaded · Pending Review</option>
                  <option value="VERIFIED">All Required Verified</option>
                </select>
              </div>

              {/* Department Roster Table / Cards */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {activeDepartment.name}
                    {selectedSubDept !== 'All'
                      ? ` · ${selectedSubDept === '__unassigned__' ? 'General' : selectedSubDept}`
                      : ''}{' '}
                    Roster ({filteredMembers.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Click any row to open full dossier (Documents, Offer Letters, Assets & QR)
                  </span>
                </div>

                {filteredMembers.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <Users className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">
                      No profiles match the current filters in {activeDepartment.name}
                    </p>
                    {canManage && (
                      <div className="pt-2 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenAddPersonInDepartment(false, activeDepartment.name)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                          + Add Employee to {activeDepartment.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenAddPersonInDepartment(true, activeDepartment.name)}
                          className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold hover:bg-amber-200"
                        >
                          + Add Candidate
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile Card List */}
                    <div className="md:hidden divide-y divide-slate-100">
                      {filteredMembers.map(person => {
                        const docs = Object.values(person.documents || {});
                        const missingReqCount = docs.filter(
                          d =>
                            d.required &&
                            (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
                        ).length;
                        const uploadedReviewCount = docs.filter(
                          d => d.status === 'Uploaded' || d.status === 'Submitted' || d.status === 'Under Review'
                        ).length;
                        const qrMeta = person.documentQrMeta;

                        return (
                          <div
                            key={person.id}
                            onClick={() => onSelectPerson(person)}
                            className="p-3.5 space-y-2 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                                  {person.fullName.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 text-xs truncate">{person.fullName}</p>
                                  <p className="text-[11px] text-slate-500 font-mono truncate">
                                    {person.employeeCode} {person.desk ? `· Desk ${person.desk}` : ''}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                  person.isCandidate
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {person.isCandidate ? 'Candidate' : person.employmentStatus}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 truncate">
                              {person.designation} · {person.subDepartment || 'General Department'}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                              <div>
                                {missingReqCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                                    <FileWarning className="w-3.5 h-3.5 text-rose-600" />
                                    {missingReqCount} Missing
                                  </span>
                                ) : uploadedReviewCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                    {uploadedReviewCount} Uploaded
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                                    Verified
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => onOpenQrModal(person)}
                                  className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold flex items-center gap-1"
                                >
                                  <QrCode className="w-3 h-3 text-amber-400" />
                                  QR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSelectPerson(person)}
                                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold"
                                >
                                  Dossier
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4">Person</th>
                          <th className="py-2.5 px-3">Role & Sub-Department</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Documents & QR</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredMembers.map(person => {
                          const docs = Object.values(person.documents || {});
                          const missingReqCount = docs.filter(
                            d =>
                              d.required &&
                              (d.status === 'Missing' || d.status === 'Not Submitted' || d.status === 'Rejected')
                          ).length;
                          const uploadedReviewCount = docs.filter(
                            d => d.status === 'Uploaded' || d.status === 'Submitted' || d.status === 'Under Review'
                          ).length;
                          const qrMeta = person.documentQrMeta;

                          return (
                            <tr
                              key={person.id}
                              onClick={() => onSelectPerson(person)}
                              className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                                    {person.fullName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">{person.fullName}</p>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">
                                      {person.employeeCode} {person.desk ? `· Desk ${person.desk}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-3">
                                <p className="font-medium text-slate-800">{person.designation}</p>
                                <p className="text-[11px] text-slate-500">
                                  {person.subDepartment || 'General Department'}
                                </p>
                              </td>

                              <td className="py-3 px-3">
                                {person.isCandidate ? (
                                  <span className="inline-flex px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                                    Candidate
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                                    {person.employmentStatus}
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3">
                                <div className="flex flex-col gap-1">
                                  {missingReqCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                                      <FileWarning className="w-3.5 h-3.5 text-rose-600" />
                                      {missingReqCount} Missing Required
                                    </span>
                                  ) : uploadedReviewCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                      {uploadedReviewCount} Uploaded (Verify)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                                      All Verified
                                    </span>
                                  )}

                                  {qrMeta?.isActive ? (
                                    <span className="text-[10px] font-mono text-emerald-700">
                                      QR Active (24h window)
                                    </span>
                                  ) : qrMeta?.isExpired ? (
                                    <span className="text-[10px] font-mono text-rose-600">
                                      QR Expired · Reshare ready
                                    </span>
                                  ) : null}
                                </div>
                              </td>

                              <td
                                className="py-3 px-4 text-right whitespace-nowrap"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenQrModal(person)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors"
                                    title="Generate or View 24-Hour Document QR"
                                  >
                                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                                    {qrMeta?.isActive ? 'View QR' : qrMeta?.isExpired ? 'Regenerate QR' : 'Document QR'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectPerson(person)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors"
                                  >
                                    Dossier
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Create Department Modal */}
      {showCreateDeptModal && canManage && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                Create New Department
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateDeptModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDepartment} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Abu Dhabi Market or Commercial Leasing"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Market Focus</label>
                <select
                  value={newDeptMarket}
                  onChange={e => setNewDeptMarket(e.target.value as MarketType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="Gurgaon">Gurgaon</option>
                  <option value="Dubai">Dubai</option>
                  <option value="Dual Market">Dual Market</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Short summary of team scope..."
                  value={newDeptDesc}
                  onChange={e => setNewDeptDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Initial Sub-Departments (comma-separated, optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Primary Sales, Secondary Advisory, Intern Cohort"
                  value={newDeptSubList}
                  onChange={e => setNewDeptSubList(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDeptModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !newDeptName.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete & Reassign Department Modal */}
      {deletingDept && canManage && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-rose-950 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Delete Department — {deletingDept.name}</h3>
              <button
                type="button"
                onClick={() => setDeletingDept(null)}
                className="text-rose-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {deletingDept.totalCount > 0 ? (
                <div className="space-y-3">
                  <p className="text-slate-700 leading-relaxed">
                    <strong>{deletingDept.name}</strong> currently contains{' '}
                    <strong>{deletingDept.totalCount}</strong> profile(s). Select the target department to move them into before deleting:
                  </p>
                  <select
                    value={reassignTargetDeptId}
                    onChange={e => setReassignTargetDeptId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    {departments
                      .filter(d => d.id !== deletingDept.id)
                      .map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.totalCount} members)
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <p className="text-slate-700">
                  Are you sure you want to delete the empty department <strong>{deletingDept.name}</strong>?
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingDept(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || (deletingDept.totalCount > 0 && !reassignTargetDeptId)}
                  onClick={handleConfirmDeleteDept}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {busy ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dynamic Employment Categories Management */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold tracking-tight">Employment Categories</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                HR can configure custom employment categories dynamically (e.g. Employee, Intern, Consultant, Contractor). Each active profile is categorized to allow targeted rosters, policies, and permissions.
              </p>

              {/* Existing Categories List */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Active Categories ({categories.length})
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categories.map(cat => {
                    const memberCount = employees.filter(
                      e => (e.employmentCategory || (e.employmentStatus === 'Intern' ? 'Intern' : 'Employee')) === cat
                    ).length;
                    const isSystem = ['Employee', 'Intern'].includes(cat);

                    return (
                      <div
                        key={cat}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/80"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 truncate block">{cat}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {memberCount} active profile{memberCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        {!isSystem && canManage && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            disabled={categoryLoading}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title={`Delete category "${cat}"`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isSystem && (
                          <span className="text-[9px] font-semibold text-slate-400 uppercase bg-slate-200/80 px-1.5 py-0.5 rounded">
                            Core
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Category Form */}
              {canManage && (
                <form onSubmit={handleAddCategory} className="pt-3 border-t border-slate-200 space-y-2.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Add New Employment Category
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Retainer, Advisor, Partner"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-slate-900"
                    />
                    <button
                      type="submit"
                      disabled={categoryLoading || !newCategoryName.trim()}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>{categoryLoading ? 'Adding...' : 'Add Category'}</span>
                    </button>
                  </div>
                </form>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
