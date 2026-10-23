import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, Search, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Eye, ShieldAlert, Package, Users as UsersIcon,
  Truck, Factory, Receipt, ShoppingCart, Loader2, X,
  Calendar, User as UserIcon, AlertCircle, Database,
  ShieldCheck, Check, Layers
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch, API_BASE } from '../services/api';


export interface DeletedRecord {
  id: string;
  category: 'USERS' | 'PRODUCTS' | 'CUSTOMERS' | 'SUPPLIERS' | 'BOMS' | 'PRODUCTION_ORDERS' | 'EXPENSES' | 'SALES';
  recordType: string;
  identifier: string;
  subIdentifier?: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName?: string;
  deletionReason?: string;
  canRestore: boolean;
  conflict?: string | null;
  metadata?: Record<string, any>;
}

export interface RecoveryStats {
  users: number;
  products: number;
  customers: number;
  suppliers: number;
  manufacturing: number;
  boms: number;
  productionOrders: number;
  expenses: number;
  sales: number;
  total: number;
}

export const RecoveryCenter: React.FC = () => {
  const { isSuperAdmin } = useAuth();

  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [inspectRecord, setInspectRecord] = useState<DeletedRecord | null>(null);
  const [restoreRecord, setRestoreRecord] = useState<DeletedRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Fetch Stats & Records
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, recordsRes] = await Promise.all([
        authFetch(`${API_BASE}/recovery/stats`),
        authFetch(`${API_BASE}/recovery/records?category=${selectedCategory}&search=${encodeURIComponent(searchQuery)}`),
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch recovery stats');
      if (!recordsRes.ok) throw new Error('Failed to fetch deleted records');

      const statsData = await statsRes.json();
      const recordsData = await recordsRes.json();

      setStats(statsData.stats);
      setRecords(recordsData.records || []);
    } catch (err: any) {
      setError(err.message || 'Error loading recovery data');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [loadData, isSuperAdmin]);

  // Execute Restore Action
  const handleRestore = async () => {
    if (!restoreRecord) return;
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const res = await authFetch(`${API_BASE}/recovery/restore/${restoreRecord.category.toLowerCase()}/${restoreRecord.id}`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to restore record');
      }

      setSuccessMessage(`Successfully restored "${restoreRecord.identifier}"!`);
      setRestoreRecord(null);
      // Refresh list and stats
      await loadData();

      // Clear success notification after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      setRestoreError(err.message || 'Restoration failed. Please check for unresolved dependencies.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Category Icon helper
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'USERS': return <UserIcon className="w-4 h-4 text-emerald-600" />;
      case 'PRODUCTS': return <Package className="w-4 h-4 text-blue-600" />;
      case 'CUSTOMERS': return <UsersIcon className="w-4 h-4 text-purple-600" />;
      case 'SUPPLIERS': return <Truck className="w-4 h-4 text-amber-600" />;
      case 'BOMS': return <Layers className="w-4 h-4 text-indigo-600" />;
      case 'PRODUCTION_ORDERS': return <Factory className="w-4 h-4 text-teal-600" />;
      case 'EXPENSES': return <Receipt className="w-4 h-4 text-rose-600" />;
      case 'SALES': return <ShoppingCart className="w-4 h-4 text-emerald-700" />;
      default: return <Database className="w-4 h-4 text-gray-600" />;
    }
  };

  // Category Badge helper
  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case 'USERS': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PRODUCTS': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CUSTOMERS': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'SUPPLIERS': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BOMS': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'PRODUCTION_ORDERS': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'EXPENSES': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'SALES': return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Gate page: strictly Super Admin only
  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 text-center bg-white rounded-2xl shadow-sm border border-red-100">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Super Admin Access Required</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          The Recovery Center / Recycle Bin contains sensitive archived records, financial histories, and system accounts. Access and restoration are strictly restricted to system Super Administrators.
        </p>
        <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-500 font-mono">
          Endpoint Security: 403 Forbidden (requireSuperAdmin middleware)
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1A3325] via-[#234A34] to-[#1A3325] rounded-2xl p-6 md:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pointer-events-none">
          <RotateCcw className="w-64 h-64 -mr-16 stroke-[1]" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 text-[#A3B899] text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4 text-[#48BB78]" />
              Super Admin Control Center
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <RotateCcw className="w-7 h-7 text-[#48BB78]" />
              Recovery Center & Recycle Bin
            </h1>
            <p className="text-sm text-[#A3B899] mt-2 max-w-3xl leading-relaxed">
              Safely inspect and restore deleted user accounts, inventory catalog items, customers, suppliers, manufacturing BOMs, and financial ledgers. Original identifiers, historical relationships, and audit trails are preserved without duplicating stock movements.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 border border-white/15 transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm shadow-sm animate-fade-in">
          <div className="flex items-center gap-3 font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-sm shadow-sm">
          <div className="flex items-center gap-3 font-medium">
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Total Deleted</span>
            <RotateCcw className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total ?? 0}</div>
          <div className="text-[11px] text-gray-400 mt-1">Archived records</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Employees</span>
            <UserIcon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.users ?? 0}</div>
          <div className="text-[11px] text-gray-400 mt-1">Deactivated profiles</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-blue-700 font-medium">
            <span>Products</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.products ?? 0}</div>
          <div className="text-[11px] text-gray-400 mt-1">Catalog & Materials</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-purple-700 font-medium">
            <span>Customers</span>
            <UsersIcon className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.customers ?? 0}</div>
          <div className="text-[11px] text-gray-400 mt-1">Client directory</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
            <span>Suppliers</span>
            <Truck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.suppliers ?? 0}</div>
          <div className="text-[11px] text-gray-400 mt-1">Vendor records</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-teal-700 font-medium">
            <span>Manufacturing</span>
            <Factory className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {(stats?.boms ?? 0) + (stats?.productionOrders ?? 0)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">BOMs & Orders</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-rose-700 font-medium">
            <span>Financial & Sales</span>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {(stats?.expenses ?? 0) + (stats?.sales ?? 0)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Expenses & Invoices</div>
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Filter and Search Bar */}
        <div className="p-4 md:p-5 border-b border-gray-200 bg-gray-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'All Records', count: stats?.total },
              { id: 'USERS', label: 'Employees', count: stats?.users },
              { id: 'PRODUCTS', label: 'Products', count: stats?.products },
              { id: 'CUSTOMERS', label: 'Customers', count: stats?.customers },
              { id: 'SUPPLIERS', label: 'Suppliers', count: stats?.suppliers },
              { id: 'MANUFACTURING', label: 'Manufacturing', count: (stats?.boms ?? 0) + (stats?.productionOrders ?? 0) },
              { id: 'EXPENSES', label: 'Expenses', count: stats?.expenses },
              { id: 'SALES', label: 'Sales', count: stats?.sales },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                  selectedCategory === tab.id
                    ? 'bg-[#1A3325] text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      selectedCategory === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, SKU, user..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A3325] focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#1A3325] mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Scanning Recovery Vault...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">Recycle Bin is Empty</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
              {searchQuery
                ? `No deleted records matching "${searchQuery}" found in the selected category.`
                : 'There are no deleted records currently in the Recovery Center. All entities are active and healthy.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Record Identifier</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Deletion Time</th>
                  <th className="py-3.5 px-4">Deleted By</th>
                  <th className="py-3.5 px-4">Reason / Notes</th>
                  <th className="py-3.5 px-4">Recovery Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                {records.map((item) => {
                  return (
                    <tr
                      key={`${item.category}-${item.id}`}
                      className="hover:bg-gray-50/80 transition-colors"
                    >
                      {/* Record Identifier */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gray-100 border border-gray-200 shrink-0">
                            {getCategoryIcon(item.category)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{item.identifier}</div>
                            {item.subIdentifier && (
                              <div className="text-[11px] text-gray-500 truncate max-w-xs">
                                {item.subIdentifier}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border ${getCategoryBadgeClass(
                            item.category
                          )}`}
                        >
                          {item.recordType}
                        </span>
                      </td>

                      {/* Deletion Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {item.deletedAt
                              ? new Date(item.deletedAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Unknown'}
                          </span>
                        </div>
                      </td>

                      {/* Deleted By */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-medium">
                          <UserIcon className="w-3 h-3 text-gray-400" />
                          {item.deletedByName || 'System'}
                        </span>
                      </td>

                      {/* Deletion Reason */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-gray-600 italic truncate text-[11px]">
                          {item.deletionReason || 'No specific reason recorded'}
                        </p>
                      </td>

                      {/* Recovery Status */}
                      <td className="py-3.5 px-4">
                        {item.canRestore ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            Ready to Restore
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 max-w-xs" title={item.conflict || 'Dependency conflict'}>
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{item.conflict || 'Dependency blocked'}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* Inspect Details Button */}
                          <button
                            onClick={() => setInspectRecord(item)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 border border-gray-200 transition-all cursor-pointer"
                            title="Inspect Record Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Restore Button */}
                          <button
                            onClick={() => {
                              setRestoreRecord(item);
                              setRestoreError(null);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                              item.canRestore
                                ? 'bg-[#1A3325] hover:bg-[#234A34] text-white cursor-pointer'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                            }`}
                            disabled={!item.canRestore}
                            title={item.canRestore ? 'Restore this record' : item.conflict || 'Restoration blocked by dependency conflict'}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INSPECT RECORD DETAILS MODAL */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white rounded-lg border border-gray-200">
                  {getCategoryIcon(inspectRecord.category)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Inspect Archived Record Details
                  </h3>
                  <div className="text-[11px] text-gray-500">
                    Category: {inspectRecord.recordType}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectRecord(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Conflict Alert if any */}
              {inspectRecord.conflict && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Dependency or Conflict Warning</div>
                    <div className="mt-0.5 text-amber-800 leading-relaxed">
                      {inspectRecord.conflict}
                    </div>
                  </div>
                </div>
              )}

              {/* Core Information Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-gray-400 font-medium">Record Identifier</div>
                  <div className="font-bold text-gray-900 text-sm mt-0.5">
                    {inspectRecord.identifier}
                  </div>
                  {inspectRecord.subIdentifier && (
                    <div className="text-gray-500 text-[11px] mt-0.5">
                      {inspectRecord.subIdentifier}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-gray-400 font-medium">System UUID</div>
                  <div className="font-mono text-gray-800 text-[11px] mt-1 break-all">
                    {inspectRecord.id}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-gray-400 font-medium">Deletion Timestamp</div>
                  <div className="font-semibold text-gray-800 mt-0.5">
                    {inspectRecord.deletedAt
                      ? new Date(inspectRecord.deletedAt).toLocaleString()
                      : 'N/A'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-gray-400 font-medium">Archived By</div>
                  <div className="font-semibold text-gray-800 mt-0.5">
                    {inspectRecord.deletedByName || 'System Administrator'}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                <div className="text-gray-400 font-medium mb-1">Recorded Deletion Reason</div>
                <div className="text-gray-700 italic">
                  "{inspectRecord.deletionReason || 'No explicit reason specified.'}"
                </div>
              </div>

              {/* Metadata Attributes */}
              {inspectRecord.metadata && Object.keys(inspectRecord.metadata).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">
                    Record Attributes & Context
                  </h4>
                  <div className="bg-gray-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-56">
                    <pre>{JSON.stringify(inspectRecord.metadata, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => setInspectRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>

              <button
                onClick={() => {
                  const target = inspectRecord;
                  setInspectRecord(null);
                  setRestoreRecord(target);
                  setRestoreError(null);
                }}
                disabled={!inspectRecord.canRestore}
                className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm ${
                  inspectRecord.canRestore
                    ? 'bg-[#1A3325] hover:bg-[#234A34] text-white cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Proceed to Restore</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE CONFIRMATION MODAL */}
      {restoreRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">
                  Confirm Record Restoration
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Restore original entity and re-establish valid relationships.
                </p>
              </div>
              <button
                onClick={() => setRestoreRecord(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {restoreError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{restoreError}</div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target Record:</span>
                  <span className="font-bold text-gray-900">{restoreRecord.identifier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type:</span>
                  <span className="font-medium text-gray-700">{restoreRecord.recordType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Category:</span>
                  <span className="font-mono text-gray-600">{restoreRecord.category}</span>
                </div>
              </div>

              {/* Safety Guarantees Checklist */}
              <div className="space-y-2 text-xs text-gray-600">
                <div className="font-semibold text-gray-800">Restoration Safety Protocol:</div>
                <div className="flex items-start gap-2 text-gray-600">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>The original record ID and foreign-key references are preserved.</span>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Stock levels and financial ledgers are preserved without duplicate movements or payments.</span>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Action will be logged in the immutable system Audit Trail.</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRestoreRecord(null)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={isRestoring}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#1A3325] hover:bg-[#234A34] text-white flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Restoring Record...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Confirm & Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
