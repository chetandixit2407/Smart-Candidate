import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Clock,
  RefreshCw,
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Play,
  Package,
} from 'lucide-react';
import {
  AuditLog,
  UserRole,
  AssetReturnReminderRecord,
  NotificationDeliveryLog,
} from '../types/index.js';
import { api } from '../services/api.js';

interface AuditTrailViewProps {
  logs: AuditLog[];
  userRole?: UserRole;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ logs, userRole = 'HR' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

  const [automationStatus, setAutomationStatus] = useState<any>(null);
  const [assetReminders, setAssetReminders] = useState<AssetReturnReminderRecord[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<NotificationDeliveryLog[]>([]);
  const [runningSweep, setRunningSweep] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

  const canTriggerSweep = userRole === 'HR' || userRole === 'Co-Founder';

  const loadAutomationTelemetry = useCallback(async () => {
    try {
      const [statusRes, remRes, delRes] = await Promise.all([
        api.getAutomationStatus(),
        api.getAssetReminders(),
        api.getDeliveryLogs(undefined, 25),
      ]);
      setAutomationStatus(statusRes);
      setAssetReminders(remRes.reminders || []);
      setDeliveryLogs(delRes.logs || []);
    } catch {
      // ignore background load error
    }
  }, []);

  useEffect(() => {
    loadAutomationTelemetry();
  }, [loadAutomationTelemetry, logs.length]);

  const handleManualSweep = async () => {
    if (!canTriggerSweep) return;
    try {
      setRunningSweep(true);
      setSweepMsg(null);
      const res = await api.runAssetReminderSweep();
      const s = res.summary;
      setSweepMsg(
        `Evaluated ${s.evaluatedPeopleCount} records (${s.referenceDate}): ${s.eligibleTwoDayMatches} exact 2-day match(es), ${s.dispatchedOrUpdated} reminder(s) processed, ${s.skippedDuplicateAlreadySent} duplicate(s) prevented, ${s.skippedNoUnreturnedAssets} skipped (no unreturned assets).`
      );
      await loadAutomationTelemetry();
    } catch (err: unknown) {
      setSweepMsg(err instanceof Error ? err.message : 'Failed to run 2-day asset return sweep.');
    } finally {
      setRunningSweep(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filterType !== 'All' && log.entityType !== filterType) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          log.actor.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.entityName.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, filterType, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Automated 2-Day Asset Return Reminders & API Delivery Logs */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                Automated 2-Day Asset Return Reminders & Real API Delivery Logs
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Cron: {automationStatus?.sweepCron || '0 * * * *'} · Retry: {automationStatus?.retryCron || '*/5 * * * *'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically dispatches Email and WhatsApp reminders exactly 2 days before internship/job end dates when issued assets remain unreturned, with duplicate prevention and exponential retry scheduling.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadAutomationTelemetry}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            {canTriggerSweep && (
              <button
                type="button"
                onClick={handleManualSweep}
                disabled={runningSweep}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 shadow-2xs disabled:opacity-50 transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-amber-400" />
                {runningSweep ? 'Running Check...' : 'Run 2-Day Check Now'}
              </button>
            )}
          </div>
        </div>

        {/* Provider Readiness Badges */}
        {automationStatus?.notificationConfig && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div
              className={`p-3 rounded-lg border flex items-center justify-between ${
                automationStatus.notificationConfig.emailConfigured
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                <div>
                  <span className="font-semibold block">Email API Gateway</span>
                  <span className="text-[11px] opacity-80">
                    Provider: {automationStatus.notificationConfig.emailProvider}
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current/20">
                {automationStatus.notificationConfig.emailConfigured ? 'CONNECTED' : 'CREDENTIALS REQUIRED'}
              </span>
            </div>

            <div
              className={`p-3 rounded-lg border flex items-center justify-between ${
                automationStatus.notificationConfig.whatsappConfigured
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div>
                  <span className="font-semibold block">WhatsApp Business API Gateway</span>
                  <span className="text-[11px] opacity-80">
                    Provider: {automationStatus.notificationConfig.whatsappProvider}
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current/20">
                {automationStatus.notificationConfig.whatsappConfigured ? 'CONNECTED' : 'CREDENTIALS REQUIRED'}
              </span>
            </div>
          </div>
        )}

        {sweepMsg && (
          <div className="p-2.5 rounded-lg bg-slate-900 text-amber-300 text-xs font-mono">
            {sweepMsg}
          </div>
        )}

        {/* Persisted 2-Day Asset Return Reminders & Delivery Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                Persisted 2-Day Asset Return Reminders ({assetReminders.length})
              </span>
            </div>
            {assetReminders.length === 0 ? (
              <p className="text-[11px] text-slate-500 py-3 text-center">
                No candidates/interns with unreturned assets have hit the exact 2-day pre-end-date window yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {assetReminders.slice(0, 10).map(rem => (
                  <div key={rem.id} className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{rem.personName}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          rem.overallStatus === 'SENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rem.overallStatus === 'CANCELLED_ASSETS_RETURNED'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rem.overallStatus}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      Deadline: {rem.endDate} · Assets: {rem.unreturnedAssets.map(a => a.assetTag).join(', ')}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Email: {rem.emailStatus} · WhatsApp: {rem.whatsappStatus}</span>
                      <span>Retries: {rem.retryCount}/{rem.maxRetries}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Recent API Delivery & Retry Logs ({deliveryLogs.length})
              </span>
            </div>
            {deliveryLogs.length === 0 ? (
              <p className="text-[11px] text-slate-500 py-3 text-center">
                No Email or WhatsApp API dispatches logged yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {deliveryLogs.slice(0, 10).map(dlog => (
                  <div key={dlog.id} className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        {dlog.status === 'SENT' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        {dlog.channel} ({dlog.provider}) · {dlog.personName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Attempt #{dlog.attemptNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 break-words">{dlog.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail by actor, action, details..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              Showing <strong className="font-mono text-slate-900">{filteredLogs.length}</strong> of{' '}
              <span className="font-mono">{logs.length}</span> audit events
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
            <Filter className="w-3 h-3" /> Event Type:
          </span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 text-xs"
          >
            <option value="All">All Entity Types</option>
            <option value="Employee">Employee Profiles</option>
            <option value="Candidate">Candidate Onboarding</option>
            <option value="OfferLetter">Offer Letters (.docx)</option>
            <option value="Document">Document Verifications</option>
            <option value="Desk">Desk Allocations</option>
            <option value="Asset">Company Assets</option>
            <option value="Automation">Scheduled Automation</option>
            <option value="Lifecycle">Lifecycle & Clearances</option>
            <option value="Import">Spreadsheet Imports</option>
          </select>
        </div>
      </div>

      {/* Audit Log Content: Mobile Cards + Desktop Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Mobile View: Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredLogs.map(log => (
            <div key={log.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                  {log.action}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {new Date(log.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Target Entity</span>
                  <span className="font-medium text-slate-900">{log.entityName}</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-1">({log.entityType})</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] block">Performed By</span>
                  <span className="font-medium text-slate-800">{log.actor}</span>
                  <span className="text-[10px] text-slate-400 font-mono block">{log.actorRole}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600 leading-relaxed break-words">
                {log.details}
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              No matching audit records.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">Actor & Role</th>
                <th className="px-4 py-3">Change Description & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                      {log.action}
                    </span>
                  </td>

                  <td className="px-4 py-3 min-w-[140px] whitespace-nowrap">
                    <span className="font-medium text-slate-800">{log.entityName}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">({log.entityType})</span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-slate-800">{log.actor}</p>
                    <p className="text-[10px] font-mono text-slate-400">{log.actorRole}</p>
                  </td>

                  <td className="px-4 py-3 text-slate-600 leading-relaxed min-w-[260px]">
                    {log.details}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-slate-400">
                    No matching audit records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
