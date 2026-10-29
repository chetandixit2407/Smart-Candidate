import React, { useState } from 'react';
import {
  LogOut,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  DollarSign,
  ShieldCheck,
  Building,
  Printer,
  ChevronRight,
  Package,
  Laptop,
  Check,
  X,
  CreditCard,
  Plus,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import {
  Employee,
  CompanyAsset,
  UserRole,
  ExitClearanceRecord,
  FullAndFinalSettlement,
  AssetCondition,
} from '../types/index.js';

interface ExitManagementViewProps {
  employees: Employee[];
  assets: CompanyAsset[];
  userRole: UserRole;
  currentUserName: string;
  onInitiateExit: (employeeId: string, data: any) => Promise<void>;
  onUpdateClearance: (employeeId: string, dept: string, updates: any) => Promise<void>;
  onCalculateFnF: (employeeId: string, overrides?: any) => Promise<void>;
  onFinalizeFnF: (employeeId: string, paymentData: any) => Promise<void>;
  onReturnAsset?: (assetId: string, returnDate: string, condition: AssetCondition, notes: string) => Promise<void>;
  onSelectEmployee: (emp: Employee) => void;
}

export const ExitManagementView: React.FC<ExitManagementViewProps> = ({
  employees,
  assets,
  userRole,
  currentUserName,
  onInitiateExit,
  onUpdateClearance,
  onCalculateFnF,
  onFinalizeFnF,
  onReturnAsset,
  onSelectEmployee,
}) => {
  const [activeTab, setActiveTab] = useState<'notice' | 'clearance' | 'fnf' | 'alumni'>('notice');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // Initiate Exit Modal State
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [targetEmpId, setTargetEmpId] = useState('');
  const [resignationDate, setResignationDate] = useState(new Date().toISOString().split('T')[0]);
  const [exitType, setExitType] = useState<ExitClearanceRecord['exitType']>('Voluntary Resignation');
  const [reasonForExit, setReasonForExit] = useState('Career Growth / Better Opportunity');
  const [noticePeriodDays, setNoticePeriodDays] = useState(60);
  const [handoverToId, setHandoverToId] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('Complete handover of premium Gurugram commercial leads and client contacts.');

  // FnF Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingEmp, setPayingEmp] = useState<Employee | null>(null);
  const [paymentRef, setPaymentRef] = useState(`UTR-WCR-${Date.now().toString().slice(-6)}`);
  const [paymentMode, setPaymentMode] = useState<'NEFT' | 'Bank Wire' | 'Cheque'>('NEFT');

  // Relieving Letter Modal State
  const [showRelievingModal, setShowRelievingModal] = useState(false);
  const [relievingEmp, setRelievingEmp] = useState<Employee | null>(null);

  // Filter employees
  const exitingEmployees = employees.filter(e => e.employmentStatus === 'Notice Period' || Boolean(e.exitClearance));
  const exEmployees = employees.filter(e => e.employmentStatus === 'Ex-Employee');
  const activeConfirmedEmployees = employees.filter(e => e.employmentStatus === 'Full-Time' || e.employmentStatus === 'Probation');

  const selectedEmployee = employees.find(e => e.id === selectedEmpId) || exitingEmployees[0] || null;

  // Selected employee's assigned assets
  const employeeAssets = assets.filter(a => selectedEmployee && a.assignedEmployeeId === selectedEmployee.id && a.status === 'In Use');

  const handleStartExit = async () => {
    if (!targetEmpId) return;
    try {
      await onInitiateExit(targetEmpId, {
        resignationDate,
        exitType,
        reasonForExit,
        noticePeriodDays,
        handoverToEmployeeId: handoverToId,
        handoverNotes,
      });
      setShowInitiateModal(false);
      setSelectedEmpId(targetEmpId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleClearanceDept = async (
    emp: Employee,
    deptKey: 'itClearance' | 'hrClearance' | 'financeClearance' | 'deptHeadClearance',
    newStatus: 'Approved' | 'Pending' | 'Rejected'
  ) => {
    try {
      const current = emp.exitClearance?.departments[deptKey];
      await onUpdateClearance(emp.id, deptKey, {
        ...current,
        status: newStatus,
        approvedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecutePayment = async () => {
    if (!payingEmp) return;
    try {
      await onFinalizeFnF(payingEmp.id, {
        paymentReference: paymentRef,
        paymentMode,
        remarks: 'Full and final settlement disbursed via corporate banking channel.',
      });
      setShowPaymentModal(false);
      setPayingEmp(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
              White Collar Realty · Exit & Separation Management
            </span>
            <span className="text-xs text-slate-400">· Full & Final Settlement Protocol</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
            Offboarding, Exit Clearances & FnF Settlement
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Oversee notice periods, track task and lead handovers, coordinate multi-department sign-offs (IT, HR, Finance, Dept Head), recover corporate assets, and compute accurate Full & Final settlements.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {userRole !== 'DEPT_HEAD_VIEWER' && (
            <button
              type="button"
              onClick={() => setShowInitiateModal(true)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Initiate Exit / Resignation
            </button>
          )}
        </div>
      </div>

      {/* Exit Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Serving Notice Period</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-900">
              {employees.filter(e => e.employmentStatus === 'Notice Period').length}
            </span>
            <span className="text-xs font-medium text-amber-600">Active Notice</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">Clearances in Progress</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-blue-900">
              {employees.filter(e => e.exitClearance && e.exitClearance.overallStatus === 'In Progress').length}
            </span>
            <span className="text-xs font-medium text-blue-600">IT / HR / Fin</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider block">Clearances Completed</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-purple-900">
              {employees.filter(e => e.exitClearance?.overallStatus === 'Clearances Complete').length}
            </span>
            <span className="text-xs font-medium text-purple-600">Ready for FnF</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">FnF Settled & Closed</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-emerald-900">
              {exEmployees.length}
            </span>
            <span className="text-xs font-medium text-emerald-600">Alumni</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('notice')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'notice' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          Active Notice Periods & Clearances ({exitingEmployees.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fnf')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'fnf' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Full & Final (FnF) Settlements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('alumni')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'alumni' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Ex-Employee Archive ({exEmployees.length})
        </button>
      </div>

      {/* TAB 1: ACTIVE NOTICE PERIODS & CLEARANCE MATRIX */}
      {activeTab === 'notice' && (
        <div className="space-y-4">
          {exitingEmployees.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No employees currently in notice period.</p>
              <p className="text-xs text-slate-500 mt-1">All active staff are in good standing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Exiting Personnel List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Personnel in Exit Process</h3>
                {exitingEmployees.map(emp => {
                  const isSelected = selectedEmployee?.id === emp.id;
                  const clearance = emp.exitClearance;
                  const lwd = clearance?.actualLwd || clearance?.calculatedLwd;

                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmpId(emp.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm">{emp.fullName}</h4>
                          <p className={`text-xs ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            {emp.designation} · {emp.department}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            clearance?.overallStatus === 'Clearances Complete'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {clearance?.overallStatus || 'Initiated'}
                        </span>
                      </div>

                      <div className={`grid grid-cols-2 gap-2 text-[11px] p-2 rounded-lg ${isSelected ? 'bg-slate-800' : 'bg-slate-50'}`}>
                        <div>
                          <span className={`${isSelected ? 'text-slate-400' : 'text-slate-500'} block text-[10px]`}>Resignation:</span>
                          <span className="font-mono font-medium">{clearance?.resignationDate || 'N/A'}</span>
                        </div>
                        <div>
                          <span className={`${isSelected ? 'text-slate-400' : 'text-slate-500'} block text-[10px]`}>Last Working Day:</span>
                          <strong className="font-mono text-amber-400">{lwd || 'N/A'}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Multi-Department Clearance & Handover Details for Selected Employee */}
              {selectedEmployee && (
                <div className="lg:col-span-2 space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                  {/* Selected Employee Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">{selectedEmployee.fullName}</h3>
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {selectedEmployee.employeeCode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {selectedEmployee.designation} · {selectedEmployee.department} · {selectedEmployee.market} Office (Desk: {selectedEmployee.desk || 'None'})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(selectedEmployee)}
                        className="px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                      >
                        Full Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRelievingEmp(selectedEmployee);
                          setShowRelievingModal(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Relieving Certificate
                      </button>
                    </div>
                  </div>

                  {/* Handover & Successor Info */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Knowledge & Account Handover</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Handover Nominee: <strong>{selectedEmployee.exitClearance?.handoverToName || 'Unassigned'}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 italic">
                      &ldquo;{selectedEmployee.exitClearance?.handoverNotes || 'Pending handover details from exiting employee.'}&rdquo;
                    </p>
                  </div>

                  {/* Multi-Department Clearance Sign-Off Matrix */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                      <span>Multi-Department Clearance Matrix (4 Departments)</span>
                      <span className="text-[11px] font-normal text-slate-500">Authorized department sign-off required</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* 1. IT Department */}
                      {(() => {
                        const it = selectedEmployee.exitClearance?.departments.itClearance;
                        const isApproved = it?.status === 'Approved';
                        return (
                          <div className={`p-4 rounded-xl border transition-all ${isApproved ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <Laptop className="w-4 h-4 text-blue-600" />
                                IT & Systems Department
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {it?.status || 'Pending'}
                              </span>
                            </div>

                            <ul className="text-[11px] text-slate-600 space-y-1">
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Google Workspace email suspended
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                CRM, Lead Portal & ERP revoked
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Laptop hardware returned
                              </li>
                            </ul>

                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Approver: {it?.approver || 'Pending IT Head'}</span>
                              {userRole !== 'DEPT_HEAD_VIEWER' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleClearanceDept(selectedEmployee, 'itClearance', isApproved ? 'Pending' : 'Approved')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    isApproved ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  }`}
                                >
                                  {isApproved ? 'Reset' : 'Sign Off IT'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 2. HR Department */}
                      {(() => {
                        const hr = selectedEmployee.exitClearance?.departments.hrClearance;
                        const isApproved = hr?.status === 'Approved';
                        return (
                          <div className={`p-4 rounded-xl border transition-all ${isApproved ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-purple-600" />
                                Human Resources Department
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {hr?.status || 'Pending'}
                              </span>
                            </div>

                            <ul className="text-[11px] text-slate-600 space-y-1">
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Physical ID card & access pass returned
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Formal exit interview completed
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Non-compete covenants reaffirmed
                              </li>
                            </ul>

                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Approver: {hr?.approver || 'Pending HR Head'}</span>
                              {userRole !== 'DEPT_HEAD_VIEWER' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleClearanceDept(selectedEmployee, 'hrClearance', isApproved ? 'Pending' : 'Approved')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    isApproved ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  }`}
                                >
                                  {isApproved ? 'Reset' : 'Sign Off HR'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 3. Finance & Accounts Department */}
                      {(() => {
                        const fin = selectedEmployee.exitClearance?.departments.financeClearance;
                        const isApproved = fin?.status === 'Approved';
                        return (
                          <div className={`p-4 rounded-xl border transition-all ${isApproved ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                Finance & Accounts Department
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {fin?.status || 'Pending'}
                              </span>
                            </div>

                            <ul className="text-[11px] text-slate-600 space-y-1">
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Travel & conveyance expense claims settled
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Salary advances & corporate cards recovered
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                TDS / tax declarations validated
                              </li>
                            </ul>

                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Approver: {fin?.approver || 'Pending Finance Head'}</span>
                              {userRole !== 'DEPT_HEAD_VIEWER' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleClearanceDept(selectedEmployee, 'financeClearance', isApproved ? 'Pending' : 'Approved')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    isApproved ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  }`}
                                >
                                  {isApproved ? 'Reset' : 'Sign Off Fin'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 4. Department Head Round */}
                      {(() => {
                        const dept = selectedEmployee.exitClearance?.departments.deptHeadClearance;
                        const isApproved = dept?.status === 'Approved';
                        return (
                          <div className={`p-4 rounded-xl border transition-all ${isApproved ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <Building className="w-4 h-4 text-amber-600" />
                                Business Department Head
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {dept?.status || 'Pending'}
                              </span>
                            </div>

                            <ul className="text-[11px] text-slate-600 space-y-1">
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Active investor / client leads handed over
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Pipeline deals transferred to successor
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-slate-400" />
                                Project files archived to Google Drive
                              </li>
                            </ul>

                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Approver: {dept?.approver || 'Pending Dept Head'}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleClearanceDept(selectedEmployee, 'deptHeadClearance', isApproved ? 'Pending' : 'Approved')}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  isApproved ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {isApproved ? 'Reset' : 'Sign Off Dept'}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Asset Recovery Status Strip */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-blue-600" />
                        Company Assets Issued to Employee ({employeeAssets.length})
                      </span>
                      <span className="text-[11px] text-slate-500">Must be surrendered prior to final settlement</span>
                    </div>

                    {employeeAssets.length === 0 ? (
                      <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                        No company assets currently checked out to this employee. All assets surrendered.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {employeeAssets.map(asset => (
                          <div
                            key={asset.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{asset.name}</span>
                              <span className="text-slate-500 font-mono text-[11px] ml-2">({asset.assetTag} · S/N: {asset.serialNumber || 'N/A'})</span>
                              <p className="text-[10px] text-slate-400">Condition: {asset.condition} · Issued: {asset.issueDate}</p>
                            </div>

                            {onReturnAsset && userRole !== 'DEPT_HEAD_VIEWER' && (
                              <button
                                type="button"
                                onClick={() => onReturnAsset(asset.id, new Date().toISOString().split('T')[0], 'Good', 'Returned during exit clearance.')}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs flex items-center gap-1 shadow-2xs"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Return to Inventory
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FULL & FINAL (FnF) SETTLEMENT STATEMENTS */}
      {activeTab === 'fnf' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exitingEmployees.concat(exEmployees).map(emp => {
              const fnf = emp.fnfSettlement;
              const isSettled = fnf?.status === 'Paid';

              return (
                <div
                  key={emp.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{emp.fullName}</h4>
                        <p className="text-xs text-slate-500">{emp.designation} · {emp.department}</p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          isSettled
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}
                      >
                        {fnf?.status || 'Draft'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Settlement Ref:</span>
                        <strong className="text-slate-800">{fnf?.settlementId || 'Pending Calculation'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Gross Earnings:</span>
                        <span className="text-emerald-700 font-semibold">{fnf?.currency} {fnf?.totalGrossEarnings.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Total Deductions:</span>
                        <span className="text-rose-700 font-semibold">-{fnf?.currency} {fnf?.totalDeductions.toLocaleString()}</span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200 flex justify-between text-sm font-bold font-sans">
                        <span>Net Payable:</span>
                        <span className="text-slate-950 font-mono font-bold text-base">
                          {fnf?.currency} {fnf?.netSettlementAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
                    {!isSettled && (userRole === 'HR_ADMIN' || userRole === 'FINANCE_ADMIN' || userRole === 'HR_MANAGER') && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingEmp(emp);
                          setShowPaymentModal(true);
                        }}
                        className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-2xs"
                      >
                        Execute Payout
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onCalculateFnF(emp.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                      title="Recalculate settlement based on actual days worked"
                    >
                      Recalculate
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRelievingEmp(emp);
                        setShowRelievingModal(true);
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                      title="Print Experience / Relieving Certificate"
                    >
                      <FileText className="w-3 h-3 text-amber-400" />
                      Relieving
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: EX-EMPLOYEES ARCHIVE */}
      {activeTab === 'alumni' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          {exEmployees.length === 0 ? (
            <p className="text-xs text-slate-500 italic text-center p-8">No ex-employee alumni records archived yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Department & Role</th>
                    <th className="p-3">Service Duration</th>
                    <th className="p-3">Last Working Day</th>
                    <th className="p-3">Settlement Reference</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {exEmployees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{emp.fullName}</td>
                      <td className="p-3">{emp.designation} · {emp.department}</td>
                      <td className="p-3 font-mono text-[11px]">{emp.fnfSettlement?.totalServiceDuration || 'Completed'}</td>
                      <td className="p-3 font-mono">{emp.exitClearance?.actualLwd || 'Completed'}</td>
                      <td className="p-3 font-mono text-emerald-800 font-semibold">{emp.fnfSettlement?.paymentReference || 'UTR-SETTLED'}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRelievingEmp(emp);
                            setShowRelievingModal(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                        >
                          View Certificate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INITIATE RESIGNATION / EXIT MODAL */}
      {showInitiateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Initiate Employee Resignation / Exit</h3>
                <p className="text-xs text-slate-500">Record separation details, compute Last Working Day, and initiate clearances.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInitiateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Employee</label>
                <select
                  value={targetEmpId}
                  onChange={e => setTargetEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="">Select active personnel...</option>
                  {activeConfirmedEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.employeeCode}) · {e.designation} · {e.department}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Resignation Date</label>
                  <input
                    type="date"
                    value={resignationDate}
                    onChange={e => setResignationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Notice Period (Days)</label>
                  <input
                    type="number"
                    value={noticePeriodDays}
                    onChange={e => setNoticePeriodDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Exit Category</label>
                <select
                  value={exitType}
                  onChange={e => setExitType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="Voluntary Resignation">Voluntary Resignation</option>
                  <option value="Mutual Separation">Mutual Separation</option>
                  <option value="End of Contract">End of Contract</option>
                  <option value="Probation Non-Confirmation">Probation Non-Confirmation</option>
                  <option value="Termination">Termination for Cause</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Reason for Exit</label>
                <input
                  type="text"
                  value={reasonForExit}
                  onChange={e => setReasonForExit(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  placeholder="e.g. Higher studies / Relocating / Career Growth"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Handover To (Successor Colleague)</label>
                <select
                  value={handoverToId}
                  onChange={e => setHandoverToId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="">Select team member...</option>
                  {employees.filter(e => e.id !== targetEmpId).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Handover Task Notes</label>
                <textarea
                  rows={2}
                  value={handoverNotes}
                  onChange={e => setHandoverNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  placeholder="Detail client accounts, pipeline transfer, and pending project items..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowInitiateModal(false)}
                className="px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!targetEmpId}
                onClick={handleStartExit}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                Confirm & Initiate Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXECUTE PAYMENT MODAL */}
      {showPaymentModal && payingEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Disburse Full & Final Settlement</h3>
                <p className="text-xs text-slate-500">Employee: <strong>{payingEmp.fullName}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-emerald-950 font-mono">
                <span className="block text-[11px] text-emerald-700 font-sans">Net Payout Amount:</span>
                <strong className="text-lg">
                  {payingEmp.fnfSettlement?.currency} {payingEmp.fnfSettlement?.netSettlementAmount.toLocaleString()}
                </strong>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Banking UTR / Transaction Reference</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Disbursement Mode</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="NEFT">NEFT / RTGS Corporate Bank Transfer</option>
                  <option value="Bank Wire">International Wire (Dubai Branch)</option>
                  <option value="Cheque">Corporate Account Payee Cheque</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePayment}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Confirm Settlement Disbursement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RELIEVING LETTER & EXPERIENCE CERTIFICATE MODAL */}
      {showRelievingModal && relievingEmp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex justify-center p-4 print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-auto p-8 text-slate-800 space-y-6 print:shadow-none print:border-none print:p-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 print:hidden">
              <span className="font-bold text-sm text-slate-900">Experience & Relieving Certificate Preview</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowRelievingModal(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Corporate Header */}
            <div className="border-b-2 border-amber-500 pb-4 flex justify-between items-start">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-amber-400 font-bold text-lg flex items-center justify-center">
                  WCR
                </div>
                <div>
                  <h1 className="text-lg font-bold uppercase text-slate-900">White Collar Realty Private Limited</h1>
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Corporate Human Resources</p>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-500 font-mono">
                <p>Golf Course Extension Road, Sector 65</p>
                <p>Gurugram, Haryana - 122018</p>
                <p>contact@whitecollarrealty.com</p>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-600 flex justify-between">
              <span>Ref: WCR/HR/REL/{new Date().getFullYear()}/{relievingEmp.employeeCode}</span>
              <span>Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>

            <div className="text-center pt-2 pb-2">
              <h2 className="text-base font-bold text-slate-900 uppercase underline tracking-wider">
                TO WHOMSOEVER IT MAY CONCERN
              </h2>
              <p className="text-xs font-semibold text-slate-600">RELIEVING & EXPERIENCE CERTIFICATE</p>
            </div>

            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-3">
              <p>
                This is to certify that <strong>{relievingEmp.fullName}</strong> (Employee Code: <strong>{relievingEmp.employeeCode}</strong>) was employed with <strong>White Collar Realty Private Limited</strong> from <strong>{relievingEmp.joiningDate || 'their date of joining'}</strong> to <strong>{relievingEmp.exitClearance?.actualLwd || new Date().toISOString().split('T')[0]}</strong>.
              </p>
              <p>
                During their tenure with the organization, they served in the role of <strong>{relievingEmp.designation}</strong> within our <strong>{relievingEmp.department}</strong> division.
              </p>
              <p>
                They have fulfilled all organizational handover responsibilities, surrendered company assets, and completed multi-department clearances with IT, HR, Finance, and Business Operations. Their Full and Final settlement has been executed in full.
              </p>
              <p>
                During their service, we found them to be sincere, dedicated, and professional in handling luxury real estate advisory. They are relieved of their duties effective close of business hours on <strong>{relievingEmp.exitClearance?.actualLwd || new Date().toISOString().split('T')[0]}</strong>.
              </p>
              <p>
                We wish them continued success in all their future endeavors.
              </p>
            </div>

            {/* Signature Block */}
            <div className="pt-8 flex justify-between items-end border-t border-slate-300">
              <div className="space-y-1 text-xs">
                <div className="w-20 h-10 border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                  [HR SEAL]
                </div>
                <p className="font-bold text-slate-900">Simran Kaur</p>
                <p className="text-[11px] text-slate-600">Head of Human Resources</p>
                <p className="text-[10px] text-slate-500">White Collar Realty Private Limited</p>
              </div>

              <div className="text-right text-xs space-y-1">
                <div className="w-20 h-10 ml-auto border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                  [SIGNATURE]
                </div>
                <p className="font-bold text-slate-900">Authorized Signatory</p>
                <p className="text-[11px] text-slate-600">Managing Director</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
