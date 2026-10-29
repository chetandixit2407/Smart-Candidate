import React, { useState, useMemo } from 'react';
import { History, Search, Filter, Shield, Clock } from 'lucide-react';
import { AuditLog } from '../types/index.js';

interface AuditTrailViewProps {
  logs: AuditLog[];
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

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
            <option value="Document">Document Verifications</option>
            <option value="Desk">Desk Allocations</option>
            <option value="Asset">Company Assets</option>
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
