import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Eye,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Lock,
  Mail,
  FileText,
  Sliders,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  UserCheck,
  Columns,
  Sparkles,
  Settings2,
} from 'lucide-react';
import {
  Employee,
  OfferLetterData,
  UserRole,
  CompensationLineItem,
  RoleSalaryStructure,
  RoleSalaryStructureRule,
  MarketType,
} from '../types/index.js';
import {
  DEFAULT_ROLE_SALARY_STRUCTURES,
  WCR_ORIGINAL_OFFER_SECTIONS,
  buildOfferLetterData,
  findMatchingRoleStructure,
  buildComponentsFromStructure,
  recalculateComponentsForNewCtc,
  summarizeCompensationComponents,
  formatOfferJoiningDate,
  formatSalutationName,
  checkOfferMissingFields,
  parseAnnualCtc,
} from '../../server/lifecycleEngine.js';
import { api } from '../services/api.js';

interface OfferLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Employee;
  allCandidates?: Employee[];
  onSelectCandidate?: (candidate: Employee) => void;
  userRole: UserRole;
  initialPreviewSnapshot?: OfferLetterData | null;
  onSaveOffer: (updates: Partial<OfferLetterData>) => Promise<void>;
  onApproveOffer: () => Promise<void>;
  onIssueOffer: () => Promise<void>;
  onAcceptOffer: (signatureName: string) => Promise<void>;
  onEmailOffer?: () => Promise<void>;
}

const DEPARTMENTS = [
  'Gurgaon Market',
  'Dubai Market',
  'AI Intern',
  'DM Intern',
  'Marketing & Digital Media',
  'Human Resources',
  'Executive Leadership',
  'Administration & Operations',
  'Sales & Investments',
  'Luxury Residential & Investments',
  'Commercial Leasing',
  'Administration & Facilities',
  'Research & Data',
  'Legal & Compliance',
  'Finance & Accounts',
];

const EMPLOYMENT_TYPES = ['Full-Time', 'Probation', 'Intern', 'Contract'];

function toIsoDateIfPossible(dateStr?: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim();
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/i, '$1');
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function formatTableCurrency(amount: number, market?: MarketType): string {
  const rounded = Math.round(Number(amount) || 0);
  if (market === 'Dubai') {
    return `AED ${rounded.toLocaleString('en-US')}`;
  }
  return rounded.toLocaleString('en-IN');
}

export const OfferLetterModal: React.FC<OfferLetterModalProps> = ({
  isOpen,
  onClose,
  candidate,
  allCandidates = [],
  onSelectCandidate,
  userRole,
  initialPreviewSnapshot = null,
  onSaveOffer,
  onApproveOffer,
  onIssueOffer,
  onAcceptOffer,
  onEmailOffer,
}) => {
  const canEditOffer = userRole === 'HR' || userRole === 'Co-Founder';
  const isViewer = false;
  const canApprove = userRole === 'HR' || userRole === 'Co-Founder' || userRole === 'CEO';
  const canConfigureStructures = canEditOffer;
  const savedOfferLetters = candidate.savedOfferLetters || [];
  const hasSavedOffer = Boolean(candidate.offerLetter || savedOfferLetters.length > 0);

  const [salaryStructures, setSalaryStructures] = useState<RoleSalaryStructure[]>(
    DEFAULT_ROLE_SALARY_STRUCTURES
  );
  const [workspaceMode, setWorkspaceMode] = useState<
    'split' | 'preview' | 'edit' | 'clauses' | 'structures' | 'compare'
  >(() => (canEditOffer && !initialPreviewSnapshot ? 'split' : 'preview'));
  const [viewAllPages, setViewAllPages] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [highlightDynamic, setHighlightDynamic] = useState<boolean>(false);

  // Draft form state vs Regenerated preview state
  const [draftData, setDraftData] = useState<OfferLetterData>(() =>
    buildOfferLetterData(
      candidate,
      initialPreviewSnapshot || candidate.offerLetter,
      DEFAULT_ROLE_SALARY_STRUCTURES
    )
  );
  const [renderedOffer, setRenderedOffer] = useState<OfferLetterData>(() =>
    buildOfferLetterData(
      candidate,
      initialPreviewSnapshot || candidate.offerLetter,
      DEFAULT_ROLE_SALARY_STRUCTURES
    )
  );
  const [hasUnregeneratedEdits, setHasUnregeneratedEdits] = useState<boolean>(false);

  const [ctcInputRaw, setCtcInputRaw] = useState<string>('');
  const [joiningIsoInput, setJoiningIsoInput] = useState<string>('');

  // Action states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState<boolean>(false);
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState<boolean>(false);
  const [showAcceptInput, setShowAcceptInput] = useState<boolean>(false);
  const [candidateSigName, setCandidateSigName] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Custom salary row inputs
  const [newCompLabel, setNewCompLabel] = useState<string>('');
  const [newCompCategory, setNewCompCategory] = useState<'ALLOWANCE' | 'VARIABLE' | 'DEDUCTION'>('ALLOWANCE');
  const [newCompMonthly, setNewCompMonthly] = useState<string>('');

  // Role Salary Structure editor state
  const [editingStructure, setEditingStructure] = useState<RoleSalaryStructure>(() => ({
    ...DEFAULT_ROLE_SALARY_STRUCTURES[0],
  }));
  const [isSavingStructure, setIsSavingStructure] = useState<boolean>(false);

  // Compare state
  const [comparePage, setComparePage] = useState<number>(1);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 3800);
  };

  // Load persisted role salary structures from server
  useEffect(() => {
    if (!isOpen) return;
    api
      .getSalaryStructures()
      .then(res => {
        if (res.structures && Array.isArray(res.structures) && res.structures.length > 0) {
          setSalaryStructures(res.structures);
          setEditingStructure(res.structures[0]);
        }
      })
      .catch(() => {
        // Fallback to default structures silently
      });
  }, [isOpen]);

  // Re-initialize when candidate, preview snapshot, or role changes
  useEffect(() => {
    const sourceOffer = initialPreviewSnapshot || candidate.offerLetter;
    const built = buildOfferLetterData(candidate, sourceOffer, salaryStructures);
    setDraftData(built);
    setRenderedOffer(built);
    setCtcInputRaw(String(built.salaryBreakup.annualCtc));
    setJoiningIsoInput(
      toIsoDateIfPossible(sourceOffer?.joiningDate || candidate.joiningDate || built.joiningDate)
    );
    setHasUnregeneratedEdits(false);
    if (!canEditOffer || initialPreviewSnapshot) {
      setWorkspaceMode('preview');
    } else if (workspaceMode === 'preview') {
      setWorkspaceMode('split');
    }
  }, [candidate.id, initialPreviewSnapshot, canEditOffer]);

  // Keep workflow status synced if candidate.offerLetter updates externally (approve/issue/accept/email)
  useEffect(() => {
    if (candidate.offerLetter) {
      setDraftData(prev => ({
        ...prev,
        status: candidate.offerLetter!.status,
        approvedBy: candidate.offerLetter!.approvedBy,
        approvedAt: candidate.offerLetter!.approvedAt,
        issuedAt: candidate.offerLetter!.issuedAt,
        acceptedAt: candidate.offerLetter!.acceptedAt,
        candidateSignatureName: candidate.offerLetter!.candidateSignatureName,
        signedAt: candidate.offerLetter!.signedAt,
        emailSentAt: candidate.offerLetter!.emailSentAt,
        emailSentBy: candidate.offerLetter!.emailSentBy,
      }));
      setRenderedOffer(prev => ({
        ...prev,
        status: candidate.offerLetter!.status,
        approvedBy: candidate.offerLetter!.approvedBy,
        approvedAt: candidate.offerLetter!.approvedAt,
        issuedAt: candidate.offerLetter!.issuedAt,
        acceptedAt: candidate.offerLetter!.acceptedAt,
        candidateSignatureName: candidate.offerLetter!.candidateSignatureName,
        signedAt: candidate.offerLetter!.signedAt,
        emailSentAt: candidate.offerLetter!.emailSentAt,
        emailSentBy: candidate.offerLetter!.emailSentBy,
      }));
    }
  }, [
    candidate.offerLetter?.status,
    candidate.offerLetter?.approvedAt,
    candidate.offerLetter?.issuedAt,
    candidate.offerLetter?.acceptedAt,
    candidate.offerLetter?.emailSentAt,
  ]);

  const selectablePeople = useMemo(() => {
    const candidatesOnly = allCandidates.filter(p => p.isCandidate);
    const others = allCandidates.filter(p => !p.isCandidate);
    const combined = [...candidatesOnly, ...others];
    if (!combined.some(p => p.id === candidate.id)) {
      return [candidate, ...combined];
    }
    return combined;
  }, [allCandidates, candidate]);

  if (!isOpen) return null;

  // --- Draft Update Helpers ---
  const updateDraft = (updater: (prev: OfferLetterData) => OfferLetterData) => {
    setDraftData(prev => {
      const next = updater(prev);
      const missing = checkOfferMissingFields(candidate, next);
      return { ...next, missingFields: missing };
    });
    setHasUnregeneratedEdits(true);
  };

  const syncComponentsIntoDraft = (
    components: CompensationLineItem[],
    marketOverride?: MarketType,
    customCtcLabel?: string
  ) => {
    updateDraft(prev => {
      const mkt = marketOverride || prev.market || 'Gurgaon';
      const summary = summarizeCompensationComponents(components, mkt);
      setCtcInputRaw(String(summary.annualCtc));
      return {
        ...prev,
        market: mkt,
        compensationComponents: components,
        ctcLpaFormatted: customCtcLabel ?? summary.ctcLpaFormatted,
        basicMonthly: summary.basicMonthly,
        basicYearly: summary.basicYearly,
        pbvpMonthly: summary.pbvpMonthly,
        pbvpYearly: summary.pbvpYearly,
        retentionBonusMonthly: summary.retentionBonusMonthly,
        retentionBonusYearly: summary.retentionBonusYearly,
        totalDeductionsMonthly: summary.totalDeductionsMonthly,
        totalDeductionsYearly: summary.totalDeductionsYearly,
        netPayMonthly: summary.netPayMonthly,
        netPayYearly: summary.netPayYearly,
        salaryBreakup: {
          ...prev.salaryBreakup,
          annualCtc: summary.annualCtc,
          monthlyCtc: summary.monthlyCtc,
          basicMonthly: summary.basicMonthly,
          basicAnnual: summary.basicYearly,
          grossMonthly: summary.monthlyCtc,
          grossAnnual: summary.annualCtc,
          approxNetInHandMonthly: summary.netPayMonthly,
          currency: summary.currency,
        },
      };
    });
  };

  const handleSelectRoleStructure = (structureId: string, useRoleDefaultCtc = true) => {
    const structure = salaryStructures.find(s => s.id === structureId);
    if (!structure) return;
    const targetCtc = useRoleDefaultCtc
      ? structure.defaultAnnualCtc
      : draftData.salaryBreakup.annualCtc || structure.defaultAnnualCtc;
    const comps = buildComponentsFromStructure(targetCtc, structure);
    const summary = summarizeCompensationComponents(comps, structure.market);
    setCtcInputRaw(String(summary.annualCtc));

    updateDraft(prev => ({
      ...prev,
      roleStructureId: structure.id,
      designation: structure.designation,
      department: structure.department,
      employmentType: structure.employmentType,
      market: structure.market,
      workLocation:
        structure.market === 'Dubai'
          ? 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE'
          : '6th floor, TOWER-A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101',
      place: structure.market === 'Dubai' ? 'Dubai, UAE' : 'Gurugram, Haryana',
      compensationComponents: comps,
      ctcLpaFormatted: summary.ctcLpaFormatted,
      basicMonthly: summary.basicMonthly,
      basicYearly: summary.basicYearly,
      pbvpMonthly: summary.pbvpMonthly,
      pbvpYearly: summary.pbvpYearly,
      retentionBonusMonthly: summary.retentionBonusMonthly,
      retentionBonusYearly: summary.retentionBonusYearly,
      totalDeductionsMonthly: summary.totalDeductionsMonthly,
      totalDeductionsYearly: summary.totalDeductionsYearly,
      netPayMonthly: summary.netPayMonthly,
      netPayYearly: summary.netPayYearly,
      salaryBreakup: {
        ...prev.salaryBreakup,
        annualCtc: summary.annualCtc,
        monthlyCtc: summary.monthlyCtc,
        basicMonthly: summary.basicMonthly,
        basicAnnual: summary.basicYearly,
        grossMonthly: summary.monthlyCtc,
        grossAnnual: summary.annualCtc,
        approxNetInHandMonthly: summary.netPayMonthly,
        currency: summary.currency,
      },
    }));
  };

  const handleDesignationChange = (newDesignation: string) => {
    const matched = findMatchingRoleStructure(
      newDesignation,
      salaryStructures,
      draftData.market,
      draftData.employmentType
    );
    const exactMatch =
      matched.designation.trim().toLowerCase() === newDesignation.trim().toLowerCase();

    if (exactMatch) {
      const comps = buildComponentsFromStructure(matched.defaultAnnualCtc, matched);
      const summary = summarizeCompensationComponents(comps, matched.market);
      setCtcInputRaw(String(summary.annualCtc));
      updateDraft(prev => ({
        ...prev,
        designation: newDesignation,
        department: matched.department || prev.department,
        employmentType: matched.employmentType || prev.employmentType,
        market: matched.market,
        roleStructureId: matched.id,
        compensationComponents: comps,
        ctcLpaFormatted: summary.ctcLpaFormatted,
        basicMonthly: summary.basicMonthly,
        basicYearly: summary.basicYearly,
        pbvpMonthly: summary.pbvpMonthly,
        pbvpYearly: summary.pbvpYearly,
        retentionBonusMonthly: summary.retentionBonusMonthly,
        retentionBonusYearly: summary.retentionBonusYearly,
        totalDeductionsMonthly: summary.totalDeductionsMonthly,
        totalDeductionsYearly: summary.totalDeductionsYearly,
        netPayMonthly: summary.netPayMonthly,
        netPayYearly: summary.netPayYearly,
        salaryBreakup: {
          ...prev.salaryBreakup,
          annualCtc: summary.annualCtc,
          monthlyCtc: summary.monthlyCtc,
          basicMonthly: summary.basicMonthly,
          basicAnnual: summary.basicYearly,
          grossMonthly: summary.monthlyCtc,
          grossAnnual: summary.annualCtc,
          approxNetInHandMonthly: summary.netPayMonthly,
          currency: summary.currency,
        },
      }));
    } else {
      updateDraft(prev => ({ ...prev, designation: newDesignation }));
    }
  };

  const handleApplyTotalCtc = (rawVal: string) => {
    setCtcInputRaw(rawVal);
    const parsedAnnual = parseAnnualCtc(rawVal, 0);
    if (parsedAnnual <= 0) return;
    const matched =
      salaryStructures.find(s => s.id === draftData.roleStructureId) ||
      findMatchingRoleStructure(draftData.designation, salaryStructures, draftData.market);
    const rescaled = recalculateComponentsForNewCtc(
      parsedAnnual,
      draftData.compensationComponents || [],
      matched
    );
    syncComponentsIntoDraft(rescaled);
  };

  const handleComponentMonthlyChange = (compId: string, monthlyVal: number) => {
    const safeMonthly = Math.max(0, Math.round(Number(monthlyVal) || 0));
    const current = draftData.compensationComponents || [];
    const next = current.map(c =>
      c.id === compId
        ? { ...c, monthlyAmount: safeMonthly, yearlyAmount: safeMonthly * 12, enabled: true }
        : c
    );
    syncComponentsIntoDraft(next);
  };

  const handleComponentYearlyChange = (compId: string, yearlyVal: number) => {
    const safeYearly = Math.max(0, Math.round(Number(yearlyVal) || 0));
    const safeMonthly = Math.round(safeYearly / 12);
    const current = draftData.compensationComponents || [];
    const next = current.map(c =>
      c.id === compId
        ? { ...c, monthlyAmount: safeMonthly, yearlyAmount: safeYearly, enabled: true }
        : c
    );
    syncComponentsIntoDraft(next);
  };

  const handleToggleComponent = (compId: string, enabled: boolean) => {
    const current = draftData.compensationComponents || [];
    const next = current.map(c => (c.id === compId ? { ...c, enabled } : c));
    syncComponentsIntoDraft(next);
  };

  const handleRenameComponent = (compId: string, label: string) => {
    const current = draftData.compensationComponents || [];
    const next = current.map(c => (c.id === compId ? { ...c, label } : c));
    updateDraft(prev => ({ ...prev, compensationComponents: next }));
  };

  const handleDeleteComponent = (compId: string) => {
    const current = draftData.compensationComponents || [];
    const next = current.filter(c => c.id !== compId);
    syncComponentsIntoDraft(next);
  };

  const handleAddCustomComponent = () => {
    if (!newCompLabel.trim()) return;
    const monthly = Math.max(0, Math.round(Number(newCompMonthly) || 0));
    const newItem: CompensationLineItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code: newCompLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label: newCompLabel.trim(),
      category: newCompCategory,
      monthlyAmount: monthly,
      yearlyAmount: monthly * 12,
      enabled: true,
      isCustom: true,
    };
    const next = [...(draftData.compensationComponents || []), newItem];
    syncComponentsIntoDraft(next);
    setNewCompLabel('');
    setNewCompMonthly('');
  };

  // --- Workflow Step Actions ---
  const handleRegeneratePreview = () => {
    const missing = checkOfferMissingFields(candidate, draftData);
    const nextOffer: OfferLetterData = {
      ...draftData,
      missingFields: missing,
    };
    setRenderedOffer(nextOffer);
    setHasUnregeneratedEdits(false);
    if (workspaceMode === 'edit') {
      setWorkspaceMode('preview');
    }
    notify('Offer letter preview regenerated with latest candidate & salary details.');
  };

  const handleSaveToCandidate = async () => {
    try {
      setIsSaving(true);
      const missing = checkOfferMissingFields(candidate, draftData);
      const payload: OfferLetterData = { ...draftData, missingFields: missing };
      setRenderedOffer(payload);
      setHasUnregeneratedEdits(false);
      await onSaveOffer(payload);
      notify(`Saved offer letter against ${payload.candidateName || candidate.fullName}.`);
    } catch (err: any) {
      notify(err.message || 'Failed to save offer letter', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadWord = async () => {
    try {
      setIsDownloadingDocx(true);
      if (!canEditOffer) {
        if (savedOfferLetters.length > 0) {
          const latestFile = savedOfferLetters[0];
          await api.downloadSavedOfferLetterFile(candidate.id, latestFile.id, latestFile.fileName);
        } else {
          await api.downloadOfferLetterDocx(candidate.id);
        }
        notify('Saved Microsoft Word (.docx) offer letter downloaded.');
        return;
      }
      const missing = checkOfferMissingFields(candidate, draftData);
      const latestPayload: OfferLetterData = { ...draftData, missingFields: missing };
      setRenderedOffer(latestPayload);
      setHasUnregeneratedEdits(false);
      await api.downloadOfferLetterDocx(candidate.id, latestPayload);
      notify('Editable Word (.docx) offer letter saved to candidate profile & downloaded.');
    } catch (err: any) {
      notify(err.message || 'Failed to download Word document', 'error');
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  const handleSaveRoleStructureTemplate = async () => {
    if (!editingStructure.designation.trim()) {
      notify('Designation name is required for a role salary structure.', 'error');
      return;
    }
    try {
      setIsSavingStructure(true);
      const res = await api.saveSalaryStructure(editingStructure);
      if (res.structures) {
        setSalaryStructures(res.structures);
      }
      if (res.structure) {
        setEditingStructure(res.structure);
      }
      notify(`Saved role salary structure for "${editingStructure.designation}".`);
    } catch (err: any) {
      notify(err.message || 'Failed to save salary structure', 'error');
    } finally {
      setIsSavingStructure(false);
    }
  };

  // --- Computed Display Values for Preview ---
  const previewSalutationName =
    formatSalutationName(renderedOffer.candidateName, renderedOffer.salutation) ||
    renderedOffer.candidateName ||
    '[Candidate Name]';
  const previewDesignation = renderedOffer.designation?.trim() || '[Designation]';
  const previewJoiningDate =
    formatOfferJoiningDate(renderedOffer.joiningDate) || '[Joining Date]';
  const previewComponents = (renderedOffer.compensationComponents || []).filter(c => c.enabled);
  const previewEarnings = previewComponents.filter(c => c.category !== 'DEDUCTION');
  const previewDeductions = previewComponents.filter(c => c.category === 'DEDUCTION');
  const previewCompSummary = summarizeCompensationComponents(
    previewComponents,
    renderedOffer.market || 'Gurgaon'
  );
  const previewCtcFormatted =
    renderedOffer.ctcLpaFormatted || previewCompSummary.ctcLpaFormatted;
  const isAccepted = renderedOffer.status === 'Accepted';
  const signedDate = renderedOffer.signedAt
    ? new Date(renderedOffer.signedAt).toLocaleDateString('en-GB')
    : '';
  const probationLabel =
    renderedOffer.probationMonths && renderedOffer.probationMonths !== 6
      ? `${renderedOffer.probationMonths} months`
      : 'six (6) months';
  const noticeDaysLabel = renderedOffer.noticePeriodDays || 45;

  const dynSpan = (text: string) =>
    highlightDynamic ? (
      <span className="bg-amber-200/80 text-slate-950 px-1 rounded-xs ring-1 ring-amber-400">
        {text}
      </span>
    ) : (
      <>{text}</>
    );

  // Reusable Page Footer (Pages 2-10) & Page 1 E-Sig Box matching CopyofSampleOfferLetter.html
  const renderESignatureBoxes = () => (
    <table className="w-full border-collapse mt-2" style={{ fontFamily: 'Arial, sans-serif' }}>
      <tbody>
        <tr>
          <td style={{ width: '46%', verticalAlign: 'top', paddingRight: '6px' }}>
            <div
              style={{
                fontSize: '6pt',
                fontWeight: 700,
                color: '#1a1a1a',
                marginBottom: '2px',
                lineHeight: 1,
              }}
            >
              HR RECRUITER E-SIGNATURE
            </div>
            <div
              style={{
                border: '0.5pt dashed #8a8a8a',
                height: '18px',
                width: '100%',
              }}
            />
          </td>
          <td style={{ width: '8%' }} />
          <td style={{ width: '46%', verticalAlign: 'top' }}>
            <div
              style={{
                fontSize: '6pt',
                fontWeight: 700,
                color: '#1a1a1a',
                marginBottom: '2px',
                lineHeight: 1,
              }}
            >
              EMPLOYEE E-SIGNATURE
            </div>
            <div
              style={{
                border: '0.5pt dashed #8a8a8a',
                height: '18px',
                width: '100%',
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );

  // Helper to render modified custom text if HR edited a legal clause in the Clause Editor
  const renderSectionOrCustom = (
    sectionKey: string,
    defaultJsx: React.ReactNode
  ): React.ReactNode => {
    const custom = renderedOffer.annexureSections?.[sectionKey];
    const orig = WCR_ORIGINAL_OFFER_SECTIONS[sectionKey]?.content;
    if (!custom || !orig || custom.trim() === orig.trim()) {
      return defaultJsx;
    }
    return (
      <div className="space-y-1 text-[8.5pt] leading-[1.15] text-[#333333] text-justify">
        {custom.split('\n').map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} className="h-1" />;
          if (/^\d+\.\d+/.test(t)) {
            return (
              <div key={i} className="font-bold text-[9pt] pt-1.5 pb-0.5 text-[#333333]">
                {t}
              </div>
            );
          }
          if (t.startsWith('●')) {
            const body = t.replace(/^●\s*/, '');
            const idx = body.indexOf(':');
            return (
              <div key={i} className="pl-6 relative">
                <span className="absolute left-2">●</span>
                {idx > 0 && idx < 65 ? (
                  <>
                    <strong className="font-bold">{body.slice(0, idx)}</strong>
                    {body.slice(idx)}
                  </>
                ) : (
                  body
                )}
              </div>
            );
          }
          return <p key={i}>{t}</p>;
        })}
      </div>
    );
  };

  // Wrapper for exact 649x932 Master Template Page
  const MasterPageShell: React.FC<{
    pageNum: number;
    isFirstPage?: boolean;
    children: React.ReactNode;
  }> = ({ pageNum, isFirstPage = false, children }) => (
    <div
      className="relative bg-white shadow-xl border border-slate-300 mx-auto overflow-hidden select-text print:shadow-none print:border-0"
      style={{
        width: '649px',
        minHeight: '932px',
        fontFamily: 'Arial, sans-serif',
        color: '#333333',
      }}
    >
      <img
        src={
          isFirstPage
            ? '/assets/offer_master_template/images/image2.png'
            : '/assets/offer_master_template/images/wcr_page2_watermark.png'
        }
        alt=""
        className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none z-0"
      />
      <div
        className="relative z-10 flex flex-col justify-between"
        style={{
          minHeight: '932px',
          paddingLeft: '96px', // 72pt @ 96dpi
          paddingRight: '96px', // 72pt @ 96dpi
          paddingTop: isFirstPage ? '178px' : '84px',
          paddingBottom: isFirstPage ? '196px' : '46px',
        }}
      >
        <div className="flex-1">{children}</div>
        {!isFirstPage && (
          <div className="pt-3 mt-auto">
            {renderESignatureBoxes()}
          </div>
        )}
      </div>
      <div className="absolute top-2.5 right-3 z-20 px-2 py-0.5 rounded bg-slate-900/5 text-[9px] font-mono text-slate-400 print:hidden">
        Page {pageNum} / 10
      </div>
    </div>
  );

  const renderBullet = (boldLead: string, text: string) => (
    <li className="pl-6 relative mb-[3pt] text-[8.5pt] leading-[1.15] text-[#333333] text-justify list-none">
      <span className="absolute left-1.5 top-0">●</span>
      {boldLead && <strong className="font-bold text-[#333333]">{boldLead}</strong>}
      <span>{text}</span>
    </li>
  );

  const renderPageByNumber = (pageNum: number) => {
    switch (pageNum) {
      case 1:
        return (
          <MasterPageShell key={1} pageNum={1} isFirstPage={true}>
            <div className="text-center pb-[8px]">
              <h1
                style={{
                  fontFamily: 'Arial, sans-serif',
                  fontSize: '15pt',
                  fontWeight: 700,
                  color: '#1a1a1a',
                  lineHeight: 1.05,
                }}
              >
                Offer Letter
              </h1>
            </div>

            <div className="space-y-[6.5px] text-[8.5pt] leading-[1.12] text-[#333333] text-justify">
              <p className="font-bold text-[#333333]">
                Dear {dynSpan(previewSalutationName)},
              </p>

              <p>
                Congratulations! We are pleased to confirm that you have been selected to work for
                the position of{' '}
                <strong className="font-bold text-[#333333]">
                  {dynSpan(previewDesignation)}
                </strong>{' '}
                for <strong className="font-bold text-[#333333]">White Collar Realty</strong>.
              </p>

              <p>
                We would like you to start work on{' '}
                <strong className="font-bold text-[#333333]">
                  {dynSpan(previewJoiningDate)}
                </strong>
                . If this date is not acceptable, please contact us immediately. We are offering
                you a salary of{' '}
                <strong className="font-bold text-[#333333]">
                  {dynSpan(isViewer ? '🔒 [RESTRICTED]' : previewCtcFormatted)}
                </strong>
                .
              </p>

              <p>
                Please sign this letter to indicate your acceptance of this offer. We are confident
                you will be able to make a significant contribution to the success of the
                organization and look forward to working with you.
              </p>

              <p>
                This offer is conditional. The Company reserves the right to withdraw this offer at
                any time before your date of joining, without any liability, including where
                background verification is unsatisfactory, required documents are not submitted, or
                you do not join on the agreed start date. This offer, together with Annexure 1.0,
                forms the complete terms of your engagement.
              </p>

              <p className="pt-[6px]">Sincerely,</p>
            </div>

            {/* Page 1 Signature Block */}
            <table className="w-full border-collapse mt-1">
              <tbody>
                <tr>
                  <td style={{ width: '45%', verticalAlign: 'top' }}>
                    <img
                      src="/assets/offer_master_template/images/image1.png"
                      alt="White Collar Realty Stamp"
                      style={{ width: '92px', height: '92px' }}
                      className="object-contain mb-2"
                    />
                    <div className="text-[7.5pt] italic text-[#333333] leading-tight">
                      ___________________
                    </div>
                    <div className="text-[9pt] font-bold text-[#1a1a1a] leading-tight mt-0.5">
                      {dynSpan(renderedOffer.recruiterName || 'Nisha')}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      {renderedOffer.recruiterTitle || 'Human Resources Recruiter'}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      White Collar Realty
                    </div>
                  </td>
                  <td style={{ width: '55%', verticalAlign: 'top', paddingLeft: '72px' }}>
                    <div style={{ height: '96px' }} className="flex items-end pb-1">
                      {isAccepted && renderedOffer.candidateSignatureName && (
                        <span className="font-serif italic text-sm text-blue-900">
                          {renderedOffer.candidateSignatureName}
                        </span>
                      )}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      ______________
                    </div>
                    <div className="text-[9pt] font-bold text-[#1a1a1a] leading-tight mt-0.5">
                      {dynSpan(previewSalutationName)}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">Employee</div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      Date: {isAccepted && signedDate ? signedDate : ''}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4">{renderESignatureBoxes()}</div>
          </MasterPageShell>
        );

      case 2:
        return (
          <MasterPageShell key={2} pageNum={2}>
            <div className="text-[10pt] font-bold text-[#1a1a1a] pb-[6pt]">
              ANNEXURE 1.0 – COMPENSATION STRUCTURE
            </div>

            <table className="w-full border-collapse tabular-nums text-[8.5pt] mb-3">
              <thead>
                <tr className="bg-[#1a1a1a] text-white font-bold">
                  <th
                    className="text-left border border-[#bbbbbb] py-[3px] px-[6px]"
                    style={{ width: '44%' }}
                  >
                    Salary Components
                  </th>
                  <th
                    className="text-left border border-[#bbbbbb] py-[3px] px-[6px]"
                    style={{ width: '28%' }}
                  >
                    Monthly Segregation
                  </th>
                  <th
                    className="text-left border border-[#bbbbbb] py-[3px] px-[6px]"
                    style={{ width: '28%' }}
                  >
                    Yearly Segregation
                  </th>
                </tr>
              </thead>
              <tbody>
                {isViewer ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="border border-[#bbbbbb] py-3 px-3 text-center text-slate-500 bg-white"
                    >
                      🔒 Compensation Breakdown Restricted to HR & Finance Roles
                    </td>
                  </tr>
                ) : (
                  <>
                    {previewEarnings.map(item => (
                      <tr key={item.id} className="bg-white text-[#333333]">
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(item.label)}
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(formatTableCurrency(item.monthlyAmount, renderedOffer.market))}
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(formatTableCurrency(item.yearlyAmount, renderedOffer.market))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#e9e9e9] text-[#333333] font-bold">
                      <td className="border border-[#bbbbbb] py-[3px] px-[6px]">CTC</td>
                      <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                        {dynSpan(
                          formatTableCurrency(previewCompSummary.monthlyCtc, renderedOffer.market)
                        )}
                      </td>
                      <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                        {dynSpan(
                          formatTableCurrency(previewCompSummary.annualCtc, renderedOffer.market)
                        )}
                      </td>
                    </tr>
                    {previewDeductions.map(ded => (
                      <tr key={ded.id} className="bg-white text-[#333333]">
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(`Less: ${ded.label}`)}
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(formatTableCurrency(ded.monthlyAmount, renderedOffer.market))}
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(formatTableCurrency(ded.yearlyAmount, renderedOffer.market))}
                        </td>
                      </tr>
                    ))}
                    {previewDeductions.length > 0 && (
                      <tr className="bg-[#e9e9e9] text-[#333333] font-bold">
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          Net Take-Home Pay (Approx.)
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(
                            formatTableCurrency(
                              previewCompSummary.netPayMonthly,
                              renderedOffer.market
                            )
                          )}
                        </td>
                        <td className="border border-[#bbbbbb] py-[3px] px-[6px]">
                          {dynSpan(
                            formatTableCurrency(
                              previewCompSummary.netPayYearly,
                              renderedOffer.market
                            )
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              1. Performance Based Variable Pay (PBVP)
            </h2>
            {renderSectionOrCustom(
              'section_1',
              <>
                <p className="text-[8.5pt] leading-[1.15] text-[#333333] text-justify pb-[3pt]">
                  PBVP is a performance-linked variable component of your CTC and is not a fixed
                  monthly entitlement.
                </p>
                <ul className="m-0 p-0">
                  {renderBullet(
                    'Eligibility',
                    ': Becomes payable only if monthly revenue of AED 50,000 is earned.'
                  )}
                  {renderBullet(
                    'Exclusions',
                    ': Cancelled bookings, refunded bookings, fraudulent transactions, transactions violating Company policy, or bookings later found to be ineligible do not qualify.'
                  )}
                  {renderBullet(
                    'Verification & Discretion',
                    ': PBVP shall be processed only after internal verification. The Company reserves the right to withhold, adjust, recover, or reverse PBVP in the event of cancellation, fraud, customer refund, policy violation, or duplicate claims. It does not create any permanent entitlement, and the Company’s decision shall be final and binding.'
                  )}
                </ul>
              </>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              2. Retention Bonus
            </h2>
            {renderSectionOrCustom(
              'section_2',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Eligibility',
                  ': Payable only after completion of one year of service, on yearly revenue of AED 5,00,000'
                )}
                {renderBullet(
                  'Exceptions & Notice Period',
                  ': Employees who resign, abandon employment, or are terminated before completing one year will not be eligible. Employees serving a notice period beyond one year must satisfy all exit formalities and policy requirements.'
                )}
                {renderBullet(
                  'Forfeiture',
                  ': Disciplinary proceedings, fraud, misconduct, policy violation, or financial liability towards the Company may result in withholding or forfeiture. The policy may be modified or discontinued prospectively.'
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              3. Sales Incentive Policy
            </h2>
            <p className="text-[8.5pt] leading-[1.15] text-[#333333] text-justify pb-[3pt]">
              The Employee shall become eligible for any Sales Incentive, Performance Bonus,
              Commission, or any other performance-linked payout only after the Company has
              successfully received its brokerage/commission from the respective transaction.
              Accordingly, no incentive, commission, or performance-linked payment shall be payable
              under, including but not limited to, the following circumstances:
            </p>
            <ul className="m-0 p-0">
              {renderBullet(
                '',
                'The customer cancels, terminates, withdraws, or fails to proceed with the booking/transaction for any reason whatsoever.'
              )}
              {renderBullet(
                '',
                'The customer defaults, delays, or fails to make the payment(s) required under the payment plan or as demanded by the developer.'
              )}
              {renderBullet(
                '',
                'The transaction is put on hold, remains incomplete, or is not successfully concluded.'
              )}
            </ul>
          </MasterPageShell>
        );

      case 3:
        return (
          <MasterPageShell key={3} pageNum={3}>
            <ul className="m-0 p-0">
              {renderBullet(
                '',
                'The Company has not received its brokerage, commission, revenue share, or any other receivable from the developer, channel partner, or any other concerned party, irrespective of the reason.'
              )}
              {renderBullet(
                '',
                'Any booking is subsequently reversed, refunded, cancelled, or declared ineligible by the developer or any competent authority.'
              )}
            </ul>
            <p className="text-[8.5pt] leading-[1.15] text-[#333333] text-justify pb-[3pt]">
              The Company’s records regarding receipt of brokerage/commission and the successful
              completion of the transaction shall be final and binding for determining the
              Employee’s eligibility for incentive payouts. No incentive shall accrue merely on the
              basis of booking generation or booking confirmation unless the Company’s
              brokerage/commission has been duly realized.
            </p>

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              4. Review, Probation & Confirmation
            </h2>
            {renderSectionOrCustom(
              'section_4',
              <ul className="m-0 p-0">
                {renderBullet(
                  '10-Day Reviewal Period',
                  ': You will be on a reviewal period for 10 days from your date of joining. Underperformance, inappropriate behavior, disciplinary issues, experience mismatch, false documents, or gross misconduct during this time may result in immediate termination without salary. Appointment letters are issued post-review.'
                )}
                {renderBullet(
                  'Probation Duration',
                  `: Initially, you will be on probation for ${probationLabel}. Evaluation covers performance, attendance, conduct, technical learning, discipline, and communication skills.`
                )}
                {renderBullet(
                  'Confirmation & Extension',
                  ': Confirmation is subject to satisfactory results and formal written approval; it is not automatic upon time completion. Probation may be extended if performance does not meet organizational standards.'
                )}
                {renderBullet(
                  'Performance Improvement Plan (PIP)',
                  ': The Company may place an underperforming employee on a PIP. Failure to complete the PIP successfully within the prescribed timeline may result in termination.'
                )}
                {renderBullet(
                  'Termination During Probation',
                  ': Notice for termination during probation is as stated under Section 9 (Termination & Summary Dismissal).'
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              5. Working Hours & Office Discipline
            </h2>
            {renderSectionOrCustom(
              'section_5',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Schedule',
                  ': Standard working hours are 10:00 AM to 7:00 PM, Tuesday to Sunday (6 days a week), inclusive of a 30-minute lunch break, a 15-minute morning break, and a 15-minute evening break.'
                )}
                {renderBullet(
                  'Weekly Off',
                  ": The designated weekly off is Monday. If a client meeting, site visit, or transaction-related work falls on the weekly off, the employee shall attend as per the client's availability, at the office or on-site. Such attendance does not carry overtime. Compensatory off, if any, is at the reporting manager's discretion."
                )}
                {renderBullet(
                  'Flexibility & Overtime',
                  ': Schedules may require working early, late, or occasionally on week-offs/holidays depending on business requirements. No overtime payment will be provided.'
                )}
                {renderBullet(
                  'Dress Code / Formal Wear Policy',
                  ': Formal business attire is mandatory during office hours.'
                )}
                {renderBullet(
                  'Code of Conduct',
                  ": Employees must maintain professional behavior, workplace ethics, business etiquette, and respect for colleagues/clients. Employees shall follow instructions from reporting managers and refrain from office politics, rumor spreading, disruptive behavior, discrimination, harassment, unauthorized photography/videography, or damaging the Company's reputation."
                )}
              </ul>
            )}
          </MasterPageShell>
        );

      case 4:
        return (
          <MasterPageShell key={4} pageNum={4}>
            <h2 className="text-[10pt] font-bold text-[#333333] pb-[3pt]">
              6. Late Entry & Early Leaving Policy
            </h2>
            {renderSectionOrCustom(
              'section_6',
              <ul className="m-0 p-0">
                {renderBullet('Standard Reporting Time', ': Strictly 10:00 AM.')}
                {renderBullet(
                  'Late Penalty',
                  ': Arrival after 10:15 AM results in a half-day leave deduction. There is no flexibility beyond 10:15 AM.'
                )}
                {renderBullet(
                  'Exceptions',
                  ': A maximum of three (3) monthly exceptions for late entry/early exit are permitted, subject to department head approval.'
                )}
                {renderBullet(
                  'Procedure',
                  ': Any late arrival requires written permission from the manager and an update in the designated group stating the reason and estimated time of arrival (ETA).'
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              7. Leave Policy
            </h2>
            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.1. Casual Leave (CL)
            </h3>
            <ul className="m-0 p-0">
              {renderBullet(
                'Entitlement',
                ': 12 CLs per year (1 paid leave per month) awarded only after probation completion. This is inclusive of all casual and medical leaves.'
              )}
            </ul>

            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.2. Carry Forward Leaves (CFL)
            </h3>
            <ul className="m-0 p-0">
              {renderBullet(
                'Carry Forward',
                ': Unused CL can be carried forward up to the end of that financial year. Leave encashment is available after the financial year completes. Taking CFL requires written approval from the manager 2 days prior.'
              )}
            </ul>

            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.3. Probation Paid Leave
            </h3>
            <ul className="m-0 p-0">
              {renderBullet('', 'No paid leaves are granted during probation.')}
            </ul>

            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.4. Emergency Leave
            </h3>
            <ul className="m-0 p-0">
              {renderBullet(
                '',
                'Must be informed and acknowledged before 10:00 AM on the same working day via call/official message to the Reporting Manager and HR.'
              )}
              {renderBullet(
                '',
                'Intimation after office hours begin or absence without confirmation will be treated as unapproved leave. A written email with reason and proof must be submitted on the next working day.'
              )}
            </ul>

            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.5. Sick Leave
            </h3>
            <ul className="m-0 p-0">
              {renderBullet(
                'Sick Leave',
                ' is availed from the Casual Leave entitlement under 7.1 (no separate sick-leave quota). Sick leave exceeding 2 days requires submission of medical records for approval.'
              )}
            </ul>

            <h3 className="text-[9pt] font-bold text-[#333333] pt-[5pt] pb-[2pt]">
              7.6. Unplanned Leave & Sandwich Policy
            </h3>
            <ul className="m-0 p-0">
              {renderBullet(
                'Sandwich Policy',
                ": Unplanned leave taken immediately before and/or after a weekly off (Monday)/holiday shall cause the weekly off/holiday to be counted as unpaid leave (2 days' deduction). Leave must be pre-approved via email at least 10 days in advance."
              )}
              {renderBullet(
                'Extended Absence',
                ': Absences exceeding 5 days void paid week-off salary.'
              )}
              {renderBullet(
                'Restricted Period',
                ': No leave is allowed for 3 days immediately before and after salary release; any taken will be marked unapproved.'
              )}
              {renderBullet('Advance Notice Requirements', ':')}
            </ul>
            <ul className="m-0 pl-12 text-[8.5pt] leading-[1.15] text-[#333333] space-y-0.5">
              <li>○ 1 day leave: Apply at least 1–2 days prior.</li>
              <li>○ 2 days leave: Apply at least 4 days in advance.</li>
            </ul>
          </MasterPageShell>
        );

      case 5:
        return (
          <MasterPageShell key={5} pageNum={5}>
            <h3 className="text-[9pt] font-bold text-[#333333] pb-[2pt]">7.7. Planned Leave</h3>
            <ul className="m-0 p-0">
              {renderBullet(
                '',
                'Planned leaves (travel, marriage, exams) must be applied for at least 30 days in advance. Unapproved leaves are treated as unauthorized.'
              )}
            </ul>

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              8. Conflict of Interest, Non-Solicitation & Client Diversion
            </h2>
            {renderSectionOrCustom(
              'section_8',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Exclusive Employment & Office-Hours Discipline',
                  ': The employee shall devote full working time to the Company. Personal calls and personal WhatsApp/messaging are not permitted during office hours; any employee found engaged in personal calls or chats during office hours shall face disciplinary action. During the tenure of employment, the employee shall not freelance or take up any secondary work (paid or unpaid), and shall not book, close, route, or process any property transaction, booking, or payment outside the Company, whether directly with any developer or with any other broker or channel partner. Any such act shall be treated as a fundamental breach, and the Company may terminate employment with immediate effect, without notice, with forfeiture of all pending incentives.'
                )}
                {renderBullet(
                  'Professional Integrity & Client Relations',
                  ': Diverting Company clients, enquiries, or leads to any external party or builder, or accepting any unauthorized external commission, is a breach of professional ethics and may lead to disciplinary action up to and including termination and legal measures.'
                )}
                {renderBullet(
                  'Non-Solicitation & Enforcement (Post-Separation)',
                  ': For 12 months following separation, the former employee is strictly prohibited from contacting, soliciting, or servicing any clients, leads, or business contacts associated with White Collar Realty for personal gain or the benefit of any other entity. Any such misuse or diversion constitutes a material breach of this agreement. The Company reserves the right to seek injunctive relief and claim financial damages for any such breach.'
                )}
                {renderBullet(
                  'Client Communication Channels',
                  ': All client, investor, and lead communication (calls, WhatsApp, messages, email) shall be conducted only through the Company-provided number, email, and CRM. Use of a personal mobile number, personal WhatsApp, or personal email for client contact is prohibited. All clients, contacts, and chat histories generated through Company work are Company property and shall be handed over in full, along with the Company number, on exit.'
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              9. Termination & Summary Dismissal
            </h2>
            <ul className="m-0 p-0">
              {renderBullet(
                'Notice by the Company',
                ': Where the Company terminates employment (other than summary dismissal):'
              )}
            </ul>
            <ol className="m-0 pl-12 text-[8.5pt] leading-[1.15] text-[#333333] space-y-0.5 list-decimal pb-1">
              <li>Regular Employees: 7 days&apos; prior notice.</li>
              <li>Probationary Employees: 24 hours&apos; notice.</li>
            </ol>
            <ul className="m-0 p-0">
              {renderBullet(
                'Performance Benchmark (First 3 Months)',
                ': Failure to achieve at least one (1) sales closure within the first three (3) months of joining entitles the Company to terminate employment immediately without further obligation.'
              )}
            </ul>
          </MasterPageShell>
        );

      case 6:
        return (
          <MasterPageShell key={6} pageNum={6}>
            <ul className="m-0 p-0">
              {renderBullet(
                'Summary Dismissal (Immediate Termination Without Notice)',
                ': Accumulating three (3) written warnings may trigger termination. However, immediate termination without notice may occur for:'
              )}
            </ul>
            <ol className="m-0 pl-12 text-[8.5pt] leading-[1.15] text-[#333333] space-y-[2pt] list-decimal pb-1">
              <li>Gross misconduct, gross negligence, or fundamental breach of contract.</li>
              <li>Unlawful communication of confidential Company business or data theft.</li>
              <li>Dishonesty, moral turpitude, or financial fraud/misconduct.</li>
              <li>Falsification or concealment of resume details or background documents.</li>
              <li>Physical or mental medical unfitness.</li>
              <li>
                Absconding or unauthorized absence as defined under Section 10 (Unannounced Absence
                Policy).
              </li>
              <li>
                Engaging in unauthorized side employment/business, freelancing, or routing any
                property transaction outside the Company (directly with a developer, broker, or
                channel partner).
              </li>
              <li>
                Unethical behavior, harassment, violence, client diversion, or damaging the
                Company&apos;s image/reputation.
              </li>
              <li>Habitual indiscipline, repeated late reporting, or failure of PIP.</li>
            </ol>

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              10. Unannounced Absence Policy
            </h2>
            {renderSectionOrCustom(
              'section_10',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Definition',
                  ': An absence of three (3) or more consecutive working days without prior approval or communication shall be treated as voluntary departure from the role. This includes failure to participate in transition responsibilities or leaving before the first salary credit during the initial training period.'
                )}
                {renderBullet(
                  'Consequences',
                  ': Such departure shall be treated as job abandonment, resulting in termination of employment and forfeiture of pending dues and incentives. No relieving documentation shall be issued. All Company property must be returned within 7 days, failing which the Company may initiate legal recovery.'
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              11. Prevention of Sexual Harassment (POSH)
            </h2>
            {renderSectionOrCustom(
              'section_11',
              <p className="text-[8.5pt] leading-[1.15] text-[#333333] text-justify">
                White Collar Realty enforces a strict zero-tolerance policy against workplace sexual
                harassment. Mandatory compliance with the Company’s POSH Policy and participation in
                POSH awareness training are required for all employees.
              </p>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              12. Document Verification & Company Property
            </h2>
            {renderSectionOrCustom(
              'section_12',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Document Verification',
                  ': Employment is subject to satisfactory background verification of identity, education, experience, address, and employment history. Submitting false information will result in immediate offer withdrawal or termination.'
                )}
                {renderBullet(
                  'Return of Property',
                  ": Upon resignation, termination, or exit clearance, the employee must return all Company assets including laptops, SIM cards, official emails, CRM access, keys, access cards, marketing materials, and physical files, in good working condition. If any Company asset is not returned, or is lost, stolen, broken, or damaged (beyond normal wear and tear) while in the employee's custody, the employee shall be liable to pay its replacement or repair cost as determined by the Company, and the Company may recover this amount from the employee's salary, incentives, or Full & Final settlement, to the extent permitted by law."
                )}
              </ul>
            )}
          </MasterPageShell>
        );

      case 7:
        return (
          <MasterPageShell key={7} pageNum={7}>
            <h2 className="text-[10pt] font-bold text-[#333333] pb-[3pt]">
              13. Exit Process, Notice Period & Full & Final (F&F) Settlement
            </h2>
            {renderSectionOrCustom(
              'section_13',
              <ul className="m-0 p-0">
                {renderBullet(
                  'Notice by the Employee',
                  `: Resigning employees must provide ${noticeDaysLabel} working days' written notice. No leaves are permitted during the notice period (granted leaves will extend the notice period by the same duration).`
                )}
                {renderBullet(
                  'Early Release & Buyout',
                  `: Early release is solely at the Company's discretion, subject to deducting salary equivalent to the unserved days or charging ${noticeDaysLabel} working days' salary as compensation for financial loss.`
                )}
                {renderBullet(
                  'Garden Leave',
                  ': The Company may place the employee on Garden Leave during the notice period, during which confidentiality and non-solicitation obligations remain active.'
                )}
                {renderBullet(
                  'F&F Settlement',
                  `: Full and Final settlement is processed after ${noticeDaysLabel} working days from leaving, subject to complete exit clearance, department clearance, handover completion, and full asset return. Failure to serve the notice period, absconding, or failing to return Company assets gives the Company the right to withhold F&F settlements, relieving letters, and unpaid salaries.`
                )}
              </ul>
            )}

            <h2 className="text-[10pt] font-bold text-[#333333] pt-[8pt] pb-[3pt]">
              14. Confidentiality, Client data protection and non-disclosure obligations
            </h2>
            <div className="space-y-1 text-[8.5pt] leading-[1.15] text-[#333333] text-justify">
              <p>
                As part of your role with White Collar Realty, you may be provided access to
                sensitive and confidential information relating to the Company, its clients,
                investors, prospects, employees, channel partners, developers, vendors and business
                operations. You acknowledge that such access is provided strictly for authorised
                Company work and is subject to the following obligations.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">14.1 Confidential Information</h3>
              <p>
                “Confidential Information” includes, without limitation, client and investor names,
                phone numbers, email addresses, contact details, identity information, investment
                history, properties owned or considered, budgets, transaction values, booking or
                payment information, portfolio information, investor classification, CRM records,
                lead databases, cold data, buyer data, spreadsheets, reports, dashboards, call
                notes, WhatsApp or email records, recordings, meeting notes, site-visit records,
                internal remarks, project-wise client lists, pricing intelligence, inventories,
                negotiated terms, brokerage information, business information, source data,
                analytics, formulas, scripts, system access details, credentials, internal
                procedures and any information that is marked confidential or would reasonably be
                understood to be confidential or non-public.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.2 Strict Need-to-Know Access and Internal Confidentiality
              </h3>
              <p>
                You shall access and use Confidential Information only to the minimum extent
                required for the task assigned to you. You shall not disclose, discuss, show,
                forward, copy or otherwise make Confidential Information available to any
                unauthorised person, including any colleague, intern, employee, manager, contractor
                or other person within the office unless that person is specifically authorised and
                requires the information for a legitimate assigned business purpose.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.3 No External Disclosure or Personal Use
              </h3>
              <p>
                You shall not share, disclose, transfer, sell, exploit or use Confidential
                Information for your own benefit or for the benefit of any relative, friend,
                competitor, broker, agent, employer, future employer, business, developer, channel
                partner, client or third party. You shall not independently contact, solicit,
                divert, approach, market to, transact with or attempt to monetise any Company
                client, investor, lead or prospect except where expressly instructed and authorised
                as part of your Company duties.
              </p>
            </div>
          </MasterPageShell>
        );

      case 8:
        return (
          <MasterPageShell key={8} pageNum={8}>
            <div className="space-y-1.5 text-[8.5pt] leading-[1.15] text-[#333333] text-justify">
              <h3 className="text-[9pt] font-bold">
                14.4 No Unauthorised Copying, Downloading or Storage
              </h3>
              <p>
                Unless specifically authorised in writing by the Company, you shall not copy,
                export, download, print, photograph, screenshot, screen-record, email, WhatsApp,
                AirDrop, upload, sync, back up, transfer or store Confidential Information on any
                personal phone, personal laptop, personal email account, personal cloud drive, USB
                device, messaging application, external storage, public website or any other
                unapproved system.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.5 Use of AI Tools, Analytics Platforms and Third-Party Applications
              </h3>
              <p>
                You shall not upload, paste, enter or expose identifiable client or investor data,
                CRM exports, phone numbers, email addresses, financial or investment information,
                passwords, Company datasets or proprietary information into any public or unapproved
                artificial-intelligence tool, analytics platform, code repository, file-sharing
                service or third-party application. Any Company-approved tool may be used only
                within the scope and safeguards specifically authorised by the Company.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.6 Data Minimisation, Masking and Security
              </h3>
              <p>
                Where full client identity is not required for analysis or testing, you shall use
                masked, pseudonymised or dummy values as directed by the Company. You shall comply
                with all Company access controls, password requirements, security instructions and
                data-handling procedures and shall not attempt to bypass permissions or access data
                outside your assigned scope.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.7 No Unauthorised Client or Investor Contact
              </h3>
              <p>
                Client or investor contact details obtained through Company work shall not be used
                for personal calls, messages, social-media contact, referrals, introductions,
                independent sales, future business or any other purpose not expressly authorised by
                the Company.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.8 Immediate Reporting of Data or Security Incidents
              </h3>
              <p>
                You must immediately report to the Company any suspected or actual loss,
                unauthorised access, accidental disclosure, misdirected message or email, stolen or
                lost device, compromised password, unauthorised download or export, phishing
                incident or any other event that may affect Confidential Information. You shall
                preserve relevant evidence and fully cooperate with the Company in investigation,
                containment, remediation and any legal or compliance action.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.9 Return, Deletion and Cessation of Access
              </h3>
              <p>
                Upon completion of an assigned task, suspension, resignation, termination, expiry of
                employment, or whenever requested by the Company, you shall immediately cease access
                to Company systems, return all Company property and records, and permanently delete
                any Company data stored in any authorised temporary location. You shall not retain
                any copy, extract, summary, photograph, screenshot, client contact, report, dataset,
                derivative data, model or reconstruction of Company information and shall provide
                written confirmation of deletion or return if required.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.10 Continuing Obligation After Exit
              </h3>
              <p>
                These confidentiality and data-protection obligations shall continue during your
                employment and shall survive resignation, termination, completion or expiry of your
                engagement. You shall continue to protect client and investor information,
                credentials, trade secrets and other non-public Company information for so long as
                such information remains confidential, proprietary or legally protected.
              </p>
            </div>
          </MasterPageShell>
        );

      case 9: {
        const desigWithMeta = [
          renderedOffer.designation?.trim(),
          renderedOffer.department?.trim(),
          renderedOffer.employmentType?.trim(),
        ]
          .filter(Boolean)
          .join(' · ');
        const blank = '____________________________________________';

        return (
          <MasterPageShell key={9} pageNum={9}>
            <div className="space-y-1.5 text-[8.5pt] leading-[1.15] text-[#333333] text-justify">
              <h3 className="text-[9pt] font-bold">
                14.11 Ownership of Data and Work Product
              </h3>
              <p>
                All Company-provided data and all datasets, cleaned or merged files, analyses,
                dashboards, reports, findings, data dictionaries, scripts, queries, transformations,
                documentation and other work product created by you in the course of Company work
                shall belong to the Company to the extent permitted by applicable law and the terms
                of your engagement. You shall have no right to retain, reuse, publish, disclose,
                sell or commercially exploit such material.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.12 Breach, Disciplinary Action and Legal Remedies
              </h3>
              <p>
                Any actual or suspected breach of these obligations may result in immediate
                restriction or suspension of access, disciplinary action, termination of employment,
                preservation of digital evidence, internal investigation and legal action as
                permitted by applicable law. The Company may seek appropriate civil, contractual,
                statutory and equitable remedies, including injunctions or other preventive relief,
                recovery of legally recoverable losses or damages and any other remedy available
                under law.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">14.13 Indemnity</h3>
              <p>
                To the extent permitted by applicable law, you shall be responsible for and shall
                indemnify the Company against direct losses, liabilities, claims, costs and expenses
                actually arising from your wilful misconduct, fraud, unauthorised disclosure,
                unauthorised use, deliberate data misuse or material breach of these obligations,
                subject to determination under applicable law.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">14.14 Lawful Disclosures</h3>
              <p>
                Nothing in these obligations prevents a disclosure expressly required by applicable
                law, a binding order of a competent court or lawful authority, or a protected
                disclosure that cannot legally be restricted. Where legally permitted, you shall
                promptly inform the Company before such disclosure and shall disclose only the
                minimum information legally required.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">14.15 Future Employment</h3>
              <p>
                Nothing in these clauses is intended to prohibit you from pursuing lawful future
                employment, profession, trade or business. However, no future employment or
                engagement gives you any right to use, retain, disclose or exploit White Collar
                Realty’s Confidential Information, client or investor information, proprietary data
                or trade secrets.
              </p>

              <h3 className="text-[9pt] font-bold pt-1">
                14.16 Applicable Law and Jurisdiction
              </h3>
              <p>
                You shall comply with applicable Indian data-protection, privacy,
                information-technology, cybersecurity and contractual requirements, together with
                Company policies and instructions. These obligations shall be governed by the laws
                of India and, subject to any dispute-resolution provision elsewhere in your offer
                letter or employment/internship terms, courts having competent jurisdiction at
                Gurugram, Haryana shall have jurisdiction.
              </p>

              <h3 className="text-[9pt] font-bold pt-2">ACKNOWLEDGEMENT AND ACCEPTANCE</h3>
              <p className="pb-2">
                I confirm that I have read and understood the above Confidentiality, Client Data
                Protection and Non-Disclosure Obligations. I understand the sensitivity of the
                client, investor and Company information that may be made available to me and agree
                to comply fully with these obligations during and after my employment. I understand
                that access to Company and client data is conditional upon my continuing compliance
                with these obligations.
              </p>

              <table className="w-full border-collapse text-[8.5pt]">
                <tbody>
                  {[
                    [
                      'Employee Name',
                      renderedOffer.candidateName?.trim()
                        ? dynSpan(previewSalutationName)
                        : blank,
                    ],
                    ['Designation', desigWithMeta ? dynSpan(desigWithMeta) : blank],
                    [
                      'Signature',
                      isAccepted && renderedOffer.candidateSignatureName
                        ? renderedOffer.candidateSignatureName
                        : blank,
                    ],
                    ['Date', isAccepted && signedDate ? signedDate : blank],
                    [
                      'Place',
                      (() => {
                        const wl = (renderedOffer.workLocation || '').trim();
                        const pl = (renderedOffer.place || '').trim();
                        const resolved = wl
                          ? pl && !wl.toLowerCase().includes(pl.split(',')[0].trim().toLowerCase())
                            ? `${wl} (${pl})`
                            : wl
                          : pl;
                        return resolved ? dynSpan(resolved) : blank;
                      })(),
                    ],
                  ].map(([lbl, val], idx) => (
                    <tr key={idx} style={{ height: '28px' }}>
                      <td
                        className="border border-[#bfbfbf] px-2 py-1 font-bold text-[#333333]"
                        style={{ width: '34.3%' }}
                      >
                        {lbl}
                      </td>
                      <td
                        className="border border-[#bfbfbf] px-2 py-1 text-[#333333] truncate"
                        style={{ width: '65.7%' }}
                      >
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterPageShell>
        );
      }

      case 10:
      default:
        return (
          <MasterPageShell key={10} pageNum={10}>
            <h2 className="text-[10pt] font-bold text-[#1a1a1a] pb-[4pt]">
              15. Acceptance & Signatures
            </h2>
            <p className="text-[8.5pt] leading-[1.15] text-[#333333] text-justify pb-5">
              By signing below, the employee confirms that he has read, understood, and accepted all
              the terms and conditions of this offer letter.
            </p>

            <table className="w-full border-collapse mt-2">
              <tbody>
                <tr>
                  <td style={{ width: '68%', verticalAlign: 'top' }}>
                    <img
                      src="/assets/offer_master_template/images/image1.png"
                      alt="White Collar Realty Stamp"
                      style={{ width: '81px', height: '81px' }}
                      className="object-contain mb-3"
                    />
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      ________________
                    </div>
                    <div className="text-[9pt] font-bold text-[#1a1a1a] leading-tight mt-0.5">
                      {dynSpan(renderedOffer.recruiterName || 'Nisha')}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      {renderedOffer.recruiterTitle || 'Human Resources Recruiter'}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      White Collar Realty
                    </div>
                  </td>
                  <td style={{ width: '32%', verticalAlign: 'top' }}>
                    <div style={{ height: '85px' }} className="flex items-end pb-1">
                      {isAccepted && renderedOffer.candidateSignatureName && (
                        <span className="font-serif italic text-sm text-blue-900">
                          {renderedOffer.candidateSignatureName}
                        </span>
                      )}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      ____ &nbsp;&nbsp; __________
                    </div>
                    <div className="text-[9pt] font-bold text-[#1a1a1a] leading-tight mt-0.5">
                      {dynSpan(previewSalutationName)}
                    </div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">Employee</div>
                    <div className="text-[7.5pt] text-[#333333] leading-tight">
                      Date: {isAccepted && signedDate ? signedDate : ''}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </MasterPageShell>
        );
    }
  };

  // --- Candidate & Salary Editor Panel ---
  const draftSummary = summarizeCompensationComponents(
    draftData.compensationComponents || [],
    draftData.market || 'Gurgaon'
  );
  const draftEarnings = (draftData.compensationComponents || []).filter(
    c => c.category !== 'DEDUCTION'
  );
  const draftDeductions = (draftData.compensationComponents || []).filter(
    c => c.category === 'DEDUCTION'
  );

  const renderEditorForm = () => (
    <div className="space-y-5">
      {/* Missing Required Fields Banner */}
      {draftData.missingFields && draftData.missingFields.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">
              Incomplete Candidate Data ({draftData.missingFields.length} required):
            </span>
            <span className="text-amber-800">{draftData.missingFields.join(' · ')}</span>
          </div>
        </div>
      )}

      {/* Section A: Candidate Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              1. Candidate & Appointment Details
            </h3>
            <p className="text-[11px] text-slate-500">
              Populated from HR record — edit fields below before regenerating preview.
            </p>
          </div>
          {onSelectCandidate && selectablePeople.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500">Record:</span>
              <select
                value={candidate.id}
                onChange={e => {
                  const found = selectablePeople.find(p => p.id === e.target.value);
                  if (found) onSelectCandidate(found);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-800 max-w-[210px]"
              >
                {selectablePeople.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} ({person.isCandidate ? 'Candidate' : person.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          <div className="sm:col-span-3">
            <label className="block font-medium text-slate-600 mb-1">Salutation</label>
            <select
              disabled={isViewer}
              value={draftData.salutation ?? ''}
              onChange={e => updateDraft(prev => ({ ...prev, salutation: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="Mr.">Mr.</option>
              <option value="Ms.">Ms.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="Dr.">Dr.</option>
              <option value="">None</option>
            </select>
          </div>

          <div className="sm:col-span-9">
            <label className="block font-medium text-slate-600 mb-1">Candidate Full Name *</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.candidateName}
              onChange={e => updateDraft(prev => ({ ...prev, candidateName: e.target.value }))}
              placeholder="Enter candidate full name"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-medium"
            />
          </div>

          <div className="sm:col-span-7">
            <label className="block font-medium text-slate-600 mb-1">
              Designation / Role Title *
            </label>
            <input
              type="text"
              list="wcr-role-designations"
              disabled={isViewer}
              value={draftData.designation}
              onChange={e => handleDesignationChange(e.target.value)}
              placeholder="Select or type designation"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-medium"
            />
            <datalist id="wcr-role-designations">
              {salaryStructures.map(s => (
                <option key={s.id} value={s.designation} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-5">
            <label className="block font-medium text-slate-600 mb-1">Department *</label>
            <input
              type="text"
              list="wcr-departments-list"
              disabled={isViewer}
              value={draftData.department}
              onChange={e => updateDraft(prev => ({ ...prev, department: e.target.value }))}
              placeholder="Department"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
            <datalist id="wcr-departments-list">
              {DEPARTMENTS.map(d => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Joining Date (Picker)</label>
            <input
              type="date"
              disabled={isViewer}
              value={joiningIsoInput}
              onChange={e => {
                const iso = e.target.value;
                setJoiningIsoInput(iso);
                const formatted = formatOfferJoiningDate(iso);
                updateDraft(prev => ({ ...prev, joiningDate: formatted }));
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">
              Joining Date on Letter *
            </label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.joiningDate}
              onChange={e => updateDraft(prev => ({ ...prev, joiningDate: e.target.value }))}
              placeholder="e.g. 1st September 2026"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-medium"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Employment Type *</label>
            <select
              disabled={isViewer}
              value={draftData.employmentType || 'Full-Time'}
              onChange={e => updateDraft(prev => ({ ...prev, employmentType: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {EMPLOYMENT_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Market / Currency</label>
            <select
              disabled={isViewer}
              value={draftData.market}
              onChange={e => {
                const mkt = e.target.value as MarketType;
                syncComponentsIntoDraft(draftData.compensationComponents || [], mkt);
                updateDraft(prev => ({
                  ...prev,
                  market: mkt,
                  place: mkt === 'Dubai' ? 'Dubai, UAE' : 'Gurugram, Haryana',
                }));
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="Gurgaon">Gurgaon (INR)</option>
              <option value="Dubai">Dubai (AED)</option>
              <option value="Dual Market">Dual Market (INR)</option>
            </select>
          </div>

          <div className="sm:col-span-8">
            <label className="block font-medium text-slate-600 mb-1">Work Location *</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.workLocation}
              onChange={e => updateDraft(prev => ({ ...prev, workLocation: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Place (Ack. Table)</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.place ?? ''}
              onChange={e => updateDraft(prev => ({ ...prev, place: e.target.value }))}
              placeholder="Gurugram, Haryana"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Candidate Email *</label>
            <input
              type="email"
              disabled={isViewer}
              value={draftData.candidateEmail}
              onChange={e => updateDraft(prev => ({ ...prev, candidateEmail: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Phone Number *</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.candidatePhone}
              onChange={e => updateDraft(prev => ({ ...prev, candidatePhone: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">Reporting Manager</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.reportingManager}
              onChange={e => updateDraft(prev => ({ ...prev, reportingManager: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">HR Signatory Name</label>
            <input
              type="text"
              disabled={isViewer}
              value={draftData.recruiterName || ''}
              onChange={e => updateDraft(prev => ({ ...prev, recruiterName: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block font-medium text-slate-600 mb-1">
              Probation / Notice Days
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                min={0}
                max={24}
                disabled={isViewer}
                value={draftData.probationMonths}
                onChange={e =>
                  updateDraft(prev => ({
                    ...prev,
                    probationMonths: Math.max(0, parseInt(e.target.value, 10) || 6),
                  }))
                }
                title="Probation Months"
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-slate-900 tabular-nums"
              />
              <input
                type="number"
                min={0}
                max={180}
                disabled={isViewer}
                value={draftData.noticePeriodDays}
                onChange={e =>
                  updateDraft(prev => ({
                    ...prev,
                    noticePeriodDays: Math.max(0, parseInt(e.target.value, 10) || 45),
                  }))
                }
                title="Notice Period Working Days"
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-slate-900 tabular-nums"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section B: Role-Based Salary Structure & Editable Components */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              2. Role-Based Compensation & Salary Components
            </h3>
            <p className="text-[11px] text-slate-500">
              Select a role salary structure or customize CTC, Basic, Allowances & Deductions.
            </p>
          </div>
          {canConfigureStructures && (
            <button
              type="button"
              onClick={() => setWorkspaceMode('structures')}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configure Role Structures
            </button>
          )}
        </div>

        {isViewer ? (
          <div className="p-6 text-center bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
            <Lock className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
            Compensation details are restricted for Department Head Viewers.
          </div>
        ) : (
          <>
            {/* Role Preset & Annual CTC Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <div className="sm:col-span-5">
                <label className="block font-semibold text-slate-700 mb-1">
                  Role Salary Structure Preset
                </label>
                <select
                  value={draftData.roleStructureId || ''}
                  onChange={e => handleSelectRoleStructure(e.target.value, true)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                >
                  {salaryStructures.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.designation} ({s.market === 'Dubai' ? `AED ${s.defaultAnnualCtc.toLocaleString()}` : `₹${(s.defaultAnnualCtc / 100000).toFixed(1)} LPA`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold text-slate-700 mb-1">
                  Annual CTC ({draftData.market === 'Dubai' ? 'AED' : 'INR'})
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ctcInputRaw}
                    onChange={e => handleApplyTotalCtc(e.target.value)}
                    placeholder="e.g. 480000 or 4.8 LPA"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">
                  Page 1 Salary Text
                </label>
                <input
                  type="text"
                  value={draftData.ctcLpaFormatted || ''}
                  onChange={e =>
                    updateDraft(prev => ({ ...prev, ctcLpaFormatted: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-semibold"
                />
              </div>
            </div>

            {/* Earnings (Basic + Allowances + Variable) Table */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Basic Pay, Allowances & Variable Components (CTC)
                </span>
                <span className="text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
                  Monthly CTC: {formatTableCurrency(draftSummary.monthlyCtc, draftData.market)} ·
                  Annual CTC: {formatTableCurrency(draftSummary.annualCtc, draftData.market)}
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs tabular-nums border-collapse">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="py-2 px-2.5 text-left w-8">On</th>
                      <th className="py-2 px-2.5 text-left">Salary Component</th>
                      <th className="py-2 px-2.5 text-right w-28">Monthly</th>
                      <th className="py-2 px-2.5 text-right w-32">Yearly</th>
                      <th className="py-2 px-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {draftEarnings.map(comp => (
                      <tr
                        key={comp.id}
                        className={comp.enabled ? 'bg-white' : 'bg-slate-50 opacity-60'}
                      >
                        <td className="py-1.5 px-2.5">
                          <input
                            type="checkbox"
                            checked={comp.enabled}
                            onChange={e => handleToggleComponent(comp.id, e.target.checked)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="py-1.5 px-2.5">
                          <input
                            type="text"
                            value={comp.label}
                            onChange={e => handleRenameComponent(comp.id, e.target.value)}
                            className="w-full px-2 py-1 border border-transparent hover:border-slate-200 focus:border-slate-400 rounded text-slate-800 font-medium bg-transparent"
                          />
                        </td>
                        <td className="py-1.5 px-2.5">
                          <input
                            type="number"
                            min={0}
                            value={comp.monthlyAmount}
                            onChange={e =>
                              handleComponentMonthlyChange(comp.id, Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono text-slate-900"
                          />
                        </td>
                        <td className="py-1.5 px-2.5">
                          <input
                            type="number"
                            min={0}
                            value={comp.yearlyAmount}
                            onChange={e =>
                              handleComponentYearlyChange(comp.id, Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono text-slate-900"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {comp.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComponent(comp.id)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold text-slate-900">
                      <td className="py-2 px-2.5" />
                      <td className="py-2 px-2.5">Total CTC</td>
                      <td className="py-2 px-2.5 text-right font-mono">
                        {formatTableCurrency(draftSummary.monthlyCtc, draftData.market)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono">
                        {formatTableCurrency(draftSummary.annualCtc, draftData.market)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deductions Table */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Applicable Deductions (Optional — Toggle On to Include on Annexure 1.0)
                </span>
                <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                  Approx. Net Monthly:{' '}
                  <strong className="text-emerald-700">
                    {formatTableCurrency(draftSummary.netPayMonthly, draftData.market)}
                  </strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs tabular-nums border-collapse">
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {draftDeductions.length === 0 ? (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-400 text-center">
                          No deduction rows configured for this market. Add a custom deduction below
                          if needed.
                        </td>
                      </tr>
                    ) : (
                      draftDeductions.map(ded => (
                        <tr
                          key={ded.id}
                          className={ded.enabled ? 'bg-rose-50/30' : 'bg-slate-50 opacity-65'}
                        >
                          <td className="py-1.5 px-2.5 w-8">
                            <input
                              type="checkbox"
                              checked={ded.enabled}
                              onChange={e => handleToggleComponent(ded.id, e.target.checked)}
                              className="rounded border-slate-300"
                            />
                          </td>
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              value={ded.label}
                              onChange={e => handleRenameComponent(ded.id, e.target.value)}
                              className="w-full px-2 py-1 border border-transparent hover:border-slate-200 rounded text-slate-800 font-medium bg-transparent"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 w-28">
                            <input
                              type="number"
                              min={0}
                              value={ded.monthlyAmount}
                              onChange={e =>
                                handleComponentMonthlyChange(ded.id, Number(e.target.value))
                              }
                              className="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono text-slate-900 bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 w-32">
                            <input
                              type="number"
                              min={0}
                              value={ded.yearlyAmount}
                              onChange={e =>
                                handleComponentYearlyChange(ded.id, Number(e.target.value))
                              }
                              className="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono text-slate-900 bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2 w-8 text-center">
                            {ded.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComponent(ded.id)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Custom Allowance / Deduction */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={newCompCategory}
                onChange={e => setNewCompCategory(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="ALLOWANCE">+ Allowance</option>
                <option value="VARIABLE">+ Variable / Bonus</option>
                <option value="DEDUCTION">- Deduction</option>
              </select>
              <input
                type="text"
                value={newCompLabel}
                onChange={e => setNewCompLabel(e.target.value)}
                placeholder="Component name (e.g. Relocation Allowance)"
                className="flex-1 min-w-[160px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                min={0}
                value={newCompMonthly}
                onChange={e => setNewCompMonthly(e.target.value)}
                placeholder="Monthly ₹/AED"
                className="w-28 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono tabular-nums"
              />
              <button
                type="button"
                onClick={handleAddCustomComponent}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // --- Role Salary Structures Configuration View ---
  const renderStructuresManager = () => (
    <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Configurable Role-Based Salary Structures
          </h3>
          <p className="text-xs text-slate-500">
            Define default CTC and percentage/fixed component rules per designation. Saved
            structures automatically populate offers for matching roles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setEditingStructure({
                id: '',
                designation: '',
                department: 'Sales & Investments',
                employmentType: 'Full-Time',
                market: 'Gurgaon',
                defaultAnnualCtc: 600000,
                rules: JSON.parse(JSON.stringify(DEFAULT_ROLE_SALARY_STRUCTURES[0].rules)),
              })
            }
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            New Role Structure
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('split')}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg"
          >
            Back to Offer Workspace
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {salaryStructures.map(struct => {
            const active = editingStructure.id === struct.id;
            return (
              <button
                key={struct.id}
                type="button"
                onClick={() => setEditingStructure(JSON.parse(JSON.stringify(struct)))}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-semibold truncate">{struct.designation}</div>
                <div
                  className={`text-[11px] mt-0.5 flex items-center justify-between tabular-nums ${
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  <span>
                    {struct.department} · {struct.employmentType}
                  </span>
                  <span className="font-mono font-semibold">
                    {struct.market === 'Dubai'
                      ? `AED ${struct.defaultAnnualCtc.toLocaleString()}`
                      : `₹${(struct.defaultAnnualCtc / 100000).toFixed(1)}L`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-8 space-y-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
              <input
                type="text"
                value={editingStructure.designation}
                onChange={e =>
                  setEditingStructure(prev => ({ ...prev, designation: e.target.value }))
                }
                placeholder="e.g. Senior Sales Manager"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={editingStructure.department}
                onChange={e =>
                  setEditingStructure(prev => ({ ...prev, department: e.target.value }))
                }
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Employment Type</label>
              <select
                value={editingStructure.employmentType}
                onChange={e =>
                  setEditingStructure(prev => ({ ...prev, employmentType: e.target.value }))
                }
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
              >
                {EMPLOYMENT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Annual CTC ({editingStructure.market === 'Dubai' ? 'AED' : 'INR'})
              </label>
              <input
                type="number"
                min={0}
                value={editingStructure.defaultAnnualCtc}
                onChange={e =>
                  setEditingStructure(prev => ({
                    ...prev,
                    defaultAnnualCtc: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-xs tabular-nums border-collapse">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="py-2 px-2.5 text-left w-10">On</th>
                  <th className="py-2 px-2.5 text-left">Component Label</th>
                  <th className="py-2 px-2.5 text-left">Category</th>
                  <th className="py-2 px-2.5 text-left">Formula</th>
                  <th className="py-2 px-2.5 text-right w-24">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {editingStructure.rules.map((rule, rIdx) => (
                  <tr key={`${rule.code}-${rIdx}`}>
                    <td className="py-1.5 px-2.5">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={e => {
                          const nextRules = [...editingStructure.rules];
                          nextRules[rIdx] = { ...rule, enabled: e.target.checked };
                          setEditingStructure(prev => ({ ...prev, rules: nextRules }));
                        }}
                      />
                    </td>
                    <td className="py-1.5 px-2.5">
                      <input
                        type="text"
                        value={rule.label}
                        onChange={e => {
                          const nextRules = [...editingStructure.rules];
                          nextRules[rIdx] = { ...rule, label: e.target.value };
                          setEditingStructure(prev => ({ ...prev, rules: nextRules }));
                        }}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-600">{rule.category}</td>
                    <td className="py-1.5 px-2.5">
                      <select
                        value={rule.calcType}
                        onChange={e => {
                          const nextRules = [...editingStructure.rules];
                          nextRules[rIdx] = {
                            ...rule,
                            calcType: e.target.value as RoleSalaryStructureRule['calcType'],
                          };
                          setEditingStructure(prev => ({ ...prev, rules: nextRules }));
                        }}
                        className="px-2 py-1 border border-slate-200 rounded bg-white"
                      >
                        <option value="PERCENT_OF_CTC">% of CTC</option>
                        <option value="PERCENT_OF_BASIC">% of Basic</option>
                        <option value="FIXED_MONTHLY">Fixed Monthly</option>
                        <option value="REMAINDER_OF_CTC">Remainder of CTC</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-2.5">
                      <input
                        type="number"
                        step="0.5"
                        value={rule.value}
                        disabled={rule.calcType === 'REMAINDER_OF_CTC'}
                        onChange={e => {
                          const nextRules = [...editingStructure.rules];
                          nextRules[rIdx] = { ...rule, value: Number(e.target.value) || 0 };
                          setEditingStructure(prev => ({ ...prev, rules: nextRules }));
                        }}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-right font-mono disabled:opacity-40"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                if (editingStructure.id) {
                  handleSelectRoleStructure(editingStructure.id, true);
                  setWorkspaceMode('split');
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Apply Structure to Current Candidate
            </button>

            <button
              type="button"
              disabled={isSavingStructure}
              onClick={handleSaveRoleStructureTemplate}
              className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              {isSavingStructure ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Role Structure
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-slate-100 w-full max-w-[1440px] h-[95vh] rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
        {/* Top Executive Action Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate">
                  {canEditOffer ? 'Offer Letter Generator' : 'Offer Letter Preview'} — {renderedOffer.candidateName || candidate.fullName}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    renderedOffer.status === 'Accepted'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : renderedOffer.status === 'Approved' || renderedOffer.status === 'Issued'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {renderedOffer.status}
                </span>
                {!canEditOffer && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    {userRole} Read-Only
                  </span>
                )}
                {canEditOffer && hasUnregeneratedEdits && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-400 text-slate-950">
                    Edits Pending Preview
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate tabular-nums">
                Master Template (10 Pages) · Ref: {renderedOffer.refNo} · {previewCtcFormatted}
              </p>
            </div>
          </div>

          {/* Primary Workflow Controls: Regenerate Preview -> Save -> Approve -> Download .docx */}
          <div className="flex flex-wrap items-center gap-2">
            {canEditOffer && (
              <>
                <button
                  type="button"
                  onClick={handleRegeneratePreview}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    hasUnregeneratedEdits
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate Preview
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveToCandidate}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save to Candidate
                </button>
              </>
            )}

            {canApprove && renderedOffer.status === 'Draft' && (canEditOffer || candidate.offerLetter) && (
              <button
                type="button"
                disabled={isSubmittingWorkflow}
                onClick={async () => {
                  try {
                    setIsSubmittingWorkflow(true);
                    if (canEditOffer) {
                      await onSaveOffer(draftData);
                    }
                    await onApproveOffer();
                    notify(`Offer letter formally approved by ${userRole}.`);
                  } catch (err: any) {
                    notify(err.message || 'Approval failed', 'error');
                  } finally {
                    setIsSubmittingWorkflow(false);
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Approve
              </button>
            )}

            {canEditOffer &&
              onEmailOffer &&
              (renderedOffer.status === 'Approved' || renderedOffer.status === 'Issued') && (
                <button
                  type="button"
                  disabled={isSubmittingWorkflow}
                  onClick={async () => {
                    try {
                      setIsSubmittingWorkflow(true);
                      await onEmailOffer();
                      notify('Official offer letter dispatched to candidate.');
                    } catch (err: any) {
                      notify(err.message || 'Email dispatch failed', 'error');
                    } finally {
                      setIsSubmittingWorkflow(false);
                    }
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Dispatch Offer
                </button>
              )}

            {(canEditOffer || hasSavedOffer) && (
              <button
                type="button"
                disabled={isDownloadingDocx}
                onClick={handleDownloadWord}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {isDownloadingDocx ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {canEditOffer ? 'Generate & Save Word (.docx)' : 'Download Saved Word (.docx)'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Secondary Mode & Page Navigation Sub-Bar */}
        <div className="bg-white px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
          <div className="flex items-center gap-1">
            {[
              ...(canEditOffer
                ? [{ id: 'split', label: 'Split Workspace (Edit + Preview)', icon: Columns }]
                : []),
              { id: 'preview', label: 'Document Preview', icon: Eye },
              ...(canEditOffer
                ? [
                    { id: 'edit', label: 'Candidate & Salary Form', icon: Edit3 },
                    { id: 'clauses', label: 'Annexure Clauses', icon: Sliders },
                    ...(canConfigureStructures
                      ? [{ id: 'structures', label: 'Role Salary Structures', icon: Settings2 }]
                      : []),
                  ]
                : []),
              { id: 'compare', label: 'Master Template Check', icon: Sparkles },
            ].map(tab => {
              const Icon = tab.icon;
              const active = workspaceMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkspaceMode(tab.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {(workspaceMode === 'split' || workspaceMode === 'preview') && (
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={highlightDynamic}
                  onChange={e => setHighlightDynamic(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Highlight Dynamic Fields</span>
              </label>

              <span className="text-slate-300">|</span>

              <button
                type="button"
                onClick={() => setViewAllPages(prev => !prev)}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
              >
                {viewAllPages ? 'Single Page View' : 'Scroll All 10 Pages'}
              </button>

              {!viewAllPages && (
                <div className="flex items-center gap-1 tabular-nums">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-semibold px-1.5">Page {currentPage} / 10</span>
                  <button
                    type="button"
                    disabled={currentPage >= 10}
                    onClick={() => setCurrentPage(p => Math.min(10, p + 1))}
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>

              {canEditOffer && renderedOffer.status !== 'Accepted' && (
                <button
                  type="button"
                  onClick={() => {
                    setCandidateSigName(renderedOffer.candidateName);
                    setShowAcceptInput(prev => !prev);
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Record Acceptance
                </button>
              )}
            </div>
          )}
        </div>

        {/* Saved .docx Versions Bar on Candidate Profile */}
        {savedOfferLetters.length > 0 && (
          <div className="bg-slate-50 px-4 py-1.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 print:hidden">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="font-semibold text-slate-700 shrink-0">
                Saved .docx on Profile ({savedOfferLetters.length}):
              </span>
              {savedOfferLetters.slice(0, 4).map(file => (
                <div
                  key={file.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-2xs shrink-0"
                >
                  <span className="font-mono text-[11px] text-slate-700">
                    {new Date(file.generatedAt).toLocaleDateString('en-IN')} · {file.generatedByRole}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenderedOffer(file.offerSnapshot);
                      if (canEditOffer) {
                        setDraftData(file.offerSnapshot);
                        setHasUnregeneratedEdits(false);
                      }
                      setWorkspaceMode('preview');
                      notify(`Previewing saved offer snapshot (${file.fileName}).`);
                    }}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Preview
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      api
                        .downloadSavedOfferLetterFile(candidate.id, file.id, file.fileName)
                        .then(() => notify(`Downloaded ${file.fileName}`))
                        .catch(err => notify(err.message || 'Download failed', 'error'))
                    }
                    className="text-emerald-700 hover:underline font-semibold"
                  >
                    Download .docx
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inline Candidate Acceptance Bar */}
        {showAcceptInput && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
            <span className="font-medium text-emerald-900">
              Record Candidate E-Signature Acceptance on Offer Ref {renderedOffer.refNo}:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={candidateSigName}
                onChange={e => setCandidateSigName(e.target.value)}
                placeholder="Type full signature name"
                className="px-3 py-1 bg-white border border-emerald-300 rounded-lg text-slate-900"
              />
              <button
                type="button"
                onClick={async () => {
                  await onAcceptOffer(candidateSigName || renderedOffer.candidateName);
                  setShowAcceptInput(false);
                  notify('Candidate acceptance recorded.');
                }}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm Signed
              </button>
            </div>
          </div>
        )}

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`px-4 py-2 text-xs font-medium flex items-center justify-between shrink-0 ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toast.text}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="opacity-80 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-hidden">
          {workspaceMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
              {/* Left Column: Form & Salary Editor */}
              <div className="lg:col-span-5 h-full overflow-y-auto p-4 border-r border-slate-200 bg-slate-50">
                {renderEditorForm()}
              </div>

              {/* Right Column: Live 10-Page Master Template Preview */}
              <div className="lg:col-span-7 h-full overflow-y-auto p-4 sm:p-6 bg-slate-200/80 space-y-6">
                {viewAllPages
                  ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => renderPageByNumber(p))
                  : renderPageByNumber(currentPage)}
              </div>
            </div>
          )}

          {workspaceMode === 'preview' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6 bg-slate-200/80 space-y-6">
              {viewAllPages
                ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => renderPageByNumber(p))
                : renderPageByNumber(currentPage)}
            </div>
          )}

          {workspaceMode === 'edit' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto">
              {renderEditorForm()}
            </div>
          )}

          {workspaceMode === 'clauses' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Master Template Clauses (Sections 1–15)
                  </h3>
                  <p className="text-xs text-slate-500">
                    All static wording is preserved verbatim from the uploaded master offer letter
                    unless explicitly modified below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const resetMap: Record<string, string> = {};
                    Object.entries(WCR_ORIGINAL_OFFER_SECTIONS).forEach(([k, v]) => {
                      resetMap[k] = v.content;
                    });
                    updateDraft(prev => ({ ...prev, annexureSections: resetMap }));
                    notify('Restored all 15 sections to verbatim master template text.');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                >
                  Restore Verbatim Defaults
                </button>
              </div>

              {Object.entries(WCR_ORIGINAL_OFFER_SECTIONS).map(([key, sec]) => (
                <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{sec.title}</span>
                    <span className="text-[11px] text-slate-400">Page {sec.page}</span>
                  </div>
                  <textarea
                    rows={5}
                    value={draftData.annexureSections?.[key] ?? sec.content}
                    onChange={e =>
                      updateDraft(prev => ({
                        ...prev,
                        annexureSections: {
                          ...(prev.annexureSections || {}),
                          [key]: e.target.value,
                        },
                      }))
                    }
                    className="w-full p-2.5 text-xs font-sans border border-slate-300 rounded-lg text-slate-800 leading-relaxed"
                  />
                </div>
              ))}
            </div>
          )}

          {workspaceMode === 'structures' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6">{renderStructuresManager()}</div>
          )}

          {workspaceMode === 'compare' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="max-w-[1340px] mx-auto bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Side-by-Side Fidelity Verification: Uploaded Master Template vs Dynamic Offer
                </span>
                <div className="flex items-center gap-2 tabular-nums">
                  <button
                    type="button"
                    disabled={comparePage <= 1}
                    onClick={() => setComparePage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-bold">Page {comparePage} / 10</span>
                  <button
                    type="button"
                    disabled={comparePage >= 10}
                    onClick={() => setComparePage(p => Math.min(10, p + 1))}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="max-w-[1340px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <div className="space-y-2">
                  <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                    Master Reference (Page {comparePage})
                  </div>
                  <img
                    src={`/assets/offer_template_page_${comparePage}.png`}
                    alt={`Master Template Page ${comparePage}`}
                    className="mx-auto border border-slate-300 shadow-lg bg-white"
                    style={{ width: '649px' }}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-center text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Dynamic Generated Document (Page {comparePage})
                  </div>
                  {renderPageByNumber(comparePage)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
