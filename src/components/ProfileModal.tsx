import React, { useState } from 'react';
import {
  X,
  User,
  Briefcase,
  GraduationCap,
  FileText,
  Users2,
  Package,
  History,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  UploadCloud,
  FileCheck,
  Building,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Lock,
  ExternalLink,
  Plus,
  RotateCcw,
  Edit3,
  ChevronDown,
  ChevronUp,
  Smartphone,
  KeyRound,
  Wifi,
  Laptop,
  Check,
  Copy,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  Employee,
  CompanyAsset,
  UserRole,
  DocumentStatus,
  DocumentRecord,
  AssetCategory,
  AssetCondition,
  ALL_DESK_CODES,
  UploadToken,
} from '../types/index.js';
import { LiveDocumentViewerModal } from './LiveDocumentViewerModal.js';

interface ProfileModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Employee>) => Promise<void>;
  onUpdateDocumentStatus: (docKey: string, status: DocumentStatus, notes: string) => Promise<void>;
  assets: CompanyAsset[];
  userRole: UserRole;
  currentUserName: string;
  onIssueAsset?: (assetId: string, employeeId: string, issueDate: string, notes: string) => Promise<void>;
  onCreateAndIssueAsset?: (assetData: Partial<CompanyAsset>) => Promise<void>;
  onReturnAsset?: (assetId: string, returnDate: string, condition: AssetCondition, notes: string) => Promise<void>;
  onUpdateAsset?: (assetId: string, updates: Partial<CompanyAsset>) => Promise<void>;
  onUploadDocumentFile?: (employeeId: string, docKey: string, fileData: string, fileName: string, fileSize: string, mimeType: string) => Promise<void>;
  onGenerateUploadLink?: (candidateId: string) => Promise<{ success: boolean; token: UploadToken; message: string }>;
  onRevokeUploadLink?: (candidateId: string) => Promise<{ success: boolean; message: string }>;
  onOpenCandidatePortal?: (token: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  employee,
  isOpen,
  onClose,
  onUpdate,
  onUpdateDocumentStatus,
  assets,
  userRole,
  currentUserName,
  onIssueAsset,
  onCreateAndIssueAsset,
  onReturnAsset,
  onUpdateAsset,
  onUploadDocumentFile,
  onGenerateUploadLink,
  onRevokeUploadLink,
  onOpenCandidatePortal,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'family' | 'experience' | 'education' | 'references' | 'documents' | 'assets'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({ ...employee });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);

  React.useEffect(() => {
    setFormData({ ...employee });
  }, [employee]);

  // Selected document for reviewer notes update or live viewer
  const [selectedDocKey, setSelectedDocKey] = useState<string | null>(null);
  const [docNotesInput, setDocNotesInput] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  // Asset Management state within profile
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueMode, setIssueMode] = useState<'existing' | 'new'>('existing');
  const [selectedStockAssetId, setSelectedStockAssetId] = useState('');
  const [issueDateInput, setIssueDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [issueNotesInput, setIssueNotesInput] = useState('');
  
  // New asset form fields
  const [newAssetType, setNewAssetType] = useState<AssetCategory>('Access Card');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetSerial, setNewAssetSerial] = useState('');
  const [newAssetCondition, setNewAssetCondition] = useState<AssetCondition>('Brand New');

  // Return modal
  const [returningAsset, setReturningAsset] = useState<CompanyAsset | null>(null);
  const [returnDateInput, setReturnDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [returnConditionInput, setReturnConditionInput] = useState<AssetCondition>('Good');
  const [returnNotesInput, setReturnNotesInput] = useState('');

  // Update asset modal
  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editSerialInput, setEditSerialInput] = useState('');
  const [editConditionInput, setEditConditionInput] = useState<AssetCondition>('Good');
  const [editNotesInput, setEditNotesInput] = useState('');

  // Expanded history for an asset
  const [expandedHistoryAssetId, setExpandedHistoryAssetId] = useState<string | null>(null);
  const [assetActionLoading, setAssetActionLoading] = useState(false);

  if (!isOpen) return null;

  const isViewer = userRole === 'DEPT_HEAD_VIEWER';
  
  // Active assets currently held by this employee/candidate
  const assignedAssets = assets.filter(
    a => a.assignedEmployeeId === employee.id && a.status === 'In Use'
  );

  // Assets previously returned by this person
  const returnedAssets = assets.filter(
    a =>
      a.history.some(
        h =>
          h.action === 'Returned' &&
          h.employeeName?.toLowerCase().includes(employee.fullName.toLowerCase())
      ) ||
      (a.assignedEmployeeId === employee.id && a.status === 'Available' && a.returnDate)
  );

  // Available stock assets ready to be issued
  const availableStockAssets = assets.filter(a => a.status === 'Available');

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');
      await onUpdate(formData);
      setSuccessMsg('Profile successfully updated.');
      setIsEditing(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDocStatusChange = async (docKey: string, newStatus: DocumentStatus) => {
    try {
      setErrorMsg('');
      await onUpdateDocumentStatus(docKey, newStatus, docNotesInput);
      setSelectedDocKey(null);
      setDocNotesInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update document status';
      setErrorMsg(msg);
    }
  };

  // Avatar resolution: If Chetan Sharma, use high-fidelity generated portrait
  const isChetan = employee.fullName.toLowerCase().includes('chetan');
  const avatarUrl = isChetan ? '/src/assets/images/avatar_chetan_sharma_1793257665587.jpg' : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] my-auto">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={employee.fullName}
                referrerPolicy="no-referrer"
                className="w-10 h-10 sm:w-13 sm:h-13 rounded-full object-cover border-2 border-amber-400/80 shadow-md shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-bold text-amber-400 text-sm sm:text-lg shrink-0">
                {employee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white truncate">
                  {employee.fullName}
                </h2>
                <span className="font-mono text-[11px] sm:text-xs text-amber-300 bg-amber-500/20 px-1.5 sm:px-2 py-0.5 rounded border border-amber-400/30">
                  {employee.employeeCode}
                </span>
                {employee.isCandidate && (
                  <span className="text-[10px] sm:text-xs text-blue-200 bg-blue-500/20 px-1.5 sm:px-2 py-0.5 rounded border border-blue-400/30">
                    Candidate / Joiner
                  </span>
                )}
                {employee.desk && (
                  <span className="text-[10px] sm:text-xs text-slate-300 bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded border border-slate-700">
                    Desk: {employee.desk}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate mt-0.5">
                {employee.designation} · {employee.department} · {employee.market} Market
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Completion Gauge */}
            <div className="hidden sm:flex flex-col items-end">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Profile Readiness:</span>
                <span className="font-mono font-semibold text-amber-300 tabular-nums">
                  {employee.profileCompletion}%
                </span>
              </div>
              <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${employee.profileCompletion}%` }}
                />
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="px-4 sm:px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-700 font-semibold">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="px-4 sm:px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
            {successMsg}
          </div>
        )}

        {/* Tab Strip */}
        <div className="px-3 sm:px-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 py-1.5">
            {[
              { id: 'profile', label: 'Basic Info', icon: User },
              { id: 'family', label: 'Family & Emergency', icon: Users2 },
              { id: 'experience', label: 'Experience & CTC', icon: Briefcase },
              { id: 'education', label: 'Academics & Degrees', icon: GraduationCap },
              { id: 'references', label: 'References', icon: FileCheck },
              { id: 'documents', label: 'Document Checklist', icon: FileText, badge: Object.values(employee.documents || {}).length },
              { id: 'assets', label: 'Company Assets', icon: Package, badge: assignedAssets.length },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!isViewer && activeTab !== 'documents' && activeTab !== 'assets' && (
            <div className="flex items-center gap-2 shrink-0 py-1.5 ml-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setFormData({ ...employee });
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-3.5 py-1.5 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Edit Profile
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-5 sm:space-y-6">
          {/* TAB 1: BASIC INFO */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.fullName || ''}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                    />
                  ) : (
                    <p className="text-xs font-semibold text-slate-900 mt-1">{employee.fullName}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Employee / Candidate Code</label>
                  {isEditing && !isViewer ? (
                    <input
                      type="text"
                      value={formData.employeeCode || ''}
                      onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                    />
                  ) : (
                    <p className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-1 inline-block">
                      {employee.employeeCode}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Official Work Email</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                    />
                  ) : (
                    <p className="text-xs font-medium text-slate-800 mt-1 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {employee.email || '—'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Primary Contact Phone</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.phone || ''}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                    />
                  ) : (
                    <p className="text-xs font-mono text-slate-800 mt-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {employee.phone || '—'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Alternate Contact Phone</label>
                  {isEditing ? (
                    <input
                      type="text"
                      placeholder="Optional alternate"
                      value={formData.alternatePhone || ''}
                      onChange={e => setFormData({ ...formData, alternatePhone: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  ) : (
                    <p className="text-xs font-mono text-slate-800 mt-1">
                      {employee.alternatePhone || '—'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Date of Birth</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formData.dateOfBirth || ''}
                      onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  ) : (
                    <p className="text-xs font-mono text-slate-800 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {employee.dateOfBirth || '—'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Gender & Nationality</label>
                  {isEditing ? (
                    <div className="flex gap-2 mt-1">
                      <select
                        value={formData.gender || 'Male'}
                        onChange={e => setFormData({ ...formData, gender: e.target.value as 'Male' | 'Female' | 'Other' })}
                        className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Nationality"
                        value={formData.nationality || ''}
                        onChange={e => setFormData({ ...formData, nationality: e.target.value })}
                        className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-800 mt-1">
                      {employee.gender || '—'} · {employee.nationality || 'Indian'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500">Employment Status</label>
                  {isEditing ? (
                    <select
                      value={formData.employmentStatus || 'Full-Time'}
                      onChange={e => setFormData({ ...formData, employmentStatus: e.target.value as Employee['employmentStatus'] })}
                      className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    >
                      <option value="Full-Time">Full-Time</option>
                      <option value="Intern">Intern</option>
                      <option value="Probation">Probation</option>
                      <option value="Notice Period">Notice Period</option>
                      <option value="Upcoming Joiner">Upcoming Joiner</option>
                      <option value="Ex-Employee">Ex-Employee</option>
                    </select>
                  ) : (
                    <p className="text-xs font-semibold text-slate-800 mt-1">{employee.employmentStatus}</p>
                  )}
                </div>
              </div>

              {/* Department & Operational Alignment */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Department & Role Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500">Department</label>
                    {isEditing ? (
                      <select
                        value={formData.department || ''}
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
                    ) : (
                      <p className="text-xs font-medium text-slate-900 mt-1">{employee.department}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Designation / Title</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.designation || ''}
                        onChange={e => setFormData({ ...formData, designation: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-medium text-slate-900 mt-1">{employee.designation}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Reporting Manager</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.reportingManager || ''}
                        onChange={e => setFormData({ ...formData, reportingManager: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-800 mt-1">{employee.reportingManager || 'Management'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Assigned Desk</label>
                    {isEditing && !isViewer ? (
                      <select
                        value={formData.desk || ''}
                        onChange={e => setFormData({ ...formData, desk: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded bg-white text-slate-900"
                      >
                        <option value="">— Unassigned (No Desk) —</option>
                        {ALL_DESK_CODES.map(code => (
                          <option key={code} value={code}>
                            Desk {code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-1 inline-block">
                        {employee.desk || 'Not Assigned'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Joining Date</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={formData.joiningDate || ''}
                        onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-mono text-slate-800 mt-1">{employee.joiningDate || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Internship Completion Date</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={formData.internshipCompletionDate || ''}
                        onChange={e => setFormData({ ...formData, internshipCompletionDate: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-mono text-slate-800 mt-1">
                        {employee.internshipCompletionDate || 'N/A (Regular Employee)'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Market Operational Focus</label>
                    {isEditing ? (
                      <select
                        value={formData.market || 'Gurgaon'}
                        onChange={e => setFormData({ ...formData, market: e.target.value as Employee['market'] })}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                      >
                        <option value="Gurgaon">Gurgaon (NCR)</option>
                        <option value="Dubai">Dubai (UAE)</option>
                        <option value="Dual Market">Dual Market (Gurgaon & Dubai)</option>
                      </select>
                    ) : (
                      <p className="text-xs font-medium text-slate-800 mt-1">{employee.market}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Addresses */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Residential Addresses
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      Current Residential Address
                    </span>
                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={formData.currentAddress || ''}
                        onChange={e => setFormData({ ...formData, currentAddress: e.target.value })}
                        className="mt-2 w-full p-2 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-800 mt-1.5 leading-relaxed">
                        {employee.currentAddress || 'Not provided yet'}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      Permanent Address
                    </span>
                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={formData.permanentAddress || ''}
                        onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })}
                        className="mt-2 w-full p-2 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-800 mt-1.5 leading-relaxed">
                        {employee.permanentAddress || 'Same as current address'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Banking & Identity Numbers (Confidential) */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    Banking, Identity & Compliance Numbers
                  </h3>
                  {isViewer ? (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                      Masked for Viewer Role
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                      HR Access Verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Aadhaar Number</span>
                    {isEditing && !isViewer ? (
                      <input
                        type="text"
                        placeholder="12-digit Aadhaar"
                        value={formData.identityDetails?.aadhaarNo || ''}
                        onChange={e => setFormData({
                          ...formData,
                          identityDetails: { ...(formData.identityDetails || {}), aadhaarNo: e.target.value }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-mono font-semibold text-slate-900 mt-1">
                        {isViewer ? '•••• •••• ••••' : employee.identityDetails?.aadhaarNo || '—'}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">PAN Card Number</span>
                    {isEditing && !isViewer ? (
                      <input
                        type="text"
                        placeholder="10-char PAN"
                        value={formData.identityDetails?.panNo || ''}
                        onChange={e => setFormData({
                          ...formData,
                          identityDetails: { ...(formData.identityDetails || {}), panNo: e.target.value.toUpperCase() }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded uppercase"
                      />
                    ) : (
                      <p className="text-xs font-mono font-semibold text-slate-900 mt-1">
                        {isViewer ? '••••••••••' : employee.identityDetails?.panNo || '—'}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Bank Account Number</span>
                    {isEditing && !isViewer ? (
                      <input
                        type="text"
                        placeholder="Account No"
                        value={formData.bankDetails?.accountNo || ''}
                        onChange={e => setFormData({
                          ...formData,
                          bankDetails: { ...(formData.bankDetails || {}), accountNo: e.target.value }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-mono font-semibold text-slate-900 mt-1">
                        {isViewer ? '••••••••••••' : employee.bankDetails?.accountNo || '—'}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Bank & IFSC Code</span>
                    {isEditing && !isViewer ? (
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="text"
                          placeholder="Bank Name"
                          value={formData.bankDetails?.bankName || ''}
                          onChange={e => setFormData({
                            ...formData,
                            bankDetails: { ...(formData.bankDetails || {}), bankName: e.target.value }
                          })}
                          className="w-1/2 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                        <input
                          type="text"
                          placeholder="IFSC"
                          value={formData.bankDetails?.ifscCode || ''}
                          onChange={e => setFormData({
                            ...formData,
                            bankDetails: { ...(formData.bankDetails || {}), ifscCode: e.target.value.toUpperCase() }
                          })}
                          className="w-1/2 px-2 py-1 text-xs font-mono border border-slate-300 rounded uppercase"
                        />
                      </div>
                    ) : (
                      <p className="text-xs font-mono font-medium text-slate-900 mt-1 truncate">
                        {employee.bankDetails?.bankName || '—'} {employee.bankDetails?.ifscCode ? `(${employee.bankDetails.ifscCode})` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Google Drive Archive Link */}
                <div className="mt-3 p-3 bg-blue-50/60 rounded-lg border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📁</span>
                    <div>
                      <p className="text-xs font-semibold text-blue-900">Google Drive Document Archive Folder</p>
                      <p className="text-[11px] text-blue-700 truncate max-w-lg">
                        Shared folder containing submitted marksheets, ID scans, and photographs.
                      </p>
                    </div>
                  </div>
                  {isEditing && !isViewer ? (
                    <input
                      type="url"
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={formData.googleDriveLink || ''}
                      onChange={e => setFormData({ ...formData, googleDriveLink: e.target.value })}
                      className="px-3 py-1 bg-white text-xs border border-blue-300 rounded w-full sm:w-72"
                    />
                  ) : isViewer ? (
                    <span className="text-xs text-slate-400 font-mono">Restricted</span>
                  ) : employee.googleDriveLink ? (
                    <a
                      href={employee.googleDriveLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                    >
                      Open Drive Folder
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No Drive folder linked</span>
                  )}
                </div>
              </div>

              {/* Onboarding Aspirations (From Chetan Information Sheet) */}
              {employee.aspirations && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
                    Onboarding Aspirations & Career Goals
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {employee.aspirations.whyWhiteCollarRealty && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">What Inspired Decision to Join</span>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          {employee.aspirations.whyWhiteCollarRealty}
                        </p>
                      </div>
                    )}
                    {employee.aspirations.associationDuration && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Association & Growth Plan</span>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          {employee.aspirations.associationDuration}
                        </p>
                      </div>
                    )}
                    {employee.aspirations.shortTermGoal && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Short Term Goal</span>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          {employee.aspirations.shortTermGoal}
                        </p>
                      </div>
                    )}
                    {employee.aspirations.longTermGoal && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-700">Long Term Goal</span>
                        <p className="text-slate-600 leading-relaxed text-[11px]">
                          {employee.aspirations.longTermGoal}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FAMILY & EMERGENCY */}
          {activeTab === 'family' && (
            <div className="space-y-6">
              {/* Emergency Contact */}
              <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900 mb-2">
                  Emergency Contact Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500">Contact Person Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.emergencyContact?.name || ''}
                        onChange={e => setFormData({
                          ...formData,
                          emergencyContact: { ...(formData.emergencyContact || { relation: '', phone: '' }), name: e.target.value }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-semibold text-slate-900 mt-0.5">
                        {employee.emergencyContact?.name || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Relationship</label>
                    {isEditing ? (
                      <input
                        type="text"
                        placeholder="Father / Spouse / Sibling"
                        value={formData.emergencyContact?.relation || ''}
                        onChange={e => setFormData({
                          ...formData,
                          emergencyContact: { ...(formData.emergencyContact || { name: '', phone: '' }), relation: e.target.value }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-medium text-slate-800 mt-0.5">
                        {employee.emergencyContact?.relation || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Emergency Phone</label>
                    {isEditing ? (
                      <input
                        type="text"
                        placeholder="Phone Number"
                        value={formData.emergencyContact?.phone || ''}
                        onChange={e => setFormData({
                          ...formData,
                          emergencyContact: { ...(formData.emergencyContact || { name: '', relation: '' }), phone: e.target.value }
                        })}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs font-mono font-medium text-slate-800 mt-0.5">
                        {isViewer ? '••••••••••' : employee.emergencyContact?.phone || '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Family Members Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Family Members & Next of Kin
                  </h3>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        const current = formData.familyDetails || [];
                        setFormData({
                          ...formData,
                          familyDetails: [...current, { relation: 'Parent', name: '', phone: '', occupation: '' }],
                        });
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3 h-3 text-amber-600" />
                      Add Family Member
                    </button>
                  )}
                </div>

                {formData.familyDetails && formData.familyDetails.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                        <tr>
                          <th className="px-4 py-2.5">Relationship</th>
                          <th className="px-4 py-2.5">Full Name</th>
                          <th className="px-4 py-2.5">Occupation</th>
                          <th className="px-4 py-2.5">Contact Number</th>
                          {isEditing && <th className="px-4 py-2.5 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.familyDetails.map((f, i) => (
                          <tr key={i} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={f.relation}
                                  onChange={e => {
                                    const next = [...(formData.familyDetails || [])];
                                    next[i] = { ...next[i], relation: e.target.value };
                                    setFormData({ ...formData, familyDetails: next });
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="font-medium text-slate-700">{f.relation}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={f.name}
                                  onChange={e => {
                                    const next = [...(formData.familyDetails || [])];
                                    next[i] = { ...next[i], name: e.target.value };
                                    setFormData({ ...formData, familyDetails: next });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="font-semibold text-slate-900">{f.name}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={f.occupation || ''}
                                  onChange={e => {
                                    const next = [...(formData.familyDetails || [])];
                                    next[i] = { ...next[i], occupation: e.target.value };
                                    setFormData({ ...formData, familyDetails: next });
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="text-slate-600">{f.occupation || '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={f.phone || ''}
                                  onChange={e => {
                                    const next = [...(formData.familyDetails || [])];
                                    next[i] = { ...next[i], phone: e.target.value };
                                    setFormData({ ...formData, familyDetails: next });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="font-mono text-slate-800">
                                  {isViewer ? '••••••••••' : f.phone}
                                </span>
                              )}
                            </td>
                            {isEditing && (
                              <td className="px-4 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (formData.familyDetails || []).filter((_, idx) => idx !== i);
                                    setFormData({ ...formData, familyDetails: next });
                                  }}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                    No family details recorded yet. Click &quot;Add Family Member&quot; above to add next of kin.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: EXPERIENCE & CTC */}
          {activeTab === 'experience' && (
            <div className="space-y-6">
              {/* Separate & Explicitly Labeled CTC Section */}
              <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs border border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <span className="text-xs font-semibold tracking-wider uppercase text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Compensation & CTC Information (Confidential)
                  </span>
                  {isViewer ? (
                    <span className="text-[11px] text-amber-400 font-mono bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                      RESTRICTED TO HR ADMIN
                    </span>
                  ) : (
                    <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                      AUTHORIZED VIEW
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700">
                    <span className="text-[11px] text-slate-400 block">Previous Company Verified CTC</span>
                    {isEditing && !isViewer ? (
                      <input
                        type="text"
                        placeholder="e.g. 8.5 LPA"
                        value={formData.previousCTC || ''}
                        onChange={e => setFormData({ ...formData, previousCTC: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs font-mono font-semibold bg-slate-900 border border-slate-600 rounded text-slate-100"
                      />
                    ) : (
                      <p className="text-base font-semibold text-slate-100 font-mono mt-1 tabular-nums">
                        {isViewer ? '🔒 [RESTRICTED]' : employee.previousCTC || '— (Fresh / Not Disclosed)'}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Based on verified salary slips and relieving documentation.
                    </span>
                  </div>

                  <div className="p-3 bg-slate-800/80 rounded-lg border border-amber-500/40">
                    <span className="text-[11px] text-amber-300 block">Current Offered CTC (White Collar Realty)</span>
                    {isEditing && !isViewer ? (
                      <input
                        type="text"
                        placeholder="e.g. 12 LPA"
                        value={formData.offeredCTC || ''}
                        onChange={e => setFormData({ ...formData, offeredCTC: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 text-xs font-mono font-bold bg-slate-900 border border-amber-400/50 rounded text-amber-300"
                      />
                    ) : (
                      <p className="text-base font-semibold text-amber-300 font-mono mt-1 tabular-nums">
                        {isViewer ? '🔒 [RESTRICTED]' : employee.offeredCTC || '— (Under Review)'}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Includes fixed remuneration + quarterly brokerage performance incentive.
                    </span>
                  </div>
                </div>
              </div>

              {/* Previous Experience Profile */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Previous Employment & Tenure
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Previous Employer / Organization</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.previousCompany || ''}
                        onChange={e => setFormData({ ...formData, previousCompany: e.target.value })}
                        className="mt-1 w-full px-2 py-1 text-xs border border-slate-300 rounded font-semibold text-slate-900"
                      />
                    ) : (
                      <p className="text-xs font-semibold text-slate-900 mt-1">
                        {employee.previousCompany || 'None (First Company)'}
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Previous Designation</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.previousDesignation || ''}
                        onChange={e => setFormData({ ...formData, previousDesignation: e.target.value })}
                        className="mt-1 w-full px-2 py-1 text-xs border border-slate-300 rounded font-medium text-slate-900"
                      />
                    ) : (
                      <p className="text-xs font-medium text-slate-900 mt-1">
                        {employee.previousDesignation || '—'}
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Total Real Estate / Industry Experience</span>
                    {isEditing ? (
                      <div className="flex gap-2 mt-1">
                        <div className="flex items-center gap-1 w-1/2">
                          <input
                            type="number"
                            min="0"
                            value={formData.totalExperienceYears ?? 0}
                            onChange={e => setFormData({ ...formData, totalExperienceYears: parseInt(e.target.value, 10) || 0 })}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-mono"
                          />
                          <span className="text-[11px] text-slate-500">Yrs</span>
                        </div>
                        <div className="flex items-center gap-1 w-1/2">
                          <input
                            type="number"
                            min="0"
                            max="11"
                            value={formData.totalExperienceMonths ?? 0}
                            onChange={e => setFormData({ ...formData, totalExperienceMonths: parseInt(e.target.value, 10) || 0 })}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-mono"
                          />
                          <span className="text-[11px] text-slate-500">Mos</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
                        {employee.totalExperienceYears !== undefined ? `${employee.totalExperienceYears} Years ${employee.totalExperienceMonths || 0} Months` : '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Market-Specific Exposure (Gurgaon & Dubai) */}
              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Regional Brokerage Exposure
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Gurgaon (NCR) Market Experience
                    </span>
                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={formData.gurgaonMarketExperience || ''}
                        onChange={e => setFormData({ ...formData, gurgaonMarketExperience: e.target.value })}
                        className="mt-2 w-full p-2 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                        {employee.gurgaonMarketExperience || 'No direct Gurgaon brokerage tenure recorded'}
                      </p>
                    )}
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Dubai (UAE) Market Experience
                    </span>
                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={formData.dubaiMarketExperience || ''}
                        onChange={e => setFormData({ ...formData, dubaiMarketExperience: e.target.value })}
                        className="mt-2 w-full p-2 text-xs border border-slate-300 rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                        {employee.dubaiMarketExperience || 'No international Dubai market exposure recorded'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EDUCATION */}
          {activeTab === 'education' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Educational Qualifications & Academics
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Degrees, institutions, and percentage records</p>
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = formData.education || [];
                      setFormData({
                        ...formData,
                        education: [
                          ...current,
                          {
                            degree: '',
                            institution: '',
                            boardOrUniversity: '',
                            yearOfPassing: String(new Date().getFullYear()),
                            gradeOrPercentage: '',
                          },
                        ],
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                    Add Qualification
                  </button>
                )}
              </div>

              {((isEditing ? formData.education : employee.education) || []).length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-2.5">Qualification / Degree</th>
                        <th className="px-4 py-2.5">Institution / College</th>
                        <th className="px-4 py-2.5">Board / University</th>
                        <th className="px-4 py-2.5">Passing Year</th>
                        <th className="px-4 py-2.5">Grade / Score</th>
                        {isEditing && <th className="px-4 py-2.5 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {((isEditing ? formData.education : employee.education) || []).map((edu, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="e.g. BBA / MBA / B.Tech"
                                value={edu.degree}
                                onChange={e => {
                                  const next = [...(formData.education || [])];
                                  next[idx] = { ...next[idx], degree: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded"
                              />
                            ) : (
                              <span className="font-semibold text-slate-900">{edu.degree}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="College / School Name"
                                value={edu.institution}
                                onChange={e => {
                                  const next = [...(formData.education || [])];
                                  next[idx] = { ...next[idx], institution: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                              />
                            ) : (
                              <span className="text-slate-700">{edu.institution}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="Board or University"
                                value={edu.boardOrUniversity}
                                onChange={e => {
                                  const next = [...(formData.education || [])];
                                  next[idx] = { ...next[idx], boardOrUniversity: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                              />
                            ) : (
                              <span className="text-slate-600">{edu.boardOrUniversity}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="YYYY"
                                value={edu.yearOfPassing}
                                onChange={e => {
                                  const next = [...(formData.education || [])];
                                  next[idx] = { ...next[idx], yearOfPassing: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                className="w-20 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                              />
                            ) : (
                              <span className="font-mono text-slate-800">{edu.yearOfPassing}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="e.g. 78% or 8.2 CGPA"
                                value={edu.gradeOrPercentage}
                                onChange={e => {
                                  const next = [...(formData.education || [])];
                                  next[idx] = { ...next[idx], gradeOrPercentage: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                className="w-24 px-2 py-1 text-xs font-mono font-medium text-emerald-700 border border-slate-300 rounded"
                              />
                            ) : (
                              <span className="font-mono font-medium text-emerald-700">{edu.gradeOrPercentage}</span>
                            )}
                          </td>
                          {isEditing && (
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (formData.education || []).filter((_, i) => i !== idx);
                                  setFormData({ ...formData, education: next });
                                }}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                  No education records registered. Click &quot;Add Qualification&quot; to insert academics.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: REFERENCES */}
          {activeTab === 'references' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Personal & Professional References
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Verification contacts for candidate background review</p>
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = formData.references || [];
                      setFormData({
                        ...formData,
                        references: [
                          ...current,
                          {
                            type: 'Professional',
                            name: '',
                            relationshipOrTitle: '',
                            company: '',
                            phone: '',
                            email: '',
                          },
                        ],
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                    Add Reference
                  </button>
                )}
              </div>

              {((isEditing ? formData.references : employee.references) || []).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {((isEditing ? formData.references : employee.references) || []).map((ref, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2 relative">
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (formData.references || []).filter((_, i) => i !== idx);
                            setFormData({ ...formData, references: next });
                          }}
                          className="absolute top-3 right-3 p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex items-center justify-between pr-6">
                        {isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              type="text"
                              placeholder="Contact Name"
                              value={ref.name}
                              onChange={e => {
                                const next = [...(formData.references || [])];
                                next[idx] = { ...next[idx], name: e.target.value };
                                setFormData({ ...formData, references: next });
                              }}
                              className="font-semibold text-xs text-slate-900 px-2 py-1 border border-slate-300 rounded w-1/2"
                            />
                            <select
                              value={ref.type}
                              onChange={e => {
                                const next = [...(formData.references || [])];
                                next[idx] = { ...next[idx], type: e.target.value as 'Professional' | 'Personal' };
                                setFormData({ ...formData, references: next });
                              }}
                              className="text-xs px-2 py-1 border border-slate-300 rounded w-1/2"
                            >
                              <option value="Professional">Professional</option>
                              <option value="Personal">Personal</option>
                            </select>
                          </div>
                        ) : (
                          <>
                            <span className="font-semibold text-xs text-slate-900">{ref.name}</span>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                ref.type === 'Professional' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {ref.type} Reference
                            </span>
                          </>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Designation / Relation"
                            value={ref.relationshipOrTitle}
                            onChange={e => {
                              const next = [...(formData.references || [])];
                              next[idx] = { ...next[idx], relationshipOrTitle: e.target.value };
                              setFormData({ ...formData, references: next });
                            }}
                            className="text-xs px-2 py-1 border border-slate-300 rounded"
                          />
                          <input
                            type="text"
                            placeholder="Company Name"
                            value={ref.company || ''}
                            onChange={e => {
                              const next = [...(formData.references || [])];
                              next[idx] = { ...next[idx], company: e.target.value };
                              setFormData({ ...formData, references: next });
                            }}
                            className="text-xs px-2 py-1 border border-slate-300 rounded"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">
                          {ref.relationshipOrTitle} {ref.company ? `at ${ref.company}` : ''}
                        </p>
                      )}

                      <div className="text-xs font-mono text-slate-800 flex items-center gap-3 pt-1 border-t border-slate-200/60">
                        {isEditing ? (
                          <div className="grid grid-cols-2 gap-2 w-full">
                            <input
                              type="text"
                              placeholder="Phone Number"
                              value={ref.phone}
                              onChange={e => {
                                const next = [...(formData.references || [])];
                                next[idx] = { ...next[idx], phone: e.target.value };
                                setFormData({ ...formData, references: next });
                              }}
                              className="text-xs px-2 py-1 font-mono border border-slate-300 rounded"
                            />
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={ref.email || ''}
                              onChange={e => {
                                const next = [...(formData.references || [])];
                                next[idx] = { ...next[idx], email: e.target.value };
                                setFormData({ ...formData, references: next });
                              }}
                              className="text-xs px-2 py-1 border border-slate-300 rounded"
                            />
                          </div>
                        ) : (
                          <>
                            <span>📞 {isViewer ? '••••••••••' : ref.phone}</span>
                            {ref.email && <span>✉️ {ref.email}</span>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                  No reference entries provided. Click &quot;Add Reference&quot; to add professional contacts.
                </div>
              )}
            </div>
          )}

          {/* TAB 6: DOCUMENTS & VERIFICATION */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* One-Time Candidate Upload Link Section */}
              {employee.isCandidate && (
                <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl border border-slate-700 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
                    <div>
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Candidate One-Time Secure Upload Portal Link
                        </h4>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Send a secure, single-use tokenized link for candidate self-service document submission. The link expires immediately upon submission.
                      </p>
                    </div>

                    {!isViewer && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={tokenLoading}
                          onClick={async () => {
                            if (!onGenerateUploadLink) return;
                            try {
                              setTokenLoading(true);
                              const res = await onGenerateUploadLink(employee.id);
                              setSuccessMsg(res.message || 'One-time upload link generated.');
                              setTimeout(() => setSuccessMsg(''), 3000);
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : 'Failed to generate link';
                              setErrorMsg(msg);
                            } finally {
                              setTokenLoading(false);
                            }
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {employee.uploadToken ? 'Regenerate Link' : 'Generate Secure Link'}
                        </button>
                      </div>
                    )}
                  </div>

                  {employee.uploadToken ? (
                    <div className="mt-3.5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 font-mono">Status:</span>
                            {employee.uploadToken.isUsed ? (
                              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Submitted & Expired (Used)
                              </span>
                            ) : employee.uploadToken.isRevoked ? (
                              <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-400/30 flex items-center gap-1">
                                <Ban className="w-3 h-3" /> Revoked by HR
                              </span>
                            ) : new Date(employee.uploadToken.expiresAt).getTime() < Date.now() ? (
                              <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Expired
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Active & Waiting for Candidate
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-300 font-mono truncate">
                            <span className="text-slate-400">Token:</span>
                            <span className="truncate bg-slate-900 px-2 py-0.5 rounded text-amber-300 font-bold">
                              {employee.uploadToken.token}
                            </span>
                            <span className="text-slate-400">· Expires:</span>
                            <span>{new Date(employee.uploadToken.expiresAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}/?uploadToken=${employee.uploadToken?.token}`;
                              navigator.clipboard.writeText(url);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2500);
                            }}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                          >
                            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedLink ? 'Copied!' : 'Copy Portal URL'}
                          </button>

                          {onOpenCandidatePortal && (
                            <button
                              type="button"
                              onClick={() => onOpenCandidatePortal(employee.uploadToken?.token || '')}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                              title="Open upload interface as candidate"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open Portal
                            </button>
                          )}

                          {!isViewer && !employee.uploadToken.isRevoked && !employee.uploadToken.isUsed && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!onRevokeUploadLink) return;
                                try {
                                  await onRevokeUploadLink(employee.id);
                                  setSuccessMsg('Upload link revoked.');
                                  setTimeout(() => setSuccessMsg(''), 3000);
                                } catch (err: unknown) {
                                  const msg = err instanceof Error ? err.message : 'Failed to revoke link';
                                  setErrorMsg(msg);
                                }
                              }}
                              className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 rounded-md text-xs font-medium flex items-center gap-1"
                              title="Immediately revoke this token"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 bg-slate-800/60 rounded-lg text-xs text-slate-300 flex items-center justify-between">
                      <span>No active upload link generated for this candidate. Click &quot;Generate Secure Link&quot; above to create one.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Onboarding Verification Checklist & Documents
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click &quot;Preview Document&quot; to view live PDFs/images, verify items, or upload files directly.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Verified:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {Object.values(employee.documents || {}).filter(d => d.status === 'Verified').length} / {Object.values(employee.documents || {}).length}
                  </span>
                </div>
              </div>

              {/* Document List */}
              <div className="space-y-3">
                {Object.values(employee.documents || {}).map(doc => {
                  const statusColors: Record<DocumentStatus, string> = {
                    'Verified': 'bg-emerald-50 text-emerald-800 border-emerald-300',
                    'Under Review': 'bg-amber-50 text-amber-800 border-amber-300',
                    'Submitted': 'bg-blue-50 text-blue-800 border-blue-300',
                    'Not Submitted': 'bg-slate-100 text-slate-600 border-slate-300',
                    'Missing': 'bg-rose-50 text-rose-800 border-rose-300',
                    'Rejected': 'bg-rose-50 text-rose-800 border-rose-300',
                    'Not Applicable': 'bg-slate-100 text-slate-400 border-slate-200',
                  };

                  return (
                    <div
                      key={doc.key}
                      className="p-3.5 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-slate-900">{doc.title}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({doc.category})</span>
                            {doc.required && (
                              <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                Required
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                            {doc.driveLink ? (
                              <a
                                href={doc.driveLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 font-mono"
                              >
                                🔗 Open Drive Folder Archive
                              </a>
                            ) : doc.fileName ? (
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="text-blue-600 hover:underline flex items-center gap-1 font-mono font-medium"
                              >
                                📄 {doc.fileName} ({doc.fileSize || 'Attached'})
                              </button>
                            ) : (
                              <span className="text-slate-400 italic">No document file attached</span>
                            )}

                            {doc.verifiedBy && (
                              <span>Verified by: <strong className="text-slate-700">{doc.verifiedBy}</strong></span>
                            )}
                            {doc.verifiedAt && (
                              <span className="font-mono text-slate-400">
                                {new Date(doc.verifiedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {doc.reviewNotes && (
                            <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 mt-1">
                              <strong>Reviewer Note:</strong> {doc.reviewNotes}
                            </p>
                          )}
                        </div>

                        {/* Actions Strip */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {/* Live Preview Button */}
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 flex items-center gap-1 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            Live Preview
                          </button>

                          {/* Direct File Upload button for HR */}
                          {!isViewer && onUploadDocumentFile && (
                            <label className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded border border-amber-300 flex items-center gap-1 cursor-pointer transition-colors">
                              <UploadCloud className="w-3.5 h-3.5 text-amber-600" />
                              Upload
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = async () => {
                                    try {
                                      const base64 = reader.result as string;
                                      const sizeKB = Math.round(file.size / 1024);
                                      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
                                      await onUploadDocumentFile(
                                        employee.id,
                                        doc.key,
                                        base64,
                                        file.name,
                                        sizeStr,
                                        file.type || 'application/pdf'
                                      );
                                      setSuccessMsg(`Document ${file.name} uploaded.`);
                                      setTimeout(() => setSuccessMsg(''), 3000);
                                    } catch (err: unknown) {
                                      const msg = err instanceof Error ? err.message : 'Upload failed';
                                      setErrorMsg(msg);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                          )}

                          {/* Status Selector */}
                          {!isViewer ? (
                            <select
                              value={doc.status}
                              onChange={e => handleDocStatusChange(doc.key, e.target.value as DocumentStatus)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer ${statusColors[doc.status]}`}
                            >
                              <option value="Missing">Status: Missing</option>
                              <option value="Not Submitted">Status: Not Submitted</option>
                              <option value="Submitted">Status: Submitted</option>
                              <option value="Under Review">Status: Under Review</option>
                              <option value="Verified">Status: Verified</option>
                              <option value="Rejected">Status: Rejected</option>
                              <option value="Not Applicable">Status: Not Applicable</option>
                            </select>
                          ) : (
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded border ${statusColors[doc.status]}`}>
                              {doc.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: COMPANY ASSETS & INVENTORY */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              {/* Header and Issue Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-amber-600" />
                      Company Assets & Inventory
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-200 text-slate-800">
                      {assignedAssets.length} Active Issued · {returnedAssets.length} Returned
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track laptops, mobile devices, SIM cards, office access badges, chargers, and parking passes issued to {employee.fullName}.
                  </p>
                </div>

                {!isViewer && (
                  <button
                    onClick={() => {
                      setIsIssueModalOpen(true);
                      setIssueMode(availableStockAssets.length > 0 ? 'existing' : 'new');
                      setSelectedStockAssetId(availableStockAssets[0]?.id || '');
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    Issue Asset to {employee.isCandidate ? 'Candidate' : 'Employee'}
                  </button>
                )}
              </div>

              {/* Active Issued Assets Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Currently Issued & Active Equipment ({assignedAssets.length})
                </h4>

                {assignedAssets.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {assignedAssets.map(asset => {
                      const isExpanded = expandedHistoryAssetId === asset.id;

                      const getAssetIcon = (type: string) => {
                        switch (type) {
                          case 'Laptop': return <Laptop className="w-4 h-4 text-blue-600" />;
                          case 'Phone / Tablet': return <Smartphone className="w-4 h-4 text-purple-600" />;
                          case 'Access Card': return <KeyRound className="w-4 h-4 text-amber-600" />;
                          case 'SIM Card': return <Wifi className="w-4 h-4 text-emerald-600" />;
                          case 'Parking Card': return <Building className="w-4 h-4 text-indigo-600" />;
                          default: return <Package className="w-4 h-4 text-slate-600" />;
                        }
                      };

                      return (
                        <div
                          key={asset.id}
                          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all shadow-xs space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
                                {getAssetIcon(asset.type)}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900">{asset.name}</span>
                                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                                    {asset.assetTag}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.2 rounded-full font-medium bg-blue-50 text-blue-800 border border-blue-200">
                                    {asset.type}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.2 rounded-full font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    {asset.status}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-500 flex items-center gap-4 flex-wrap pt-0.5 font-mono">
                                  <span>Serial: <strong className="text-slate-800">{asset.serialNumber || 'N/A'}</strong></span>
                                  <span>Issue Date: <strong className="text-slate-800">{asset.issueDate || '—'}</strong></span>
                                  <span>Condition: <strong className="text-slate-800 font-sans">{asset.condition}</strong></span>
                                </div>

                                {asset.notes && (
                                  <p className="text-xs text-slate-600 pt-1 leading-relaxed">
                                    <span className="font-medium text-slate-700">Notes:</span> {asset.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons for Authorized Users */}
                            {!isViewer && (
                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                <button
                                  onClick={() => {
                                    setEditingAsset(asset);
                                    setEditNameInput(asset.name);
                                    setEditSerialInput(asset.serialNumber || '');
                                    setEditConditionInput(asset.condition);
                                    setEditNotesInput(asset.notes || '');
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded border border-slate-300 transition-colors flex items-center gap-1"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Update
                                </button>
                                <button
                                  onClick={() => {
                                    setReturningAsset(asset);
                                    setReturnDateInput(new Date().toISOString().split('T')[0]);
                                    setReturnConditionInput(asset.condition);
                                    setReturnNotesInput('');
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Return Asset
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Expandable History Log */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <button
                              onClick={() => setExpandedHistoryAssetId(isExpanded ? null : asset.id)}
                              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              {asset.history?.length || 0} History Events
                            </button>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Last updated: {new Date(asset.updatedAt).toLocaleDateString()}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
                              <h5 className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider">
                                Asset Lifecycle & Audit Trail
                              </h5>
                              {asset.history && asset.history.length > 0 ? (
                                <div className="space-y-1.5 divide-y divide-slate-200/60">
                                  {asset.history.map((h, hIdx) => (
                                    <div key={hIdx} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2 text-[11px]">
                                      <div>
                                        <span className="font-semibold text-slate-800">{h.action}</span>
                                        {h.employeeName && <span className="text-slate-600"> — {h.employeeName}</span>}
                                        {h.notes && <p className="text-slate-500 mt-0.5">{h.notes}</p>}
                                      </div>
                                      <div className="text-right shrink-0 font-mono text-[10px] text-slate-400">
                                        <div>{new Date(h.date).toLocaleDateString()}</div>
                                        <div>by {h.performedBy}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-400 italic text-[11px]">No history logged.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-1.5">
                    <Package className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-700">No active assets currently assigned</p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Use the &quot;Issue Asset&quot; button above to allocate a laptop, SIM card, building pass, or charger.
                    </p>
                  </div>
                )}
              </div>

              {/* Previously Returned Equipment Section */}
              {returnedAssets.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Previously Handed Over / Returned Equipment ({returnedAssets.length})
                  </h4>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                        <tr>
                          <th className="px-4 py-2.5">Tag</th>
                          <th className="px-4 py-2.5">Asset Name</th>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5">Serial / ID</th>
                          <th className="px-4 py-2.5">Return Date</th>
                          <th className="px-4 py-2.5">Condition at Return</th>
                          <th className="px-4 py-2.5">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {returnedAssets.map(asset => (
                          <tr key={asset.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{asset.assetTag}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-900">{asset.name}</td>
                            <td className="px-4 py-2.5 text-slate-600">{asset.type}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">{asset.serialNumber || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-800 font-semibold">{asset.returnDate || 'Returned'}</td>
                            <td className="px-4 py-2.5 text-slate-700">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                                {asset.condition}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{asset.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <span>
            Employee Record ID: <strong className="font-mono text-slate-700">{employee.id}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Close Profile
          </button>
        </div>
      </div>

      {/* Simulated Document Viewer Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-5 border border-slate-300 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h4 className="font-semibold text-sm text-slate-900">{previewDoc.title}</h4>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="h-64 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-6 space-y-3">
              <FileText className="w-12 h-12 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-800">{previewDoc.fileName || 'Document File'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Encrypted White Collar Realty Secure Storage</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
                Status: {previewDoc.status}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded-md"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sub-Modal: Issue Company Asset to Employee */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-600" />
                  Issue Asset to {employee.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign existing stock or register a new piece of company inventory.
                </p>
              </div>
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setIssueMode('existing')}
                disabled={availableStockAssets.length === 0}
                className={`flex-1 py-1.5 text-center font-medium rounded-md transition-colors ${
                  issueMode === 'existing'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                }`}
              >
                Select from Available Stock ({availableStockAssets.length})
              </button>
              <button
                type="button"
                onClick={() => setIssueMode('new')}
                className={`flex-1 py-1.5 text-center font-medium rounded-md transition-colors ${
                  issueMode === 'new'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register & Issue New Asset
              </button>
            </div>

            {issueMode === 'existing' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Choose Stock Asset</label>
                  <select
                    value={selectedStockAssetId}
                    onChange={e => setSelectedStockAssetId(e.target.value)}
                    className="mt-1 w-full p-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="">-- Choose unassigned asset --</option>
                    {availableStockAssets.map(a => (
                      <option key={a.id} value={a.id}>
                        [{a.assetTag}] {a.name} ({a.type}) {a.serialNumber ? `— S/N: ${a.serialNumber}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700">Issue Date</label>
                    <input
                      type="date"
                      value={issueDateInput}
                      onChange={e => setIssueDateInput(e.target.value)}
                      className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Handover Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Docked at Desk C2"
                      value={issueNotesInput}
                      onChange={e => setIssueNotesInput(e.target.value)}
                      className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700">Asset Category</label>
                    <select
                      value={newAssetType}
                      onChange={e => setNewAssetType(e.target.value as AssetCategory)}
                      className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                    >
                      <option value="Access Card">Access Card</option>
                      <option value="SIM Card">SIM Card</option>
                      <option value="Charger">Charger</option>
                      <option value="Parking Card">Parking Card</option>
                      <option value="Laptop">Laptop / Computer</option>
                      <option value="Phone / Tablet">Phone / Tablet</option>
                      <option value="Display Monitor">Display Monitor</option>
                      <option value="Other">Other Company Issued</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Condition</label>
                    <select
                      value={newAssetCondition}
                      onChange={e => setNewAssetCondition(e.target.value as AssetCondition)}
                      className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                    >
                      <option value="Brand New">Brand New</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Needs Service">Needs Service</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700">Item Name & Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Dell Latitude 5440 i7 / WCR Office Badge"
                    value={newAssetName}
                    onChange={e => setNewAssetName(e.target.value)}
                    className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700">Unique Serial / Card Number</label>
                    <input
                      type="text"
                      placeholder="e.g. SN-88912 or RFID-2026-009"
                      value={newAssetSerial}
                      onChange={e => setNewAssetSerial(e.target.value)}
                      className="mt-1 w-full p-2 text-xs font-mono border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Issue Date</label>
                    <input
                      type="date"
                      value={issueDateInput}
                      onChange={e => setIssueDateInput(e.target.value)}
                      className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700">Issuance Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Assigned with adapter and protective sleeve"
                    value={issueNotesInput}
                    onChange={e => setIssueNotesInput(e.target.value)}
                    className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsIssueModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  assetActionLoading ||
                  (issueMode === 'existing' && !selectedStockAssetId) ||
                  (issueMode === 'new' && !newAssetName)
                }
                onClick={async () => {
                  try {
                    setAssetActionLoading(true);
                    if (issueMode === 'existing') {
                      if (onIssueAsset && selectedStockAssetId) {
                        await onIssueAsset(
                          selectedStockAssetId,
                          employee.id,
                          issueDateInput,
                          issueNotesInput || `Issued to ${employee.fullName}`
                        );
                      }
                    } else {
                      if (onCreateAndIssueAsset) {
                        await onCreateAndIssueAsset({
                          name: newAssetName,
                          type: newAssetType,
                          serialNumber: newAssetSerial || undefined,
                          condition: newAssetCondition,
                          issueDate: issueDateInput,
                          notes: issueNotesInput || `Issued to ${employee.fullName}`,
                          assignedEmployeeId: employee.id,
                          assignedEmployeeName: employee.fullName,
                          assignedEmployeeCode: employee.employeeCode,
                        });
                      }
                    }
                    setIsIssueModalOpen(false);
                    setSuccessMsg('Asset issued successfully to profile.');
                    setTimeout(() => setSuccessMsg(''), 3000);
                  } catch {
                    setErrorMsg('Failed to complete asset issuance.');
                  } finally {
                    setAssetActionLoading(false);
                  }
                }}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {assetActionLoading ? 'Issuing...' : 'Confirm Issuance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Return Company Asset */}
      {returningAsset && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  Return Asset: {returningAsset.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asset Tag: <span className="font-mono font-semibold">{returningAsset.assetTag}</span>
                </p>
              </div>
              <button onClick={() => setReturningAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Actual Return Date</label>
                <input
                  type="date"
                  value={returnDateInput}
                  onChange={e => setReturnDateInput(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Condition at Return</label>
                <select
                  value={returnConditionInput}
                  onChange={e => setReturnConditionInput(e.target.value as AssetCondition)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                >
                  <option value="Brand New">Brand New (Unopened/Pristine)</option>
                  <option value="Good">Good (Normal wear, fully functional)</option>
                  <option value="Fair">Fair (Noticeable wear)</option>
                  <option value="Needs Service">Needs Service / Damaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Handover Inspection Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Hardware inspected, all accessories present, returned to IT safe"
                  value={returnNotesInput}
                  onChange={e => setReturnNotesInput(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturningAsset(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assetActionLoading}
                onClick={async () => {
                  try {
                    setAssetActionLoading(true);
                    if (onReturnAsset && returningAsset) {
                      await onReturnAsset(
                        returningAsset.id,
                        returnDateInput,
                        returnConditionInput,
                        returnNotesInput || `Returned by ${employee.fullName}`
                      );
                    }
                    setReturningAsset(null);
                    setSuccessMsg('Asset successfully returned to inventory.');
                    setTimeout(() => setSuccessMsg(''), 3000);
                  } catch {
                    setErrorMsg('Failed to process asset return.');
                  } finally {
                    setAssetActionLoading(false);
                  }
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {assetActionLoading ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Edit Asset Details */}
      {editingAsset && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-slate-700" />
                  Update Asset [{editingAsset.assetTag}]
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Modify details, serial number, and condition status.
                </p>
              </div>
              <button onClick={() => setEditingAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Item Name</label>
                <input
                  type="text"
                  value={editNameInput}
                  onChange={e => setEditNameInput(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Serial / ID Number</label>
                <input
                  type="text"
                  value={editSerialInput}
                  onChange={e => setEditSerialInput(e.target.value)}
                  className="mt-1 w-full p-2 text-xs font-mono border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Current Condition</label>
                <select
                  value={editConditionInput}
                  onChange={e => setEditConditionInput(e.target.value as AssetCondition)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                >
                  <option value="Brand New">Brand New</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Needs Service">Needs Service</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Operational Notes</label>
                <textarea
                  rows={2}
                  value={editNotesInput}
                  onChange={e => setEditNotesInput(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assetActionLoading}
                onClick={async () => {
                  try {
                    setAssetActionLoading(true);
                    if (onUpdateAsset && editingAsset) {
                      await onUpdateAsset(editingAsset.id, {
                        name: editNameInput,
                        serialNumber: editSerialInput || undefined,
                        condition: editConditionInput,
                        notes: editNotesInput,
                      });
                    }
                    setEditingAsset(null);
                    setSuccessMsg('Asset details updated.');
                    setTimeout(() => setSuccessMsg(''), 3000);
                  } catch {
                    setErrorMsg('Failed to update asset details.');
                  } finally {
                    setAssetActionLoading(false);
                  }
                }}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {assetActionLoading ? 'Saving...' : 'Save Updates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Interactive Document Viewer Modal */}
      {previewDoc && (
        <LiveDocumentViewerModal
          document={previewDoc}
          employeeId={employee.id}
          employeeName={employee.fullName}
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          onUpdateStatus={async (docKey: string, status: DocumentStatus, notes: string) => {
            await handleDocStatusChange(docKey, status);
            setPreviewDoc(prev => (prev ? { ...prev, status, reviewNotes: notes } : null));
          }}
          onUploadFile={
            onUploadDocumentFile
              ? async (docKey: string, fileData: string, fileName: string, fileSize: string, mimeType: string) => {
                  await onUploadDocumentFile(employee.id, docKey, fileData, fileName, fileSize, mimeType);
                  setPreviewDoc(prev => (prev ? { ...prev, fileData, fileName, fileSize, mimeType, status: 'Submitted' } : null));
                }
              : undefined
          }
          userRole={userRole}
          currentUserName={currentUserName}
        />
      )}
    </div>
  );
};
