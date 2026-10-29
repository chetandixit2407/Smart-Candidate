import React, { useState, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  RotateCcw,
  History,
  Laptop,
  CreditCard,
  Smartphone,
  Zap,
  Car,
  AlertCircle,
} from 'lucide-react';
import { CompanyAsset, Employee, UserRole, AssetCategory, AssetCondition } from '../types/index.js';

interface AssetsViewProps {
  assets: CompanyAsset[];
  employees: Employee[];
  onCreateAsset: (asset: Partial<CompanyAsset>) => Promise<void>;
  onIssueAsset: (assetId: string, employeeId: string, issueDate: string, notes: string) => Promise<void>;
  onReturnAsset: (assetId: string, returnDate: string, condition: AssetCondition, notes: string) => Promise<void>;
  onTransferAsset: (assetId: string, newEmployeeId: string, notes: string) => Promise<void>;
  userRole: UserRole;
}

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  employees,
  onCreateAsset,
  onIssueAsset,
  onReturnAsset,
  onTransferAsset,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [issueModalAsset, setIssueModalAsset] = useState<CompanyAsset | null>(null);
  const [returnModalAsset, setReturnModalAsset] = useState<CompanyAsset | null>(null);
  const [transferModalAsset, setTransferModalAsset] = useState<CompanyAsset | null>(null);
  const [historyModalAsset, setHistoryModalAsset] = useState<CompanyAsset | null>(null);

  // Form states
  const [newAssetData, setNewAssetData] = useState<Partial<CompanyAsset>>({
    type: 'Laptop',
    condition: 'Brand New',
    status: 'Available',
  });
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [returnCondition, setReturnCondition] = useState<AssetCondition>('Good');
  const [returnNotes, setReturnNotes] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isViewer = userRole === 'DEPT_HEAD_VIEWER';

  const categories: AssetCategory[] = [
    'Access Card',
    'Charger',
    'SIM Card',
    'Parking Card',
    'Laptop',
    'Phone / Tablet',
    'Display Monitor',
    'Other',
  ];

  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (categoryFilter !== 'All' && a.type !== categoryFilter) return false;
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match =
          a.assetTag.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.serialNumber && a.serialNumber.toLowerCase().includes(q)) ||
          (a.assignedEmployeeName && a.assignedEmployeeName.toLowerCase().includes(q)) ||
          (a.assignedEmployeeCode && a.assignedEmployeeCode.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [assets, categoryFilter, statusFilter, searchTerm]);

  const handleCreateAsset = async () => {
    try {
      setSaving(true);
      setErrorMsg('');
      await onCreateAsset(newAssetData);
      setShowAddModal(false);
      setNewAssetData({ type: 'Laptop', condition: 'Brand New', status: 'Available' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create asset';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmIssue = async () => {
    if (!issueModalAsset || !targetEmployeeId) return;
    try {
      setSaving(true);
      setErrorMsg('');
      await onIssueAsset(
        issueModalAsset.id,
        targetEmployeeId,
        new Date().toISOString().split('T')[0],
        issueNotes
      );
      setIssueModalAsset(null);
      setTargetEmployeeId('');
      setIssueNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to issue asset';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnModalAsset) return;
    try {
      setSaving(true);
      setErrorMsg('');
      await onReturnAsset(
        returnModalAsset.id,
        new Date().toISOString().split('T')[0],
        returnCondition,
        returnNotes
      );
      setReturnModalAsset(null);
      setReturnNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to return asset';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferModalAsset || !targetEmployeeId) return;
    try {
      setSaving(true);
      setErrorMsg('');
      await onTransferAsset(transferModalAsset.id, targetEmployeeId, transferNotes);
      setTransferModalAsset(null);
      setTargetEmployeeId('');
      setTransferNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to transfer asset';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryIcon = (type: AssetCategory) => {
    switch (type) {
      case 'Laptop': return Laptop;
      case 'Access Card': return CreditCard;
      case 'SIM Card': return Smartphone;
      case 'Charger': return Zap;
      case 'Parking Card': return Car;
      default: return Package;
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by tag, name, serial, employee..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end text-xs">
            <span className="text-slate-500">
              Showing <strong className="font-mono text-slate-800">{filteredAssets.length}</strong> of{' '}
              <span className="font-mono">{assets.length}</span> items
            </span>

            {!isViewer && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Asset Item
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
            <Filter className="w-3 h-3" /> Categories:
          </span>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 text-xs"
          >
            <option value="All">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 text-xs"
          >
            <option value="All">All Statuses</option>
            <option value="In Use">In Use (Issued)</option>
            <option value="Available">Available (In Stock)</option>
            <option value="In Repair">In Repair</option>
            <option value="Retired">Retired</option>
          </select>
        </div>
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
              <tr>
                <th className="px-4 py-3">Asset Tag</th>
                <th className="px-4 py-3">Item Name & Serial</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Assigned Employee</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredAssets.map(asset => {
                const Icon = getCategoryIcon(asset.type);

                return (
                  <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {asset.assetTag}
                      </span>
                    </td>

                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{asset.name}</p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            SN: {asset.serialNumber || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-slate-700 font-medium">
                      {asset.type}
                    </td>

                    <td className="px-4 py-3 min-w-[170px]">
                      {asset.assignedEmployeeName ? (
                        <div>
                          <p className="font-semibold text-slate-900 truncate">{asset.assignedEmployeeName}</p>
                          <p className="text-[10px] font-mono text-slate-500">{asset.assignedEmployeeCode}</p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          In Safe / HR Stock
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                      {asset.issueDate || '—'}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                        {asset.condition}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          asset.status === 'In Use'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : asset.status === 'Available'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {asset.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setHistoryModalAsset(asset)}
                          title="View Audit History"
                          className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        {!isViewer && (
                          <>
                            {asset.status === 'Available' ? (
                              <button
                                onClick={() => {
                                  setIssueModalAsset(asset);
                                  setTargetEmployeeId('');
                                  setIssueNotes('');
                                }}
                                className="px-2.5 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors"
                              >
                                Issue Asset
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setTransferModalAsset(asset);
                                    setTargetEmployeeId('');
                                    setTransferNotes('');
                                  }}
                                  title="Transfer Asset"
                                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setReturnModalAsset(asset);
                                    setReturnCondition(asset.condition);
                                    setReturnNotes('');
                                  }}
                                  title="Return Asset"
                                  className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                                >
                                  Return
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-slate-400">
                    No company assets matching the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-900">Add Company Asset / Inventory Item</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            {errorMsg && (
              <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Asset Tag / Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. AST-LPT-015"
                  value={newAssetData.assetTag || ''}
                  onChange={e => setNewAssetData({ ...newAssetData, assetTag: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Item Name / Model</label>
                <input
                  type="text"
                  placeholder="e.g. MacBook Air M2 15-inch 16GB"
                  value={newAssetData.name || ''}
                  onChange={e => setNewAssetData({ ...newAssetData, name: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Category</label>
                  <select
                    value={newAssetData.type}
                    onChange={e => setNewAssetData({ ...newAssetData, type: e.target.value as AssetCategory })}
                    className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700">Condition</label>
                  <select
                    value={newAssetData.condition}
                    onChange={e => setNewAssetData({ ...newAssetData, condition: e.target.value as AssetCondition })}
                    className="mt-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  >
                    <option value="Brand New">Brand New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Service">Needs Service</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Serial Number / Hardware ID</label>
                <input
                  type="text"
                  placeholder="e.g. C02G99ABMD6M or SIM ICCID"
                  value={newAssetData.serialNumber || ''}
                  onChange={e => setNewAssetData({ ...newAssetData, serialNumber: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Notes / Configuration</label>
                <textarea
                  rows={2}
                  placeholder="Access permissions, charger kit, accessories..."
                  value={newAssetData.notes || ''}
                  onChange={e => setNewAssetData({ ...newAssetData, notes: e.target.value })}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAsset}
                disabled={saving || !newAssetData.name}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add to Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Asset Modal */}
      {issueModalAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Issue Asset to Employee</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  [{issueModalAsset.assetTag}] {issueModalAsset.name}
                </p>
              </div>
              <button onClick={() => setIssueModalAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Select Employee</label>
                <select
                  value={targetEmployeeId}
                  onChange={e => setTargetEmployeeId(e.target.value)}
                  className="mt-1.5 w-full p-2 text-xs border border-slate-300 rounded"
                >
                  <option value="">-- Choose employee --</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.employeeCode}) — {e.designation}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Handover Notes / Verification</label>
                <textarea
                  rows={2}
                  placeholder="Condition verified upon handover, accessories included..."
                  value={issueNotes}
                  onChange={e => setIssueNotes(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIssueModalAsset(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmIssue}
                disabled={saving || !targetEmployeeId}
                className="px-4 py-1.5 bg-emerald-700 text-white rounded text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Issuing...' : 'Confirm Issuance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Asset Modal */}
      {returnModalAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Return Company Asset</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  [{returnModalAsset.assetTag}] {returnModalAsset.name}
                </p>
              </div>
              <button onClick={() => setReturnModalAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                <span>Currently Issued to: </span>
                <strong className="text-slate-900">{returnModalAsset.assignedEmployeeName}</strong>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Condition Upon Return</label>
                <select
                  value={returnCondition}
                  onChange={e => setReturnCondition(e.target.value as AssetCondition)}
                  className="mt-1.5 w-full p-2 text-xs border border-slate-300 rounded"
                >
                  <option value="Good">Good (Normal Wear & Tear)</option>
                  <option value="Brand New">Brand New / Pristine</option>
                  <option value="Fair">Fair (Minor Scuffs / Working)</option>
                  <option value="Needs Service">Needs Service / Damaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Check-in Notes</label>
                <textarea
                  rows={2}
                  placeholder="All cables returned, data wiped, stored in safe..."
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setReturnModalAsset(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={saving}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Processing...' : 'Confirm Return to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Asset Modal */}
      {transferModalAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Transfer Asset to Another Employee</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  [{transferModalAsset.assetTag}] {transferModalAsset.name}
                </p>
              </div>
              <button onClick={() => setTransferModalAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                <span>Transferring from: </span>
                <strong className="text-slate-900">{transferModalAsset.assignedEmployeeName}</strong>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">New Recipient Employee</label>
                <select
                  value={targetEmployeeId}
                  onChange={e => setTargetEmployeeId(e.target.value)}
                  className="mt-1.5 w-full p-2 text-xs border border-slate-300 rounded"
                >
                  <option value="">-- Choose new recipient --</option>
                  {employees
                    .filter(e => e.id !== transferModalAsset.assignedEmployeeId)
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        {e.fullName} ({e.employeeCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Transfer Reason & Notes</label>
                <textarea
                  rows={2}
                  placeholder="Department transfer, promotion, equipment upgrade..."
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  className="mt-1 w-full p-2 text-xs border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setTransferModalAsset(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransfer}
                disabled={saving || !targetEmployeeId}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Log Modal */}
      {historyModalAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Asset Audit & Transaction History</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  [{historyModalAsset.assetTag}] {historyModalAsset.name}
                </p>
              </div>
              <button onClick={() => setHistoryModalAsset(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {historyModalAsset.history && historyModalAsset.history.length > 0 ? (
                historyModalAsset.history.map((entry, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{entry.action}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(entry.date).toLocaleString()}
                      </span>
                    </div>
                    {entry.employeeName && (
                      <p className="text-slate-700">
                        Linked Person: <strong>{entry.employeeName}</strong>
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-slate-600 italic">&ldquo;{entry.notes}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-slate-400 pt-0.5">
                      Logged by: {entry.performedBy}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">No historical transactions logged yet.</p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setHistoryModalAsset(null)}
                className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded font-medium"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
