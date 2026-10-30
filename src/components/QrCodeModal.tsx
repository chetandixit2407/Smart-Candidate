import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  QrCode,
  X,
  RefreshCw,
  Copy,
  Check,
  Download,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileWarning,
  FileCheck2,
  Ban,
  Share2,
  Mail,
  Sparkles,
  Globe,
  Settings,
  ExternalLink,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Employee,
  UserRole,
  ProfileDocumentInspection,
  DocumentQrStatusInfo,
} from '../types/index.js';
import { api } from '../services/api.js';

interface QrCodeModalProps {
  person: Employee;
  userRole: UserRole;
  onClose: () => void;
  onQrUpdated?: () => void;
}

// Permanent public HTTPS application endpoint (defaults to live container URL or window location)
export const PERMANENT_PUBLIC_APP_URL =
  typeof window !== 'undefined' && window.location?.origin && !isInvalidHostOrIp(window.location.hostname)
    ? window.location.origin
    : 'https://ais-dev-yjzfez2popqx6klg7wyifs-86309533096.asia-southeast1.run.app';

export const SHARED_APP_PREVIEW_URL =
  'https://ais-pre-yjzfez2popqx6klg7wyifs-86309533096.asia-southeast1.run.app';

export function isInvalidHostOrIp(hostOrUrl: string): boolean {
  if (!hostOrUrl) return true;
  const lower = hostOrUrl.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('169.254.') ||
    lower.startsWith('192.168.') ||
    lower.includes('.192.168.') ||
    lower.startsWith('10.') ||
    lower.includes('.10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower) ||
    lower.includes('.local')
  );
}

export function getPublicShareOrigin(customCandidate?: string): string {
  if (customCandidate && customCandidate.trim()) {
    try {
      const parsed = new URL(customCandidate.trim());
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !isInvalidHostOrIp(parsed.hostname)
      ) {
        return parsed.origin;
      }
    } catch {}
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (
      (origin.startsWith('https://') || origin.startsWith('http://')) &&
      !isInvalidHostOrIp(window.location.hostname)
    ) {
      return origin;
    }
  }

  return PERMANENT_PUBLIC_APP_URL;
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  person,
  userRole,
  onClose,
  onQrUpdated,
}) => {
  const canManageQr = userRole === 'HR' || userRole === 'Co-Founder';

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [includeOptionalMissing, setIncludeOptionalMissing] = useState(false);
  const [inspection, setInspection] = useState<ProfileDocumentInspection | null>(null);
  const [qrStatus, setQrStatus] = useState<DocumentQrStatusInfo | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Configurable public base URL & format
  const [customOriginInput, setCustomOriginInput] = useState('');
  const [showCustomConfig, setShowCustomConfig] = useState(false);
  const [urlFormat, setUrlFormat] = useState<'path' | 'query'>('path');

  // Domain health status
  const [domainCheck, setDomainCheck] = useState<{ checked: boolean; ok: boolean; status: number } | null>(null);

  // Client-rendered QR image data URL
  const [renderedQrDataUrl, setRenderedQrDataUrl] = useState<string | null>(null);

  const activeOrigin = useMemo(() => getPublicShareOrigin(customOriginInput), [customOriginInput]);

  // Check whether the active origin returns 200 or 404
  useEffect(() => {
    let cancel = false;
    if (!activeOrigin) return;
    setDomainCheck(null);
    fetch(`/api/system/check-domain?url=${encodeURIComponent(activeOrigin)}`)
      .then(r => r.json())
      .then(d => {
        if (!cancel) {
          setDomainCheck({ checked: true, ok: Boolean(d.ok), status: d.status || 0 });
        }
      })
      .catch(() => {
        if (!cancel) {
          setDomainCheck({ checked: true, ok: true, status: 200 });
        }
      });
    return () => {
      cancel = true;
    };
  }, [activeOrigin]);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getEmployeeDocumentQr(person.id, {
        customOrigin: activeOrigin,
      });
      setInspection(res.inspection);
      setQrStatus(res.qrStatus);
      if (res.qrStatus.expiresAt && res.qrStatus.isActive) {
        const diff = Math.max(0, new Date(res.qrStatus.expiresAt).getTime() - Date.now());
        setRemainingMs(diff);
      } else {
        setRemainingMs(0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to inspect profile documents');
    } finally {
      setLoading(false);
    }
  }, [person.id, activeOrigin]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus, person.updatedAt]);

  // Live 1-second 24-hour expiry countdown
  useEffect(() => {
    if (!qrStatus?.expiresAt || qrStatus.isRevoked) {
      setRemainingMs(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, new Date(qrStatus.expiresAt!).getTime() - Date.now());
      setRemainingMs(diff);
      if (diff === 0 && qrStatus.isActive) {
        setQrStatus(prev => (prev ? { ...prev, isActive: false, isExpired: true, remainingMs: 0 } : prev));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [qrStatus?.expiresAt, qrStatus?.isRevoked, qrStatus?.isActive]);

  // Extract raw token string
  const tokenString = useMemo(() => {
    if (qrStatus?.token) return qrStatus.token;
    if (!qrStatus?.shareUrl) return null;
    const match = qrStatus.shareUrl.match(/(?:\/qr-upload\/|\/qr\/|[?&]qr=)([a-zA-Z0-9_-]{20,80})/i);
    return match ? match[1] : null;
  }, [qrStatus?.token, qrStatus?.shareUrl]);

  // Effective share URL: Uses verified origin and chosen format
  const effectiveShareUrl = useMemo(() => {
    if (!tokenString) {
      if (!qrStatus?.shareUrl) return '';
      return qrStatus.shareUrl;
    }
    if (urlFormat === 'query') {
      return `${activeOrigin}/?qr=${tokenString}`;
    }
    return `${activeOrigin}/qr-upload/${tokenString}`;
  }, [tokenString, qrStatus?.shareUrl, activeOrigin, urlFormat]);

  // Re-generate high-contrast QR code data URL whenever the effective URL changes
  useEffect(() => {
    if (!effectiveShareUrl) {
      setRenderedQrDataUrl(qrStatus?.qrDataUrl || null);
      return;
    }

    QRCode.toDataURL(effectiveShareUrl, {
      width: 380,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then(url => setRenderedQrDataUrl(url))
      .catch(() => setRenderedQrDataUrl(qrStatus?.qrDataUrl || null));
  }, [effectiveShareUrl, qrStatus?.qrDataUrl]);

  const handleGenerateQr = async () => {
    if (!canManageQr) return;
    setGenerating(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.generateEmployeeDocumentQr(person.id, {
        includeOptionalMissing,
        customOrigin: activeOrigin,
      });
      setInspection(res.inspection);
      setQrStatus(res.qrStatus);
      if (res.qrStatus.expiresAt) {
        setRemainingMs(Math.max(0, new Date(res.qrStatus.expiresAt).getTime() - Date.now()));
      }
      setFeedback(res.message);
      if (onQrUpdated) onQrUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to generate Document QR');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeQr = async () => {
    if (!canManageQr) return;
    setRevoking(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.revokeEmployeeDocumentQr(person.id);
      setFeedback(res.message);
      await loadStatus();
      if (onQrUpdated) onQrUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke Document QR');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyLink = async () => {
    if (!effectiveShareUrl) return;
    try {
      await navigator.clipboard.writeText(effectiveShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Unable to copy link to clipboard.');
    }
  };

  const handleDownloadQrPng = () => {
    const src = renderedQrDataUrl || qrStatus?.qrDataUrl;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    const cleanName = person.fullName.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `White_Collar_Realty_Doc_QR_${cleanName}_${person.employeeCode}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isCurrentlyActive = Boolean(qrStatus?.isActive && remainingMs > 0);
  const isCurrentlyExpired = Boolean(qrStatus?.isExpired || (qrStatus?.hasToken && remainingMs === 0 && !qrStatus?.isRevoked));

  const waPhone = person.phone?.replace(/[^0-9]/g, '') || '';
  const shareMessage = effectiveShareUrl
    ? `Hello ${person.fullName},\n\nPlease upload your pending onboarding documents for White Collar Realty (${person.designation} - ${person.department}) using your secure 24-hour link:\n${effectiveShareUrl}\n\nAccepted formats: PDF, JPG, PNG. Note: This link expires automatically in 24 hours.`
    : '';

  const whatsappHref = waPhone && shareMessage
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(shareMessage)}`
    : shareMessage
    ? `https://wa.me/?text=${encodeURIComponent(shareMessage)}`
    : undefined;

  const mailtoHref = person.email && shareMessage
    ? `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(
        `Action Required: Upload Onboarding Documents (24h QR Link) - White Collar Realty`
      )}&body=${encodeURIComponent(shareMessage)}`
    : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  Individual Document QR — {person.fullName}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {person.department}
                  {person.subDepartment ? ` · ${person.subDepartment}` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Candidate-specific 256-bit opaque QR token · Exact 24-hour automatic expiry · Permanent Global Public HTTPS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Close QR Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{feedback}</span>
            </div>
          )}

          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-700" />
              <p className="text-xs font-medium">Checking profile & scanning missing documents...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Automatic Missing Document Inspection & Domain Notice */}
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Step 1 · Automatic Document Check
                    </h3>
                    <button
                      type="button"
                      onClick={loadStatus}
                      className="text-[11px] font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Recheck
                    </button>
                  </div>

                  {/* Summary Metrics */}
                  <div className="grid grid-cols-3 gap-2.5 mb-3.5">
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Missing Required</p>
                      <p className="text-lg font-bold text-rose-600 font-mono tabular-nums mt-0.5">
                        {inspection?.missingRequired.length ?? 0}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Uploaded (Review)</p>
                      <p className="text-lg font-bold text-indigo-600 font-mono tabular-nums mt-0.5">
                        {inspection?.uploadedPendingVerification.length ?? 0}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Verified</p>
                      <p className="text-lg font-bold text-emerald-600 font-mono tabular-nums mt-0.5">
                        {inspection?.verified.length ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* Missing Required Checklist */}
                  {inspection && inspection.missingRequired.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                        <FileWarning className="w-3.5 h-3.5 text-rose-600" />
                        Missing Required Documents ({inspection.missingRequired.length}) — Configured on Candidate QR:
                      </p>
                      <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {inspection.missingRequired.map(doc => (
                          <li
                            key={doc.key}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-rose-200/80 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{doc.title}</p>
                              <p className="text-[10px] text-slate-500">{doc.category}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold shrink-0">
                              {doc.status === 'Rejected' ? 'Re-upload Required' : 'Missing'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        All mandatory checklist documents have already been uploaded or verified for{' '}
                        <strong>{person.fullName}</strong>.
                      </span>
                    </div>
                  )}

                  {/* Optional Missing Toggle */}
                  {canManageQr && inspection && inspection.missingOptional.length > 0 && (
                    <label className="mt-3 pt-3 border-t border-slate-200 flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeOptionalMissing}
                        onChange={e => setIncludeOptionalMissing(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-slate-900"
                      />
                      <span className="text-xs text-slate-600">
                        Include {inspection.missingOptional.length} optional missing document(s) on QR checklist
                      </span>
                    </label>
                  )}
                </div>



                {/* Public Domain & Route Configuration */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-800 space-y-2.5">
                  <div className="font-semibold flex items-center justify-between text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                      Public Candidate Scanning Domain
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCustomConfig(!showCustomConfig)}
                      className="text-[10px] text-slate-600 hover:text-slate-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>{showCustomConfig ? 'Hide Settings' : 'Configure Domain'}</span>
                    </button>
                  </div>

                  {/* Active Domain & Live Ping Status */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Active Host</p>
                      <p className="text-[11px] font-mono font-semibold text-slate-800 truncate">{activeOrigin}</p>
                    </div>
                    {domainCheck ? (
                      domainCheck.ok ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold shrink-0 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          HTTP {domainCheck.status} OK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold shrink-0 flex items-center gap-1" title="The current host returned 404. Switch to Live URL or publish your app.">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          HTTP {domainCheck.status || 'Offline'}
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-400 animate-pulse shrink-0">Checking...</span>
                    )}
                  </div>

                  {/* URL Route Format Selector */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                    <span className="text-[11px] font-medium text-slate-600">Link URL Format:</span>
                    <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-[10px] font-medium">
                      <button
                        type="button"
                        onClick={() => setUrlFormat('path')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          urlFormat === 'path' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Path (/qr-upload/...)
                      </button>
                      <button
                        type="button"
                        onClick={() => setUrlFormat('query')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          urlFormat === 'query' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Query (/?qr=...)
                      </button>
                    </div>
                  </div>

                  {showCustomConfig && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <label className="block text-[10px] font-semibold text-slate-700">
                        Select or Enter Public Domain Preset:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomOriginInput(PERMANENT_PUBLIC_APP_URL)}
                          className={`p-1.5 rounded-lg border text-left text-[10px] transition-colors cursor-pointer ${
                            activeOrigin === PERMANENT_PUBLIC_APP_URL
                              ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="block font-bold">1. Live App Container</span>
                          <span className="text-[9px] text-slate-500 truncate block">Instant active workspace</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomOriginInput(SHARED_APP_PREVIEW_URL)}
                          className={`p-1.5 rounded-lg border text-left text-[10px] transition-colors cursor-pointer ${
                            activeOrigin === SHARED_APP_PREVIEW_URL
                              ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="block font-bold">2. Shared Public Preview</span>
                          <span className="text-[9px] text-slate-500 truncate block">Active after &quot;Share&quot; click</span>
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-500 font-medium">
                          Or custom HTTPS domain / tunnel (e.g. from APP_BASE_URL):
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={customOriginInput}
                            onChange={e => setCustomOriginInput(e.target.value)}
                            placeholder={PERMANENT_PUBLIC_APP_URL}
                            className="flex-1 px-2.5 py-1 text-xs border border-slate-300 bg-white rounded-lg text-slate-900 font-mono"
                          />
                          {customOriginInput && (
                            <button
                              type="button"
                              onClick={() => setCustomOriginInput('')}
                              className="px-2 py-1 text-[10px] rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500 font-medium">
                    <span>Security:</span>
                    <span>Opaque 256-bit token · 24h Expiry · Zero PII in URL · Real-time SSE Sync</span>
                  </div>
                </div>
              </div>

              {/* Right Column: QR Display, Countdown & Share Controls */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Step 2 · 24-Hour Shareable QR
                    </h3>
                    {isCurrentlyActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active (24h)
                      </span>
                    ) : isCurrentlyExpired ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                        Expired (24h elapsed)
                      </span>
                    ) : qrStatus?.isRevoked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-semibold">
                        Revoked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                        Not Generated
                      </span>
                    )}
                  </div>

                  {/* Active QR Code Box */}
                  {isCurrentlyActive && (renderedQrDataUrl || qrStatus?.qrDataUrl) ? (
                    <div className="flex flex-col items-center">
                      <div className="p-3 bg-white rounded-2xl border-2 border-slate-900 shadow-sm relative group">
                        <img
                          src={renderedQrDataUrl || qrStatus?.qrDataUrl}
                          alt={`Secure Document Upload QR for ${person.fullName}`}
                          className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                        />
                      </div>

                      {/* 24h Live Countdown */}
                      <div className="mt-2.5 w-full rounded-lg bg-slate-900 text-white px-3 py-2 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Expires in
                        </span>
                        <span className="font-mono font-bold text-amber-300 tabular-nums tracking-wider">
                          {formatDurationMs(remainingMs)}
                        </span>
                      </div>

                      <div className="mt-1.5 w-full flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono tabular-nums">
                        <span>Scans: {qrStatus?.openCount ?? 0}</span>
                        <span>
                          Uploaded: {qrStatus?.uploadedDocKeys?.length ?? 0}/{qrStatus?.targetDocKeys?.length ?? 0}
                        </span>
                      </div>

                      {/* Share URL Box */}
                      {effectiveShareUrl && (
                        <div className="mt-2.5 w-full space-y-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              readOnly
                              value={effectiveShareUrl}
                              className="w-full px-2.5 py-1.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCopyLink}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                              title="Copy QR Upload Link"
                            >
                              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-4 gap-1.5">
                            <button
                              type="button"
                              onClick={handleDownloadQrPng}
                              className="px-2 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              title="Download QR code image (.png)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PNG</span>
                            </button>
                            <a
                              href={effectiveShareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                              title="Open public portal page in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open</span>
                            </a>
                            {whatsappHref && (
                              <a
                                href={whatsappHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-2 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                                title="Share directly to candidate via WhatsApp"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                            {mailtoHref && (
                              <a
                                href={mailtoHref}
                                className="px-2 py-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                                title="Email upload invitation to candidate"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>Email</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isCurrentlyActive && !canManageQr ? (
                    <div className="py-8 px-4 text-center rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
                      <p className="text-xs font-semibold text-slate-800">Active 24-Hour QR Token Issued</p>
                      <p className="text-[11px] text-slate-500">
                        Expires in <span className="font-mono font-semibold text-slate-800 tabular-nums">{formatDurationMs(remainingMs)}</span>. Shareable QR links are restricted to HR and Co-Founder roles.
                      </p>
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-2.5">
                      <QrCode className="w-11 h-11 text-slate-400 mx-auto" />
                      {isCurrentlyExpired ? (
                        <>
                          <p className="text-xs font-bold text-rose-700">Previous QR Code Expired</p>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            The 24-hour upload window has closed and the expired link no longer accepts uploads. Regenerate a fresh 24-hour QR below to reshare with {person.fullName}.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-slate-800">Ready to Generate Candidate QR</p>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Generate a unique 24-hour QR code linked exclusively to {person.fullName}&apos;s missing documents on the permanent public HTTPS domain.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Footer inside Right Card */}
                {canManageQr && (
                  <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
                    <button
                      type="button"
                      onClick={handleGenerateQr}
                      disabled={generating}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      {generating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Secure 24h QR...</span>
                        </>
                      ) : isCurrentlyActive ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-amber-400" />
                          <span>Regenerate & Reshare 24h QR</span>
                        </>
                      ) : isCurrentlyExpired || qrStatus?.isRevoked ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-amber-400" />
                          <span>Regenerate Expired QR (New 24h Window)</span>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4 text-amber-400" />
                          <span>Generate Document QR (24h Expiry)</span>
                        </>
                      )}
                    </button>

                    {isCurrentlyActive && (
                      <button
                        type="button"
                        onClick={handleRevokeQr}
                        disabled={revoking}
                        className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{revoking ? 'Deactivating...' : 'Deactivate QR Immediately'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
