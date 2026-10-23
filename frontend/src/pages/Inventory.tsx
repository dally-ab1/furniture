import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  Package, 
  Search, 
  Plus, 
  SlidersHorizontal, 
  AlertTriangle, 
  History, 
  CheckCircle2, 
  X, 
  Loader2,
  Warehouse,
  Store,
  Tag,
  Trash2
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

interface LocationStock {
  quantity: number;
  locations: {
    id: string;
    name: string;
    type: 'SHOP' | 'WAREHOUSE' | 'FACTORY';
  };
}

interface Product {
  id: string;
  sku: string;
  name: string;
  type: 'FINISHED_GOOD' | 'RAW_MATERIAL';
  unit_of_measure: string;
  selling_price: number;
  cost_price: number;
  min_stock_level: number;
  is_active: boolean;
  categories?: {
    id: string;
    name: string;
  };
  stock_levels?: LocationStock[];
}

interface Category {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  type: string;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string;
  created_at: string;
  product?: { sku: string; name: string; unit_of_measure: string };
  location?: { name: string; type: string };
}

export const Inventory: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FINISHED_GOOD' | 'RAW_MATERIAL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<'ALL' | 'LOW_STOCK'>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Forms
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    type: 'FINISHED_GOOD' as 'FINISHED_GOOD' | 'RAW_MATERIAL',
    categoryId: '',
    unitOfMeasure: 'pcs',
    sellingPrice: 0,
    costPrice: 0,
    minStockLevel: 5,
    initialLocationId: '',
    initialQuantity: 0,
  });

  const [adjustment, setAdjustment] = useState({
    productId: '',
    locationId: '',
    newQuantity: 0,
    reason: '',
  });

  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Load Products, Categories, Locations
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [prodRes, catRes, locRes] = await Promise.all([
        authFetch(`${API_BASE}/products`),
        authFetch(`${API_BASE}/products/categories`),
        authFetch(`${API_BASE}/products/locations`),
      ]);

      const prodData = await prodRes.json();
      const catData = await catRes.json();
      const locData = await locRes.json();

      if (prodData.success) setProducts(prodData.data);
      if (catData.success) setCategories(catData.data);
      if (locData.success) setLocations(locData.data);
    } catch {
      setError('Unable to fetch inventory data from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch movement ledger
  const fetchMovements = async (prodId?: string) => {
    try {
      setMovementsLoading(true);
      const url = prodId 
        ? `${API_BASE}/products/movements?productId=${prodId}`
        : `${API_BASE}/products/movements?limit=40`;
      const res = await authFetch(url);
      const data = await res.json();
      if (data.success) setMovements(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setMovementsLoading(false);
    }
  };

  // Helper calculations
  const getProductStock = (product: Product, locType?: 'SHOP' | 'WAREHOUSE') => {
    if (!product.stock_levels || product.stock_levels.length === 0) return 0;
    if (locType) {
      const match = product.stock_levels.find(s => s.locations?.type === locType);
      return match ? Number(match.quantity) : 0;
    }
    return product.stock_levels.reduce((acc, curr) => acc + Number(curr.quantity), 0);
  };

  const isLowStock = (product: Product) => {
    const total = getProductStock(product);
    return total <= product.min_stock_level;
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === 'ALL' || p.type === typeFilter;
      const matchesCategory = categoryFilter === 'ALL' || p.categories?.id === categoryFilter;
      const matchesStockStatus = stockStatusFilter === 'ALL' || (stockStatusFilter === 'LOW_STOCK' && isLowStock(p));

      return matchesSearch && matchesType && matchesCategory && matchesStockStatus;
    });
  }, [products, searchQuery, typeFilter, categoryFilter, stockStatusFilter]);

  // Handle New Product Submission
    // Soft-delete product to Recovery Center
  const handleDeleteProduct = async (product: Product) => {
    const reason = window.prompt(
      `Are you sure you want to move "${product.name}" (${product.sku}) to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/products/${product.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete product');
      }
      alert(`Product "${product.name}" moved to Recovery Center. Existing stock quantities are safely preserved.`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error deleting product');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: newProduct.sku,
          name: newProduct.name,
          type: newProduct.type,
          categoryId: newProduct.categoryId || undefined,
          unitOfMeasure: newProduct.unitOfMeasure,
          sellingPrice: Number(newProduct.sellingPrice),
          costPrice: Number(newProduct.costPrice),
          minStockLevel: Number(newProduct.minStockLevel),
          initialLocationId: newProduct.initialLocationId || undefined,
          initialQuantity: Number(newProduct.initialQuantity) || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to create product');
        return;
      }

      setShowAddModal(false);
      setNewProduct({
        sku: '',
        name: '',
        type: 'FINISHED_GOOD',
        categoryId: '',
        unitOfMeasure: 'pcs',
        sellingPrice: 0,
        costPrice: 0,
        minStockLevel: 5,
        initialLocationId: '',
        initialQuantity: 0,
      });
      fetchData();
    } catch {
      alert('Error connecting to server.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Stock Adjustment
  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/products/adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustment.productId,
          locationId: adjustment.locationId,
          newQuantity: Number(adjustment.newQuantity),
          reason: adjustment.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Adjustment failed');
        return;
      }

      setShowAdjustModal(false);
      setAdjustment({ productId: '', locationId: '', newQuantity: 0, reason: '' });
      fetchData();
    } catch {
      alert('Error executing adjustment');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#202820] tracking-tight">Products & Inventory</h1>
          <p className="text-xs text-[#69736B] mt-1">
            Real-time stock ledger, physical locations, and atomic inventory tracking in ETB
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowMovementsModal(true);
              fetchMovements();
            }}
            className="px-4 py-2 bg-white hover:bg-[#F7F7F2] text-[#202820] font-medium text-xs rounded-xl border border-[#E3E7E1] transition-all flex items-center gap-2 shadow-2xs"
          >
            <History className="w-4 h-4 text-[#69736B]" />
            Audit Movements
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#276749] hover:bg-[#234A34] text-white font-medium text-xs rounded-xl transition-all flex items-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E3E7E1] shadow-2xs">
          <div className="flex items-center justify-between text-[#69736B] text-xs font-medium mb-1.5">
            <span>Total Catalog Items</span>
            <Package className="w-4 h-4 text-[#276749]" />
          </div>
          <div className="text-2xl font-bold text-[#202820] tracking-tight tabular-nums">
            {products.length}
          </div>
          <div className="text-[11px] text-[#69736B] mt-1">
            {products.filter(p => p.type === 'FINISHED_GOOD').length} Finished &middot; {products.filter(p => p.type === 'RAW_MATERIAL').length} Raw Materials
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E3E7E1] shadow-2xs">
          <div className="flex items-center justify-between text-[#69736B] text-xs font-medium mb-1.5">
            <span>Main Shop Stock</span>
            <Store className="w-4 h-4 text-[#276749]" />
          </div>
          <div className="text-2xl font-bold text-[#202820] tracking-tight tabular-nums">
            {products.reduce((acc, p) => acc + getProductStock(p, 'SHOP'), 0)}
          </div>
          <div className="text-[11px] text-[#69736B] mt-1">Available for immediate showroom sale</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E3E7E1] shadow-2xs">
          <div className="flex items-center justify-between text-[#69736B] text-xs font-medium mb-1.5">
            <span>Central Warehouse</span>
            <Warehouse className="w-4 h-4 text-[#276749]" />
          </div>
          <div className="text-2xl font-bold text-[#202820] tracking-tight tabular-nums">
            {products.reduce((acc, p) => acc + getProductStock(p, 'WAREHOUSE'), 0)}
          </div>
          <div className="text-[11px] text-[#69736B] mt-1">Factory supply & bulk inventory</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E3E7E1] shadow-2xs">
          <div className="flex items-center justify-between text-[#69736B] text-xs font-medium mb-1.5">
            <span>Low Stock Alerts</span>
            <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
          </div>
          <div className="text-2xl font-bold text-[#DC2626] tracking-tight tabular-nums">
            {products.filter(isLowStock).length}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-1">Items at or below safety threshold</div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E3E7E1] shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 text-[#69736B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by SKU or item name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F7F7F2] text-xs text-[#202820] placeholder-[#69736B] rounded-xl pl-9 pr-3 py-2 border border-[#E3E7E1] focus:outline-none focus:border-[#276749]"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex items-center bg-[#F7F7F2] p-1 rounded-xl border border-[#E3E7E1]">
            <button
              onClick={() => setTypeFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                typeFilter === 'ALL' ? 'bg-white text-[#202820] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('FINISHED_GOOD')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                typeFilter === 'FINISHED_GOOD' ? 'bg-white text-[#202820] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
              }`}
            >
              Finished Furniture
            </button>
            <button
              onClick={() => setTypeFilter('RAW_MATERIAL')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                typeFilter === 'RAW_MATERIAL' ? 'bg-white text-[#202820] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
              }`}
            >
              Raw Materials
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#F7F7F2] text-xs text-[#202820] rounded-xl px-3 py-2 border border-[#E3E7E1] focus:outline-none focus:border-[#276749]"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Low Stock Toggle */}
        <button
          onClick={() => setStockStatusFilter(prev => prev === 'ALL' ? 'LOW_STOCK' : 'ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
            stockStatusFilter === 'LOW_STOCK'
              ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#DC2626]'
              : 'bg-[#F7F7F2] border-[#E3E7E1] text-[#69736B] hover:text-[#202820]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Low Stock Only</span>
        </button>
      </div>

      {/* Main Inventory Table */}
      <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-[#69736B]">
            <Loader2 className="w-8 h-8 animate-spin text-[#276749] mb-3" />
            <p className="text-xs font-medium">Loading inventory records...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 text-xs">
            {error}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-16 text-center text-[#69736B]">
            <Package className="w-10 h-10 mx-auto text-[#9CA3AF] mb-3 stroke-[1.5]" />
            <p className="text-sm font-semibold text-[#202820]">No items matched your filters</p>
            <p className="text-xs text-[#9CA3AF] mt-1">Try adjusting your search query or category filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F7F7F2]/60 border-b border-[#E3E7E1] text-[#69736B] font-medium select-none">
                  <th className="py-3 px-5">SKU & Item Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Selling Price</th>
                  <th className="py-3 px-4 text-right">Cost Price</th>
                  <th className="py-3 px-4 text-center">Shop</th>
                  <th className="py-3 px-4 text-center">Warehouse</th>
                  <th className="py-3 px-4 text-center">Total Stock</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E7E1]">
                {filteredProducts.map((p) => {
                  const shopQty = getProductStock(p, 'SHOP');
                  const whQty = getProductStock(p, 'WAREHOUSE');
                  const totalQty = getProductStock(p);
                  const isLow = totalQty <= p.min_stock_level;

                  return (
                    <tr key={p.id} className="hover:bg-[#F7F7F2]/40 transition-colors">
                      {/* SKU & Name */}
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-[#202820] flex items-center gap-2">
                          <span>{p.name}</span>
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">
                              LOW
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#69736B] mt-0.5">
                          {p.sku} &middot; {p.unit_of_measure}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 text-[#202820]">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-[#F7F7F2] border border-[#E3E7E1] text-[#69736B]">
                          <Tag className="w-3 h-3 text-[#9CA3AF]" />
                          {p.categories?.name || 'Unassigned'}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                          p.type === 'FINISHED_GOOD'
                            ? 'bg-[#EAF3EC] text-[#276749]'
                            : 'bg-[#EFF6FF] text-[#1D4ED8]'
                        }`}>
                          {p.type === 'FINISHED_GOOD' ? 'Finished Good' : 'Raw Material'}
                        </span>
                      </td>

                      {/* Selling Price */}
                      <td className="py-3.5 px-4 text-right font-medium tabular-nums text-[#202820]">
                        {p.type === 'FINISHED_GOOD' 
                          ? `${Number(p.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB` 
                          : '—'
                        }
                      </td>

                      {/* Cost Price */}
                      <td className="py-3.5 px-4 text-right text-[#69736B] tabular-nums">
                        {Number(p.cost_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                      </td>

                      {/* Shop Stock */}
                      <td className="py-3.5 px-4 text-center tabular-nums text-[#202820] font-medium">
                        {shopQty}
                      </td>

                      {/* Warehouse Stock */}
                      <td className="py-3.5 px-4 text-center tabular-nums text-[#202820] font-medium">
                        {whQty}
                      </td>

                      {/* Total Stock */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md font-bold tabular-nums text-xs ${
                          isLow ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#EAF3EC] text-[#276749]'
                        }`}>
                          {totalQty} {p.unit_of_measure}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedProduct(p);
                              setAdjustment({
                                productId: p.id,
                                locationId: locations[0]?.id || '',
                                newQuantity: totalQty,
                                reason: 'Routine physical count adjustment',
                              });
                              setShowAdjustModal(true);
                            }}
                            className="px-2.5 py-1 text-[11px] bg-white hover:bg-[#F7F7F2] text-[#276749] font-semibold border border-[#E3E7E1] rounded-lg transition-all shadow-2xs"
                          >
                            Adjust
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              className="p-1 text-[#69736B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors border border-transparent hover:border-[#FCA5A5]"
                              title="Move to Recovery Center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* MODAL: ADD PRODUCT */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#E3E7E1]">
              <h2 className="text-base font-bold text-[#202820]">Create New Catalog Item</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">SKU / Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FN-CH-010"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Item Type *</label>
                  <select
                    value={newProduct.type}
                    onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value as any })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  >
                    <option value="FINISHED_GOOD">Finished Furniture</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#202820] mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 4-Seater Coffee Table"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Category</label>
                  <select
                    value={newProduct.categoryId}
                    onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Unit of Measure *</label>
                  <input
                    type="text"
                    required
                    placeholder="pcs, m, sheet, box..."
                    value={newProduct.unitOfMeasure}
                    onChange={(e) => setNewProduct({ ...newProduct, unitOfMeasure: e.target.value })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Selling Price (ETB)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.sellingPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Cost Price (ETB)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#202820] mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    min="0"
                    value={newProduct.minStockLevel}
                    onChange={(e) => setNewProduct({ ...newProduct, minStockLevel: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                  />
                </div>
              </div>

              {/* Initial Stock Intake */}
              <div className="p-3 bg-[#F7F7F2] rounded-xl border border-[#E3E7E1] space-y-2.5">
                <div className="text-[11px] font-semibold text-[#202820]">Initial Opening Stock (Optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[#69736B] mb-1">Location</label>
                    <select
                      value={newProduct.initialLocationId}
                      onChange={(e) => setNewProduct({ ...newProduct, initialLocationId: e.target.value })}
                      className="w-full bg-white px-2.5 py-1.5 text-xs rounded-lg border border-[#E3E7E1] outline-none focus:border-[#276749]"
                    >
                      <option value="">None</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#69736B] mb-1">Initial Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={newProduct.initialQuantity}
                      onChange={(e) => setNewProduct({ ...newProduct, initialQuantity: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white px-2.5 py-1.5 text-xs rounded-lg border border-[#E3E7E1] outline-none focus:border-[#276749]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#69736B] hover:text-[#202820]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#E3E7E1]">
              <div>
                <h2 className="text-base font-bold text-[#202820]">Stock Adjustment</h2>
                <p className="text-xs text-[#69736B] mt-0.5">{selectedProduct.name} ({selectedProduct.sku})</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStockAdjustment} className="space-y-4 pt-4">
              <div>
                <label className="block text-[11px] font-medium text-[#202820] mb-1">Physical Location *</label>
                <select
                  required
                  value={adjustment.locationId}
                  onChange={(e) => setAdjustment({ ...adjustment, locationId: e.target.value })}
                  className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#202820] mb-1">New Verified Count *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={adjustment.newQuantity}
                  onChange={(e) => setAdjustment({ ...adjustment, newQuantity: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#202820] mb-1">Adjustment Reason / Notes *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Monthly physical audit count adjustment or damaged stock disposal"
                  value={adjustment.reason}
                  onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
                  className="w-full bg-[#F7F7F2] px-3 py-2 text-xs rounded-xl border border-[#E3E7E1] outline-none focus:border-[#276749]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#69736B] hover:text-[#202820]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MOVEMENTS AUDIT TRAIL */}
      {showMovementsModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] max-w-3xl w-full p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-[#E3E7E1]">
              <div>
                <h2 className="text-base font-bold text-[#202820]">Immutable Inventory Movement Ledger</h2>
                <p className="text-xs text-[#69736B] mt-0.5">Auditable history of all receipts, sales deductions, and adjustments</p>
              </div>
              <button onClick={() => setShowMovementsModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {movementsLoading ? (
                <div className="p-12 text-center text-[#69736B]">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#276749]" />
                  <p className="text-xs">Loading ledger entries...</p>
                </div>
              ) : movements.length === 0 ? (
                <div className="p-12 text-center text-[#69736B] text-xs">
                  No movement records found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E3E7E1] text-[#69736B] font-medium bg-[#F7F7F2]/50">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3">Location</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Delta Qty</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E7E1]">
                    {movements.map((m) => {
                      const isPositive = Number(m.quantity) > 0;
                      return (
                        <tr key={m.id} className="hover:bg-[#F7F7F2]/40">
                          <td className="py-2.5 px-3 text-[#69736B] whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#202820]">
                            {m.product?.name || 'Item'}
                          </td>
                          <td className="py-2.5 px-3 text-[#69736B]">
                            {m.location?.name}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F7F7F2] border border-[#E3E7E1] text-[#69736B]">
                              {m.movement_type}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                            isPositive ? 'text-[#276749]' : 'text-[#DC2626]'
                          }`}>
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-[#69736B] max-w-[200px] truncate">
                            {m.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
