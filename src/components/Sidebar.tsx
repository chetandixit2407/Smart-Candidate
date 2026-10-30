import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Armchair,
  FileSpreadsheet,
  History,
  CheckCircle2,
  Lock,
  X,
  Briefcase,
  LogOut,
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Layers,
  Sparkles,
} from 'lucide-react';
import { UserRole, DepartmentWithCounts } from '../types/index.js';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  userName: string;
  onChangeRole: (role: UserRole) => void;
  pendingDocCount: number;
  upcomingCount: number;
  departmentsCount?: number;
  departments?: DepartmentWithCounts[];
  selectedDepartmentId?: string;
  selectedSubDepartmentName?: string;
  onSelectDepartment?: (deptId: string, subDeptName?: string) => void;
  onOpenCreateDepartment?: () => void;
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
  departmentsCount,
  departments = [],
  selectedDepartmentId,
  selectedSubDepartmentName = 'All',
  onSelectDepartment,
  onOpenCreateDepartment,
  sseConnected,
  mobileOpen = false,
  onCloseMobile,
}) => {
  // Expandable department toggle state
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>(() => {
    // Default open AI and DA departments, or first two
    return {
      'dept-ai': true,
      'dept-da': true,
    };
  });

  const toggleDeptExpand = (deptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts(prev => ({
      ...prev,
      [deptId]: !prev[deptId],
    }));
  };

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleDepartmentClick = (deptId: string, subName = 'All') => {
    if (onSelectDepartment) {
      onSelectDepartment(deptId, subName);
    } else {
      onSelectTab('departments');
    }
    // Auto expand the clicked department
    setExpandedDepts(prev => ({ ...prev, [deptId]: true }));
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

  const canManage = userRole === 'HR' || userRole === 'Co-Founder';

  const navItems = [
    {
      id: 'overview',
      label: 'Overview & Metrics',
      icon: LayoutDashboard,
    },
    {
      id: 'hiring',
      label: 'Recruitment & Offers',
      icon: Briefcase,
      badge: upcomingCount > 0 ? `${upcomingCount}` : undefined,
    },
    {
      id: 'candidates',
      label: 'Upcoming Joiners',
      icon: UserPlus,
      badge: upcomingCount > 0 ? `${upcomingCount}` : undefined,
    },
    {
      id: 'employees',
      label: 'Current Employees',
      icon: Users,
    },
    {
      id: 'departments',
      label: 'All Departments',
      icon: Building2,
      badge: departmentsCount && departmentsCount > 0 ? `${departmentsCount}` : undefined,
    },
    {
      id: 'exit',
      label: 'Exit & FnF Settlement',
      icon: LogOut,
    },
    {
      id: 'desks',
      label: 'Desk Allocation',
      icon: Armchair,
    },
    {
      id: 'import',
      label: 'Spreadsheet Import',
      icon: FileSpreadsheet,
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
      <div className="p-4 sm:p-5 border-b border-slate-800 shrink-0">
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
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        <div>
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Management Console
          </div>
          <div className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id && (item.id !== 'departments' || !selectedDepartmentId);
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-left ${
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
          </div>
        </div>

        {/* Expandable Department Structure */}
        {departments.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <div className="px-3 pb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-amber-400/80" />
                Departments & Units
              </span>
              {canManage && onOpenCreateDepartment && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCreateDepartment();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-slate-800 transition-colors"
                  title="Create new Department"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              {departments.map(dept => {
                const isExpanded = !!expandedDepts[dept.id];
                const isDeptSelected = currentTab === 'departments' && selectedDepartmentId === dept.id;
                const isAi = dept.id === 'dept-ai' || dept.name.includes('AI');
                const isDa = dept.id === 'dept-da' || dept.name.includes('DA');

                return (
                  <div key={dept.id} className="rounded-lg overflow-hidden">
                    {/* Department Row */}
                    <div
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium transition-colors rounded-lg ${
                        isDeptSelected && selectedSubDepartmentName === 'All'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                          : isDeptSelected
                          ? 'bg-slate-800/90 text-white border border-slate-700'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleDepartmentClick(dept.id, 'All')}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left py-0.5"
                      >
                        {isAi ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : isDa ? (
                          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        ) : (
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate text-xs font-semibold">{dept.name}</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded tabular-nums">
                          {dept.totalCount}
                        </span>
                        {dept.subDepartments && dept.subDepartments.length > 0 && (
                          <button
                            type="button"
                            onClick={e => toggleDeptExpand(dept.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                            aria-label={`Toggle ${dept.name} sub-departments`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sub-Departments nested list (e.g. AI Employees, AI Interns, DA Employees, DA Interns) */}
                    {isExpanded && dept.subDepartments && dept.subDepartments.length > 0 && (
                      <div className="ml-4 pl-2.5 my-1 border-l border-slate-800 space-y-0.5">
                        {dept.subDepartments.map(sub => {
                          const isSubSelected =
                            isDeptSelected && selectedSubDepartmentName.toLowerCase() === sub.name.toLowerCase();
                          const count = dept.subDepartmentCounts ? dept.subDepartmentCounts[sub.name] || 0 : 0;
                          const isInternUnit = sub.name.toLowerCase().includes('intern');

                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleDepartmentClick(dept.id, sub.name)}
                              className={`w-full flex items-center justify-between px-2.5 py-1 text-[11px] rounded transition-colors text-left ${
                                isSubSelected
                                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isInternUnit ? 'bg-amber-400' : 'bg-emerald-400'
                                  }`}
                                />
                                <span className="truncate">{sub.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 tabular-nums ml-1">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Role & Access Switcher (Strictly 3 Roles: HR, Co-Founder, CEO) */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            Security & RBAC
          </span>
          <span className="text-[10px] text-amber-400 font-mono">
            {userRole}
          </span>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => handleRoleChange('HR')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'HR'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">HR (Offers, Assets & People Ops)</span>
            {userRole === 'HR' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </button>
          <button
            onClick={() => handleRoleChange('Co-Founder')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'Co-Founder'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">Co-Founder (Executive & Offers)</span>
            {userRole === 'Co-Founder' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          </button>
          <button
            onClick={() => handleRoleChange('CEO')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              userRole === 'CEO'
                ? 'bg-slate-800 text-white font-medium border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="truncate">CEO (Leadership & Offer Review)</span>
            {userRole === 'CEO' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
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
              {userRole === 'HR'
                ? 'People Operations & HR'
                : userRole === 'Co-Founder'
                ? 'Co-Founder · Full Access'
                : 'Chief Executive Officer'}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile, visible from md:) */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-200 flex-col shrink-0 border-r border-slate-800 select-none h-screen sticky top-0 overflow-hidden">
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
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shadow-2xl select-none h-full z-10 animate-in slide-in-from-left duration-200 overflow-hidden">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
