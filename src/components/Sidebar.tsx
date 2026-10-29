import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Armchair,
  Package,
  FileSpreadsheet,
  History,
  ShieldCheck,
  CheckCircle2,
  Building2,
  Lock,
  X,
} from 'lucide-react';
import { UserRole } from '../types/index.js';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  userName: string;
  onChangeRole: (role: UserRole) => void;
  pendingDocCount: number;
  upcomingCount: number;
  sseConnected: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  userName,
  onChangeRole,
  pendingDocCount,
  upcomingCount,
  sseConnected,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleRoleChange = (role: UserRole) => {
    onChangeRole(role);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navItems = [
    {
      id: 'overview',
      label: 'Overview & Metrics',
      icon: LayoutDashboard,
    },
    {
      id: 'employees',
      label: 'Current Employees',
      icon: Users,
    },
    {
      id: 'candidates',
      label: 'Upcoming Joiners',
      icon: UserPlus,
      badge: upcomingCount > 0 ? `${upcomingCount}` : undefined,
    },
    {
      id: 'desks',
      label: 'Desk Allocation',
      icon: Armchair,
    },
    {
      id: 'assets',
      label: 'Company Assets',
      icon: Package,
    },
    {
      id: 'import',
      label: 'Spreadsheet Sync',
      icon: FileSpreadsheet,
      badge: pendingDocCount > 0 ? `${pendingDocCount} Docs` : undefined,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: History,
    },
  ];

  const renderContent = (isMobile: boolean) => (
    <>
      {/* Brand Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-base shadow-inner shrink-0">
              WC
            </div>
            <div className="overflow-hidden min-w-0">
              <h1 className="font-semibold text-sm tracking-tight text-white leading-tight truncate">
                White Collar Realty
              </h1>
              <p className="text-[11px] text-slate-400 tracking-wide font-normal truncate">
                Gurgaon · Dubai Operations
              </p>
            </div>
          </div>
          {isMobile && onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Live Sync Status */}
        <div className="mt-3.5 flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs">
          <span className="text-slate-400">Live Database Sync</span>
          <span className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px] tabular-nums">
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
              }`}
            />
            {sseConnected ? 'Real-time' : 'Reconnecting'}
          </span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Management Console
        </div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-left ${
                isActive
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-amber-500/30 text-amber-200'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Role & Access Switcher */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            Security & RBAC
          </span>
          <span className="text-[10px] text-amber-400 font-mono">
            {userRole === 'HR_ADMIN' ? 'FULL' : userRole === 'HR_MANAGER' ? 'OPS' : 'VIEW'}
          </span>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => handleRoleChange('HR_ADMIN')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'HR_ADMIN'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">HR Admin (Full Access & CTC)</span>
            {userRole === 'HR_ADMIN' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </button>
          <button
            onClick={() => handleRoleChange('HR_MANAGER')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'HR_MANAGER'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">HR Manager (Ops & Docs)</span>
            {userRole === 'HR_MANAGER' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </button>
          <button
            onClick={() => handleRoleChange('DEPT_HEAD_VIEWER')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'DEPT_HEAD_VIEWER'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">Dept Head (CTC Masked)</span>
            {userRole === 'DEPT_HEAD_VIEWER' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </button>
        </div>

        {/* Current User Card */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-semibold shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="overflow-hidden min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{userName}</p>
            <p className="text-[10px] text-slate-400 truncate">
              {userRole === 'HR_ADMIN' ? 'Head of People' : userRole === 'HR_MANAGER' ? 'Talent Operations' : 'Viewer Mode'}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile, visible from md:) */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-200 flex-col shrink-0 border-r border-slate-800 select-none h-screen sticky top-0">
        {renderContent(false)}
      </aside>

      {/* Mobile Slide-Out Drawer & Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shadow-2xl select-none h-full z-10 animate-in slide-in-from-left duration-200">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
