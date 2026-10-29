import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api.js';
import { Sidebar } from './components/Sidebar.js';
import { TopNav } from './components/TopNav.js';
import { OverviewView } from './components/OverviewView.js';
import { EmployeesView } from './components/EmployeesView.js';
import { CandidatesView } from './components/CandidatesView.js';
import { DeskAllocationView } from './components/DeskAllocationView.js';
import { AssetsView } from './components/AssetsView.js';
import { SpreadsheetImportView } from './components/SpreadsheetImportView.js';
import { AuditTrailView } from './components/AuditTrailView.js';
import { ProfileModal } from './components/ProfileModal.js';
import { AddPersonModal } from './components/AddPersonModal.js';
import { UpcomingAlertsModal } from './components/UpcomingAlertsModal.js';
import { CandidateUploadPortal } from './components/CandidateUploadPortal.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import {
  Employee,
  CompanyAsset,
  DeskSlot,
  AuditLog,
  UserRole,
  DocumentStatus,
  AssetCondition,
  AlertItem,
  UploadToken,
} from './types/index.js';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [userRole, setUserRole] = useState<UserRole>('HR_ADMIN');
  const [userName, setUserName] = useState<string>('Simran Kaur (HR Head)');
  const [sseConnected, setSseConnected] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Core data states
  const [stats, setStats] = useState<any>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [desks, setDesks] = useState<DeskSlot[]>([]);
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Candidate Self-Service Upload Portal Mode
  const [candidatePortalToken, setCandidatePortalToken] = useState<string | null>(null);

  // Reset database confirmation modal
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);

  // 2-Day Advance Alerts State
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [referenceDate, setReferenceDate] = useState<string>('2026-10-29');
  const [showAlertsPopup, setShowAlertsPopup] = useState<boolean>(false);
  const [hasAutoOpenedAlerts, setHasAutoOpenedAlerts] = useState<boolean>(false);

  // Modals
  const [selectedPerson, setSelectedPerson] = useState<Employee | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addModalIsCandidate, setAddModalIsCandidate] = useState<boolean>(false);
  const [liveToast, setLiveToast] = useState<{ text: string; time: number } | null>(null);

  // Split into active employees and upcoming joiners (candidates)
  const activeEmployees = allEmployees.filter(e => !e.isCandidate);
  const candidates = allEmployees.filter(e => e.isCandidate);

  // Calculate pending doc count
  let pendingDocCount = 0;
  allEmployees.forEach(e => {
    if (e.documents) {
      Object.values(e.documents).forEach(d => {
        if (d.required && (d.status === 'Not Submitted' || d.status === 'Under Review' || d.status === 'Rejected')) {
          pendingDocCount++;
        }
      });
    }
  });

  const showToast = (text: string) => {
    setLiveToast({ text, time: Date.now() });
    setTimeout(() => {
      setLiveToast(prev => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Load all data
  const refreshAllData = useCallback(async () => {
    try {
      const [statsData, empData, desksData, assetsData, logsData] = await Promise.all([
        api.getStats(),
        api.getEmployees(),
        api.getDesks(),
        api.getAssets(),
        api.getAuditLogs(),
      ]);

      setStats(statsData);
      setAllEmployees(empData);
      setDesks(desksData.desks);
      setAssets(assetsData);
      setAuditLogs(logsData);
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch upcoming alerts (Internship Completion & Birthdays within 2 days)
  const refreshAlerts = useCallback(async (refDate?: string) => {
    try {
      const res = await api.getAlerts({
        refDate: refDate || referenceDate,
        maxDays: 2,
        activeOnly: true,
      });
      setAlerts(res.alerts);
      return res.alerts;
    } catch (err) {
      console.error('Failed to load upcoming alerts:', err);
      return [];
    }
  }, [referenceDate]);

  useEffect(() => {
    // Check URL query parameters for direct one-time candidate portal access
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('uploadToken');
    if (token) {
      setCandidatePortalToken(token);
    }
  }, []);

  useEffect(() => {
    refreshAllData();
    refreshAlerts('2026-10-29').then(initialAlerts => {
      // Automatically trigger on-screen popup notification if there are upcoming 2-day alerts
      if (initialAlerts && initialAlerts.length > 0 && !hasAutoOpenedAlerts) {
        setShowAlertsPopup(true);
        setHasAutoOpenedAlerts(true);
      }
    });
  }, [refreshAllData, refreshAlerts, hasAutoOpenedAlerts]);

  useEffect(() => {
    refreshAlerts(referenceDate);
  }, [referenceDate, refreshAlerts]);

  // Subscribe to real-time events via SSE
  useEffect(() => {
    const unsubscribe = api.subscribeToEvents((type, data: any) => {
      setSseConnected(true);

      switch (type) {
        case 'CONNECTED':
          setSseConnected(true);
          break;

        case 'EMPLOYEE_CREATED':
          setAllEmployees(prev => [...prev, data]);
          showToast(`New ${data.isCandidate ? 'candidate' : 'employee'} registered: ${data.fullName}`);
          api.getStats().then(setStats);
          api.getDesks().then(d => setDesks(d.desks));
          break;

        case 'EMPLOYEE_UPDATED':
          setAllEmployees(prev => prev.map(e => (e.id === data.id ? data : e)));
          setSelectedPerson(prev => (prev?.id === data.id ? data : prev));
          api.getStats().then(setStats);
          break;

        case 'UPLOAD_SUBMITTED':
          setAllEmployees(prev => prev.map(e => (e.id === data.candidateId ? data.employee : e)));
          setSelectedPerson(prev => (prev?.id === data.candidateId ? data.employee : prev));
          showToast('Candidate completed document submission (link has expired).');
          api.getStats().then(setStats);
          break;

        case 'EMPLOYEE_DELETED':
          setAllEmployees(prev => prev.filter(e => e.id !== data.id));
          setSelectedPerson(prev => (prev?.id === data.id ? null : prev));
          api.getStats().then(setStats);
          api.getDesks().then(d => setDesks(d.desks));
          api.getAssets().then(setAssets);
          break;

        case 'CANDIDATE_CONVERTED':
          setAllEmployees(prev => prev.map(e => (e.id === data.id ? data : e)));
          setSelectedPerson(prev => (prev?.id === data.id ? data : prev));
          showToast(`Candidate converted to employee: ${data.fullName} (${data.employeeCode})`);
          api.getStats().then(setStats);
          api.getDesks().then(d => setDesks(d.desks));
          break;

        case 'DOCUMENT_STATUS_CHANGED':
          setAllEmployees(prev =>
            prev.map(e => {
              if (e.id === data.employeeId && e.documents) {
                return {
                  ...e,
                  profileCompletion: data.profileCompletion,
                  documents: {
                    ...e.documents,
                    [data.docKey]: data.doc,
                  },
                };
              }
              return e;
            })
          );
          setSelectedPerson(prev => {
            if (!prev) return null;
            if (prev.id === data.employeeId && prev.documents) {
              return {
                ...prev,
                profileCompletion: data.profileCompletion,
                documents: {
                  ...prev.documents,
                  [data.docKey]: data.doc,
                },
              };
            }
            return prev;
          });
          api.getStats().then(setStats);
          break;

        case 'DESK_ALLOCATION_CHANGED':
          api.getDesks().then(d => setDesks(d.desks));
          api.getEmployees().then(setAllEmployees);
          api.getStats().then(setStats);
          break;

        case 'ASSET_CREATED':
        case 'ASSET_UPDATED':
          api.getAssets().then(setAssets);
          api.getStats().then(setStats);
          break;

        case 'AUDIT_LOG_ADDED':
          setAuditLogs(prev => [data, ...prev.slice(0, 199)]);
          break;

        case 'IMPORT_COMPLETED':
        case 'DATABASE_RESET':
          refreshAllData();
          refreshAlerts();
          showToast(type === 'DATABASE_RESET' ? 'Database reset to seed data' : 'Spreadsheet sync completed');
          break;

        case 'ALERT_DISMISSED':
        case 'ALERTS_RESET':
          refreshAlerts();
          api.getStats().then(setStats);
          break;

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refreshAllData]);

  // Role change handler
  const handleChangeRole = (newRole: UserRole) => {
    setUserRole(newRole);
    api.setRole(newRole);
    setUserName(api.getUserName());
    // Refresh employees to apply backend redactions
    api.getEmployees().then(setAllEmployees);
  };

  // Actions
  const handleUpdateEmployee = async (updates: Partial<Employee>) => {
    if (!selectedPerson) return;
    const updated = await api.updateEmployee(selectedPerson.id, updates);
    setSelectedPerson(updated);
  };

  const handleUpdateDocumentStatus = async (docKey: string, status: DocumentStatus, reviewNotes: string) => {
    if (!selectedPerson) return;
    const updated = await api.updateDocumentStatus(selectedPerson.id, docKey, {
      status,
      reviewNotes,
      verifiedBy: userName,
    });
    setSelectedPerson(updated);
  };

  const handleDeleteEmployee = async (id: string) => {
    await api.deleteEmployee(id);
    showToast('Record deleted successfully');
  };

  const handleConvertCandidate = async (id: string, params: { employeeCode?: string; joiningDate?: string; desk?: string }) => {
    await api.convertCandidate(id, params);
  };

  const handleAssignDesk = async (deskCode: string, employeeId: string) => {
    await api.assignDesk(deskCode, employeeId);
  };

  const handleReleaseDesk = async (deskCode: string) => {
    await api.releaseDesk(deskCode);
  };

  const handleCreateAsset = async (asset: Partial<CompanyAsset>) => {
    await api.createAsset(asset);
    showToast(`Asset registered: ${asset.name}`);
  };

  const handleIssueAsset = async (assetId: string, employeeId: string, issueDate: string, notes: string) => {
    await api.issueAsset(assetId, employeeId, issueDate, notes);
    showToast('Asset issued successfully');
  };

  const handleReturnAsset = async (assetId: string, returnDate: string, condition: AssetCondition, notes: string) => {
    await api.returnAsset(assetId, returnDate, condition, notes);
    showToast('Asset returned to stock');
  };

  const handleTransferAsset = async (assetId: string, newEmployeeId: string, notes: string) => {
    await api.transferAsset(assetId, newEmployeeId, notes);
    showToast('Asset transferred');
  };

  const handleUploadDocumentFile = async (
    employeeId: string,
    docKey: string,
    fileData: string,
    fileName: string,
    fileSize: string,
    mimeType: string
  ) => {
    const updated = await api.uploadDocumentFile(employeeId, docKey, {
      fileData,
      fileName,
      fileSize,
      mimeType,
    });
    setSelectedPerson(updated);
    setAllEmployees(prev => prev.map(e => (e.id === updated.id ? updated : e)));
    showToast(`Document ${fileName} uploaded and saved.`);
  };

  const handleGenerateUploadLink = async (candidateId: string) => {
    const res = await api.generateUploadLink(candidateId);
    if (res.token) {
      setAllEmployees(prev =>
        prev.map(e => (e.id === candidateId ? { ...e, uploadToken: res.token } : e))
      );
      setSelectedPerson(prev => (prev?.id === candidateId ? { ...prev, uploadToken: res.token } : prev));
    }
    showToast('Secure one-time link generated.');
    return res;
  };

  const handleRevokeUploadLink = async (candidateId: string) => {
    const res = await api.revokeUploadLink(candidateId);
    setAllEmployees(prev =>
      prev.map(e =>
        e.id === candidateId && e.uploadToken
          ? { ...e, uploadToken: { ...e.uploadToken, isRevoked: true } }
          : e
      )
    );
    setSelectedPerson(prev =>
      prev?.id === candidateId && prev.uploadToken
        ? { ...prev, uploadToken: { ...prev.uploadToken, isRevoked: true } }
        : prev
    );
    showToast('Upload link revoked.');
    return res;
  };

  const handleResetDatabase = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmResetDatabase = async () => {
    try {
      setResetLoading(true);
      await api.resetDatabase();
      setShowResetConfirm(false);
      await refreshAllData();
      await refreshAlerts();
      showToast('Database reset to pristine seed data.');
    } catch {
      showToast('Failed to reset database.');
    } finally {
      setResetLoading(false);
    }
  };

  // If candidate accessed with ?uploadToken=..., render dedicated Candidate Upload Portal
  if (candidatePortalToken) {
    return (
      <CandidateUploadPortal
        token={candidatePortalToken}
        onExitPortal={() => {
          setCandidatePortalToken(null);
          window.history.replaceState({}, '', window.location.pathname);
          refreshAllData();
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans antialiased overflow-hidden w-full">
      {/* Sidebar Navigation (Desktop static + Mobile slide-out drawer) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        userRole={userRole}
        userName={userName}
        onChangeRole={handleChangeRole}
        pendingDocCount={pendingDocCount}
        upcomingCount={candidates.length}
        sseConnected={sseConnected}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        {/* Top Bar following contract */}
        <TopNav
          currentTab={currentTab}
          userRole={userRole}
          onOpenAddModal={isCand => {
            setAddModalIsCandidate(isCand);
            setShowAddModal(true);
          }}
          onResetDatabase={handleResetDatabase}
          alertsCount={alerts.length}
          onOpenAlertsModal={() => setShowAlertsPopup(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
        />

        {/* Viewport View Container */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 w-full min-w-0 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 w-full min-w-0">
            {currentTab === 'overview' && (
              <OverviewView
                stats={stats}
                employees={activeEmployees}
                candidates={candidates}
                desks={desks}
                onSelectEmployee={setSelectedPerson}
                onNavigateTab={setCurrentTab}
                alerts={alerts}
                onOpenAlertsModal={() => setShowAlertsPopup(true)}
              />
            )}

            {currentTab === 'employees' && (
              <EmployeesView
                employees={activeEmployees}
                onSelectEmployee={setSelectedPerson}
                onOpenAddModal={() => {
                  setAddModalIsCandidate(false);
                  setShowAddModal(true);
                }}
                onDeleteEmployee={handleDeleteEmployee}
                userRole={userRole}
              />
            )}

            {currentTab === 'candidates' && (
              <CandidatesView
                candidates={candidates}
                onSelectCandidate={setSelectedPerson}
                onOpenAddModal={() => {
                  setAddModalIsCandidate(true);
                  setShowAddModal(true);
                }}
                onConvertCandidate={handleConvertCandidate}
                userRole={userRole}
                onGenerateUploadLink={handleGenerateUploadLink}
                onOpenCandidatePortal={token => setCandidatePortalToken(token)}
              />
            )}

            {currentTab === 'desks' && (
              <DeskAllocationView
                desks={desks}
                allPeople={allEmployees}
                onAssignDesk={handleAssignDesk}
                onReleaseDesk={handleReleaseDesk}
                onSelectEmployee={setSelectedPerson}
                userRole={userRole}
              />
            )}

            {currentTab === 'assets' && (
              <AssetsView
                assets={assets}
                employees={activeEmployees}
                onCreateAsset={handleCreateAsset}
                onIssueAsset={handleIssueAsset}
                onReturnAsset={handleReturnAsset}
                onTransferAsset={handleTransferAsset}
                userRole={userRole}
              />
            )}

            {currentTab === 'import' && (
              <SpreadsheetImportView
                onPreviewImport={api.previewImport.bind(api)}
                onCommitImport={api.commitImport.bind(api)}
                userRole={userRole}
              />
            )}

            {currentTab === 'audit' && (
              <AuditTrailView logs={auditLogs} />
            )}
          </div>
        </main>
      </div>

      {/* Profile Detail & Edit Modal */}
      {selectedPerson && (
        <ProfileModal
          employee={selectedPerson}
          isOpen={true}
          onClose={() => setSelectedPerson(null)}
          onUpdate={handleUpdateEmployee}
          onUpdateDocumentStatus={handleUpdateDocumentStatus}
          assets={assets}
          userRole={userRole}
          currentUserName={userName}
          onIssueAsset={async (assetId, employeeId, issueDate, notes) => {
            await handleIssueAsset(assetId, employeeId, issueDate, notes);
            const updatedAssets = await api.getAssets();
            setAssets(updatedAssets);
          }}
          onCreateAndIssueAsset={async assetData => {
            await handleCreateAsset(assetData);
            const updatedAssets = await api.getAssets();
            setAssets(updatedAssets);
          }}
          onReturnAsset={async (assetId, returnDate, condition, notes) => {
            await handleReturnAsset(assetId, returnDate, condition, notes);
            const updatedAssets = await api.getAssets();
            setAssets(updatedAssets);
          }}
          onUpdateAsset={async (assetId, updates) => {
            await api.updateAsset(assetId, updates);
            const updatedAssets = await api.getAssets();
            setAssets(updatedAssets);
            showToast('Asset updated');
          }}
          onUploadDocumentFile={handleUploadDocumentFile}
          onGenerateUploadLink={handleGenerateUploadLink}
          onRevokeUploadLink={handleRevokeUploadLink}
          onOpenCandidatePortal={token => setCandidatePortalToken(token)}
        />
      )}

      {/* Upcoming Alerts Modal (2-Day Advance On-Screen Popup for Birthdays & Internship Completions) */}
      <UpcomingAlertsModal
        isOpen={showAlertsPopup}
        onClose={() => setShowAlertsPopup(false)}
        alerts={alerts}
        onDismissAlert={async alertId => {
          await api.dismissAlert(alertId);
          await refreshAlerts();
          showToast('Alert dismissed');
        }}
        onViewProfile={personId => {
          const person = allEmployees.find(p => p.id === personId);
          if (person) {
            setSelectedPerson(person);
            setShowAlertsPopup(false);
          }
        }}
        referenceDate={referenceDate}
        onReferenceDateChange={newDate => {
          setReferenceDate(newDate);
        }}
        onResetDismissed={async () => {
          await api.resetDismissedAlerts();
          await refreshAlerts();
          showToast('All dismissed alerts have been reset');
        }}
        userRole={userRole}
      />

      {/* Add Person Modal */}
      {showAddModal && (
        <AddPersonModal
          isOpen={showAddModal}
          isCandidateDefault={addModalIsCandidate}
          onClose={() => setShowAddModal(false)}
          onCreate={async data => {
            await api.createEmployee(data);
          }}
          userRole={userRole}
        />
      )}

      {/* Confirm Database Reset Modal */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset Entire Database to Seed Records"
        message="Are you sure you want to restore the pristine White Collar Realty roster, desk allocations, assets, and Chetan Sharma's complete dossier? All manual changes will be reverted."
        confirmLabel="Reset Database"
        isDestructive={true}
        loading={resetLoading}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmResetDatabase}
      />

      {/* Real-Time Live Event Notification Toast */}
      {liveToast && (
        <div className="fixed bottom-5 right-5 z-70 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-slate-700 text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{liveToast.text}</span>
        </div>
      )}
    </div>
  );
}
