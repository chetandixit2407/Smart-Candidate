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
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { UserRole, DepartmentWithCounts } from '../types/index.js';
import { COMPANY_CONFIG } from '../config/company.js';

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
  pendingDocCount: _pendingDocCount,
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
  // Collapsed state for desktop (allows compact mode with smooth slide)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Expandable department toggle state
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>(() => ({
    'dept-ai': true,
    'dept-da': true,
    'dept-dubai-market': true,
    'dept-gurgaon-market': true,
  }));

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

  const renderContent = (isMobile: boolean, collapsed: boolean) => (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Brand Header with 3D Depth & Light-Gold Reflection */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800/90 shrink-0 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* 3D Metallic Gold Logo Badge */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black text-sm shadow-[0_4px_12px_rgba(217,119,6,0.35),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.3)] shrink-0 transition-transform duration-200 hover:scale-105">
              WC
            </div>
            {!collapsed && (
              <div className="overflow-hidden min-w-0 animate-in fade-in duration-200">
                <h1 className="font-bold text-xs sm:text-sm tracking-tight text-white leading-tight truncate">
                  {COMPANY_CONFIG.name}
                </h1>
                <p
                  className="text-[10px] text-slate-400 tracking-wide font-normal truncate"
                  title={COMPANY_CONFIG.officialAddress}
                >
                  M3M Urbana, Sec 67 · Gurugram
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isMobile && (
              <button
                type="button"
                onClick={() => setIsCollapsed(prev => !prev)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition-all duration-200 shrink-0 cursor-pointer"
                title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              >
                {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            )}

            {isMobile && onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Sync Status with 3D inset styling */}
        {!collapsed && (
          <div className="mt-3 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs shadow-inner">
            <span className="text-slate-400 text-[11px]">Live Database Sync</span>
            <span className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px] tabular-nums">
              <span
                className={`w-2 h-2 rounded-full ${
                  sseConnected
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse'
                    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                }`}
              />
              {sseConnected ? 'Real-time' : 'Reconnecting'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Items with Slide Effects & 3D Highlighting */}
      <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto no-scrollbar">
        <div>
          {!collapsed && (
            <div className="px-2.5 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span>Management Console</span>
            </div>
          )}
          <div className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id && (item.id !== 'departments' || !selectedDepartmentId);
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full group relative flex items-center ${
                    collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                  } text-xs font-medium rounded-xl transition-all duration-200 ease-out cursor-pointer whitespace-nowrap text-left ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent text-amber-200 border border-amber-500/35 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] translate-x-1'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 hover:translate-x-1'
                  }`}
                >
                  {/* Left edge 3D active bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_0_10px_rgba(251,191,36,0.7)]" />
                  )}

                  <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'text-slate-400'
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!collapsed && item.badge && (
                    <span
                      className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md shadow-xs transition-colors ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                          : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
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

        {/* Expandable Department Units (Hidden when collapsed for clean rail) */}
        {!collapsed && departments.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <div className="px-2.5 pb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-amber-400" />
                Departments & Units
              </span>
              {canManage && onOpenCreateDepartment && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCreateDepartment();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800 transition-all cursor-pointer"
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
                const isDubai = dept.id === 'dept-dubai-market' || dept.name.toLowerCase().includes('dubai');

                return (
                  <div key={dept.id} className="rounded-xl overflow-hidden transition-all duration-200">
                    {/* Department Row */}
                    <div
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg group ${
                        isDeptSelected && selectedSubDepartmentName === 'All'
                          ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent text-amber-200 border border-amber-500/35 shadow-xs translate-x-0.5'
                          : isDeptSelected
                          ? 'bg-slate-800/90 text-white border border-slate-700'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60 hover:translate-x-0.5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleDepartmentClick(dept.id, 'All')}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left py-0.5 cursor-pointer"
                      >
                        {isAi ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : isDa ? (
                          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        ) : isDubai ? (
                          <Building2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        ) : (
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate text-xs font-semibold">{dept.name}</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-800/90 px-1.5 py-0.2 rounded-md tabular-nums border border-slate-700/60 shadow-xs">
                          {dept.totalCount}
                        </span>
                        {dept.subDepartments && dept.subDepartments.length > 0 && (
                          <button
                            type="button"
                            onClick={e => toggleDeptExpand(dept.id, e)}
                            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
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

                    {/* Sub-Departments nested accordion with smooth slide animation */}
                    {isExpanded && dept.subDepartments && dept.subDepartments.length > 0 && (
                      <div className="ml-3.5 pl-2.5 my-1 border-l-2 border-slate-800 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
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
                              className={`w-full flex items-center justify-between px-2.5 py-1 text-[11px] rounded-lg transition-all duration-150 cursor-pointer text-left ${
                                isSubSelected
                                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-xs translate-x-1'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 hover:translate-x-0.5'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isInternUnit
                                      ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                                      : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
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

      {/* Role Switcher & User Card (3D Inset & Elevation) */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/60 shrink-0">
        {!collapsed && (
          <>
            <div className="flex items-center justify-between px-1.5 pb-2">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-400/80" />
                Security & RBAC
              </span>
              <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-md">
                {userRole}
              </span>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => handleRoleChange('HR')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer ${
                  userRole === 'HR'
                    ? 'bg-slate-800 text-white font-medium border border-slate-700 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span className="truncate">HR (Offers, Assets & People Ops)</span>
                {userRole === 'HR' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </button>
              <button
                onClick={() => handleRoleChange('Co-Founder')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer ${
                  userRole === 'Co-Founder'
                    ? 'bg-slate-800 text-white font-medium border border-slate-700 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span className="truncate">Co-Founder (Executive & Offers)</span>
                {userRole === 'Co-Founder' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </button>
              <button
                onClick={() => handleRoleChange('CEO')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer ${
                  userRole === 'CEO'
                    ? 'bg-slate-800 text-white font-medium border border-slate-700 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span className="truncate">CEO (Leadership Oversight)</span>
                {userRole === 'CEO' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </button>
            </div>
          </>
        )}

        {/* Current User Card with 3D Avatar */}
        <div
          className={`mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center ${
            collapsed ? 'justify-center' : 'gap-2 px-1'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600 text-amber-300 flex items-center justify-center text-xs font-bold shrink-0 shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]">
            {userName.charAt(0)}
          </div>
          {!collapsed && (
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {userRole === 'HR'
                  ? 'People Operations & HR'
                  : userRole === 'Co-Founder'
                  ? 'Co-Founder · Full Access'
                  : 'Chief Executive Officer'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar with Smooth Width Transition */}
      <aside
        className={`hidden md:flex ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-slate-900 text-slate-200 flex-col shrink-0 border-r border-slate-800/90 select-none h-screen sticky top-0 overflow-hidden transition-all duration-300 ease-in-out shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-30`}
      >
        {renderContent(false, isCollapsed)}
      </aside>

      {/* Mobile Slide-Out Drawer & Backdrop with Smooth Animation */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ease-out ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop with Blur */}
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity duration-300"
          onClick={onCloseMobile}
          aria-hidden="true"
        />

        {/* Drawer Sliding In From Left */}
        <aside
          className={`relative w-72 max-w-[85vw] bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shadow-2xl select-none h-full z-10 overflow-hidden transform transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {renderContent(true, false)}
        </aside>
      </div>
    </>
  );
};
