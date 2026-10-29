import React, { useState, useRef, useEffect } from 'react';
import { Download, Plus, Shield, RefreshCw, Bell, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { UserRole } from '../types/index.js';

interface TopNavProps {
  currentTab: string;
  userRole: UserRole;
  onOpenAddModal: (isCandidate: boolean) => void;
  onResetDatabase?: () => void;
  alertsCount?: number;
  onOpenAlertsModal?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentTab,
  userRole,
  onOpenAddModal,
  onResetDatabase,
  alertsCount = 0,
  onOpenAlertsModal,
}) => {
  const tabTitles: Record<string, { main: string; sub: string }> = {
    overview: { main: 'Executive HR Dashboard', sub: 'People Analytics & Onboarding' },
    employees: { main: 'Employee Directory', sub: 'Active Workforce & Profiles' },
    candidates: { main: 'Candidate Pipeline', sub: 'New Joiners & Onboarding' },
    desks: { main: 'Office Desk Allocation', sub: 'Bays A–H Interactive Layout' },
    assets: { main: 'Company Assets & Inventory', sub: 'Devices, Cards & Issued Items' },
    import: { main: 'Spreadsheet Synchronization', sub: 'Chetan Dossier & Birthday Sheet' },
    audit: { main: 'Security Audit Trail', sub: 'Verification & Profile Change Logs' },
  };

  const titleInfo = tabTitles[currentTab] || { main: 'HR Management', sub: 'White Collar Realty' };
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 gap-6">
      {/* Zone 1: Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap min-w-0">
        <span className="font-semibold text-slate-900 tracking-tight text-sm">
          {titleInfo.main}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 text-xs hidden sm:inline">
          {titleInfo.sub}
        </span>
      </div>

      {/* Zone 2: Sensitive CTC indicator & reset option */}
      <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500">
        {userRole === 'HR_ADMIN' ? (
          <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-200">
            <Shield className="w-3 h-3" />
            Full Access (CTC & Documents Unrestricted)
          </span>
        ) : userRole === 'HR_MANAGER' ? (
          <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-medium border border-blue-200">
            <Shield className="w-3 h-3" />
            Manager Access (Verification & Desk Ops)
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-medium border border-amber-200">
            <Shield className="w-3 h-3" />
            Viewer Access (CTC & Identity Masked)
          </span>
        )}

        {onResetDatabase && userRole === 'HR_ADMIN' && (
          <button
            onClick={onResetDatabase}
            title="Reset to pristine White Collar Realty dataset"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Reset Seed Data
          </button>
        )}
      </div>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Milestone & Compliance 2-Day Alerts Bell */}
        {onOpenAlertsModal && (
          <button
            onClick={onOpenAlertsModal}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              alertsCount > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 animate-pulse'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="View 2-Day Advance Alerts for Birthdays & Internship Completions"
          >
            <Bell className={`w-3.5 h-3.5 ${alertsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
            <span>2-Day Alerts</span>
            {alertsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full font-mono text-[10px] font-bold">
                {alertsCount}
              </span>
            )}
          </button>
        )}

        {/* Master Excel Export with Single-Sheet Option */}
        <div className="relative" ref={menuRef}>
          <div className="inline-flex rounded-lg shadow-xs border border-slate-300 bg-white">
            <a
              href="/api/export/excel/single-sheet"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors rounded-l-lg border-r border-slate-200"
              title="Export all employees and candidates in one single worksheet sorted alphabetically by name"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Master Excel</span>
            </a>
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-2 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-r-lg transition-colors"
              title="Choose Excel format"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {showExportMenu && (
            <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Export Format Options
              </div>
              <a
                href="/api/export/excel/single-sheet"
                download
                onClick={() => setShowExportMenu(false)}
                className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-emerald-50/60 transition-colors text-slate-800 group"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900 group-hover:text-emerald-800">
                    Single-Sheet Master Roster
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    One row per person (sorted alphabetically A-Z), all personal, contact, desk, asset, and verification fields.
                  </p>
                </div>
              </a>
              <a
                href="/api/export/excel"
                download
                onClick={() => setShowExportMenu(false)}
                className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-slate-50 transition-colors text-slate-800 group border-t border-slate-100"
              >
                <Download className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900 group-hover:text-blue-800">
                    Multi-Tab Workbook
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Divided into separate tabs for Employees, Candidates, Desks, Assets, and Compliance.
                  </p>
                </div>
              </a>
            </div>
          )}
        </div>

        {userRole !== 'DEPT_HEAD_VIEWER' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onOpenAddModal(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Employee
            </button>
            <button
              onClick={() => onOpenAddModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-amber-800" />
              Add Candidate
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
