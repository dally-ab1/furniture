import React, { useState, useEffect, useMemo } from 'react';
import { authFetch, API_BASE } from '../services/api';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Receipt, 
  User, 
  MapPin, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Printer, 
  X, 
  Loader2,
  Hammer,
  Package
} from 'lucide-react';


interface Product {
  id: string;
  sku: string;
  name: string;
  type: 'FINISHED_GOOD' | 'RAW_MATERIAL';
  unit_of_measure: string;
  selling_price: number;
  cost_price: number;
  min_stock_level: number;
  categories?: { id: string; name: string };
  stock_levels?: {
    quantity: number;
    locations: { id: string; name: string; type: string };
  }[];
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
}

interface Location {
  id: string;
  name: string;
  type: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  costPrice: number;
}

interface SaleRecord {
  id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: 'PAID' | 'PARTIAL' | 'CREDIT' | 'PENDING_PRODUCTION';
  created_at: string;
  customer?: { id: string; name: string; phone: string | null };
  location?: { id: string; name: string };
}

export const Sales: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'POS' | 'HISTORY'>('POS');
  
  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('INV-00001');

  // POS State
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    try { return sessionStorage.getItem('furnierp_pos_customer_id') || ''; } catch { return ''; }
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    try { return sessionStorage.getItem('furnierp_pos_search') || ''; } catch { return ''; }
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('furnierp_pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Safe draft persistence across refresh / tab switches (never auto-submits)
  useEffect(() => {
    try {
      if (cart.length > 0) {
        sessionStorage.setItem('furnierp_pos_cart', JSON.stringify(cart));
      } else {
        sessionStorage.removeItem('furnierp_pos_cart');
      }
    } catch {}
  }, [cart]);

  useEffect(() => {
    try {
      if (selectedCustomerId) {
        sessionStorage.setItem('furnierp_pos_customer_id', selectedCustomerId);
      } else {
        sessionStorage.removeItem('furnierp_pos_customer_id');
      }
    } catch {}
  }, [selectedCustomerId]);

  useEffect(() => {
    try {
      if (searchQuery) {
        sessionStorage.setItem('furnierp_pos_search', searchQuery);
      } else {
        sessionStorage.removeItem('furnierp_pos_search');
      }
    } catch {}
  }, [searchQuery]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'EBIRR' | 'BANK_TRANSFER' | 'CBE_BIRR'>('CASH');
  const [notes, setNotes] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Completed Invoice Modal
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Custom Order Modal
  const [showCustomOrderModal, setShowCustomOrderModal] = useState(false);
  const [customOrderProduct, setCustomOrderProduct] = useState<any>(null);
  const [customOrderCustomerId, setCustomOrderCustomerId] = useState('');
  const [customOrderDeposit, setCustomOrderDeposit] = useState('');
  const [customOrderPaymentMethod, setCustomOrderPaymentMethod] = useState<'CASH' | 'EBIRR' | 'BANK_TRANSFER' | 'CBE_BIRR'>('CASH');
  const [customOrderNotes, setCustomOrderNotes] = useState('');
  const [customOrderSubmitting, setCustomOrderSubmitting] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  // Load initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodRes, custRes, locRes, invRes, salesRes] = await Promise.all([
        authFetch(`${API_BASE}/products?type=FINISHED_GOOD`),
        authFetch(`${API_BASE}/customers`),
        authFetch(`${API_BASE}/products/locations`),
        authFetch(`${API_BASE}/sales/next-invoice-number`),
        authFetch(`${API_BASE}/sales`),
      ]);

      const prodData = await prodRes.json();
      const custData = await custRes.json();
      const locData = await locRes.json();
      const invData = await invRes.json();
      const salesData = await salesRes.json();

      if (prodData.success) setProducts(prodData.data);
      if (custData.success) {
        setCustomers(custData.data);
        const walkIn = custData.data.find((c: Customer) => c.name.toLowerCase().includes('walk-in'));
        if (walkIn) setSelectedCustomerId(walkIn.id);
        else if (custData.data.length > 0) setSelectedCustomerId(custData.data[0].id);
      }
      if (locData.success && locData.data.length > 0) {
        setLocations(locData.data);
        const shop = locData.data.find((l: Location) => l.type === 'SHOP');
        setSelectedLocationId(shop ? shop.id : locData.data[0].id);
      }
      if (invData.success) setNextInvoiceNumber(invData.invoiceNumber);
      if (salesData.success) setSalesHistory(salesData.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculate stock at selected location
  const getAvailableStock = (product: Product, locationId: string): number => {
    if (!product.stock_levels) return 0;
    const match = product.stock_levels.find(s => s.locations?.id === locationId);
    return match ? Number(match.quantity) : 0;
  };

  // Cart operations
  const addToCart = (product: Product) => {
    const available = getAvailableStock(product, selectedLocationId);
    const existing = cart.find(item => item.product.id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > available) {
      alert(`Cannot add more. Only ${available} ${product.unit_of_measure} available at this location.`);
      return;
    }

    if (existing) {
      setCart(cart.map(item => 
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, {
        product,
        quantity: 1,
        unitPrice: Number(product.selling_price),
        costPrice: Number(product.cost_price),
      }]);
    }
  };

  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;

    const available = getAvailableStock(item.product, selectedLocationId);
    if (newQty > available) {
      alert(`Maximum available stock at this location is ${available} ${item.product.unit_of_measure}.`);
      return;
    }

    setCart(cart.map(i => i.product.id === productId ? { ...i, quantity: newQty } : i));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
    setPaidAmount('');
    setNotes('');
    try {
      sessionStorage.removeItem('furnierp_pos_cart');
      sessionStorage.removeItem('furnierp_pos_customer_id');
      sessionStorage.removeItem('furnierp_pos_search');
    } catch {}
  };

  // Cart Totals
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }, [cart]);

  const totalAmount = useMemo(() => {
    const total = subtotal - Number(discountAmount);
    return total > 0 ? total : 0;
  }, [subtotal, discountAmount]);

  // Actual amount paid (default to total if not typed)
  const actualPaidAmount = paidAmount === '' ? totalAmount : Number(paidAmount);
  const balanceDue = totalAmount - actualPaidAmount > 0 ? totalAmount - actualPaidAmount : 0;

  // Selected Customer details
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Filtered Products for Catalog
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || p.categories?.name === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.categories?.name) set.add(p.categories.name);
    });
    return Array.from(set);
  }, [products]);

  // Submit Sale Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Cart is empty. Add products to cart first.');
      return;
    }

    if (!selectedLocationId) {
      alert('Please select a selling location.');
      return;
    }

    // Verify stock one last time
    for (const item of cart) {
      const avail = getAvailableStock(item.product, selectedLocationId);
      if (item.quantity > avail) {
        alert(`Insufficient stock for "${item.product.name}". Available: ${avail}, Requested: ${item.quantity}`);
        return;
      }
    }

    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const payload = {
        invoiceNumber: nextInvoiceNumber,
        customerId: selectedCustomerId || null,
        locationId: selectedLocationId,
        subtotal,
        discountAmount: Number(discountAmount),
        totalAmount,
        paidAmount: actualPaidAmount,
        paymentMethod: actualPaidAmount > 0 ? paymentMethod : null,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
        })),
        notes: notes || undefined,
      };

      const res = await authFetch(`${API_BASE}/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setCheckoutError(data.error || 'Failed to complete checkout.');
        return;
      }

      // Prepare Invoice Modal Data
      setCompletedInvoice({
        invoiceNumber: nextInvoiceNumber,
        createdAt: new Date().toISOString(),
        customer: selectedCustomer,
        location: locations.find(l => l.id === selectedLocationId),
        items: [...cart],
        subtotal,
        discountAmount,
        totalAmount,
        paidAmount: actualPaidAmount,
        balanceDue,
        paymentMethod,
        status: data.data.status,
      });

      setShowInvoiceModal(true);
      clearCart();
      fetchData(); // Refresh stock & sales history
    } catch {
      setCheckoutError('Network error connecting to API server.');
    } finally {
      setCheckoutLoading(false);
    }
  };


  // Handle Custom Order submission (out-of-stock item for manufacturing)
  const handleCustomOrder = async () => {
    if (!customOrderProduct || !customOrderCustomerId) {
      alert('Please select a customer for the custom order.');
      return;
    }

    setCustomOrderSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE}/sales/custom-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customOrderCustomerId,
          locationId: selectedLocationId,
          items: [{
            productId: customOrderProduct.id,
            quantity: 1,
            unitPrice: Number(customOrderProduct.selling_price),
          }],
          depositAmount: Number(customOrderDeposit) || 0,
          paymentMethod: customOrderPaymentMethod,
          notes: customOrderNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create custom order');
      }

      alert(`Custom order created! Invoice: ${json.data?.invoice_number || 'Created'}. You can now create a manufacturing order for this product.`);
      setShowCustomOrderModal(false);
      setCustomOrderProduct(null);
      setCustomOrderCustomerId('');
      setCustomOrderDeposit('');
      setCustomOrderNotes('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error creating custom order');
    } finally {
      setCustomOrderSubmitting(false);
    }
  };

  // Handle Fulfill PENDING_PRODUCTION sale
  const handleFulfillSale = async (saleId: string) => {
    if (!window.confirm('Fulfill this order? This will deduct stock and complete the sale.')) return;
    
    setFulfillingId(saleId);
    try {
      const res = await authFetch(`${API_BASE}/sales/${saleId}/fulfill`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fulfill order');
      }

      alert('Order fulfilled successfully! Stock has been deducted.');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error fulfilling order');
    } finally {
      setFulfillingId(null);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#202820] tracking-tight">Sales & Point of Sale</h1>
          <p className="text-xs text-[#69736B] mt-1">
            Fast checkout register, instant stock deduction, multiple payment channels & invoice issuance in ETB
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#F7F7F2] p-1 rounded-xl border border-[#E3E7E1]">
          <button
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'POS'
                ? 'bg-white text-[#202820] shadow-2xs'
                : 'text-[#69736B] hover:text-[#202820]'
            }`}
          >
            <ShoppingCart className="w-4 h-4 text-[#276749]" />
            POS Register
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'HISTORY'
                ? 'bg-white text-[#202820] shadow-2xs'
                : 'text-[#69736B] hover:text-[#202820]'
            }`}
          >
            <Receipt className="w-4 h-4 text-[#276749]" />
            Sales History ({salesHistory.length})
          </button>
        </div>
      </div>

      {activeTab === 'POS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 7 COLS: PRODUCT CATALOG */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search & Category Filter */}
            <div className="bg-white p-4 rounded-2xl border border-[#E3E7E1] shadow-2xs space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#69736B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search furniture by SKU or model name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F7F7F2] text-xs text-[#202820] placeholder-[#69736B] rounded-xl pl-9 pr-3 py-2.5 border border-[#E3E7E1] focus:outline-none focus:border-[#276749]"
                  />
                </div>

                {/* Selling Location Switcher */}
                <div className="flex items-center gap-1.5 bg-[#F7F7F2] px-3 py-2 rounded-xl border border-[#E3E7E1]">
                  <MapPin className="w-3.5 h-3.5 text-[#276749]" />
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-[#202820] outline-none cursor-pointer"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                    selectedCategory === 'ALL'
                      ? 'bg-[#276749] text-white shadow-2xs'
                      : 'bg-[#F7F7F2] text-[#69736B] hover:text-[#202820]'
                  }`}
                >
                  All Items
                </button>
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? 'bg-[#276749] text-white shadow-2xs'
                        : 'bg-[#F7F7F2] text-[#69736B] hover:text-[#202820]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {loading ? (
                <div className="col-span-full p-12 text-center text-[#69736B]">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#276749]" />
                  <p className="text-xs">Loading items...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-[#E3E7E1] text-[#69736B] text-xs">
                  No furniture items found matching your criteria.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const stock = getAvailableStock(p, selectedLocationId);
                  const isOutOfStock = stock <= 0;

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isOutOfStock && addToCart(p)}
                      className={`bg-white rounded-2xl border p-4 flex flex-col justify-between transition-all select-none ${
                        isOutOfStock 
                          ? 'border-[#FEE2E2] cursor-default'
                          : 'border-[#E3E7E1] hover:border-[#276749] hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono text-[10px] text-[#69736B] px-1.5 py-0.5 rounded bg-[#F7F7F2]">
                            {p.sku}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            stock > 2 ? 'bg-[#EAF3EC] text-[#276749]' : 'bg-[#FEE2E2] text-[#DC2626]'
                          }`}>
                            {stock} {p.unit_of_measure} left
                          </span>
                        </div>

                        <h3 className="text-xs font-bold text-[#202820] line-clamp-2 leading-snug">
                          {p.name}
                        </h3>
                        <p className="text-[11px] text-[#69736B] mt-0.5">{p.categories?.name || 'Furniture'}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#E3E7E1] flex items-center justify-between">
                        <div className="font-bold text-sm text-[#276749] tabular-nums">
                          {Number(p.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] font-normal text-[#69736B]">ETB</span>
                        </div>
                        {isOutOfStock ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomOrderProduct(p);
                              setShowCustomOrderModal(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-[#92400E] text-white text-[10px] font-bold hover:bg-[#78350F] transition-colors flex items-center gap-1"
                          >
                            <Hammer className="w-3 h-3" />
                            Custom Order
                          </button>
                        ) : (
                          <button
                            className="w-7 h-7 rounded-lg bg-[#276749] text-white flex items-center justify-center hover:bg-[#234A34] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT 5 COLS: ACTIVE CART & REGISTER */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E3E7E1] shadow-2xs p-5 flex flex-col space-y-4">
            {/* Cart Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3EC] text-[#276749] flex items-center justify-center font-bold">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#202820]">Current Sale</h2>
                  <span className="font-mono text-[10px] text-[#69736B]">{nextInvoiceNumber}</span>
                </div>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-[11px] text-[#DC2626] hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Customer Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-[#69736B] flex items-center justify-between">
                <span>Customer</span>
                {selectedCustomer && selectedCustomer.outstanding_balance > 0 && (
                  <span className="text-[#DC2626] font-bold text-[10px]">
                    Debt: {Number(selectedCustomer.outstanding_balance).toLocaleString()} ETB
                  </span>
                )}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-[#69736B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-[#F7F7F2] text-xs font-medium text-[#202820] rounded-xl pl-9 pr-3 py-2 border border-[#E3E7E1] focus:outline-none focus:border-[#276749]"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line Items List */}
            <div className="flex-1 max-h-[300px] overflow-y-auto space-y-2.5 divide-y divide-[#E3E7E1]/60 pr-1">
              {cart.length === 0 ? (
                <div className="p-8 text-center text-[#69736B] text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto text-[#9CA3AF] mb-2 stroke-[1.5]" />
                  Cart is empty. Click any item on the left to add.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="pt-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-[#202820] truncate">
                        {item.product.name}
                      </div>
                      <div className="text-[10px] text-[#69736B] font-mono mt-0.5">
                        {item.unitPrice.toLocaleString()} ETB &times; {item.quantity}
                      </div>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-1.5 bg-[#F7F7F2] border border-[#E3E7E1] rounded-lg p-0.5">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-5 h-5 flex items-center justify-center text-[#69736B] hover:text-[#202820]"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold w-6 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-5 h-5 flex items-center justify-center text-[#69736B] hover:text-[#202820]"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <div className="text-right font-bold text-xs text-[#202820] tabular-nums min-w-[70px]">
                      {(item.quantity * item.unitPrice).toLocaleString()} ETB
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary */}
            <div className="pt-3 border-t border-[#E3E7E1] space-y-2 text-xs">
              <div className="flex justify-between text-[#69736B]">
                <span>Subtotal</span>
                <span className="font-medium text-[#202820] tabular-nums">
                  {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                </span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center justify-between text-[#69736B]">
                <span>Discount (ETB)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-24 text-right bg-[#F7F7F2] px-2 py-1 rounded-lg border border-[#E3E7E1] text-xs font-medium text-[#202820] outline-none focus:border-[#276749]"
                />
              </div>

              <div className="flex justify-between text-sm font-bold text-[#202820] pt-1 border-t border-[#E3E7E1]">
                <span>Grand Total</span>
                <span className="text-[#276749] tabular-nums">
                  {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-medium text-[#69736B]">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'CASH'
                      ? 'bg-[#EAF3EC] border-[#276749] text-[#276749]'
                      : 'bg-[#F7F7F2] border-[#E3E7E1] text-[#69736B]'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('EBIRR')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'EBIRR'
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB]'
                      : 'bg-[#F7F7F2] border-[#E3E7E1] text-[#69736B]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> ebirr
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('BANK_TRANSFER')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'BANK_TRANSFER'
                      ? 'bg-[#FEF3C7] border-[#D97706] text-[#D97706]'
                      : 'bg-[#F7F7F2] border-[#E3E7E1] text-[#69736B]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> CBE Bank
                </button>
              </div>
            </div>

            {/* Paid Amount & Credit Warning */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-medium text-[#69736B]">
                <span>Amount Paid Now (ETB)</span>
                {balanceDue > 0 && (
                  <span className="text-[#DC2626] font-semibold">
                    Balance Due: {balanceDue.toLocaleString()} ETB (Credit Sale)
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={totalAmount.toFixed(2)}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full bg-[#F7F7F2] px-3 py-2 rounded-xl border border-[#E3E7E1] text-xs font-bold text-[#202820] outline-none focus:border-[#276749]"
              />
            </div>

            {/* Checkout Error */}
            {checkoutError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || checkoutLoading}
              className="w-full py-3 bg-[#276749] hover:bg-[#234A34] active:bg-[#1A4830] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Complete Sale & Issue Invoice
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* SALES HISTORY TAB */
        <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[#E3E7E1] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#202820]">All Finalized Sales Invoices</h2>
            <span className="text-xs text-[#69736B]">Real-time audit log of customer transactions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F7F2]/60 border-b border-[#E3E7E1] text-[#69736B] font-medium">
                  <th className="py-3 px-5">Invoice #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E7E1]">
                {salesHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#69736B]">
                      No sales recorded yet. Use the POS register to make the first sale!
                    </td>
                  </tr>
                ) : (
                  salesHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F7F7F2]/40 transition-colors">
                      <td className="py-3.5 px-5 font-mono font-bold text-[#276749]">
                        {s.invoice_number}
                      </td>
                      <td className="py-3.5 px-4 text-[#69736B] whitespace-nowrap">
                        {new Date(s.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#202820]">
                        {s.customer?.name || 'Walk-in Customer'}
                      </td>
                      <td className="py-3.5 px-4 text-[#69736B]">
                        {s.location?.name || 'Main Shop'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#202820] tabular-nums">
                        {Number(s.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#276749] font-medium tabular-nums">
                        {Number(s.paid_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                      </td>
                      <td className={`py-3.5 px-4 text-right font-bold tabular-nums ${
                        Number(s.balance_due) > 0 ? 'text-[#DC2626]' : 'text-[#69736B]'
                      }`}>
                        {Number(s.balance_due).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === 'PAID'
                            ? 'bg-[#EAF3EC] text-[#276749]'
                            : s.status === 'PARTIAL'
                            ? 'bg-[#FEF3C7] text-[#92400E]'
                            : s.status === 'PENDING_PRODUCTION'
                            ? 'bg-[#FDF2F8] text-[#9D174D]'
                            : 'bg-[#EFF6FF] text-[#1D4ED8]'
                        }`}>
                          {s.status === 'PENDING_PRODUCTION' ? 'MANUFACTURING' : s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {s.status === 'PENDING_PRODUCTION' && (
                          <button
                            onClick={() => handleFulfillSale(s.id)}
                            disabled={fulfillingId === s.id}
                            className="px-3 py-1.5 bg-[#276749] hover:bg-[#234A34] text-white text-[10px] font-bold rounded-lg shadow-xs transition-colors inline-flex items-center gap-1"
                          >
                            {fulfillingId === s.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Package className="w-3 h-3" />
                            )}
                            Fulfill
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
      )}

      {/* INVOICE RECEIPT MODAL */}
      {showInvoiceModal && completedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] max-w-lg w-full p-6 shadow-2xl space-y-5 text-xs">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E3E7E1] pb-4">
              <div>
                <div className="flex items-center gap-1.5 text-[#276749] font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Sale Completed Successfully
                </div>
                <p className="text-[11px] text-[#69736B] mt-0.5">Invoice issued & inventory deducted atomically</p>
              </div>
              <button onClick={() => setShowInvoiceModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Invoice Card */}
            <div id="printable-invoice" className="p-5 bg-[#F7F7F2]/50 border border-[#E3E7E1] rounded-xl space-y-4">
              {/* Company Info */}
              <div className="text-center pb-3 border-b border-[#E3E7E1]">
                <h2 className="text-base font-bold text-[#202820] tracking-tight">FurniERP Furniture PLC</h2>
                <p className="text-[11px] text-[#69736B]">Jigjiga, Ethiopia &middot; TIN: 0012345678</p>
                <p className="text-[11px] text-[#69736B]">Tel: +251 11 661 2345 &middot; sales@furnierp.com</p>
              </div>

              {/* Invoice Meta */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[#69736B]">Invoice No:</span> <strong className="font-mono text-[#202820]">{completedInvoice.invoiceNumber}</strong>
                </div>
                <div className="text-right">
                  <span className="text-[#69736B]">Date:</span> <strong>{new Date(completedInvoice.createdAt).toLocaleDateString()}</strong>
                </div>
                <div>
                  <span className="text-[#69736B]">Customer:</span> <strong>{completedInvoice.customer?.name || 'Walk-in Customer'}</strong>
                </div>
                <div className="text-right">
                  <span className="text-[#69736B]">Location:</span> <strong>{completedInvoice.location?.name}</strong>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left text-[11px] border-t border-b border-[#E3E7E1]">
                <thead>
                  <tr className="text-[#69736B] border-b border-[#E3E7E1]">
                    <th className="py-1.5">Item</th>
                    <th className="py-1.5 text-center">Qty</th>
                    <th className="py-1.5 text-right">Price</th>
                    <th className="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E1]/50">
                  {completedInvoice.items.map((item: CartItem, idx: number) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-medium">{item.product.name}</td>
                      <td className="py-1.5 text-center">{item.quantity}</td>
                      <td className="py-1.5 text-right">{item.unitPrice.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-semibold">{(item.quantity * item.unitPrice).toLocaleString()} ETB</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Totals */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between text-[#69736B]">
                  <span>Subtotal</span>
                  <span>{completedInvoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                </div>
                {completedInvoice.discountAmount > 0 && (
                  <div className="flex justify-between text-[#69736B]">
                    <span>Discount</span>
                    <span>-{completedInvoice.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#202820] text-xs pt-1 border-t border-[#E3E7E1]">
                  <span>Grand Total</span>
                  <span>{completedInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                </div>
                <div className="flex justify-between font-semibold text-[#276749]">
                  <span>Amount Paid ({completedInvoice.paymentMethod})</span>
                  <span>{completedInvoice.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                </div>
                {completedInvoice.balanceDue > 0 && (
                  <div className="flex justify-between font-bold text-[#DC2626]">
                    <span>Balance Due (Receivable)</span>
                    <span>{completedInvoice.balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-white hover:bg-[#F7F7F2] text-[#202820] font-semibold rounded-xl border border-[#E3E7E1] flex items-center gap-2"
              >
                <Printer className="w-3.5 h-3.5" /> Print Receipt
              </button>
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white font-semibold rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ORDER MODAL */}
      {showCustomOrderModal && customOrderProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] bg-[#FAFBF9] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hammer className="w-5 h-5 text-[#92400E]" />
                <h3 className="font-bold text-[#202820]">Custom Order (Manufacturing)</h3>
              </div>
              <button onClick={() => setShowCustomOrderModal(false)} className="text-[#8C948D] hover:text-[#202820] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3 text-xs text-[#92400E]">
                <strong>{customOrderProduct.name}</strong> is currently out of stock. Create a custom order to reserve it for a customer — then create a manufacturing order to produce it.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">Customer *</label>
                <select
                  required
                  value={customOrderCustomerId}
                  onChange={e => setCustomOrderCustomerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">Select Customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No phone'})</option>
                  ))}
                </select>
              </div>

              <div className="bg-[#F7F7F2] border border-[#E3E7E1] rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#69736B]">Product</span>
                  <span className="font-semibold text-[#202820]">{customOrderProduct.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#69736B]">Unit Price</span>
                  <span className="font-bold text-[#276749]">{Number(customOrderProduct.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Deposit Amount (ETB)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customOrderDeposit}
                    onChange={e => setCustomOrderDeposit(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">Payment Method</label>
                  <select
                    value={customOrderPaymentMethod}
                    onChange={e => setCustomOrderPaymentMethod(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="CASH">Cash</option>
                    <option value="EBIRR">eBirr</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={customOrderNotes}
                  onChange={e => setCustomOrderNotes(e.target.value)}
                  placeholder="Customer specifications, color, material..."
                  className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  onClick={() => setShowCustomOrderModal(false)}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomOrder}
                  disabled={customOrderSubmitting || !customOrderCustomerId}
                  className="px-5 py-2 bg-[#92400E] hover:bg-[#78350F] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {customOrderSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Custom Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
