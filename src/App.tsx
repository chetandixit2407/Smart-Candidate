import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api.js';
import { Sidebar } from './components/Sidebar.js';
import { TopNav } from './components/TopNav.js';
import { OverviewView } from './components/OverviewView.js';
import { EmployeesView } from './components/EmployeesView.js';
import { CandidatesView } from './components/CandidatesView.js';
import { DeskAllocationView } from './components/DeskAllocationView.js';
import { SpreadsheetImportView } from './components/SpreadsheetImportView.js';
import { AuditTrailView } from './components/AuditTrailView.js';
import { ProfileModal } from './components/ProfileModal.js';
import { AddPersonModal } from './components/AddPersonModal.js';
import { UpcomingAlertsModal } from './components/UpcomingAlertsModal.js';
import { CandidateUploadPortal } from './components/CandidateUploadPortal.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { HiringLifecycleView } from './components/HiringLifecycleView.js';
import { ExitManagementView } from './components/ExitManagementView.js';
import { OfferLetterModal } from './components/OfferLetterModal.js';
import { CandidateReminderModal } from './components/CandidateReminderModal.js';
import { HRAlertsFloatingBanner } from './components/HRAlertsFloatingBanner.js';
import { DepartmentsView } from './components/DepartmentsView.js';
import { QrCodeModal } from './components/QrCodeModal.js';
import { QrDocumentUploadPage } from './components/QrDocumentUploadPage.js';
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
  OfferLetterData,
  InterviewRound,
  DepartmentWithCounts,
  LiveQrUploadEvent,
} from './types/index.js';

function detectPublicQrTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.trim();
  const pathMatch = path.match(/^\/(?:qr-upload|qr)\/([a-zA-Z0-9_-]{20,80})\/?$/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }
  const searchParams = new URLSearchParams(window.location.search);
  const queryToken = searchParams.get('qr') || searchParams.get('token') || searchParams.get('qrToken');
  if (queryToken && /^[a-zA-Z0-9_-]{20,80}$/.test(queryToken.trim())) {
    return queryToken.trim();
  }
  return null;
}

export default function App() {
  // Public unauthenticated 24-Hour QR Document Upload route (does NOT require HR login)
  const [publicQrToken] = useState<string | null>(() => detectPublicQrTokenFromLocation());

  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [userRole, setUserRole] = useState<UserRole>('HR');
  const [userName, setUserName] = useState<string>('Nisha (HR)');
  const [sseConnected, setSseConnected] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Core data states
  const [stats, setStats] = useState<any>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<DepartmentWithCounts[]>([]);
  const [desks, setDesks] = useState<DeskSlot[]>([]);
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Live QR upload progress & dashboard feed
  const [liveQrUploads, setLiveQrUploads] = useState<Record<string, LiveQrUploadEvent>>({});
  const [liveQrFeed, setLiveQrFeed] = useState<LiveQrUploadEvent[]>([]);

  // Candidate Self-Service Upload Portal Mode (legacy ?uploadToken=...)
  const [candidatePortalToken, setCandidatePortalToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('uploadToken');
  });

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
  const [qrModalPerson, setQrModalPerson] = useState<Employee | null>(null);
  const [offerModalCandidate, setOfferModalCandidate] = useState<Employee | null>(null);
  const [offerPreviewSnapshot, setOfferPreviewSnapshot] = useState<OfferLetterData | null>(null);
  const [reminderCandidate, setReminderCandidate] = useState<Employee | null>(null);
  const [reminderInitialChannel, setReminderInitialChannel] = useState<'EMAIL' | 'WHATSAPP' | 'BOTH'>('BOTH');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedSubDept, setSelectedSubDept] = useState<string>('All');
  const [openCreateDeptTrigger, setOpenCreateDeptTrigger] = useState<number>(0);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addModalIsCandidate, setAddModalIsCandidate] = useState<boolean>(false);
  const [addModalDefaultDept, setAddModalDefaultDept] = useState<string | undefined>(undefined);
  const [addModalDefaultSubDept, setAddModalDefaultSubDept] = useState<string | undefined>(undefined);
  const [liveToast, setLiveToast] = useState<{ text: string; time: number } | null>(null);

  // Split into active employees and upcoming joiners (candidates)
  const activeEmployees = allEmployees.filter(e => !e.isCandidate);
  const candidates = allEmployees.filter(e => e.isCandidate);

  // Calculate pending doc count (Missing / Not Submitted / Uploaded awaiting HR verification)
  let pendingDocCount = 0;
  allEmployees.forEach(e => {
    if (e.documents) {
      Object.values(e.documents).forEach(d => {
        if (
          d.status === 'Uploaded' ||
          (d.required &&
            (d.status === 'Missing' ||
              d.status === 'Not Submitted' ||
              d.status === 'Under Review' ||
              d.status === 'Rejected'))
        ) {
          pendingDocCount++;
        }
      });
    }
  });

  const showToast = (text: string) => {
    setLiveToast({ text, time: Date.now() });
    setTimeout(() => {
      setLiveToast(prev => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Load all data
  const refreshAllData = useCallback(async () => {
    if (publicQrToken || candidatePortalToken) return;
    try {
      const [statsData, empData, deptsData, desksData, assetsData, logsData] = await Promise.all([
        api.getStats(),
        api.getEmployees(),
        api.getDepartments(),
        api.getDesks(),
        api.getAssets(),
        api.getAuditLogs(),
      ]);

      setStats(statsData);
      setAllEmployees(empData);
      setDepartments(deptsData || []);
      setDesks(desksData.desks);
      setAssets(assetsData);
      setAuditLogs(logsData);
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setLoading(false);
    }
  }, [publicQrToken, candidatePortalToken]);

  // Fetch upcoming alerts (Internship Completion & Birthdays within 2 days)
  const refreshAlerts = useCallback(async (refDate?: string) => {
    if (publicQrToken || candidatePortalToken) return [];
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
  }, [referenceDate, publicQrToken, candidatePortalToken]);

  useEffect(() => {
    if (publicQrToken || candidatePortalToken) return;
    refreshAllData();
    refreshAlerts('2026-10-29').then(initialAlerts => {
      // Automatically trigger on-screen popup notification if there are upcoming 2-day alerts
      if (initialAlerts && initialAlerts.length > 0 && !hasAutoOpenedAlerts) {
        setShowAlertsPopup(true);
        setHasAutoOpenedAlerts(true);
      }
    });
  }, [refreshAllData, refreshAlerts, hasAutoOpenedAlerts, publicQrToken, candidatePortalToken]);

  useEffect(() => {
    if (publicQrToken || candidatePortalToken) return;
    refreshAlerts(referenceDate);
  }, [referenceDate, refreshAlerts, publicQrToken, candidatePortalToken]);

  // Subscribe to real-time events via SSE
  useEffect(() => {
    if (publicQrToken || candidatePortalToken) return;
    const unsubscribe = api.subscribeToEvents((type, data: any) => {
      setSseConnected(true);

      switch (type) {
        case 'CONNECTED':
          setSseConnected(true);
          break;

        case 'EMPLOYEE_CREATED':
          setAllEmployees(prev => (prev.some(e => e.id === data.id) ? prev : [...prev, data]));
          showToast(`New ${data.isCandidate ? 'candidate' : 'employee'} registered: ${data.fullName} (${data.department})`);
          api.getStats().then(setStats);
          api.getDepartments().then(setDepartments);
          api.getDesks().then(d => setDesks(d.desks));
          break;

        case 'EMPLOYEE_UPDATED':
          setAllEmployees(prev => prev.map(e => (e.id === data.id ? data : e)));
          setSelectedPerson(prev => (prev?.id === data.id ? data : prev));
          setQrModalPerson(prev => (prev?.id === data.id ? data : prev));
          api.getStats().then(setStats);
          api.getDepartments().then(setDepartments);
          api.getAuditLogs().then(setAuditLogs);
          api.getDesks().then(d => setDesks(d.desks));
          break;

        case 'CANDIDATE_DOCUMENTS_SUBMITTED':
        case 'UPLOAD_SUBMITTED':
          setAllEmployees(prev =>
            prev.map(e => {
              if (e.id === data.candidateId) {
                return data.employee || {
                  ...e,
                  documents: data.documents,
                  profileCompletion: data.profileCompletion,
                  uploadToken: data.tokenInfo || e.uploadToken,
                };
              }
              return e;
            })
          );
          setSelectedPerson(prev => {
            if (prev && prev.id === data.candidateId) {
              return (data.employee as Employee) || {
                ...prev,
                documents: data.documents,
                profileCompletion: data.profileCompletion,
                uploadToken: data.tokenInfo || prev.uploadToken,
              };
            }
            return prev;
          });
          showToast(`Candidate ${data.fullName || ''} uploaded ${data.filesCount || ''} document(s).`);
          api.getStats().then(setStats);
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'UPLOAD_LINK_GENERATED':
          setAllEmployees(prev =>
            prev.map(e => (e.id === data.candidateId ? { ...e, uploadToken: data.token } : e))
          );
          setSelectedPerson(prev => {
            if (prev && prev.id === data.candidateId) {
              return { ...prev, uploadToken: data.token };
            }
            return prev;
          });
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'UPLOAD_LINK_REVOKED':
          setAllEmployees(prev =>
            prev.map(e =>
              e.id === data.candidateId && e.uploadToken
                ? { ...e, uploadToken: { ...e.uploadToken, revoked: true, isRevoked: true } }
                : e
            )
          );
          setSelectedPerson(prev => {
            if (prev && prev.id === data.candidateId && prev.uploadToken) {
              return { ...prev, uploadToken: { ...prev.uploadToken, revoked: true, isRevoked: true } };
            }
            return prev;
          });
          api.getAuditLogs().then(setAuditLogs);
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

        case 'OFFER_LETTER_UPDATED':
          setAllEmployees(prev => prev.map(e => (e.id === data.candidateId ? (data.employee || e) : e)));
          setSelectedPerson(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          setOfferModalCandidate(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          showToast(`Offer letter updated for ${data.employee?.fullName || 'candidate'}`);
          api.getStats().then(setStats);
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'LIFECYCLE_EVENT_ADDED':
          setAllEmployees(prev => prev.map(e => (e.id === data.employeeId ? (data.employee || e) : e)));
          setSelectedPerson(prev => (prev?.id === data.employeeId ? (data.employee || prev) : prev));
          setOfferModalCandidate(prev => (prev?.id === data.employeeId ? (data.employee || prev) : prev));
          if (data.event?.title) {
            showToast(data.event.title);
          }
          api.getStats().then(setStats);
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'ALERT_DISMISSED':
        case 'ALERTS_RESET':
        case 'ALERT_UPDATED':
          refreshAlerts();
          api.getStats().then(setStats);
          break;

        case 'REMINDER_SENT':
          setAllEmployees(prev => prev.map(e => (e.id === data.candidateId ? (data.employee || e) : e)));
          setSelectedPerson(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          setReminderCandidate(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          showToast(data.message || `Document reminder sent to ${data.employee?.fullName || 'candidate'}`);
          refreshAlerts();
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'OFFER_LETTER_EMAILED':
          setAllEmployees(prev => prev.map(e => (e.id === data.candidateId ? (data.employee || e) : e)));
          setSelectedPerson(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          setOfferModalCandidate(prev => (prev?.id === data.candidateId ? (data.employee || prev) : prev));
          showToast(`10-page offer letter emailed to ${data.employee?.fullName || 'candidate'}`);
          api.getStats().then(setStats);
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'ASSET_REMINDER_UPDATED':
        case 'NOTIFICATION_LOG_ADDED':
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'DEPARTMENTS_UPDATED':
          if (Array.isArray(data)) {
            setDepartments(data);
          } else if (data?.departments) {
            setDepartments(data.departments);
          } else {
            api.getDepartments().then(setDepartments);
          }
          api.getEmployees().then(empList => {
            setAllEmployees(empList);
            setSelectedPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
            setQrModalPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
          });
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'EMPLOYEES_BULK_UPDATED':
          api.getEmployees().then(empList => {
            setAllEmployees(empList);
            setSelectedPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
          });
          api.getDepartments().then(setDepartments);
          api.getStats().then(setStats);
          break;

        case 'DOCUMENT_QR_GENERATED':
        case 'DOCUMENT_QR_REVOKED':
          api.getEmployees().then(empList => {
            setAllEmployees(empList);
            setSelectedPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
            setQrModalPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
          });
          api.getAuditLogs().then(setAuditLogs);
          break;

        case 'QR_UPLOAD_PROGRESS': {
          const ev = data as LiveQrUploadEvent;
          if (ev.docKey) {
            setLiveQrUploads(prev => ({
              ...prev,
              [`${ev.employeeId}:${ev.docKey}`]: ev,
            }));
          }
          setLiveQrFeed(prev => {
            const filtered = prev.filter(
              item => !(item.employeeId === ev.employeeId && item.docKey === ev.docKey)
            );
            return [ev, ...filtered].slice(0, 8);
          });
          if (ev.status === 'OPENED') {
            showToast(`📲 ${ev.employeeName} opened their 24h Document QR upload link`);
          }
          break;
        }

        case 'QR_UPLOAD_COMPLETED': {
          const updatedEmp = data.employee as Employee | undefined;
          if (updatedEmp) {
            setAllEmployees(prev => prev.map(e => (e.id === updatedEmp.id ? updatedEmp : e)));
            setSelectedPerson(prev => (prev?.id === updatedEmp.id ? updatedEmp : prev));
            setQrModalPerson(prev => (prev?.id === updatedEmp.id ? updatedEmp : prev));
          } else {
            api.getEmployees().then(setAllEmployees);
          }
          const completedEvent: LiveQrUploadEvent = {
            uploadId: `qrdone-${Date.now()}`,
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            department: data.department,
            docKey: data.docKey,
            docTitle: data.docTitle,
            fileName: data.fileName,
            progress: 100,
            status: 'COMPLETED',
            timestamp: data.uploadedAt || new Date().toISOString(),
          };
          setLiveQrUploads(prev => ({
            ...prev,
            [`${data.employeeId}:${data.docKey}`]: completedEvent,
          }));
          setLiveQrFeed(prev => {
            const filtered = prev.filter(
              item => !(item.employeeId === data.employeeId && item.docKey === data.docKey)
            );
            return [completedEvent, ...filtered].slice(0, 8);
          });
          showToast(
            `✅ QR Upload: ${data.employeeName} uploaded "${data.docTitle}" (Missing → Uploaded)`
          );
          api.getStats().then(setStats);
          api.getDepartments().then(setDepartments);
          refreshAlerts();
          api.getAuditLogs().then(setAuditLogs);
          break;
        }

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refreshAllData, refreshAlerts, userRole, publicQrToken, candidatePortalToken]);

  // Role change handler
  const handleChangeRole = (newRole: UserRole) => {
    api.setRole(newRole);
    setUserRole(newRole);
    setUserName(api.getUserName());
    // Refresh data under active role permissions
    api.getEmployees().then(setAllEmployees);
    api.getDepartments().then(setDepartments);
    api.getStats().then(setStats);
    refreshAlerts();
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

  const handleIssueAsset = async (
    assetId: string,
    employeeId: string,
    issueDate: string,
    notes: string,
    expectedReturnDate?: string | null
  ) => {
    await api.issueAsset(assetId, employeeId, issueDate, notes, expectedReturnDate);
    showToast('Asset issued successfully');
  };

  const handleReturnAsset = async (assetId: string, returnDate: string, condition: AssetCondition, notes: string) => {
    await api.returnAsset(assetId, returnDate, condition, notes);
    showToast('Asset returned to stock');
  };

  const handleDismissAllMissingDocs = async () => {
    const res = await api.dismissMissingDocAlerts();
    await refreshAlerts();
    showToast(
      res.dismissedCount > 0
        ? `HR Alert: Candidate Missing Documents hidden (${res.dismissedCount} item${res.dismissedCount === 1 ? '' : 's'} dismissed)`
        : 'HR Alert: Candidate Missing Documents hidden'
    );
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

  const handleGenerateUploadLink = async (candidateId: string, options?: { expiryDays?: number; isOneTime?: boolean }) => {
    const res = await api.generateUploadLink(candidateId, options);
    if (res.token) {
      setAllEmployees(prev =>
        prev.map(e => (e.id === candidateId ? { ...e, uploadToken: res.token } : e))
      );
      setSelectedPerson(prev => (prev?.id === candidateId ? { ...prev, uploadToken: res.token } : prev));
    }
    showToast(res.message || 'Secure link generated.');
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

  // Recruitment & Interview Handlers
  const handleScheduleInterview = async (candidateId: string, roundData: Partial<InterviewRound>) => {
    const res = await api.addInterview(candidateId, roundData);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? res.employee : prev));
      if (offerModalCandidate?.id === candidateId) setOfferModalCandidate(res.employee);
    }
    showToast('Interview round scheduled.');
  };

  const handleUpdateInterview = async (candidateId: string, roundId: string, updates: Partial<InterviewRound>) => {
    const res = await api.updateInterview(candidateId, roundId, updates);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? res.employee : prev));
      if (offerModalCandidate?.id === candidateId) setOfferModalCandidate(res.employee);
    }
    showToast('Interview evaluation updated.');
  };

  const handleDeleteInterview = async (candidateId: string, roundId: string) => {
    const res = await api.deleteInterview(candidateId, roundId);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? res.employee : prev));
      if (offerModalCandidate?.id === candidateId) setOfferModalCandidate(res.employee);
    }
    showToast('Interview round removed.');
  };

  // Offer Letter Handlers
  const handleUpdateOffer = async (candidateId: string, offerData: Partial<OfferLetterData>) => {
    const res = await api.updateOfferLetter(candidateId, offerData);
    const updated = res.employee || res.candidate;
    if (updated) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? updated : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? updated : prev));
      setOfferModalCandidate(updated);
    }
    showToast('Offer letter saved against candidate record.');
    api.getAuditLogs().then(setAuditLogs);
  };

  const handleApproveOffer = async (candidateId: string) => {
    const res = await api.approveOfferLetter(candidateId);
    const updated = res.employee || res.candidate;
    if (updated) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? updated : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? updated : prev));
      setOfferModalCandidate(updated);
    }
    showToast('Offer letter approved by HR leadership.');
    api.getAuditLogs().then(setAuditLogs);
  };

  const handleIssueOffer = async (candidateId: string) => {
    const res = await api.issueOfferLetter(candidateId);
    const updated = res.employee || res.candidate;
    if (updated) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? updated : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? updated : prev));
      setOfferModalCandidate(updated);
    }
    showToast('Offer letter formally issued to candidate.');
    api.getAuditLogs().then(setAuditLogs);
  };

  const handleAcceptOffer = async (candidateId: string, signatureName: string) => {
    const res = await api.acceptOfferLetter(candidateId, signatureName || 'Accepted');
    const updated = res.employee || res.candidate;
    if (updated) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? updated : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? updated : prev));
      setOfferModalCandidate(updated);
    }
    showToast('Candidate offer accepted!');
    api.getAuditLogs().then(setAuditLogs);
  };

  const handleEmailOffer = async (candidateId: string) => {
    const res = await api.emailOfferLetter(candidateId);
    const updated = res.employee || res.candidate;
    if (updated) {
      setAllEmployees(prev => prev.map(e => (e.id === candidateId ? updated : e)));
      setSelectedPerson(prev => (prev?.id === candidateId ? updated : prev));
      setOfferModalCandidate(updated);
    }
    showToast(`Official 10-page offer letter emailed to ${updated?.fullName || 'candidate'}.`);
    api.getAuditLogs().then(setAuditLogs);
  };

  const handleOpenReminderModal = (candidateId: string, channel: 'EMAIL' | 'WHATSAPP' | 'BOTH' = 'BOTH') => {
    const cand = allEmployees.find(e => e.id === candidateId);
    if (cand) {
      setReminderCandidate(cand);
      setReminderInitialChannel(channel);
    }
  };

  // Exit & FnF Handlers
  const handleInitiateExit = async (employeeId: string, data: any) => {
    const res = await api.initiateExit(employeeId, data);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === employeeId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === employeeId ? res.employee : prev));
    }
    showToast(`Exit workflow initiated for ${res.employee?.fullName || 'employee'}.`);
  };

  const handleUpdateExitClearance = async (employeeId: string, dept: string, updates: any) => {
    const res = await api.updateExitClearance(employeeId, dept, updates);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === employeeId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === employeeId ? res.employee : prev));
    }
    showToast(`${dept.toUpperCase()} clearance updated.`);
  };

  const handleCalculateFnF = async (employeeId: string, overrides?: any) => {
    return await api.calculateFnF(employeeId, overrides);
  };

  const handleFinalizeFnF = async (employeeId: string, paymentData: any) => {
    const res = await api.finalizeFnF(employeeId, paymentData);
    if (res.employee) {
      setAllEmployees(prev => prev.map(e => (e.id === employeeId ? res.employee : e)));
      setSelectedPerson(prev => (prev?.id === employeeId ? res.employee : prev));
    }
    showToast('Full & Final settlement disbursed. Employee status moved to Ex-Employee.');
    api.getDesks().then(d => setDesks(d.desks));
  };

  // If candidate scanned a 24-hour Document QR code (/qr-upload/:token or ?qr=:token), render mobile upload page directly without HR login
  if (publicQrToken) {
    return <QrDocumentUploadPage token={publicQrToken} />;
  }

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
        departmentsCount={departments.length}
        departments={departments}
        selectedDepartmentId={selectedDeptId}
        selectedSubDepartmentName={selectedSubDept}
        onSelectDepartment={(deptId, subDeptName) => {
          setSelectedDeptId(deptId);
          setSelectedSubDept(subDeptName || 'All');
          setCurrentTab('departments');
        }}
        onOpenCreateDepartment={() => {
          setSelectedDeptId('');
          setSelectedSubDept('All');
          setCurrentTab('departments');
          setOpenCreateDeptTrigger(prev => prev + 1);
        }}
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
            setAddModalDefaultDept(undefined);
            setAddModalDefaultSubDept(undefined);
            setAddModalIsCandidate(isCand);
            setShowAddModal(true);
          }}
          onOpenOfferGenerator={
            userRole !== 'CEO' && (candidates.length > 0 || allEmployees.length > 0)
              ? () => {
                  setOfferPreviewSnapshot(null);
                  setOfferModalCandidate(candidates[0] || allEmployees[0]);
                }
              : undefined
          }
          onResetDatabase={handleResetDatabase}
          alertsCount={alerts.length}
          onOpenAlertsModal={() => setShowAlertsPopup(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
        />

        {/* Top Notification / Alert Banner - Contained strictly inside content area, never overlapping sidebar or top header */}
        <HRAlertsFloatingBanner
          alerts={alerts}
          onViewProfile={personId => {
            const person = allEmployees.find(p => p.id === personId);
            if (person) {
              setSelectedPerson(person);
            }
          }}
          onSendReminder={(candidateId, channel) => {
            handleOpenReminderModal(candidateId, channel);
          }}
          onDismissAlert={async alertId => {
            await api.dismissAlert(alertId);
            await refreshAlerts();
            showToast('Alert dismissed');
          }}
          onDismissAllMissingDocs={handleDismissAllMissingDocs}
          userRole={userRole}
          onOpenFullModal={() => setShowAlertsPopup(true)}
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
                onDismissMissingDocAlerts={handleDismissAllMissingDocs}
                departments={departments}
                liveQrFeed={liveQrFeed}
                onOpenQrModal={setQrModalPerson}
              />
            )}

            {currentTab === 'departments' && (
              <DepartmentsView
                departments={departments}
                employees={allEmployees}
                userRole={userRole}
                activeDeptId={selectedDeptId}
                activeSubDept={selectedSubDept}
                onSelectDeptAndSub={(deptId, subDept) => {
                  setSelectedDeptId(deptId);
                  setSelectedSubDept(subDept);
                }}
                openCreateDeptTrigger={openCreateDeptTrigger}
                onSelectPerson={setSelectedPerson}
                onOpenQrModal={setQrModalPerson}
                onOpenAddPersonInDepartment={(isCand, deptName, subDeptName) => {
                  setAddModalIsCandidate(isCand);
                  setAddModalDefaultDept(deptName);
                  setAddModalDefaultSubDept(subDeptName);
                  setShowAddModal(true);
                }}
                onDepartmentsChanged={updated => setDepartments(updated)}
                onEmployeesRefresh={() => {
                  api.getEmployees().then(setAllEmployees);
                  api.getDepartments().then(setDepartments);
                  api.getStats().then(setStats);
                }}
              />
            )}

            {currentTab === 'employees' && (
              <EmployeesView
                employees={activeEmployees}
                onSelectEmployee={setSelectedPerson}
                onOpenAddModal={() => {
                  setAddModalDefaultDept(undefined);
                  setAddModalDefaultSubDept(undefined);
                  setAddModalIsCandidate(false);
                  setShowAddModal(true);
                }}
                onDeleteEmployee={handleDeleteEmployee}
                userRole={userRole}
                departmentsList={departments}
                onOpenQrModal={setQrModalPerson}
              />
            )}

            {currentTab === 'hiring' && (
              <HiringLifecycleView
                candidates={candidates}
                userRole={userRole}
                onSelectCandidate={setSelectedPerson}
                onOpenAddModal={() => {
                  setAddModalDefaultDept(undefined);
                  setAddModalDefaultSubDept(undefined);
                  setAddModalIsCandidate(true);
                  setShowAddModal(true);
                }}
                onOpenOfferModal={candidate => setOfferModalCandidate(candidate)}
                onOpenUploadLinkModal={candidate => setQrModalPerson(candidate)}
                onConvertCandidate={handleConvertCandidate}
                onScheduleInterview={handleScheduleInterview}
                onUpdateInterview={handleUpdateInterview}
              />
            )}

            {currentTab === 'candidates' && (
              <CandidatesView
                candidates={candidates}
                onSelectCandidate={setSelectedPerson}
                onOpenAddModal={() => {
                  setAddModalDefaultDept(undefined);
                  setAddModalDefaultSubDept(undefined);
                  setAddModalIsCandidate(true);
                  setShowAddModal(true);
                }}
                onConvertCandidate={handleConvertCandidate}
                userRole={userRole}
                onGenerateUploadLink={handleGenerateUploadLink}
                onRevokeUploadLink={handleRevokeUploadLink}
                onOpenCandidatePortal={token => setCandidatePortalToken(token)}
                onOpenOfferLetter={candidate => setOfferModalCandidate(candidate)}
                onSendReminder={(candId, channel) => handleOpenReminderModal(candId, channel || 'BOTH')}
                onOpenQrModal={setQrModalPerson}
              />
            )}

            {currentTab === 'exit' && (
              <ExitManagementView
                employees={allEmployees}
                assets={assets}
                userRole={userRole}
                currentUserName={userName}
                onInitiateExit={handleInitiateExit}
                onUpdateClearance={handleUpdateExitClearance}
                onCalculateFnF={handleCalculateFnF}
                onFinalizeFnF={handleFinalizeFnF}
                onReturnAsset={handleReturnAsset}
                onSelectEmployee={setSelectedPerson}
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

            {currentTab === 'import' && (
              <SpreadsheetImportView
                onPreviewImport={api.previewImport.bind(api)}
                onCommitImport={api.commitImport.bind(api)}
                userRole={userRole}
              />
            )}

            {currentTab === 'audit' && (
              <AuditTrailView logs={auditLogs} userRole={userRole} />
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
          auditLogs={auditLogs}
          userRole={userRole}
          currentUserName={userName}
          onIssueAsset={async (assetId, employeeId, issueDate, notes, expectedReturnDate) => {
            await handleIssueAsset(assetId, employeeId, issueDate, notes, expectedReturnDate);
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
          onOpenOfferLetter={(emp, snapshot) => {
            setSelectedPerson(null);
            setOfferPreviewSnapshot(snapshot || null);
            setOfferModalCandidate(emp);
          }}
          departments={departments}
          onOpenQrModal={person => setQrModalPerson(person)}
          liveQrUploads={liveQrUploads}
        />
      )}

      {/* Individual 24-Hour Document QR Generation & Missing Document Inspection Modal */}
      {qrModalPerson && (
        <QrCodeModal
          person={qrModalPerson}
          userRole={userRole}
          onClose={() => setQrModalPerson(null)}
          onQrUpdated={() => {
            api.getEmployees().then(empList => {
              setAllEmployees(empList);
              setSelectedPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
              setQrModalPerson(prev => (prev ? empList.find(e => e.id === prev.id) || prev : null));
            });
            api.getAuditLogs().then(setAuditLogs);
          }}
        />
      )}

      {/* Executive Offer Letter Modal */}
      {offerModalCandidate && (
        <OfferLetterModal
          candidate={offerModalCandidate}
          allCandidates={allEmployees}
          onSelectCandidate={cand => {
            setOfferPreviewSnapshot(null);
            setOfferModalCandidate(cand);
          }}
          isOpen={!!offerModalCandidate}
          onClose={() => {
            setOfferPreviewSnapshot(null);
            setOfferModalCandidate(null);
          }}
          userRole={userRole}
          initialPreviewSnapshot={offerPreviewSnapshot}
          onSaveOffer={async offerData => {
            await handleUpdateOffer(offerModalCandidate.id, offerData);
          }}
          onApproveOffer={async () => {
            await handleApproveOffer(offerModalCandidate.id);
          }}
          onIssueOffer={async () => {
            await handleIssueOffer(offerModalCandidate.id);
          }}
          onAcceptOffer={async signatureName => {
            await handleAcceptOffer(offerModalCandidate.id, signatureName);
          }}
          onEmailOffer={async () => {
            await handleEmailOffer(offerModalCandidate.id);
          }}
        />
      )}

      {/* Upcoming Alerts Modal (2-Day Advance On-Screen Popup for Birthdays, Internship Completions & Missing Docs) */}
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
        onDismissAllMissingDocs={handleDismissAllMissingDocs}
        onSendReminder={(candId, channel) => {
          handleOpenReminderModal(candId, channel);
          setShowAlertsPopup(false);
        }}
      />

      {/* Candidate Missing Document Reminder Modal (WhatsApp & Email with 24h deadline) */}
      {reminderCandidate && (
        <CandidateReminderModal
          isOpen={!!reminderCandidate}
          onClose={() => setReminderCandidate(null)}
          candidate={reminderCandidate}
          userRole={userRole}
          initialChannel={reminderInitialChannel}
          onReminderSent={updated => {
            setAllEmployees(prev => prev.map(e => (e.id === updated.id ? updated : e)));
            setSelectedPerson(prev => (prev?.id === updated.id ? updated : prev));
            setReminderCandidate(updated);
            refreshAlerts();
          }}
        />
      )}

      {/* Add Person Modal */}
      {showAddModal && (
        <AddPersonModal
          isOpen={showAddModal}
          isCandidateDefault={addModalIsCandidate}
          departments={departments}
          defaultDepartment={addModalDefaultDept}
          defaultSubDepartment={addModalDefaultSubDept}
          onClose={() => {
            setShowAddModal(false);
            setAddModalDefaultDept(undefined);
            setAddModalDefaultSubDept(undefined);
          }}
          onCreate={async (data, options) => {
            const created = await api.createEmployee(data);
            const [empList, deptRes, statsData] = await Promise.all([
              api.getEmployees(),
              api.getDepartments(),
              api.getStats(),
            ]);
            setAllEmployees(empList);
            setDepartments(deptRes || []);
            setStats(statsData);
            if (created && options?.openQrAfterCreate) {
              setQrModalPerson(created);
            }
            return created;
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
