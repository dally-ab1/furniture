import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, Trash2, Search, Plus, X, Phone, Mail, MapPin, User, Loader2, AlertCircle,
  ChevronRight, CreditCard, RefreshCw, ArrowLeft
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  outstanding_balance: number;
  created_at: string;
}

const formatETB = (value: number): string => {
  return `ETB ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Supplier payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
    // Soft-delete supplier to Recovery Center
  const handleDeleteSupplier = async (supp: Supplier) => {
    const reason = window.prompt(
      `Are you sure you want to move supplier "${supp.name}" to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/suppliers/${supp.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete supplier');
      }
      alert(`Supplier "${supp.name}" moved to Recovery Center.`);
      setSelectedSupplier(null);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message || 'Error deleting supplier');
    }
  };

  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'EBIRR' | 'CBE_BIRR'>('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await authFetch(`${API_BASE}/suppliers${params}`);
      const json = await res.json();
      if (json.success) setSuppliers(json.data || []);
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuppliers(), 300);
    return () => clearTimeout(timer);
  }, [fetchSuppliers]);

  // Supplier Detail View
  if (selectedSupplier) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <button
          onClick={() => setSelectedSupplier(null)}
          className="flex items-center gap-2 text-sm text-[#69736B] hover:text-[#276749] mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Suppliers
        </button>

        {/* Supplier Header Card */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EBF2FA] text-[#2563EB] flex items-center justify-center">
                <Truck className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#202820]">{selectedSupplier.name}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-[#69736B] flex-wrap">
                  {selectedSupplier.contact_person && (
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {selectedSupplier.contact_person}</span>
                  )}
                  {selectedSupplier.phone && (
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedSupplier.phone}</span>
                  )}
                  {selectedSupplier.email && (
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedSupplier.email}</span>
                  )}
                  {selectedSupplier.address && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedSupplier.address}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-2">
                <button
                  onClick={() => handleDeleteSupplier(selectedSupplier)}
                  className="px-2.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg flex items-center gap-1 transition-colors"
                  title="Move Supplier to Recovery Center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Supplier
                </button>
              </div>
              <div className="text-xs text-[#69736B] mb-1">Outstanding Payable</div>
              <div className={`text-2xl font-bold tabular-nums ${
                Number(selectedSupplier.outstanding_balance) > 0 ? 'text-[#DC2626]' : 'text-[#276749]'
              }`}>
                {formatETB(Number(selectedSupplier.outstanding_balance))}
              </div>
              {Number(selectedSupplier.outstanding_balance) > 0 && (
                <button
                  onClick={() => {
                    setPayAmount(Number(selectedSupplier.outstanding_balance));
                    setShowPaymentModal(true);
                  }}
                  className="mt-2.5 px-3.5 py-1.5 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>


        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
            <div className="text-xs text-[#69736B] mb-1">Added On</div>
            <div className="text-base font-semibold text-[#202820]">
              {new Date(selectedSupplier.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
            <div className="text-xs text-[#69736B] mb-1">Status</div>
            <div className="text-base font-semibold text-[#276749]">Active</div>
          </div>
        </div>

        {/* Placeholder for purchase orders */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-8 text-center">
          <Truck className="w-8 h-8 text-[#276749]/60 mx-auto mb-3" />
          <p className="text-sm font-medium text-[#202820]">Direct Supplier Procurement</p>
          <p className="text-xs text-[#69736B] mt-1 max-w-md mx-auto">
            Purchasing and material ordering are managed directly outside FurniERP (via phone/direct contact). When raw materials arrive, employees record actual quantities directly in Products &amp; Inventory.
          </p>
        </div>

        {/* Supplier Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#276749]" />
                  <h3 className="font-bold text-[#202820]">Record Supplier Payment</h3>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="text-[#8C948D] hover:text-[#202820]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!selectedSupplier || payAmount <= 0) return;
                  setPaySubmitting(true);
                  try {
                    const res = await authFetch(`${API_BASE}/suppliers/${selectedSupplier.id}/payments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        amount: Number(payAmount),
                        paymentMethod: payMethod,
                        transactionReference: payRef || undefined,
                        notes: payNotes || undefined,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Payment failed');
                    setShowPaymentModal(false);
                    setSelectedSupplier(prev => prev ? { ...prev, outstanding_balance: Math.max(0, Number(prev.outstanding_balance) - payAmount) } : null);
                    fetchSuppliers();
                  } catch (err: any) {
                    alert(err.message || 'Failed to record supplier payment');
                  } finally {
                    setPaySubmitting(false);
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="bg-[#FAFBF9] rounded-xl p-3 border border-[#E3E7E1] text-xs">
                  <div className="text-[#69736B]">Supplier: <strong className="text-[#202820]">{selectedSupplier.name}</strong></div>
                  <div className="text-[#69736B] mt-0.5">Outstanding Payable: <strong className="text-[#DC2626]">{formatETB(Number(selectedSupplier.outstanding_balance))}</strong></div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Payment Amount (ETB) *</label>
                  <input
                    type="number"
                    min="1"
                    max={Number(selectedSupplier.outstanding_balance)}
                    step="0.01"
                    required
                    value={payAmount || ''}
                    onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm font-bold text-[#276749] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Payment Method *</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="EBIRR">ebirr</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Transaction Reference / Voucher #</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                    placeholder="e.g. PV-00124 or Bank Slip #"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Notes</label>
                  <textarea
                    rows={2}
                    value={payNotes}
                    onChange={e => setPayNotes(e.target.value)}
                    placeholder="Optional payment notes..."
                    className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={paySubmitting}
                    className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                  >
                    {paySubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }


  // Main Suppliers Directory
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#202820]">Suppliers</h1>
          <p className="text-sm text-[#69736B] mt-0.5">Manage your supplier directory and track accounts payable</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#276749] hover:bg-[#234A34] text-white text-sm font-semibold rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Search */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#69736B]" />
          <input
            type="text"
            placeholder="Search suppliers by name or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
              placeholder:text-[#69736B] focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749] transition-all"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#EBF2FA] flex items-center justify-center">
              <Truck className="w-4 h-4 text-[#2563EB]" />
            </div>
            <span className="text-xs text-[#69736B]">Total Suppliers</span>
          </div>
          <div className="text-2xl font-bold text-[#202820]">{suppliers.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-[#DC2626]" />
            </div>
            <span className="text-xs text-[#69736B]">Total Payable</span>
          </div>
          <div className="text-2xl font-bold text-[#DC2626] tabular-nums">
            {formatETB(suppliers.reduce((sum, s) => sum + Number(s.outstanding_balance || 0), 0))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#92400E]" />
            </div>
            <span className="text-xs text-[#69736B]">With Balance Due</span>
          </div>
          <div className="text-2xl font-bold text-[#92400E]">
            {suppliers.filter(s => Number(s.outstanding_balance || 0) > 0).length}
          </div>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#276749]" />
            <h3 className="text-sm font-semibold text-[#202820]">Supplier Directory</h3>
          </div>
          <button onClick={fetchSuppliers} className="text-xs text-[#69736B] hover:text-[#276749] transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#276749] animate-spin" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-10 h-10 text-[#E3E7E1] mx-auto mb-3" />
            <p className="text-sm text-[#69736B]">No suppliers found</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-[#276749] hover:underline font-medium"
            >
              Add your first supplier
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E1]">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Supplier</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Contact</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Phone</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Payable</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Since</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E7E1]">
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    onClick={() => setSelectedSupplier(supplier)}
                    className="hover:bg-[#F7F7F2] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#EBF2FA] text-[#2563EB] flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {supplier.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="font-medium text-[#202820]">{supplier.name}</div>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-[#69736B]">{supplier.contact_person || '—'}</td>
                    <td className="py-3 px-6 text-[#69736B]">{supplier.phone || '—'}</td>
                    <td className={`py-3 px-6 text-right font-medium tabular-nums ${
                      Number(supplier.outstanding_balance || 0) > 0 ? 'text-[#DC2626]' : 'text-[#276749]'
                    }`}>
                      {formatETB(Number(supplier.outstanding_balance || 0))}
                    </td>
                    <td className="py-3 px-6 text-right text-[#69736B] text-xs">
                      {new Date(supplier.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4">
                      <ChevronRight className="w-4 h-4 text-[#E3E7E1]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <AddSupplierModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); fetchSuppliers(); }}
        />
      )}
    </div>
  );
};

// Add Supplier Modal
const AddSupplierModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Supplier name is required'); return; }
    if (!form.phone.trim()) { setError('Phone number is required'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await authFetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create supplier');
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#202820]">Add New Supplier</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F7F7F2] transition-colors">
            <X className="w-4 h-4 text-[#69736B]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Supplier Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Addis Timber Supply"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Contact Person</label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              placeholder="Full name"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Phone *</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+251-xxx-xxx-xxx"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="supplier@example.com"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Addis Ababa, Ethiopia"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-[#E3E7E1] rounded-xl text-sm font-medium text-[#69736B] hover:bg-[#F7F7F2] transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-[#276749] hover:bg-[#234A34] text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Add Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Suppliers;
