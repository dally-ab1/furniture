import React, { useState, useEffect, useCallback } from 'react';
import {
  Cog, Plus, Search, Filter, Calendar, CheckCircle2, Clock,
  Layers, FileText, Trash2, Check, X,
  TrendingUp, ShieldAlert, ChevronDown, ChevronRight, Loader2,
  PackageCheck, User, Pencil
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


interface Product {
  id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  cost_price: number;
  selling_price: number;
  type?: string;
}

interface BomItem {
  id: string;
  quantity: number;
  waste_tolerance_pct: number;
  raw_material: {
    id: string;
    sku: string;
    name: string;
    unit_of_measure: string;
    cost_price: number;
  };
}

interface Bom {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  product: Product;
  items: BomItem[];
  created_at: string;
}

interface MaterialIssue {
  id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  issued_at: string;
  raw_material: {
    sku: string;
    name: string;
    unit_of_measure: string;
  };
}

interface ProductionOrder {
  id: string;
  order_number: string;
  target_quantity: number;
  completed_quantity: number;
  waste_quantity: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  progress_pct: number;
  due_date: string | null;
  total_material_cost: number;
  labor_cost: number;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  product: Product;
  bom: {
    id: string;
    name: string;
    version: number;
    items?: BomItem[];
  };
  location: {
    id: string;
    name: string;
    type: string;
  };
  material_issues?: MaterialIssue[];
  customer_id?: string | null;
  sale_id?: string | null;
  customer?: { id: string; name: string; phone: string } | null;
  sale?: { id: string; invoice_number: string; total_amount: number; status: string } | null;
}

interface Location {
  id: string;
  name: string;
  type: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

const formatETB = (val: number): string => {
  return `ETB ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const Manufacturing: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'orders' | 'boms'>('orders');
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [selectedOrderForIssue, setSelectedOrderForIssue] = useState<ProductionOrder | null>(null);
  const [selectedOrderForComplete, setSelectedOrderForComplete] = useState<ProductionOrder | null>(null);

  // New Order Form state
  const [newOrderProduct, setNewOrderProduct] = useState('');
  const [newOrderBom, setNewOrderBom] = useState('');
  const [newOrderLocation, setNewOrderLocation] = useState('');
  const [newOrderQuantity, setNewOrderQuantity] = useState(1);
  const [newOrderDueDate, setNewOrderDueDate] = useState('');
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editBom, setEditBom] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editCustomer, setEditCustomer] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Issue Materials Form state
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueLocationId, setIssueLocationId] = useState('');

  // Complete Order Form state
  const [completeQuantity, setCompleteQuantity] = useState<number>(0);
  const [wasteQuantity, setWasteQuantity] = useState<number>(0);
  const [laborCost, setLaborCost] = useState<number>(0);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  // Expanded BOM state
  const [expandedBomId, setExpandedBomId] = useState<string | null>(null);

  // Fetch all core data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, bomsRes, locsRes, prodsRes, custsRes] = await Promise.all([
        authFetch(`${API_BASE}/manufacturing/orders`),
        authFetch(`${API_BASE}/manufacturing/boms`),
        authFetch(`${API_BASE}/products/locations`),
        authFetch(`${API_BASE}/products`),
        authFetch(`${API_BASE}/customers`),
      ]);

      const [ordersJson, bomsJson, locsJson, prodsJson, custsJson] = await Promise.all([
        ordersRes.json(),
        bomsRes.json(),
        locsRes.json(),
        prodsRes.json(),
        custsRes.json(),
      ]);

      if (ordersJson.success) setOrders(ordersJson.data || []);
      if (bomsJson.success) setBoms(bomsJson.data || []);
      if (locsJson.success) setLocations(locsJson.data || []);
      if (prodsJson.success) setProducts(prodsJson.data || []);
      if (custsJson.success) setCustomers(custsJson.data || []);
    } catch (err) {
      console.error('Failed to fetch manufacturing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When selected product changes in create order modal, auto-select its active BOM
  useEffect(() => {
    if (newOrderProduct) {
      const matchingBom = boms.find(b => b.product.id === newOrderProduct && b.is_active);
      if (matchingBom) {
        setNewOrderBom(matchingBom.id);
      } else {
        setNewOrderBom('');
      }
    }
  }, [newOrderProduct, boms]);

  // Handle Create Production Order Submit
    // Soft-delete BOM to Recovery Center
  const handleDeleteBom = async (bom: Bom) => {
    const reason = window.prompt(
      `Are you sure you want to move BOM "${bom.name}" to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/manufacturing/boms/${bom.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete BOM');
      }
      alert(`BOM "${bom.name}" moved to Recovery Center.`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error deleting BOM');
    }
  };

  // Soft-delete / Cancel Production Order to Recovery Center
  const handleDeleteOrder = async (order: ProductionOrder) => {
    const reason = window.prompt(
      `Are you sure you want to move Production Order "${order.order_number}" to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/manufacturing/orders/${order.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete production order');
      }
      alert(`Production Order "${order.order_number}" moved to Recovery Center.`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error deleting production order');
    }
  };

  // Cancel Production Order with option to return raw materials
  const handleCancelOrder = async (order: ProductionOrder) => {
    let returnMaterials = false;
    if (order.status === "IN_PROGRESS") {
      returnMaterials = window.confirm(
        "Cancel order " + order.order_number + "?\n\nClick OK to return issued raw materials back to inventory.\nClick Cancel to cancel order without returning raw materials."
      );
    } else if (!window.confirm("Cancel planned production order " + order.order_number + "?")) {
      return;
    }
    const reason = window.prompt("Reason for cancelling production order (optional):", "Cancelled by staff") || "Cancelled by staff";
    try {
      const res = await authFetch(API_BASE + "/manufacturing/orders/" + order.id + "/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnMaterials, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to cancel production order");
      alert("Production order " + order.order_number + " cancelled successfully.");
      fetchData();
    } catch (err: any) {
      alert(err.message || "Error cancelling production order");
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderProduct || !newOrderBom || !newOrderLocation || newOrderQuantity <= 0) {
      alert('Please fill out all required fields.');
      return;
    }

    setOrderSubmitting(true);
    try {
      // 1. Fetch next order number
      const numRes = await authFetch(`${API_BASE}/manufacturing/orders/next-number`);
      const numJson = await numRes.json();
      const orderNumber = numJson.orderNumber || `MO-${Date.now().toString().slice(-5)}`;

      // 2. Submit order
      const res = await authFetch(`${API_BASE}/manufacturing/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          productId: newOrderProduct,
          bomId: newOrderBom,
          locationId: newOrderLocation,
          targetQuantity: Number(newOrderQuantity),
          dueDate: newOrderDueDate || undefined,
          notes: newOrderNotes || undefined,
          customerId: newOrderCustomer || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create production order');
      }

      setShowCreateOrderModal(false);
      resetOrderForm();
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error creating production order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const resetOrderForm = () => {
    setNewOrderProduct('');
    setNewOrderBom('');
    setNewOrderLocation('');
    setNewOrderQuantity(1);
    setNewOrderDueDate('');
    setNewOrderNotes('');
    setNewOrderCustomer('');
  };

    // Handle Open Edit Modal
  const handleOpenEditModal = (order: ProductionOrder) => {
    setEditingOrder(order);
    setEditQuantity(Number(order.target_quantity) || 1);
    setEditBom(order.bom?.id || '');
    setEditLocation(order.location?.id || '');
    setEditDueDate(order.due_date ? order.due_date.split('T')[0] : '');
    setEditNotes(order.notes || '');
    setEditCustomer(order.customer_id || order.customer?.id || '');
  };

  // Handle Save Edit Submit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setEditSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE}/manufacturing/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetQuantity: Number(editQuantity),
          bomId: editBom || undefined,
          locationId: editLocation || undefined,
          dueDate: editDueDate || null,
          notes: editNotes || null,
          customerId: editingOrder.sale_id ? undefined : (editCustomer || null),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update production order');
      }

      setEditingOrder(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error updating production order');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Issue Materials Submit
  const handleIssueMaterials = async () => {
    if (!selectedOrderForIssue) return;
    const matchingBom = boms.find(b => b.id === selectedOrderForIssue.bom.id);
    if (!matchingBom || !matchingBom.items || matchingBom.items.length === 0) {
      setIssueError('No BOM recipe items found for this order.');
      return;
    }

    setIssueSubmitting(true);
    setIssueError(null);
    try {
      // Build material items array: BOM qty per unit * target quantity
      const itemsToIssue = matchingBom.items.map(item => {
        const qtyRequired = Number(item.quantity) * Number(selectedOrderForIssue.target_quantity);
        return {
          rawMaterialId: item.raw_material.id,
          quantity: qtyRequired,
          unitCost: Number(item.raw_material.cost_price || 0),
        };
      });

      const res = await authFetch(`${API_BASE}/manufacturing/orders/${selectedOrderForIssue.id}/issue-materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: issueLocationId || selectedOrderForIssue.location.id,
          items: itemsToIssue,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to issue materials');
      }

      setSelectedOrderForIssue(null);
      fetchData();
    } catch (err: any) {
      setIssueError(err.message);
    } finally {
      setIssueSubmitting(false);
    }
  };

  // Handle Complete Order Submit
  const handleCompleteOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForComplete || completeQuantity <= 0) {
      alert('Please enter a valid completed quantity.');
      return;
    }

    setCompleteSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE}/manufacturing/orders/${selectedOrderForComplete.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedQuantity: Number(completeQuantity),
          wasteQuantity: Number(wasteQuantity),
          laborCost: Number(laborCost),
          notes: completeNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to complete production order');
      }

      setSelectedOrderForComplete(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error completing order');
    } finally {
      setCompleteSubmitting(false);
    }
  };

  // Filtered Orders
  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      o.product.name.toLowerCase().includes(search.toLowerCase()) ||
      o.product.sku.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: ProductionOrder['status']) => {
    switch (status) {
      case 'PLANNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
            <Clock className="w-3.5 h-3.5" />
            Planned
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            <TrendingUp className="w-3.5 h-3.5" />
            In Progress
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            <X className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#202820]">Manufacturing & Production</h1>
          <p className="text-sm text-[#69736B] mt-0.5">
            Manage Bill of Materials (BOM) recipes, production orders, and material consumption
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateOrderModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Production Order
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E3E7E1] mb-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 py-3 px-5 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'orders'
              ? 'border-[#276749] text-[#276749]'
              : 'border-transparent text-[#69736B] hover:text-[#202820]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Production Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('boms')}
          className={`flex items-center gap-2 py-3 px-5 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'boms'
              ? 'border-[#276749] text-[#276749]'
              : 'border-transparent text-[#69736B] hover:text-[#202820]'
          }`}
        >
          <FileText className="w-4 h-4" />
          Bills of Materials / Recipes ({boms.length})
        </button>
      </div>

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div>
          {/* Controls Bar */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#8C948D] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search orders by number or finished product..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm placeholder:text-[#8C948D] focus:outline-hidden focus:border-[#276749] transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#69736B]" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-white border border-[#E3E7E1] rounded-xl px-3 py-2 text-xs font-medium text-[#202820] focus:outline-hidden focus:border-[#276749]"
              >
                <option value="ALL">All Statuses</option>
                <option value="PLANNED">Planned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#276749]" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center p-12 text-[#69736B]">
                <Layers className="w-10 h-10 mx-auto mb-3 text-[#C8CEC7]" />
                <p className="text-sm font-medium">No production orders found.</p>
                <p className="text-xs text-[#8C948D] mt-1">Create a new order to begin factory manufacturing.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold uppercase tracking-wider text-[#69736B]">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Finished Product</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Factory Location</th>
                    <th className="py-3 px-4 text-center">Batch Target</th>
                    <th className="py-3 px-4 text-center">Completed</th>
                    <th className="py-3 px-4">Cost (Material / Labor)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E1]">
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-[#FAFBF9]/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#202820]">
                        {order.order_number}
                        {order.due_date && (
                          <div className="text-[11px] font-normal text-[#8C948D] flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" /> Due {order.due_date}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#202820]">{order.product.name}</div>
                        <div className="text-xs text-[#8C948D]">SKU: {order.product.sku} • {order.bom.name}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {order.customer ? (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-[#276749]" />
                            <div>
                              <div className="text-xs font-semibold text-[#202820]">{order.customer.name}</div>
                              {order.sale && (
                                <div className="text-[10px] text-[#8C948D]">Invoice: {order.sale.invoice_number}</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#8C948D] italic">Stock production</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#69736B]">
                        {order.location.name}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-[#202820]">
                        {Number(order.target_quantity)} {order.product.unit_of_measure}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-semibold text-[#276749]">
                          {Number(order.completed_quantity)} {order.product.unit_of_measure}
                        </div>
                        {Number(order.waste_quantity) > 0 && (
                          <div className="text-[11px] text-[#DC2626]">
                            +{Number(order.waste_quantity)} scrap
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs tabular-nums">
                        <div className="text-[#202820] font-medium">Mat: {formatETB(Number(order.total_material_cost))}</div>
                        <div className="text-[#8C948D]">Labor: {formatETB(Number(order.labor_cost))}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {order.status === 'PLANNED' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(order)}
                              className="p-1.5 text-[#69736B] hover:text-[#276749] hover:bg-[#EAF3EC] rounded-lg transition-colors border border-transparent hover:border-[#A7D7B5]"
                              title="Edit production order details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleCancelOrder(order)}
                              className="p-1.5 text-[#69736B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors border border-transparent hover:border-[#FCA5A5]"
                              title="Cancel planned production order"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrderForIssue(order);
                                const wh = locations.find(l => l.type === 'WAREHOUSE');
                                setIssueLocationId(wh ? wh.id : order.location.id);
                              }}
                              className="px-3 py-1.5 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                              Issue Materials
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(order)}
                              className="p-1.5 text-[#69736B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors border border-transparent hover:border-[#FCA5A5]"
                              title="Move to Recovery Center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {order.status === 'IN_PROGRESS' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(order)}
                              className="p-1.5 text-[#69736B] hover:text-[#276749] hover:bg-[#EAF3EC] rounded-lg transition-colors border border-transparent hover:border-[#A7D7B5]"
                              title="Edit due date or notes"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrderForComplete(order);
                                setCompleteQuantity(Number(order.target_quantity));
                              }}
                              className="px-3 py-1.5 bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              Complete Order
                            </button>
                            <button
                              onClick={() => handleCancelOrder(order)}
                              className="p-1.5 text-[#69736B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors border border-transparent hover:border-[#FCA5A5]"
                              title="Cancel order & return raw materials"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {order.status === 'COMPLETED' && (
                          <span className="text-xs text-[#15803D] font-medium flex items-center justify-end gap-1">
                            <Check className="w-3.5 h-3.5" /> Done
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* BOMS TAB */}
      {activeTab === 'boms' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#276749]" />
            </div>
          ) : boms.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-2xl border border-[#E3E7E1] text-[#69736B]">
              <FileText className="w-10 h-10 mx-auto mb-3 text-[#C8CEC7]" />
              <p className="text-sm font-medium">No Bill of Materials (BOM) recipes defined yet.</p>
            </div>
          ) : (
            boms.map(bom => {
              const isExpanded = expandedBomId === bom.id;
              // Calculate estimated unit recipe cost
              const estimatedUnitCost = (bom.items || []).reduce((sum, item) => {
                const qty = Number(item.quantity);
                const cost = Number(item.raw_material?.cost_price || 0);
                return sum + (qty * cost);
              }, 0);

              return (
                <div key={bom.id} className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
                  <div
                    onClick={() => setExpandedBomId(isExpanded ? null : bom.id)}
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-[#FAFBF9] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-[#202820] text-base">{bom.name}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF3EC] text-[#276749]">
                            v{bom.version}
                          </span>
                        </div>
                        <div className="text-xs text-[#69736B] mt-0.5">
                          Target Product: <span className="font-semibold text-[#202820]">{bom.product.name}</span> ({bom.product.sku})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[11px] text-[#8C948D]">Est. Material Cost / Unit</div>
                        <div className="text-sm font-bold text-[#276749] tabular-nums">
                          {formatETB(estimatedUnitCost)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBom(bom);
                          }}
                          className="p-1.5 text-[#69736B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                          title="Move BOM to Recovery Center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="text-[#8C948D]">
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Recipe Ingredients */}
                  {isExpanded && (
                    <div className="bg-[#FAFBF9] border-t border-[#E3E7E1] p-5">
                      <div className="text-xs font-semibold text-[#202820] uppercase tracking-wider mb-3">
                        Required Raw Materials per 1 Unit of {bom.product.name}
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[#8C948D] border-b border-[#E3E7E1]">
                            <th className="py-2">Raw Material</th>
                            <th className="py-2 text-center">Required Qty</th>
                            <th className="py-2 text-center">Waste Tolerance</th>
                            <th className="py-2 text-right">Standard Cost</th>
                            <th className="py-2 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E7E1]/60">
                          {bom.items.map(item => {
                            const lineTotal = Number(item.quantity) * Number(item.raw_material?.cost_price || 0);
                            return (
                              <tr key={item.id}>
                                <td className="py-2.5">
                                  <div className="font-semibold text-[#202820]">{item.raw_material.name}</div>
                                  <div className="text-[11px] text-[#8C948D]">SKU: {item.raw_material.sku}</div>
                                </td>
                                <td className="py-2.5 text-center font-bold text-[#202820]">
                                  {Number(item.quantity)} {item.raw_material.unit_of_measure}
                                </td>
                                <td className="py-2.5 text-center text-[#69736B]">
                                  {Number(item.waste_tolerance_pct)}%
                                </td>
                                <td className="py-2.5 text-right tabular-nums text-[#69736B]">
                                  {formatETB(Number(item.raw_material?.cost_price || 0))}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-[#202820] tabular-nums">
                                  {formatETB(lineTotal)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

            {/* MODAL: EDIT PRODUCTION ORDER */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[#276749]" />
                <h3 className="font-bold text-[#202820]">
                  Edit Production Order: {editingOrder.order_number}
                </h3>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="text-[#8C948D] hover:text-[#202820] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editingOrder.sale && (
                <div className="bg-[#EAF3EC] border border-[#A7D7B5] rounded-xl p-3 text-xs text-[#276749] flex items-center gap-2">
                  <User className="w-4 h-4 shrink-0" />
                  <div>
                    <strong>POS Custom Sale:</strong> Linked to invoice{' '}
                    <span className="font-mono font-bold">{editingOrder.sale.invoice_number}</span>
                    {editingOrder.customer && ` for ${editingOrder.customer.name}`}.
                  </div>
                </div>
              )}

              <div className="bg-[#FAFBF9] rounded-xl p-3 border border-[#E3E7E1] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#69736B]">Finished Product</span>
                  <span className="font-semibold text-[#202820]">{editingOrder.product.name} ({editingOrder.product.sku})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#69736B]">Current Status</span>
                  <span className="font-semibold text-[#202820]">{editingOrder.status}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  BOM Recipe *
                </label>
                <select
                  required
                  disabled={editingOrder.status !== 'PLANNED'}
                  value={editBom}
                  onChange={e => setEditBom(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden disabled:bg-[#F7F7F2]"
                >
                  <option value="">Select Recipe...</option>
                  {boms
                    .filter(b => b.product.id === editingOrder.product.id)
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} (v{b.version})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Batch Target Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    disabled={editingOrder.status !== 'PLANNED'}
                    value={editQuantity}
                    onChange={e => setEditQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden disabled:bg-[#F7F7F2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Factory / Workshop *
                  </label>
                  <select
                    required
                    disabled={editingOrder.status !== 'PLANNED'}
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden disabled:bg-[#F7F7F2]"
                  >
                    <option value="">Select Location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Target Due Date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              {!editingOrder.sale && (
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Customer (Optional)
                  </label>
                  <select
                    value={editCustomer}
                    onChange={e => setEditCustomer(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="">No customer (stock production)</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone || 'No phone'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Order Notes / Production Instructions
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="e.g. Expedited priority, custom finish notes..."
                  className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  {editSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PRODUCTION ORDER */}
      {showCreateOrderModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2">
                <Cog className="w-5 h-5 text-[#276749]" />
                <h3 className="font-bold text-[#202820]">Create Production Order</h3>
              </div>
              <button
                onClick={() => setShowCreateOrderModal(false)}
                className="text-[#8C948D] hover:text-[#202820] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Finished Good to Manufacture *
                </label>
                <select
                  required
                  value={newOrderProduct}
                  onChange={e => setNewOrderProduct(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">Select Finished Furniture...</option>
                  {products
                    .filter(p => p.type === 'FINISHED_GOOD')
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  BOM Recipe *
                </label>
                <select
                  required
                  value={newOrderBom}
                  onChange={e => setNewOrderBom(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">Select Recipe...</option>
                  {boms
                    .filter(b => b.product.id === newOrderProduct)
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} (v{b.version})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Batch Target Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={newOrderQuantity}
                    onChange={e => setNewOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Factory / Workshop *
                  </label>
                  <select
                    required
                    value={newOrderLocation}
                    onChange={e => setNewOrderLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="">Select Location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Target Due Date
                </label>
                <input
                  type="date"
                  value={newOrderDueDate}
                  onChange={e => setNewOrderDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Customer (Optional)
                </label>
                <select
                  value={newOrderCustomer}
                  onChange={e => setNewOrderCustomer(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">No customer (stock production)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8C948D] mt-1">Link this production to a customer order</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Order Notes / Production Instructions
                </label>
                <textarea
                  rows={2}
                  value={newOrderNotes}
                  onChange={e => setNewOrderNotes(e.target.value)}
                  placeholder="e.g. Rush order for upcoming showroom display..."
                  className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateOrderModal(false)}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={orderSubmitting}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  {orderSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE MATERIALS */}
      {selectedOrderForIssue && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#276749]" />
                <h3 className="font-bold text-[#202820]">
                  Issue Raw Materials for {selectedOrderForIssue.order_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForIssue(null)}
                className="text-[#8C948D] hover:text-[#202820] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[#FAFBF9] rounded-xl p-4 border border-[#E3E7E1] text-xs text-[#202820]">
                <div className="font-semibold text-sm mb-1">{selectedOrderForIssue.product.name}</div>
                <div className="text-[#69736B]">
                  Target Quantity: <span className="font-bold text-[#202820]">{Number(selectedOrderForIssue.target_quantity)} {selectedOrderForIssue.product.unit_of_measure}</span>
                  {' '}• Order Destination: <span className="font-semibold text-[#202820]">{selectedOrderForIssue.location.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">Issue Raw Materials From Location</label>
                <select
                  value={issueLocationId}
                  onChange={e => setIssueLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>

              {issueError && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{issueError}</span>
                </div>
              )}

              <p className="text-xs text-[#69736B]">
                This will deduct the exact required raw material quantities from{' '}
                <strong>{selectedOrderForIssue.location.name}</strong> inventory with immutable{' '}
                <code className="text-[#276749] font-mono">MFG_CONSUMPTION</code> records.
              </p>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForIssue(null)}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleIssueMaterials}
                  disabled={issueSubmitting}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  {issueSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Issue & Start Production
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPLETE PRODUCTION ORDER */}
      {selectedOrderForComplete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#15803D]" />
                <h3 className="font-bold text-[#202820]">
                  Complete Production Intake: {selectedOrderForComplete.order_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForComplete(null)}
                className="text-[#8C948D] hover:text-[#202820] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteOrder} className="p-6 space-y-4">
              <div className="bg-[#FAFBF9] rounded-xl p-4 border border-[#E3E7E1] text-xs text-[#202820]">
                <div className="font-semibold text-sm mb-1">{selectedOrderForComplete.product.name}</div>
                <div className="text-[#69736B]">
                  Target: {Number(selectedOrderForComplete.target_quantity)} {selectedOrderForComplete.product.unit_of_measure} • Factory: {selectedOrderForComplete.location.name}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Accepted Finished Units *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={completeQuantity}
                    onChange={e => setCompleteQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden font-bold text-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Scrap / Waste Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={wasteQuantity}
                    onChange={e => setWasteQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Direct Labor & Finishing Cost (ETB)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborCost}
                  onChange={e => setLaborCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Completion Notes / Quality Check
                </label>
                <textarea
                  rows={2}
                  value={completeNotes}
                  onChange={e => setCompleteNotes(e.target.value)}
                  placeholder="e.g. Quality inspection passed, loaded onto finished warehouse racks."
                  className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <p className="text-xs text-[#69736B]">
                Completing will atomically increase stock of{' '}
                <strong>{selectedOrderForComplete.product.name}</strong> by{' '}
                <strong>{completeQuantity}</strong> units at{' '}
                <strong>{selectedOrderForComplete.location.name}</strong> with a{' '}
                <code className="text-[#276749] font-mono">MFG_OUTPUT</code> inventory movement.
              </p>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForComplete(null)}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={completeSubmitting}
                  className="px-5 py-2 bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  {completeSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm & Intake Finished Goods
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Manufacturing;
