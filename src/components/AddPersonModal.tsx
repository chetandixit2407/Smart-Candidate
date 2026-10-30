import React, { useState, useEffect } from 'react';
import { X, UserPlus, Lock, QrCode, Building2 } from 'lucide-react';
import {
  Employee,
  UserRole,
  MarketType,
  ALL_DESK_CODES,
  DepartmentWithCounts,
  isInternAllowedDepartment,
} from '../types/index.js';

interface AddPersonModalProps {
  isOpen: boolean;
  isCandidateDefault: boolean;
  onClose: () => void;
  onCreate: (
    emp: Partial<Employee>,
    options?: { openQrAfterCreate?: boolean }
  ) => Promise<Employee | void>;
  userRole: UserRole;
  departments?: DepartmentWithCounts[];
  defaultDepartment?: string;
  defaultSubDepartment?: string;
}

const FALLBACK_DEPARTMENTS = [
  'HR',
  'AI',
  'DA',
  'DM',
  'Gurgaon Market',
  'Dubai Market',
  'Administration & Operations',
  'Executive Leadership',
];

export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  isOpen,
  isCandidateDefault,
  onClose,
  onCreate,
  userRole,
  departments = [],
  defaultDepartment,
  defaultSubDepartment,
}) => {
  const [isCandidate, setIsCandidate] = useState(isCandidateDefault);
  const [openQrAfterCreate, setOpenQrAfterCreate] = useState<boolean>(true);
  const initialDeptName =
    defaultDepartment || departments[0]?.name || 'Gurgaon Market';
  const initialDeptObj = departments.find(d => d.name === initialDeptName);
  const initialIsInternAllowed = isInternAllowedDepartment(initialDeptName);
  const initialSubDept =
    defaultSubDepartment !== undefined
      ? defaultSubDepartment
      : (initialDeptObj?.subDepartments || []).find(
          s => initialIsInternAllowed || !s.name.toLowerCase().includes('intern')
        )?.name || '';

  const [formData, setFormData] = useState<Partial<Employee>>({
    fullName: '',
    employeeCode: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: 'Male',
    nationality: 'Indian',
    department: initialDeptName,
    departmentId: initialDeptObj?.id,
    subDepartment: initialSubDept,
    employmentCategory: initialIsInternAllowed && initialSubDept.toLowerCase().includes('intern')
      ? 'Intern'
      : 'Employee',
    designation: 'Property Consultant',
    reportingManager: 'Varun Batra',
    joiningDate: new Date().toISOString().split('T')[0],
    internshipCompletionDate: '',
    jobEndDate: '',
    market: initialDeptName === 'Dubai Market' ? 'Dubai' : 'Gurgaon',
    desk: '',
    previousCompany: '',
    previousDesignation: '',
    previousCTC: '',
    offeredCTC: '',
    totalExperienceYears: 2,
    gurgaonMarketExperience: '',
    dubaiMarketExperience: '',
    currentAddress: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setIsCandidate(isCandidateDefault);
    const deptName = defaultDepartment || departments[0]?.name || 'Gurgaon Market';
    const deptObj = departments.find(d => d.name === deptName);
    const isInternAllowed = isInternAllowedDepartment(deptName);
    const subName =
      defaultSubDepartment !== undefined
        ? defaultSubDepartment
        : (deptObj?.subDepartments || []).find(
            s => isInternAllowed || !s.name.toLowerCase().includes('intern')
          )?.name || '';

    setFormData(prev => ({
      ...prev,
      department: deptName,
      departmentId: deptObj?.id,
      subDepartment: subName,
      employmentCategory: isInternAllowed ? prev.employmentCategory : 'Employee',
      market: deptName === 'Dubai Market' ? 'Dubai' : prev.market || 'Gurgaon',
    }));
  }, [isOpen, isCandidateDefault, defaultDepartment, defaultSubDepartment, departments]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const isCurrentInternAllowed = isInternAllowedDepartment(formData.department);
  const selectedDeptObj = departments.find(
    d => d.id === formData.departmentId || d.name === formData.department
  );
  const availableSubDepts = (selectedDeptObj?.subDepartments || []).filter(
    s => isCurrentInternAllowed || !s.name.toLowerCase().includes('intern')
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName?.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }
    if (!formData.department?.trim()) {
      setErrorMsg('Department selection is required.');
      return;
    }

    const isInternAllowed = isInternAllowedDepartment(formData.department);
    const chosenCat = isInternAllowed ? (formData.employmentCategory || 'Employee') : 'Employee';
    const chosenStatus = isCandidate
      ? 'Upcoming Joiner'
      : (chosenCat === 'Intern' && isInternAllowed ? 'Intern' : 'Full-Time');

    try {
      setSaving(true);
      setErrorMsg('');
      await onCreate(
        {
          ...formData,
          isCandidate,
          employmentCategory: chosenCat,
          employmentStatus: chosenStatus,
          internshipCompletionDate: isInternAllowed ? formData.internshipCompletionDate : undefined,
          candidateStatus: isCandidate ? 'Offer Accepted' : undefined,
        },
        { openQrAfterCreate }
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register person';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] my-auto">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserPlus className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-semibold tracking-tight text-white truncate">
              {isCandidate ? 'Register New Candidate / Joiner' : 'Add New Active Employee'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button>
        </div>

        {errorMsg && (
          <div className="px-4 sm:px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-5">
          {/* Record Type Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <label className="flex items-center gap-1.5 font-medium cursor-pointer">
              <input
                type="radio"
                name="personType"
                checked={!isCandidate}
                onChange={() => setIsCandidate(false)}
                className="text-slate-900"
              />
              <span>Active Employee</span>
            </label>
            <label className="flex items-center gap-1.5 font-medium cursor-pointer">
              <input
                type="radio"
                name="personType"
                checked={isCandidate}
                onChange={() => setIsCandidate(true)}
                className="text-slate-900"
              />
              <span>Candidate / Upcoming Joiner</span>
            </label>
          </div>

          {/* Section: Basic Identity */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Identity & Contact Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arjun Kapoor"
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Employee Code (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank to auto-generate (e.g. WCR-025)"
                  value={formData.employeeCode}
                  onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  placeholder="name@whitecollarrealty.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98110 ..."
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Date of Birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Nationality</label>
                <input
                  type="text"
                  value={formData.nationality}
                  onChange={e => setFormData({ ...formData, nationality: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Section: Role & Department */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Department, Role & Office Placement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  <span>Department *</span>
                </label>
                <select
                  value={formData.department || ''}
                  onChange={e => {
                    const nextName = e.target.value;
                    const matched = departments.find(d => d.name === nextName);
                    const isNextInternAllowed = isInternAllowedDepartment(nextName);
                    const validSubs = (matched?.subDepartments || []).filter(
                      s => isNextInternAllowed || !s.name.toLowerCase().includes('intern')
                    );
                    const nextSub = validSubs[0]?.name || '';
                    setFormData({
                      ...formData,
                      department: nextName,
                      departmentId: matched?.id,
                      subDepartment: nextSub,
                      employmentCategory: isNextInternAllowed ? formData.employmentCategory : 'Employee',
                      internshipCompletionDate: isNextInternAllowed ? formData.internshipCompletionDate : '',
                      market:
                        nextName === 'Dubai Market'
                          ? 'Dubai'
                          : nextName === 'Gurgaon Market'
                            ? 'Gurgaon'
                            : formData.market,
                    });
                  }}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                >
                  {(departments.length > 0
                    ? departments.map(d => d.name)
                    : FALLBACK_DEPARTMENTS
                  ).map(deptName => (
                    <option key={deptName} value={deptName}>
                      {deptName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Sub-Department / Unit
                </label>
                {availableSubDepts.length > 0 ? (
                  <select
                    value={formData.subDepartment || ''}
                    onChange={e => setFormData({ ...formData, subDepartment: e.target.value })}
                    className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    <option value="">— General (Department Root) —</option>
                    {availableSubDepts.map(sub => (
                      <option key={sub.id} value={sub.name}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Optional sub-unit (e.g. Off-Plan Team)"
                    value={formData.subDepartment || ''}
                    onChange={e => setFormData({ ...formData, subDepartment: e.target.value })}
                    className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Employment Category *
                </label>
                <select
                  value={isCurrentInternAllowed ? (formData.employmentCategory || 'Employee') : 'Employee'}
                  onChange={e => {
                    const cat = e.target.value as any;
                    setFormData({
                      ...formData,
                      employmentCategory: cat,
                    });
                  }}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium"
                >
                  <option value="Employee">Employee (Full-Time Regular)</option>
                  {isCurrentInternAllowed && (
                    <option value="Intern">Intern (Cohort / Stipend Trainee)</option>
                  )}
                  <option value="Consultant">Consultant (Professional / Advisory)</option>
                  <option value="Contractor">Contractor (Fixed-Term Agreement)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Designation / Role Title</label>
                <input
                  type="text"
                  placeholder="e.g. Senior Portfolio Consultant"
                  value={formData.designation}
                  onChange={e => setFormData({ ...formData, designation: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Reporting Manager</label>
                <input
                  type="text"
                  placeholder="e.g. Varun Batra / Rohit Juneja"
                  value={formData.reportingManager}
                  onChange={e => setFormData({ ...formData, reportingManager: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  {isCandidate ? 'Expected Joining Date' : 'Official Joining Date'}
                </label>
                <input
                  type="date"
                  value={formData.joiningDate}
                  onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Internship / Contract End Date <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={formData.internshipCompletionDate || formData.jobEndDate || ''}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      internshipCompletionDate: e.target.value,
                      jobEndDate: e.target.value,
                    })
                  }
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Market Operational Focus</label>
                <select
                  value={formData.market}
                  onChange={e => setFormData({ ...formData, market: e.target.value as MarketType })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                >
                  <option value="Gurgaon">Gurgaon (NCR)</option>
                  <option value="Dubai">Dubai (UAE)</option>
                  <option value="Dual Market">Dual Market (Gurgaon & Dubai)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Designated Desk (A1–H5)</label>
                <select
                  value={formData.desk || ''}
                  onChange={e => setFormData({ ...formData, desk: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
                >
                  <option value="">-- Unassigned --</option>
                  {ALL_DESK_CODES.map(code => (
                    <option key={code} value={code}>
                      Desk {code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Spreadsheet Raw Seat Code <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. CB, AC, Reception"
                  value={formData.sourceSpreadsheetSeat || ''}
                  onChange={e => setFormData({ ...formData, sourceSpreadsheetSeat: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Section: Compensation & Previous CTC (Strictly Separated) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              Compensation & Market Experience
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Previous Company</label>
                <input
                  type="text"
                  placeholder="e.g. DLF / JLL / Anarock"
                  value={formData.previousCompany}
                  onChange={e => setFormData({ ...formData, previousCompany: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Previous Verified CTC</label>
                <input
                  type="text"
                  placeholder="e.g. ₹8,50,000 p.a. or AED 120,000 p.a."
                  value={formData.previousCTC}
                  onChange={e => setFormData({ ...formData, previousCTC: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Offered CTC (White Collar Realty)</label>
                <input
                  type="text"
                  placeholder="e.g. ₹13,50,000 p.a."
                  value={formData.offeredCTC}
                  onChange={e => setFormData({ ...formData, offeredCTC: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Total Experience (Years)</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.totalExperienceYears || 0}
                  onChange={e => setFormData({ ...formData, totalExperienceYears: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Automatic New Profile Onboarding & 24-Hour Document QR Option */}
          <div className="p-3 bg-amber-50/70 rounded-lg border border-amber-200 space-y-1.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={openQrAfterCreate}
                onChange={e => setOpenQrAfterCreate(e.target.checked)}
                className="mt-0.5 rounded border-amber-400 text-slate-900 focus:ring-slate-900"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-amber-600" />
                  Open &ldquo;Generate Document QR&rdquo; immediately after saving
                </span>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Every new profile automatically initializes document tracking (Missing → Uploaded → Verified), department placement, offer letters, asset tracking, and 24-hour QR generation.
                </p>
              </div>
            </label>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Registering...' : isCandidate ? 'Save Candidate Record' : 'Save Employee Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
