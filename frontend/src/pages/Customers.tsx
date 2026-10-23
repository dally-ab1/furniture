import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Trash2, Search, Plus, X, Phone, Mail, MapPin, Loader2, AlertCircle,
  ChevronRight, CreditCard, ShoppingCart, ArrowLeft, RefreshCw, Cog
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  outstanding_balance: number;
  created_at: string;
  sales?: Sale[];
}

interface Sale {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  created_at: string;
}

interface ManufacturingOrder {
  id: string;
  order_number: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  target_quantity: number;
  due_date: string | null;
  created_at: string;
  product: { id: string; name: string; sku: string };
}

const formatETB = (value: number): string => {
  return `ETB ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    PAID: 'bg-[#EAF3EC] text-[#276749]',
    PARTIAL: 'bg-[#FEF3C7] text-[#92400E]',
    CREDIT: 'bg-[#EFF6FF] text-[#1D4ED8]',
    COMPLETED: 'bg-[#EAF3EC] text-[#276749]',
    PENDING_PRODUCTION: 'bg-[#FDF2F8] text-[#9D174D]',
    PLANNED: 'bg-[#EFF6FF] text-[#1D4ED8]',
    IN_PROGRESS: 'bg-[#FEF3C7] text-[#92400E]',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
};

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [manufacturingOrders, setManufacturingOrders] = useState<ManufacturingOrder[]>([]);
  const [loadingMfgOrders, setLoadingMfgOrders] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'EBIRR' | 'CBE_BIRR'>('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await authFetch(`${API_BASE}/customers${params}`);
      const json = await res.json();
      if (json.success) setCustomers(json.data || []);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 300);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const fetchCustomerDetail = async (id: string) => {
    setLoadingDetail(true);
    setLoadingMfgOrders(true);
    try {
      const [custRes, mfgRes] = await Promise.all([
        authFetch(`${API_BASE}/customers/${id}`),
        authFetch(`${API_BASE}/manufacturing/orders?customerId=${id}`),
      ]);
      const custJson = await custRes.json();
      const mfgJson = await mfgRes.json();
      if (custJson.success) setSelectedCustomer(custJson.data);
      setManufacturingOrders(mfgJson.success ? (mfgJson.data || []) : []);
    } catch (err) {
      console.error('Failed to fetch customer detail:', err);
    } finally {
      setLoadingDetail(false);
      setLoadingMfgOrders(false);
    }
  };

    // Soft-delete customer to Recovery Center
  const handleDeleteCustomer = async (cust: Customer) => {
    const reason = window.prompt(
      `Are you sure you want to move customer "${cust.name}" to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/customers/${cust.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete customer');
      }
      alert(`Customer "${cust.name}" moved to Recovery Center.`);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Error deleting customer');
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || payAmount <= 0) return;
    setPaySubmitting(true);
    try {
      const res = await authFetch(`${API_BASE}/customers/${selectedCustomer.id}/payments`, {
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
      fetchCustomerDetail(selectedCustomer.id);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  // Customer Detail View
  if (selectedCustomer) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Back Button */}
        <button
          onClick={() => setSelectedCustomer(null)}
          className="flex items-center gap-2 text-sm text-[#69736B] hover:text-[#276749] mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customers
        </button>

        {/* Customer Header Card */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center text-xl font-bold uppercase">
                {selectedCustomer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#202820]">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-4 mt-1 text-sm text-[#69736B]">
                  {selectedCustomer.phone && (
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedCustomer.phone}</span>
                  )}
                  {selectedCustomer.email && (
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedCustomer.email}</span>
                  )}
                  {selectedCustomer.address && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {selectedCustomer.address}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-2">
                <button
                  onClick={() => handleDeleteCustomer(selectedCustomer)}
                  className="px-2.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg flex items-center gap-1 transition-colors"
                  title="Move Customer to Recovery Center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Customer
                </button>
              </div>
              <div className="text-xs text-[#69736B] mb-1">Outstanding Balance</div>
              <div className={`text-2xl font-bold tabular-nums ${
                selectedCustomer.outstanding_balance > 0 ? 'text-[#EA580C]' : 'text-[#276749]'
              }`}>
                {formatETB(selectedCustomer.outstanding_balance)}
              </div>
              {selectedCustomer.outstanding_balance > 0 && (
                <button
                  onClick={() => {
                    setPayAmount(Number(selectedCustomer.outstanding_balance));
                    setShowPaymentModal(true);
                  }}
                  className="mt-2.5 px-3.5 py-1.5 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Collect Payment
                </button>
              )}
            </div>
          </div>
        </div>


        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
            <div className="text-xs text-[#69736B] mb-1">Total Sales</div>
            <div className="text-xl font-bold text-[#202820]">{selectedCustomer.sales?.length || 0}</div>
          </div>
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
            <div className="text-xs text-[#69736B] mb-1">Total Revenue</div>
            <div className="text-xl font-bold text-[#202820] tabular-nums">
              {formatETB(selectedCustomer.sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
            <div className="text-xs text-[#69736B] mb-1">Total Paid</div>
            <div className="text-xl font-bold text-[#276749] tabular-nums">
              {formatETB(selectedCustomer.sales?.reduce((sum, s) => sum + Number(s.paid_amount), 0) || 0)}
            </div>
          </div>
        </div>

        {/* Sales History Table */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1]">
          <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-[#276749]" />
            <h3 className="text-sm font-semibold text-[#202820]">Sales History</h3>
          </div>
          {selectedCustomer.sales && selectedCustomer.sales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E3E7E1]">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Invoice #</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Total</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Paid</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Balance</th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E1]">
                  {selectedCustomer.sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-[#F7F7F2] transition-colors">
                      <td className="py-3 px-6 font-medium text-[#202820]">{sale.invoice_number}</td>
                      <td className="py-3 px-6 text-right tabular-nums">{formatETB(Number(sale.total_amount))}</td>
                      <td className="py-3 px-6 text-right tabular-nums text-[#276749]">{formatETB(Number(sale.paid_amount))}</td>
                      <td className="py-3 px-6 text-right tabular-nums text-[#EA580C]">{formatETB(Number(sale.balance_due))}</td>
                      <td className="py-3 px-6 text-center"><StatusBadge status={sale.status} /></td>
                      <td className="py-3 px-6 text-right text-[#69736B]">
                        {new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#69736B]">No sales history for this customer yet.</div>
          )}
        </div>

        {/* Manufacturing Orders Section */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1]">
          <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center gap-2">
            <Cog className="w-4 h-4 text-[#276749]" />
            <h3 className="text-sm font-semibold text-[#202820]">Manufacturing Orders</h3>
            {loadingMfgOrders && <span className="text-xs text-[#8C948D]">Loading...</span>}
          </div>
          {manufacturingOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E3E7E1]">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Order #</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Product</th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Qty</th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E1]">
                  {manufacturingOrders.map((mo) => (
                    <tr key={mo.id} className="hover:bg-[#F7F7F2] transition-colors">
                      <td className="py-3 px-6 font-mono font-medium text-[#202820]">{mo.order_number}</td>
                      <td className="py-3 px-6">
                        <div className="font-semibold text-[#202820]">{mo.product.name}</div>
                        <div className="text-[10px] text-[#8C948D]">{mo.product.sku}</div>
                      </td>
                      <td className="py-3 px-6 text-center tabular-nums">{mo.target_quantity}</td>
                      <td className="py-3 px-6 text-center"><StatusBadge status={mo.status} /></td>
                      <td className="py-3 px-6 text-right text-[#69736B]">
                        {mo.due_date ? new Date(mo.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[#69736B]">
              {loadingMfgOrders ? 'Loading manufacturing orders...' : 'No manufacturing orders linked to this customer.'}
            </div>
          )}
        </div>

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#276749]" />
                  <h3 className="font-bold text-[#202820]">Collect Customer Payment</h3>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="text-[#8C948D] hover:text-[#202820]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCollectPayment} className="p-6 space-y-4">
                <div className="bg-[#FAFBF9] rounded-xl p-3 border border-[#E3E7E1] text-xs">
                  <div className="text-[#69736B]">Customer: <strong className="text-[#202820]">{selectedCustomer.name}</strong></div>
                  <div className="text-[#69736B] mt-0.5">Outstanding Balance: <strong className="text-[#EA580C]">{formatETB(selectedCustomer.outstanding_balance)}</strong></div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Payment Amount (ETB) *</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedCustomer.outstanding_balance}
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
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Transaction Reference / Receipt #</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                    placeholder="e.g. TXN-9988123 or Bank Slip #"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Notes</label>
                  <textarea
                    rows={2}
                    value={payNotes}
                    onChange={e => setPayNotes(e.target.value)}
                    placeholder="Optional collection notes..."
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
                    Confirm Collection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }


  // Main Customers Directory
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#202820]">Customers</h1>
          <p className="text-sm text-[#69736B] mt-0.5">Manage your customer directory and track outstanding balances</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#276749] hover:bg-[#234A34] text-white text-sm font-semibold rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#69736B]" />
          <input
            type="text"
            placeholder="Search customers by name or phone..."
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
            <div className="w-8 h-8 rounded-xl bg-[#EAF3EC] flex items-center justify-center">
              <Users className="w-4 h-4 text-[#276749]" />
            </div>
            <span className="text-xs text-[#69736B]">Total Customers</span>
          </div>
          <div className="text-2xl font-bold text-[#202820]">{customers.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#FFF4ED] flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-[#EA580C]" />
            </div>
            <span className="text-xs text-[#69736B]">Total Outstanding</span>
          </div>
          <div className="text-2xl font-bold text-[#EA580C] tabular-nums">
            {formatETB(customers.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#DC2626]" />
            </div>
            <span className="text-xs text-[#69736B]">With Debt</span>
          </div>
          <div className="text-2xl font-bold text-[#DC2626]">
            {customers.filter(c => Number(c.outstanding_balance || 0) > 0).length}
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#276749]" />
            <h3 className="text-sm font-semibold text-[#202820]">Customer Directory</h3>
          </div>
          <button onClick={fetchCustomers} className="text-xs text-[#69736B] hover:text-[#276749] transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#276749] animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-[#E3E7E1] mx-auto mb-3" />
            <p className="text-sm text-[#69736B]">No customers found</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-[#276749] hover:underline font-medium"
            >
              Add your first customer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E3E7E1]">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Customer</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Phone</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Email</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Outstanding</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-[#69736B] uppercase tracking-wider">Since</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E7E1]">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => fetchCustomerDetail(customer.id)}
                    className="hover:bg-[#F7F7F2] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="font-medium text-[#202820]">{customer.name}</div>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-[#69736B]">{customer.phone || '—'}</td>
                    <td className="py-3 px-6 text-[#69736B]">{customer.email || '—'}</td>
                    <td className={`py-3 px-6 text-right font-medium tabular-nums ${
                      Number(customer.outstanding_balance || 0) > 0 ? 'text-[#EA580C]' : 'text-[#276749]'
                    }`}>
                      {formatETB(Number(customer.outstanding_balance || 0))}
                    </td>
                    <td className="py-3 px-6 text-right text-[#69736B] text-xs">
                      {new Date(customer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); fetchCustomers(); }}
        />
      )}

      {/* Loading overlay for detail fetch */}
      {loadingDetail && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#276749]" />
            <span className="text-sm text-[#202820]">Loading customer details...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Add Customer Modal
const AddCustomerModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Customer name is required'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await authFetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create customer');
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
          <h3 className="text-base font-semibold text-[#202820]">Add New Customer</h3>
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
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Customer Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Abebe Kebede"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820]
                placeholder:text-[#69736B]/50 focus:outline-none focus:ring-2 focus:ring-[#276749]/20 focus:border-[#276749]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#69736B] mb-1.5">Phone</label>
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
              placeholder="email@example.com"
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
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Customers;
