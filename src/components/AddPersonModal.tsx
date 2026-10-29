import React, { useState } from 'react';
import { X, UserPlus, Lock } from 'lucide-react';
import { Employee, UserRole, MarketType } from '../types/index.js';
import { ALL_DESK_CODES } from '../../server/seedData.js';

interface AddPersonModalProps {
  isOpen: boolean;
  isCandidateDefault: boolean;
  onClose: () => void;
  onCreate: (emp: Partial<Employee>) => Promise<void>;
  userRole: UserRole;
}

export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  isOpen,
  isCandidateDefault,
  onClose,
  onCreate,
  userRole,
}) => {
  const [isCandidate, setIsCandidate] = useState(isCandidateDefault);
  const [formData, setFormData] = useState<Partial<Employee>>({
    fullName: '',
    employeeCode: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: 'Male',
    nationality: 'Indian',
    department: 'Sales & Investments',
    designation: 'Property Consultant',
    reportingManager: 'Varun Batra',
    joiningDate: new Date().toISOString().split('T')[0],
    market: 'Gurgaon',
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

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName) {
      setErrorMsg('Full Name is required.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');
      await onCreate({
        ...formData,
        isCandidate,
        employmentStatus: isCandidate ? 'Upcoming Joiner' : 'Full-Time',
        candidateStatus: isCandidate ? 'Offer Accepted' : undefined,
      });
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
                <label className="text-xs font-medium text-slate-700">Department</label>
                <select
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                >
                  <option value="Sales & Investments">Sales & Investments</option>
                  <option value="Luxury Residential & Investments">Luxury Residential & Investments</option>
                  <option value="Commercial Leasing">Commercial Leasing</option>
                  <option value="CRM & Client Relations">CRM & Client Relations</option>
                  <option value="Marketing & Digital Media">Marketing & Digital Media</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Finance & Accounts">Finance & Accounts</option>
                  <option value="Operations & Legal">Operations & Legal</option>
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
