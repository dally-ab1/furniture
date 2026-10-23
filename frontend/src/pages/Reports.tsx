import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, CreditCard, BarChart3, FileText,
  Calendar, RefreshCw, ChevronRight, Download, Plus,
  Search, X, Loader2, ArrowUpRight,
  Package, ShieldCheck, CheckCircle2,
  AlertCircle, Eye, Receipt, Trash2, ArrowLeft,
  Layers, Percent, Building2
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


// Format ETB currency cleanly
const formatETB = (val: number): string => {
  return `ETB ${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface FinanceSummary {
  currency: string;
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  pnl: {
    totalRevenue: number;
    totalSubtotal: number;
    totalDiscounts: number;
    salesCount: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPct: number;
    totalExpenses: number;
    netProfit: number;
    netMarginPct: number;
    expensesByCategory: Record<string, number>;
  };
  comparison: {
    previousRevenue: number;
    previousExpenses: number;
    previousNetProfit: number;
    revenueChangePct: number;
    expensesChangePct: number;
    profitChangePct: number;
  };
  workingCapital: {
    totalCashCollected: number;
    cashCollectedByMethod: Record<string, number>;
    totalSupplierPaymentsMade: number;
    totalAccountsReceivable: number;
    unsettledInvoiceReceivables: number;
    totalAccountsPayable: number;
    topDebtors: Array<{ id: string; name: string; phone: string | null; outstanding_balance: number }>;
    topCreditors: Array<{ id: string; name: string; phone: string | null; outstanding_balance: number }>;
  };
  outstandingInvoices: {
    count: number;
    total: number;
  };
  inventoryValuation: {
    totalInventoryValue: number;
    finishedGoodsValue: number;
    rawMaterialsValue: number;
  };
  manufacturing: {
    completedOrdersCount: number;
    mfgMaterialCost: number;
    mfgLaborCost: number;
    totalManufacturingValue: number;
  };
}

interface TimeSeriesPoint {
  date: string;
  label: string;
  income: number;
  expenses: number;
}

interface ExpenseBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

interface FinancialTransaction {
  id: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  description: string;
  category: string;
  reference: string;
  amount: number;
  paidAmount?: number;
  balanceDue?: number;
  status: string;
  paymentMethod?: string;
  counterparty: string;
  sourceType: 'SALE' | 'EXPENSE' | 'PAYMENT';
}

interface ReconciliationReport {
  timestamp: string;
  currency: string;
  reconciliation: {
    systemCashBalance: number;
    cashCollectedViaCash: number;
    cashCollectedViaBank: number;
    cashCollectedViaEbirr: number;
    cashCollectedViaCbeBirr: number;
    totalOperatingExpensesCash: number;
    totalSupplierDisbursementsCash: number;
  };
  arAging: {
    current: number;
    days1_30: number;
    days31_60: number;
    days60_plus: number;
    totalReceivables: number;
  };
  integrityChecks: Array<{ check: string; status: 'PASS' | 'WARNING'; message: string }>;
}

export const Reports: React.FC = () => {
  // Global dashboard state
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdownItem[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dedicated Report View state (null = main dashboard, or 'SALES' | 'INVENTORY' | 'FINANCE' | 'TAX')
  const [activeReportView, setActiveReportView] = useState<null | 'SALES' | 'INVENTORY' | 'FINANCE' | 'TAX'>(null);
  const [reportSubtab, setReportSubtab] = useState<string>('DEFAULT');
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'THIS_MONTH' | 'ALL' | 'TODAY' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM'>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showDatePickerMenu, setShowDatePickerMenu] = useState(false);

  // Main Dashboard Table Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dedicated Report Search & Filters
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('ALL');
  const [reportCategoryFilter, setReportCategoryFilter] = useState('ALL');
  const [reportLocationFilter, setReportLocationFilter] = useState('ALL');

  // Modals
  const [showNewExpenseModal, setShowNewExpenseModal] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedTransactionDetail, setSelectedTransactionDetail] = useState<FinancialTransaction | null>(null);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null);
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState<any | null>(null);
  const [selectedProductDetail, setSelectedProductDetail] = useState<any | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);

  // New Expense form state
  const [expenseCategory, setExpenseCategory] = useState('Workshop Consumables & Maintenance');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'EBIRR' | 'CBE_BIRR'>('CASH');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Hover state for Area Chart
  const [hoveredPoint, setHoveredPoint] = useState<TimeSeriesPoint | null>(null);
  // Hover state for Donut Chart
  const [hoveredDonutCategory, setHoveredDonutCategory] = useState<string | null>(null);

  // Compute active date range from filter preset
  const activeDateRange = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (dateFilter === 'ALL') {
      return { startDate: undefined, endDate: undefined, label: 'All Time' };
    }
    if (dateFilter === 'TODAY') {
      return { startDate: todayStr, endDate: todayStr, label: 'Today' };
    }
    if (dateFilter === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const monthName = today.toLocaleDateString('en-US', { month: 'short' });
      return { startDate: firstDay, endDate: todayStr, label: `${monthName} 1, ${today.getFullYear()} → ${monthName} ${today.getDate()}, ${today.getFullYear()}` };
    }
    if (dateFilter === 'LAST_MONTH') {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
      const lastMonthName = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' });
      return { startDate: firstDayLastMonth, endDate: lastDayLastMonth, label: `Last Month (${lastMonthName})` };
    }
    if (dateFilter === 'THIS_YEAR') {
      const firstDayYear = `${today.getFullYear()}-01-01`;
      return { startDate: firstDayYear, endDate: todayStr, label: `Year ${today.getFullYear()}` };
    }
    if (dateFilter === 'CUSTOM') {
      return {
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
        label: customStartDate && customEndDate ? `${customStartDate} → ${customEndDate}` : 'Custom Range',
      };
    }
    return { startDate: undefined, endDate: undefined, label: 'All Time' };
  }, [dateFilter, customStartDate, customEndDate]);

  // Fetch Main Financials
  const fetchAllFinancials = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (activeDateRange.startDate) params.set('startDate', activeDateRange.startDate);
    if (activeDateRange.endDate) params.set('endDate', activeDateRange.endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';

    try {
      const [sumRes, tsRes, expRes, txRes] = await Promise.all([
        authFetch(`${API_BASE}/finance/summary${qs}`),
        authFetch(`${API_BASE}/finance/time-series${qs}`),
        authFetch(`${API_BASE}/finance/expense-breakdown${qs}`),
        authFetch(`${API_BASE}/finance/transactions${qs}&page=${currentPage}&limit=10${typeFilter !== 'ALL' ? `&type=${typeFilter}` : ''}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`),
      ]);

      if (!sumRes.ok) throw new Error('Failed to load financial summary');
      const sumJson = await sumRes.json();
      setSummary(sumJson.data);

      if (tsRes.ok) {
        const tsJson = await tsRes.json();
        setTimeSeries(tsJson.data || []);
      }

      if (expRes.ok) {
        const expJson = await expRes.json();
        setExpenseBreakdown(expJson.categories || []);
      }

      if (txRes.ok) {
        const txJson = await txRes.json();
        setTransactions(txJson.data || []);
        if (txJson.pagination) {
          setTotalPages(txJson.pagination.totalPages);
          setTotalCount(txJson.pagination.totalCount);
        }
      }
    } catch (err: any) {
      console.error('Financial data load error:', err);
      setErrorMessage(err.message || 'Error loading financial statements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeDateRange, currentPage, typeFilter, searchQuery]);

  // Fetch Dedicated Quick Report Data
  const fetchDedicatedReport = useCallback(async (reportType: 'SALES' | 'INVENTORY' | 'FINANCE' | 'TAX') => {
    setReportLoading(true);
    setReportError(null);

    const endpointMap: Record<string, string> = {
      SALES: 'sales',
      INVENTORY: 'inventory',
      FINANCE: 'pnl',
      TAX: 'tax',
    };

    const typeKey = endpointMap[reportType] || 'sales';
    const params = new URLSearchParams();
    if (activeDateRange.startDate) params.set('startDate', activeDateRange.startDate);
    if (activeDateRange.endDate) params.set('endDate', activeDateRange.endDate);

    try {
      const res = await authFetch(`${API_BASE}/finance/reports/${typeKey}?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load ${reportType.toLowerCase()} report`);
      const json = await res.json();
      setReportData(json);
    } catch (err: any) {
      console.error('Report fetch error:', err);
      setReportError(err.message || 'Failed to fetch report');
    } finally {
      setReportLoading(false);
    }
  }, [activeDateRange]);

  useEffect(() => {
    if (!activeReportView) {
      fetchAllFinancials();
    } else {
      fetchDedicatedReport(activeReportView);
    }
  }, [fetchAllFinancials, fetchDedicatedReport, activeReportView]);

  // Handle switching to a dedicated report view
  const handleOpenReport = (report: 'SALES' | 'INVENTORY' | 'FINANCE' | 'TAX') => {
    setActiveReportView(report);
    setReportSubtab('DEFAULT');
    setReportSearch('');
    setReportStatusFilter('ALL');
    setReportCategoryFilter('ALL');
    setReportLocationFilter('ALL');
  };

  // Handle returning back to main dashboard
  const handleBackToDashboard = () => {
    setActiveReportView(null);
    fetchAllFinancials();
  };

  // Create New Expense
    // Soft-delete expense to Recovery Center
  const handleDeleteExpense = async (tx: any) => {
    const reason = window.prompt(
      `Are you sure you want to move this expense (ETB ${tx.amount}) to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/finance/expenses/${tx.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete expense');
      }
      alert('Expense record moved to Recovery Center.');
      setSelectedTransactionDetail(null);
      // Refresh financial data
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Error deleting expense');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0) {
      alert('Please enter a valid expense amount');
      return;
    }

    setSubmittingExpense(true);
    try {
      const res = await authFetch(`${API_BASE}/finance/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: expenseCategory,
          amount: Number(expenseAmount),
          payment_method: expensePaymentMethod,
          expense_date: expenseDate,
          description: expenseDesc || `${expenseCategory} expense`,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.error || 'Failed to record expense');
      }

      setShowNewExpenseModal(false);
      setExpenseAmount(0);
      setExpenseDesc('');
      fetchAllFinancials(true);
    } catch (err: any) {
      alert(err.message || 'Error recording expense');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Fetch Reconciliation Report
  const handleOpenReconciliation = async () => {
    setShowReconciliationModal(true);
    setReconciliationLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/finance/reconciliation`);
      if (res.ok) {
        const json = await res.json();
        setReconciliation(json.data);
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
    } finally {
      setReconciliationLoading(false);
    }
  };

  // Export Main Dashboard Transactions to CSV
  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert('No transactions available to export');
      return;
    }

    const headers = ['Date', 'Type', 'Description', 'Category', 'Reference', 'Amount (ETB)', 'Status', 'Counterparty'];
    const rows = transactions.map(t => [
      t.date.split('T')[0],
      t.type,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.category.replace(/"/g, '""')}"`,
      t.reference,
      t.amount.toFixed(2),
      t.status,
      `"${t.counterparty.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FurniERP_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Dedicated Report to CSV
  const handleExportReportCSV = () => {
    if (!reportData) {
      alert('No report data available to export');
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = `FurniERP_${activeReportView}_Report_${new Date().toISOString().split('T')[0]}.csv`;

    if (activeReportView === 'SALES') {
      headers = ['Invoice Number', 'Date', 'Customer', 'Items Count', 'Subtotal (ETB)', 'Discount (ETB)', 'Total (ETB)', 'Paid (ETB)', 'Balance Due (ETB)', 'Status'];
      const list = filteredReportRows || [];
      rows = list.map((s: any) => [
        s.invoice_number,
        s.created_at.split('T')[0],
        `"${(s.customer?.name || 'Walk-in Customer').replace(/"/g, '""')}"`,
        s.items?.length || 0,
        Number(s.subtotal || 0).toFixed(2),
        Number(s.discount_amount || 0).toFixed(2),
        Number(s.total_amount || 0).toFixed(2),
        Number(s.paid_amount || 0).toFixed(2),
        Number(s.balance_due || 0).toFixed(2),
        s.status,
      ]);

    } else if (activeReportView === 'INVENTORY') {
      if (reportSubtab === 'MOVEMENTS') {
        headers = ['Movement Date', 'Type', 'Product', 'SKU', 'Quantity Change', 'Location', 'Notes'];
        const list = filteredReportRows || [];
        rows = list.map((m: any) => [
          m.created_at.split('T')[0],
          m.movement_type,
          `"${(m.product?.name || '').replace(/"/g, '""')}"`,
          m.product?.sku || '',
          m.quantity,
          `"${(m.location?.name || '').replace(/"/g, '""')}"`,
          `"${(m.notes || '').replace(/"/g, '""')}"`,
        ]);
      } else {
        headers = ['Product Name', 'SKU', 'Type', 'Category', 'Location', 'Quantity', 'Unit', 'Unit Cost (ETB)', 'Selling Price (ETB)', 'Total Valuation (ETB)', 'Stock Status'];
        const list = filteredReportRows || [];
        rows = list.map((item: any) => [
          `"${item.productName.replace(/"/g, '""')}"`,
          item.sku,
          item.type,
          `"${item.categoryName.replace(/"/g, '""')}"`,
          `"${item.locationName.replace(/"/g, '""')}"`,
          item.quantity,
          item.unitOfMeasure,
          item.unitCost.toFixed(2),
          item.sellingPrice.toFixed(2),
          item.totalValuation.toFixed(2),
          item.stockStatus,
        ]);
      }
    } else if (activeReportView === 'FINANCE') {
      headers = ['Category', 'Type', 'Amount (ETB)'];
      const pnl = reportData?.statement || {};
      rows = [
        ['Gross Sales Revenue', 'Income', Number(pnl.grossRevenue || 0).toFixed(2)],
        ['Sales Discounts', 'Deduction', Number(pnl.totalDiscounts || 0).toFixed(2)],
        ['Net Sales Revenue', 'Revenue', Number(pnl.netRevenue || 0).toFixed(2)],
        ['Cost of Goods Sold (COGS)', 'Direct Cost', Number(pnl.cogs || 0).toFixed(2)],
        ['Gross Operating Profit', 'Margin', Number(pnl.grossProfit || 0).toFixed(2)],
        ['Total Operating Expenses', 'Expense', Number(pnl.totalOperatingExpenses || 0).toFixed(2)],
        ['Net Operating Profit', 'Profit', Number(pnl.netOperatingProfit || 0).toFixed(2)],
      ];
    } else if (activeReportView === 'TAX') {
      headers = ['Invoice Number', 'Date', 'Customer / Entity', 'Taxable Base (ETB)', 'Output VAT 15% (ETB)', 'TOT 2% (ETB)'];
      const list = filteredReportRows || [];
      rows = list.map((t: any) => [
        t.reference,
        t.date.split('T')[0],
        `"${t.counterparty.replace(/"/g, '""')}"`,
        t.taxableBase.toFixed(2),
        t.vat15.toFixed(2),
        t.tot2.toFixed(2),
      ]);
    }

    if (rows.length === 0) {
      alert('No rows matching current filters to export');
      return;
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rows for dedicated reports
  const filteredReportRows = useMemo(() => {
    if (!reportData) return [];

    if (activeReportView === 'SALES') {
      let list = (reportData.data || []) as any[];
      if (reportStatusFilter !== 'ALL') {
        list = list.filter(s => s.status === reportStatusFilter);
      }
      if (reportCategoryFilter !== 'ALL') {
        list = list.filter(s => s.items?.some((it: any) => it.product?.category?.name === reportCategoryFilter));
      }
      if (reportSearch) {
        const q = reportSearch.toLowerCase();
        list = list.filter(s =>
          s.invoice_number?.toLowerCase().includes(q) ||
          s.customer?.name?.toLowerCase().includes(q) ||
          s.customer?.phone?.includes(q) ||
          s.items?.some((it: any) => it.product?.name?.toLowerCase().includes(q) || it.product?.sku?.toLowerCase().includes(q))
        );
      }
      return list;
    }



    if (activeReportView === 'INVENTORY') {
      if (reportSubtab === 'MOVEMENTS') {
        let list = (reportData.movements || []) as any[];
        if (reportSearch) {
          const q = reportSearch.toLowerCase();
          list = list.filter(m =>
            m.movement_type?.toLowerCase().includes(q) ||
            m.product?.name?.toLowerCase().includes(q) ||
            m.product?.sku?.toLowerCase().includes(q) ||
            m.location?.name?.toLowerCase().includes(q)
          );
        }
        return list;
      } else {
        let list = (reportData.data || []) as any[];
        if (reportStatusFilter !== 'ALL') {
          list = list.filter(item => item.stockStatus === reportStatusFilter);
        }
        if (reportLocationFilter !== 'ALL') {
          list = list.filter(item => item.locationName === reportLocationFilter);
        }
        if (reportCategoryFilter !== 'ALL') {
          list = list.filter(item => item.categoryName === reportCategoryFilter);
        }
        if (reportSearch) {
          const q = reportSearch.toLowerCase();
          list = list.filter(item =>
            item.productName.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            item.locationName.toLowerCase().includes(q)
          );
        }
        return list;
      }
    }

    if (activeReportView === 'TAX') {
      let list = (reportData.salesLedger || []) as any[];
      if (reportSearch) {
        const q = reportSearch.toLowerCase();
        list = list.filter(s =>
          s.reference?.toLowerCase().includes(q) ||
          s.counterparty?.toLowerCase().includes(q)
        );
      }
      return list;
    }

    return [];
  }, [reportData, activeReportView, reportSubtab, reportStatusFilter, reportCategoryFilter, reportLocationFilter, reportSearch]);

  // Compute Area Chart SVG geometry
  const chartGeometry = useMemo(() => {
    if (!timeSeries || timeSeries.length === 0) return null;

    const width = 600;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };

    const maxVal = Math.max(
      ...timeSeries.map(p => Math.max(p.income, p.expenses)),
      1000
    ) * 1.15;

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = (index: number) => {
      if (timeSeries.length === 1) return padding.left + chartW / 2;
      return padding.left + (index / (timeSeries.length - 1)) * chartW;
    };

    const getY = (val: number) => {
      return padding.top + chartH - (val / maxVal) * chartH;
    };

    // Build SVG path strings with smooth bezier curves
    const buildPath = (values: number[]) => {
      const pts = values.map((v, i) => ({ x: getX(i), y: getY(v) }));
      if (pts.length === 0) return { line: '', area: '' };
      if (pts.length === 1) {
        return {
          line: `M ${pts[0].x} ${pts[0].y}`,
          area: `M ${pts[0].x} ${padding.top + chartH} L ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${padding.top + chartH} Z`,
        };
      }

      let lineD = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const midX = (p0.x + p1.x) / 2;
        lineD += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
      }

      const areaD = `${lineD} L ${pts[pts.length - 1].x} ${padding.top + chartH} L ${pts[0].x} ${padding.top + chartH} Z`;
      return { line: lineD, area: areaD };
    };

    const incomePaths = buildPath(timeSeries.map(p => p.income));
    const expensePaths = buildPath(timeSeries.map(p => p.expenses));

    const yAxisTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal].map(v => ({
      val: v,
      y: getY(v),
      label: v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`,
    }));

    return {
      width,
      height,
      padding,
      chartW,
      chartH,
      getX,
      getY,
      incomePaths,
      expensePaths,
      yAxisTicks,
      maxVal,
    };
  }, [timeSeries]);

  // Compute Donut Chart SVG paths
  const donutGeometry = useMemo(() => {
    if (!expenseBreakdown || expenseBreakdown.length === 0) return null;

    const size = 160;
    const center = size / 2;
    const radius = 62;
    const innerRadius = 42;

    let accumulatedAngle = 0;

    const slices = expenseBreakdown.map(item => {
      const angle = (item.percentage / 100) * 360;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle = endAngle;

      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const ix1 = center + innerRadius * Math.cos(endRad);
      const iy1 = center + innerRadius * Math.sin(endRad);
      const ix2 = center + innerRadius * Math.cos(startRad);
      const iy2 = center + innerRadius * Math.sin(startRad);

      const largeArc = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
        'Z',
      ].join(' ');

      return {
        ...item,
        pathData,
        startAngle,
        endAngle,
      };
    });

    return { size, center, radius, innerRadius, slices };
  }, [expenseBreakdown]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans text-[#202820]">
      {/* =========================================================================
          IF DEDICATED REPORT IS ACTIVE: RENDER FULL-WIDTH ERP REPORT VIEW
      ========================================================================= */}
      {activeReportView ? (
        <div className="space-y-6">
          {/* Dedicated Report Header */}
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackToDashboard}
                  className="p-2 rounded-xl border border-[#E3E7E1] bg-white text-[#202820] hover:bg-[#FAFBF9] hover:border-[#276749] transition-all flex items-center gap-1.5 text-xs font-semibold"
                  title="Back to Finance Dashboard"
                >
                  <ArrowLeft className="w-4 h-4 text-[#276749]" />
                  <span>Back to Dashboard</span>
                </button>

                <div className="h-6 w-[1px] bg-[#E3E7E1] hidden sm:block" />

                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    activeReportView === 'SALES' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                    activeReportView === 'INVENTORY' ? 'bg-[#FEF3C7] text-[#D97706]' :
                    activeReportView === 'FINANCE' ? 'bg-[#DBEAFE] text-[#2563EB]' :
                    'bg-[#CCFBF1] text-[#0D9488]'
                  }`}>
                    {activeReportView === 'SALES' && <BarChart3 className="w-4 h-4 stroke-[2.2]" />}
                    {activeReportView === 'INVENTORY' && <Package className="w-4 h-4 stroke-[2.2]" />}
                    {activeReportView === 'FINANCE' && <Receipt className="w-4 h-4 stroke-[2.2]" />}
                    {activeReportView === 'TAX' && <FileText className="w-4 h-4 stroke-[2.2]" />}
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-[#202820]">
                      {activeReportView === 'SALES' && 'Sales Performance Report'}
                      {activeReportView === 'INVENTORY' && 'Inventory Valuation & Movements Report'}
                      {activeReportView === 'FINANCE' && 'Multi-Step Financial Statement (P&L)'}
                      {activeReportView === 'TAX' && 'Tax Compliance & Turnover Modeling Report'}
                    </h1>
                    <p className="text-xs text-[#69736B]">
                      {activeReportView === 'SALES' && 'Real-time sales invoices, product margin analysis, and customer order performance'}
                      {activeReportView === 'INVENTORY' && 'Current stock asset valuation across Main Shop & Warehouse, plus movement audit ledger'}
                      {activeReportView === 'FINANCE' && 'Multi-step Profit & Loss statement, cost structure, working capital, and accounts receivable'}
                      {activeReportView === 'TAX' && 'Modeled Ethiopian VAT (15%), Turnover Tax (TOT 2%), and procurement withholding liabilities'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportReportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E3E7E1] bg-white text-xs font-semibold text-[#202820] hover:bg-[#FAFBF9] transition-all"
                  title="Export Current Filtered Report to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-[#69736B]" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => fetchDedicatedReport(activeReportView)}
                  disabled={reportLoading}
                  className="p-1.5 rounded-xl border border-[#E3E7E1] bg-white text-[#69736B] hover:text-[#276749] transition-all disabled:opacity-50"
                  title="Refresh Report Data"
                >
                  <RefreshCw className={`w-4 h-4 ${reportLoading ? 'animate-spin text-[#276749]' : ''}`} />
                </button>
              </div>
            </div>

            {/* Quick Report Navigation Switcher */}
            <div className="pt-3 flex items-center justify-between overflow-x-auto gap-2">
              <div className="flex items-center gap-1 bg-[#F7F7F2] p-1 rounded-xl">
                <button
                  onClick={() => handleOpenReport('SALES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeReportView === 'SALES' ? 'bg-white text-[#16A34A] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                  }`}
                >
                  Sales Report
                </button>

                <button
                  onClick={() => handleOpenReport('INVENTORY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeReportView === 'INVENTORY' ? 'bg-white text-[#D97706] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                  }`}
                >
                  Inventory Report
                </button>
                <button
                  onClick={() => handleOpenReport('FINANCE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeReportView === 'FINANCE' ? 'bg-white text-[#2563EB] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                  }`}
                >
                  Finance Report
                </button>
                <button
                  onClick={() => handleOpenReport('TAX')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeReportView === 'TAX' ? 'bg-white text-[#0D9488] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                  }`}
                >
                  Tax Report
                </button>
              </div>

              <div className="text-xs font-medium text-[#69736B] hidden md:block">
                <span>Period: <strong>{activeDateRange.label}</strong></span>
              </div>
            </div>
          </div>

          {/* Report Loading State */}
          {reportLoading && (
            <div className="bg-white rounded-2xl border border-[#E3E7E1] p-12 text-center shadow-2xs">
              <Loader2 className="w-8 h-8 animate-spin text-[#276749] mx-auto mb-3" />
              <div className="text-sm font-bold text-[#202820]">Generating Financial Report...</div>
              <div className="text-xs text-[#69736B] mt-1">Retrieving persisted transactions from Supabase PostgreSQL</div>
            </div>
          )}

          {/* Report Error State */}
          {reportError && (
            <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-xs text-red-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="font-bold">Report Generation Error</div>
                  <div>{reportError}</div>
                </div>
              </div>
              <button
                onClick={() => fetchDedicatedReport(activeReportView)}
                className="px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {/* Report Content when Loaded */}
          {!reportLoading && !reportError && reportData && (
            <div className="space-y-6">
              {/* -------------------------------------------------------------
                  1. DEDICATED SALES REPORT VIEW
              ------------------------------------------------------------- */}
              {activeReportView === 'SALES' && (
                <div className="space-y-6">
                  {/* 4 Sales KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Recognized Sales Revenue</span>
                        <div className="w-7 h-7 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
                          <TrendingUp className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#202820]">
                        {formatETB(reportData.summary?.totalRevenue || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Subtotal: {formatETB(reportData.summary?.totalSubtotal || 0)}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Completed Invoices</span>
                        <div className="w-7 h-7 rounded-lg bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#202820]">
                        {reportData.summary?.salesCount || 0} Invoices
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Avg Ticket: {formatETB(reportData.summary?.avgSaleValue || 0)}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Cost of Goods Sold (COGS)</span>
                        <div className="w-7 h-7 rounded-lg bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
                          <Package className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#DC2626]">
                        {formatETB(reportData.summary?.totalCogs || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Direct inventory product cost
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Gross Sales Margin</span>
                        <div className="w-7 h-7 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
                          <Percent className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#16A34A]">
                        {reportData.summary?.grossMarginPct || 0}%
                      </div>
                      <div className="text-[11px] text-[#16A34A] font-semibold mt-1">
                        Gross Profit: {formatETB(reportData.summary?.grossProfit || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Category Breakdown & Top Customers */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-3">
                      <div className="text-xs font-bold text-[#202820] flex items-center justify-between pb-2 border-b border-[#E3E7E1]">
                        <span>Sales by Product Category</span>
                        <span className="text-[11px] text-[#69736B]">{reportData.byCategory?.length || 0} categories</span>
                      </div>
                      <div className="space-y-2">
                        {reportData.byCategory?.map((cat: any) => {
                          const pct = reportData.summary?.totalRevenue > 0
                            ? Math.round((cat.revenue / reportData.summary.totalRevenue) * 100)
                            : 0;
                          return (
                            <div key={cat.name} className="space-y-1">
                              <div className="flex justify-between text-xs font-medium">
                                <span className="text-[#202820]">{cat.name} ({cat.quantity} units)</span>
                                <span className="font-bold text-[#276749]">{formatETB(cat.revenue)} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-[#F3F4F6] h-2 rounded-full overflow-hidden">
                                <div className="bg-[#276749] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-3">
                      <div className="text-xs font-bold text-[#202820] flex items-center justify-between pb-2 border-b border-[#E3E7E1]">
                        <span>Top Customers by Sales Volume</span>
                        <span className="text-[11px] text-[#69736B]">{reportData.byCustomer?.length || 0} customers</span>
                      </div>
                      <div className="space-y-2">
                        {reportData.byCustomer?.map((cust: any) => (
                          <div key={cust.name} className="flex justify-between items-center p-2 rounded-xl border border-[#E3E7E1] bg-[#FAFBF9] text-xs">
                            <div>
                              <div className="font-bold text-[#202820]">{cust.name}</div>
                              <div className="text-[11px] text-[#69736B]">{cust.count} orders recorded</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-[#276749]">{formatETB(cust.revenue)}</div>
                              <div className="text-[10px] text-[#69736B]">Total Settled</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-full sm:w-80 px-3 py-1.5 border border-[#E3E7E1] rounded-xl bg-[#FAFBF9]">
                      <Search className="w-3.5 h-3.5 text-[#69736B]" />
                      <input
                        type="text"
                        placeholder="Search invoice #, customer name, phone, item..."
                        value={reportSearch}
                        onChange={e => setReportSearch(e.target.value)}
                        className="w-full text-xs bg-transparent border-none focus:outline-hidden text-[#202820] placeholder-[#9CA3AF]"
                      />
                      {reportSearch && (
                        <button onClick={() => setReportSearch('')} className="text-[#69736B] hover:text-[#202820]">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select
                        value={reportStatusFilter}
                        onChange={e => setReportStatusFilter(e.target.value)}
                        className="px-3 py-1.5 border border-[#E3E7E1] rounded-xl bg-white text-xs font-semibold text-[#202820] focus:border-[#276749] focus:outline-hidden"
                      >
                        <option value="ALL">All Payment Statuses</option>
                        <option value="PAID">Paid Only</option>
                        <option value="PARTIAL">Partial Only</option>
                        <option value="CREDIT">Credit Only</option>
                      </select>
                    </div>
                  </div>

                  {/* Sales Data Table */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
                    <div className="p-4 border-b border-[#E3E7E1] flex justify-between items-center text-xs font-bold">
                      <span>Itemized Sales Records ({filteredReportRows.length})</span>
                      <span className="text-[#69736B] font-normal">Click any row for invoice drilldown</span>
                    </div>

                    {filteredReportRows.length === 0 ? (
                      <div className="py-12 text-center text-xs text-[#69736B]">
                        <Package className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                        <div className="font-semibold text-[#202820]">No sales records found</div>
                        <div className="text-[11px] mt-0.5">Try selecting a different date range or clearing filters</div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4">Invoice #</th>
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Customer</th>
                              <th className="py-3 px-4">Items</th>
                              <th className="py-3 px-4 text-right">Subtotal</th>
                              <th className="py-3 px-4 text-right">Discount</th>
                              <th className="py-3 px-4 text-right">Total Net</th>
                              <th className="py-3 px-4 text-right">Balance Due</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E3E7E1]">
                            {filteredReportRows.map((sale: any) => (
                              <tr
                                key={sale.id}
                                onClick={() => setSelectedSaleDetail(sale)}
                                className="hover:bg-[#FAFBF9] transition-colors cursor-pointer"
                              >
                                <td className="py-3 px-4 font-mono font-bold text-[#276749]">
                                  {sale.invoice_number}
                                </td>
                                <td className="py-3 px-4 text-[#69736B] whitespace-nowrap">
                                  {new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="py-3 px-4 font-medium text-[#202820]">
                                  <div>{sale.customer?.name || 'Walk-in Customer'}</div>
                                  {sale.customer?.phone && (
                                    <div className="text-[10px] text-[#69736B]">{sale.customer.phone}</div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-[#69736B]">
                                  {sale.items?.length || 0} line items
                                </td>
                                <td className="py-3 px-4 text-right font-medium">
                                  {formatETB(Number(sale.subtotal || 0))}
                                </td>
                                <td className="py-3 px-4 text-right text-[#DC2626]">
                                  {Number(sale.discount_amount || 0) > 0 ? `- ${formatETB(Number(sale.discount_amount))}` : '-'}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-[#202820]">
                                  {formatETB(Number(sale.total_amount || 0))}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-[#DC2626]">
                                  {Number(sale.balance_due || 0) > 0 ? formatETB(Number(sale.balance_due)) : '0.00'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    sale.status === 'PAID' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                                    sale.status === 'PARTIAL' ? 'bg-[#FEF3C7] text-[#D97706]' :
                                    'bg-[#FEE2E2] text-[#DC2626]'
                                  }`}>
                                    {sale.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedSaleDetail(sale); }}
                                    className="p-1 hover:bg-[#EBF3EE] text-[#276749] rounded-lg transition-colors"
                                    title="View Invoice Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------
                  3. DEDICATED INVENTORY REPORT VIEW
              ------------------------------------------------------------- */}
              {activeReportView === 'INVENTORY' && (
                <div className="space-y-6">
                  {/* 4 Inventory KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Total Inventory Valuation</span>
                        <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
                          <Package className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#202820]">
                        {formatETB(reportData.summary?.totalInventoryValue || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Across {reportData.summary?.totalSkusCount || 0} product SKUs ({reportData.summary?.totalItemsCount || 0} units)
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Finished Furniture Asset</span>
                        <div className="w-7 h-7 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#16A34A]">
                        {formatETB(reportData.summary?.finishedGoodsValue || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Ready for retail delivery & sale
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Raw Materials Asset</span>
                        <div className="w-7 h-7 rounded-lg bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center">
                          <Layers className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#2563EB]">
                        {formatETB(reportData.summary?.rawMaterialsValue || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Timber, foam, paint, and workshop materials
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="flex justify-between items-center text-xs font-semibold text-[#69736B] mb-2">
                        <span>Reorder Level Alerts</span>
                        <div className="w-7 h-7 rounded-lg bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-[#DC2626]">
                        {reportData.summary?.lowStockCount || 0} Low Stock
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        {reportData.summary?.outOfStockCount || 0} Out of Stock SKUs
                      </div>
                    </div>
                  </div>

                  {/* Subtabs for Inventory: Stock Levels vs Movements */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 bg-[#F7F7F2] p-1 rounded-xl">
                      <button
                        onClick={() => setReportSubtab('DEFAULT')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          reportSubtab === 'DEFAULT' ? 'bg-white text-[#202820] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                        }`}
                      >
                        Stock Valuation Ledger ({reportData.data?.length || 0})
                      </button>
                      <button
                        onClick={() => setReportSubtab('MOVEMENTS')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          reportSubtab === 'MOVEMENTS' ? 'bg-white text-[#202820] shadow-2xs' : 'text-[#69736B] hover:text-[#202820]'
                        }`}
                      >
                        Movement History Ledger ({reportData.movements?.length || 0})
                      </button>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="flex items-center gap-2 px-3 py-1.5 border border-[#E3E7E1] rounded-xl bg-[#FAFBF9] w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 text-[#69736B]" />
                        <input
                          type="text"
                          placeholder="Search product name, SKU..."
                          value={reportSearch}
                          onChange={e => setReportSearch(e.target.value)}
                          className="w-full text-xs bg-transparent border-none focus:outline-hidden text-[#202820]"
                        />
                      </div>

                      {reportSubtab === 'DEFAULT' && (
                        <select
                          value={reportStatusFilter}
                          onChange={e => setReportStatusFilter(e.target.value)}
                          className="px-3 py-1.5 border border-[#E3E7E1] rounded-xl bg-white text-xs font-semibold text-[#202820]"
                        >
                          <option value="ALL">All Stock Statuses</option>
                          <option value="IN_STOCK">In Stock</option>
                          <option value="LOW_STOCK">Low Stock</option>
                          <option value="OUT_OF_STOCK">Out of Stock</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Inventory Table */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
                    {reportSubtab === 'MOVEMENTS' ? (
                      <div>
                        <div className="p-4 border-b border-[#E3E7E1] text-xs font-bold">
                          Persisted Inventory Movement Ledger ({filteredReportRows.length})
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">
                              <tr>
                                <th className="py-3 px-4">Date</th>
                                <th className="py-3 px-4">Movement Type</th>
                                <th className="py-3 px-4">Product Name</th>
                                <th className="py-3 px-4">SKU</th>
                                <th className="py-3 px-4 text-right">Quantity Change</th>
                                <th className="py-3 px-4">Location</th>
                                <th className="py-3 px-4">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E3E7E1]">
                              {filteredReportRows.map((m: any) => {
                                const qty = Number(m.quantity || 0);
                                return (
                                  <tr key={m.id} className="hover:bg-[#FAFBF9]">
                                    <td className="py-3 px-4 text-[#69736B] whitespace-nowrap">
                                      {new Date(m.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF3EE] text-[#276749]">
                                        {m.movement_type}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 font-bold text-[#202820]">{m.product?.name}</td>
                                    <td className="py-3 px-4 font-mono text-[#69736B]">{m.product?.sku}</td>
                                    <td className={`py-3 px-4 text-right font-bold ${qty > 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                                      {qty > 0 ? `+${qty}` : qty}
                                    </td>
                                    <td className="py-3 px-4 text-[#69736B]">{m.location?.name}</td>
                                    <td className="py-3 px-4 text-[#69736B]">{m.notes || 'Routine stock event'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="p-4 border-b border-[#E3E7E1] text-xs font-bold">
                          Stock Levels & Asset Valuation ({filteredReportRows.length})
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">
                              <tr>
                                <th className="py-3 px-4">Product Name</th>
                                <th className="py-3 px-4">SKU</th>
                                <th className="py-3 px-4">Type</th>
                                <th className="py-3 px-4">Location</th>
                                <th className="py-3 px-4 text-right">Stock Qty</th>
                                <th className="py-3 px-4 text-right">Unit Cost</th>
                                <th className="py-3 px-4 text-right">Selling Price</th>
                                <th className="py-3 px-4 text-right">Total Valuation</th>
                                <th className="py-3 px-4 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E3E7E1]">
                              {filteredReportRows.map((item: any, idx: number) => (
                                <tr
                                  key={`${item.productId}-${item.locationName}-${idx}`}
                                  onClick={() => setSelectedProductDetail(item)}
                                  className="hover:bg-[#FAFBF9] cursor-pointer"
                                >
                                  <td className="py-3 px-4 font-bold text-[#202820]">{item.productName}</td>
                                  <td className="py-3 px-4 font-mono text-[#69736B]">{item.sku}</td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      item.type === 'FINISHED_GOOD' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#DBEAFE] text-[#2563EB]'
                                    }`}>
                                      {item.type}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-[#69736B]">{item.locationName}</td>
                                  <td className="py-3 px-4 text-right font-bold text-[#202820]">
                                    {item.quantity} {item.unitOfMeasure}
                                  </td>
                                  <td className="py-3 px-4 text-right text-[#69736B]">
                                    {formatETB(item.unitCost)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-semibold text-[#276749]">
                                    {formatETB(item.sellingPrice)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-bold text-[#202820]">
                                    {formatETB(item.totalValuation)}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      item.stockStatus === 'IN_STOCK' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                                      item.stockStatus === 'LOW_STOCK' ? 'bg-[#FEF3C7] text-[#D97706]' :
                                      'bg-[#FEE2E2] text-[#DC2626]'
                                    }`}>
                                      {item.stockStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------
                  4. DEDICATED FINANCE / P&L REPORT VIEW
              ------------------------------------------------------------- */}
              {activeReportView === 'FINANCE' && (
                <div className="space-y-6">
                  {/* 4 Finance KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Net Sales Revenue</div>
                      <div className="text-xl font-bold text-[#16A34A]">
                        {formatETB(reportData.statement?.netRevenue || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Gross: {formatETB(reportData.statement?.grossRevenue || 0)}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Gross Margin</div>
                      <div className="text-xl font-bold text-[#202820]">
                        {reportData.statement?.grossMarginPct || 0}%
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Gross Profit: {formatETB(reportData.statement?.grossProfit || 0)}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Total Operating Expenses</div>
                      <div className="text-xl font-bold text-[#DC2626]">
                        {formatETB(reportData.statement?.totalOperatingExpenses || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Workshop & general overhead
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Net Operating Profit</div>
                      <div className="text-xl font-bold text-[#276749]">
                        {formatETB(reportData.statement?.netOperatingProfit || 0)}
                      </div>
                      <div className="text-[11px] text-[#276749] font-bold mt-1">
                        Net Margin: {reportData.statement?.netMarginPct || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Multi-Step P&L Statement */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] p-6 shadow-2xs space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-[#E3E7E1]">
                      <h3 className="text-sm font-bold text-[#202820]">Multi-Step Income Statement (Ethiopian Birr - ETB)</h3>
                      <span className="text-xs text-[#69736B]">Managerial Accounting Basis</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-2 border-b border-[#E3E7E1] font-bold">
                        <span>1. Gross Sales Revenue</span>
                        <span className="text-[#16A34A]">{formatETB(reportData.statement?.grossRevenue || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1.5 pl-4 text-[#69736B]">
                        <span>Less: Sales Discounts</span>
                        <span>- {formatETB(reportData.statement?.totalDiscounts || 0)}</span>
                      </div>
                      <div className="flex justify-between py-2 bg-[#FAFBF9] px-3 rounded-lg font-bold">
                        <span>Net Sales Revenue</span>
                        <span>{formatETB(reportData.statement?.netRevenue || 0)}</span>
                      </div>

                      <div className="flex justify-between py-2 border-b border-[#E3E7E1] font-bold text-[#DC2626]">
                        <span>2. Cost of Goods Sold (COGS)</span>
                        <span>- {formatETB(reportData.statement?.cogs || 0)}</span>
                      </div>

                      <div className="flex justify-between py-2.5 bg-[#DCFCE7]/40 px-3 rounded-lg font-bold text-sm text-[#16A34A]">
                        <span>Gross Operating Profit</span>
                        <span>{formatETB(reportData.statement?.grossProfit || 0)} ({reportData.statement?.grossMarginPct}%)</span>
                      </div>

                      <div className="pt-2 font-bold text-[#202820]">3. Operating Expenses Breakdown</div>
                      {Object.entries(reportData.statement?.expensesByCategory || {}).map(([cat, amt]) => (
                        <div key={cat} className="flex justify-between py-1.5 pl-4 text-[#69736B]">
                          <span>{cat}</span>
                          <span className="text-[#DC2626]">- {formatETB(Number(amt))}</span>
                        </div>
                      ))}

                      <div className="flex justify-between py-3 bg-[#276749] text-white px-4 rounded-xl font-bold text-base mt-4 shadow-sm">
                        <span>Net Operating Profit</span>
                        <span>{formatETB(reportData.statement?.netOperatingProfit || 0)} ({reportData.statement?.netMarginPct}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Working Capital & Receivables */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-3">
                      <div className="text-xs font-bold text-[#202820] pb-2 border-b border-[#E3E7E1]">
                        Cash Collected by Settlement Channel
                      </div>
                      <div className="space-y-2 text-xs">
                        {Object.entries(reportData.workingCapital?.cashByMethod || {}).map(([method, amt]) => (
                          <div key={method} className="flex justify-between items-center p-2 rounded-xl bg-[#FAFBF9] border border-[#E3E7E1]">
                            <span className="font-semibold text-[#202820]">{method}</span>
                            <span className="font-bold text-[#16A34A]">{formatETB(Number(amt))}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-3">
                      <div className="text-xs font-bold text-[#202820] pb-2 border-b border-[#E3E7E1]">
                        Accounts Receivable (Customer Debtors)
                      </div>
                      <div className="space-y-2 text-xs">
                        {reportData.workingCapital?.debtors?.map((d: any) => (
                          <div key={d.id} className="flex justify-between items-center p-2 rounded-xl bg-[#FAFBF9] border border-[#E3E7E1]">
                            <div>
                              <div className="font-bold text-[#202820]">{d.name}</div>
                              <div className="text-[10px] text-[#69736B]">{d.phone || 'No phone'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-[#DC2626]">{formatETB(Number(d.outstanding_balance))}</div>
                              <div className="text-[10px] text-[#DC2626]">Due balance</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------
                  5. DEDICATED TAX REPORT VIEW
              ------------------------------------------------------------- */}
              {activeReportView === 'TAX' && (
                <div className="space-y-6">
                  {/* Compliance Notice Banner */}
                  <div className="bg-[#FAFBF9] rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-[#0D9488] shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-[#202820]">
                          Ethiopian Revenue & Customs Authority (ERCA) Tax Modeling
                        </div>
                        <div className="text-[11px] text-[#69736B] mt-1 leading-relaxed">
                          Company TIN: <strong>{reportData.companyInfo?.tinNumber || 'Not Configured (Default Model)'}</strong>.
                          {reportData.complianceNotice}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4 Tax KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Gross Taxable Turnover</div>
                      <div className="text-xl font-bold text-[#202820]">
                        {formatETB(reportData.summary?.totalTaxableSales || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Across {reportData.summary?.salesCount || 0} recognized sales
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Standard 15% VAT Liability</div>
                      <div className="text-xl font-bold text-[#0D9488]">
                        {formatETB(reportData.summary?.vat?.outputVat || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Gross output tax collected on sales
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Turnover Tax (TOT 2%)</div>
                      <div className="text-xl font-bold text-[#2563EB]">
                        {formatETB(reportData.summary?.tot?.estimatedTot || 0)}
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Applicable for non-VAT registered supplies
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-[#69736B] mb-1">Input VAT Deduction</div>
                      <div className="text-sm font-semibold text-[#69736B] mt-1">
                        External Invoicing
                      </div>
                      <div className="text-[11px] text-[#69736B] mt-1">
                        Procurement handled outside FurniERP via phone; file credits from physical tax invoices
                      </div>
                    </div>
                  </div>

                  
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs font-bold text-[#202820]">
                      Sales Output Tax Ledger ({reportData.salesLedger?.length || 0} transactions)
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-80 px-3 py-1.5 border border-[#E3E7E1] rounded-xl bg-[#FAFBF9]">
                      <Search className="w-3.5 h-3.5 text-[#69736B]" />
                      <input
                        type="text"
                        placeholder="Search invoice #, customer name..."
                        value={reportSearch}
                        onChange={e => setReportSearch(e.target.value)}
                        className="w-full text-xs bg-transparent border-none focus:outline-hidden text-[#202820]"
                      />
                    </div>
                  </div>

                  {/* Tax Data Table */}
                  <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
                    <div className="p-4 border-b border-[#E3E7E1] text-xs font-bold">
                      'Sales Output Tax Liability Ledger' ({filteredReportRows.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Reference</th>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Counterparty</th>
                            <th className="py-3 px-4 text-right">Taxable Base</th>
                            <th className="py-3 px-4 text-right">Standard 15% VAT</th>
                            <th className="py-3 px-4 text-right">'2% TOT'</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E7E1]">
                          {filteredReportRows.map((t: any) => (
                            <tr key={t.id} className="hover:bg-[#FAFBF9]">
                              <td className="py-3 px-4 font-mono font-bold text-[#0D9488]">{t.reference}</td>
                              <td className="py-3 px-4 text-[#69736B]">{new Date(t.date).toLocaleDateString()}</td>
                              <td className="py-3 px-4 font-bold text-[#202820]">{t.counterparty}</td>
                              <td className="py-3 px-4 text-right font-medium">{formatETB(t.taxableBase)}</td>
                              <td className="py-3 px-4 text-right font-bold text-[#0D9488]">{formatETB(t.vat15 || 0)}</td>
                              <td className="py-3 px-4 text-right text-[#69736B]">{formatETB(t.tot2 || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* =========================================================================
            DEFAULT VIEW: MAIN FINANCE DASHBOARD (Matching Reference Screenshot)
        ========================================================================= */
        <div className="space-y-6">
          {/* 1. TOP HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#202820] tracking-tight">Finance & Reports</h1>
              <p className="text-xs text-[#69736B] mt-0.5">
                Financial performance, revenue tracking & multi-ledger reporting
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Audit Ledger Button */}
              <button
                onClick={handleOpenReconciliation}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E3E7E1] bg-white text-xs font-semibold text-[#202820] hover:border-[#276749] hover:text-[#276749] transition-all shadow-2xs"
              >
                <ShieldCheck className="w-4 h-4 text-[#276749]" />
                <span>Audit Ledger</span>
              </button>

              {/* Date Range Selector Pill */}
              <div className="relative">
                <button
                  onClick={() => setShowDatePickerMenu(!showDatePickerMenu)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E3E7E1] bg-white text-xs font-semibold text-[#202820] hover:border-[#276749] transition-all shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#69736B]" />
                  <span>{activeDateRange.label}</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-[#69736B] transition-transform ${showDatePickerMenu ? 'rotate-90' : ''}`} />
                </button>

                {/* Date Preset Dropdown */}
                {showDatePickerMenu && (
                  <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-[#E3E7E1] shadow-lg py-1.5 z-40 text-xs font-medium text-[#202820]">
                    <button
                      onClick={() => { setDateFilter('THIS_MONTH'); setShowDatePickerMenu(false); }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-[#FAFBF9] transition-colors ${dateFilter === 'THIS_MONTH' ? 'text-[#276749] font-bold bg-[#EBF3EE]' : ''}`}
                    >
                      This Month (Current)
                    </button>
                    <button
                      onClick={() => { setDateFilter('TODAY'); setShowDatePickerMenu(false); }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-[#FAFBF9] transition-colors ${dateFilter === 'TODAY' ? 'text-[#276749] font-bold bg-[#EBF3EE]' : ''}`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { setDateFilter('LAST_MONTH'); setShowDatePickerMenu(false); }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-[#FAFBF9] transition-colors ${dateFilter === 'LAST_MONTH' ? 'text-[#276749] font-bold bg-[#EBF3EE]' : ''}`}
                    >
                      Last Month
                    </button>
                    <button
                      onClick={() => { setDateFilter('THIS_YEAR'); setShowDatePickerMenu(false); }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-[#FAFBF9] transition-colors ${dateFilter === 'THIS_YEAR' ? 'text-[#276749] font-bold bg-[#EBF3EE]' : ''}`}
                    >
                      This Year
                    </button>
                    <button
                      onClick={() => { setDateFilter('ALL'); setShowDatePickerMenu(false); }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-[#FAFBF9] transition-colors ${dateFilter === 'ALL' ? 'text-[#276749] font-bold bg-[#EBF3EE]' : ''}`}
                    >
                      All Time
                    </button>
                    <div className="border-t border-[#E3E7E1] my-1 pt-1.5 px-3.5">
                      <div className="text-[10px] uppercase font-bold text-[#69736B] mb-1">Custom Range</div>
                      <div className="flex flex-col gap-1.5 pb-1">
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => { setCustomStartDate(e.target.value); setDateFilter('CUSTOM'); }}
                          className="px-2 py-1 text-xs border border-[#E3E7E1] rounded-lg text-[#202820]"
                        />
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => { setCustomEndDate(e.target.value); setDateFilter('CUSTOM'); }}
                          className="px-2 py-1 text-xs border border-[#E3E7E1] rounded-lg text-[#202820]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => fetchAllFinancials(true)}
                disabled={refreshing}
                className="p-2 rounded-xl border border-[#E3E7E1] bg-white text-[#69736B] hover:text-[#276749] hover:border-[#276749] transition-all disabled:opacity-50"
                title="Refresh Financial Data"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#276749]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => fetchAllFinancials(true)} className="font-semibold underline ml-2">
                Retry
              </button>
            </div>
          )}

          {/* 2. FOUR TOP FINANCIAL KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Income */}
            <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#69736B]">Total Income</span>
                <div className="w-9 h-9 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A]">
                  <TrendingUp className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#202820] tabular-nums tracking-tight">
                {formatETB(summary?.pnl.totalRevenue || 0)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#16A34A]">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{summary?.comparison?.revenueChangePct ? `↑ ${summary.comparison.revenueChangePct}%` : 'Stable'} vs. previous period</span>
              </div>
            </div>

            {/* Card 2: Total Expenses */}
            <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#69736B]">Total Expenses</span>
                <div className="w-9 h-9 rounded-full bg-[#FEE2E2] flex items-center justify-center text-[#DC2626]">
                  <CreditCard className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#202820] tabular-nums tracking-tight">
                {formatETB(summary?.pnl.totalExpenses || 0)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#DC2626]">
                <span>Operating workshop costs recorded</span>
              </div>
            </div>

            {/* Card 3: Net Profit */}
            <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#69736B]">Net Profit</span>
                <div className="w-9 h-9 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#2563EB]">
                  <BarChart3 className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#202820] tabular-nums tracking-tight">
                {formatETB(summary?.pnl.netProfit || 0)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#2563EB]">
                <span>{summary?.pnl.netMarginPct ? `${summary.pnl.netMarginPct}% Net Margin` : 'Calculated real margin'}</span>
              </div>
            </div>

            {/* Card 4: Outstanding Invoices */}
            <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#69736B]">Outstanding Invoices</span>
                <div className="w-9 h-9 rounded-full bg-[#F3E8FF] flex items-center justify-center text-[#9333EA]">
                  <FileText className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#202820] tabular-nums tracking-tight">
                {formatETB(summary?.outstandingInvoices.total || 0)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#9333EA]">
                <span>{summary?.outstandingInvoices.count || 0} invoices pending payment</span>
              </div>
            </div>
          </div>

          {/* 3. CHARTS ROW (Area Chart + Donut Chart) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Area Chart (8 cols): Income vs Expenses */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#202820]">Income vs Expenses</h3>
                  <p className="text-xs text-[#69736B] mt-0.5">Continuous daily operational cash flow</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#276749]" />
                    <span className="text-[#69736B]">Income</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                    <span className="text-[#69736B]">Expenses</span>
                  </div>
                </div>
              </div>

              {/* Chart SVG */}
              <div className="relative w-full h-[220px]">
                {chartGeometry ? (
                  <svg
                    viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#276749" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#276749" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity="0.01" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    {chartGeometry.yAxisTicks.map((tick, i) => (
                      <g key={i}>
                        <line
                          x1={chartGeometry.padding.left}
                          y1={tick.y}
                          x2={chartGeometry.width - chartGeometry.padding.right}
                          y2={tick.y}
                          stroke="#F0F2EE"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={chartGeometry.padding.left - 8}
                          y={tick.y + 4}
                          textAnchor="end"
                          className="text-[10px] fill-[#9CA3AF]"
                        >
                          {tick.label}
                        </text>
                      </g>
                    ))}

                    {/* Area Gradients */}
                    <path d={chartGeometry.incomePaths.area} fill="url(#incomeGradient)" />
                    <path d={chartGeometry.expensePaths.area} fill="url(#expenseGradient)" />

                    {/* Curves */}
                    <path d={chartGeometry.incomePaths.line} fill="none" stroke="#276749" strokeWidth="2.5" strokeLinecap="round" />
                    <path d={chartGeometry.expensePaths.line} fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />

                    {/* Hover points */}
                    {timeSeries.map((point, i) => {
                      const cx = chartGeometry.getX(i);
                      const cyIncome = chartGeometry.getY(point.income);
                      const cyExpense = chartGeometry.getY(point.expenses);
                      const isHovered = hoveredPoint?.date === point.date;

                      return (
                        <g key={point.date} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)}>
                          {point.income > 0 && (
                            <circle
                              cx={cx}
                              cy={cyIncome}
                              r={isHovered ? 5.5 : 3.5}
                              fill="#FFFFFF"
                              stroke="#276749"
                              strokeWidth={isHovered ? 3 : 2}
                              className="transition-all cursor-pointer"
                            />
                          )}
                          {point.expenses > 0 && (
                            <circle
                              cx={cx}
                              cy={cyExpense}
                              r={isHovered ? 5.5 : 3}
                              fill="#FFFFFF"
                              stroke="#EF4444"
                              strokeWidth={isHovered ? 3 : 2}
                              className="transition-all cursor-pointer"
                            />
                          )}
                          <text
                            x={cx}
                            y={chartGeometry.height - 8}
                            textAnchor="middle"
                            className="text-[10px] fill-[#9CA3AF]"
                          >
                            {point.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#69736B]">
                    No time series data recorded for the selected period.
                  </div>
                )}

                {/* Tooltip on Hover */}
                {hoveredPoint && (
                  <div className="absolute top-2 right-4 bg-white/95 backdrop-blur-xs border border-[#E3E7E1] rounded-xl shadow-md p-2.5 text-xs z-20 pointer-events-none">
                    <div className="font-bold text-[#202820] mb-1">{hoveredPoint.label}</div>
                    <div className="flex items-center gap-2 text-[#276749]">
                      <span className="w-2 h-2 rounded-full bg-[#276749]" />
                      <span>Income: {formatETB(hoveredPoint.income)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#EF4444]">
                      <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                      <span>Expenses: {formatETB(hoveredPoint.expenses)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Donut Chart (4 cols): Expense Breakdown */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-[#202820]">Expense Breakdown</h3>
                  <p className="text-xs text-[#69736B] mt-0.5">Categorical cost allocation</p>
                </div>
              </div>

              {donutGeometry && donutGeometry.slices.length > 0 ? (
                <div className="flex flex-col items-center justify-center my-auto">
                  {/* Donut SVG */}
                  <div className="relative w-[160px] h-[160px]">
                    <svg viewBox={`0 0 ${donutGeometry.size} ${donutGeometry.size}`} className="w-full h-full">
                      {donutGeometry.slices.map(slice => {
                        const isHovered = hoveredDonutCategory === slice.category;
                        return (
                          <path
                            key={slice.category}
                            d={slice.pathData}
                            fill={slice.color}
                            className="transition-transform duration-200 cursor-pointer"
                            style={{
                              transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                              transformOrigin: `${donutGeometry.center}px ${donutGeometry.center}px`,
                              opacity: hoveredDonutCategory && !isHovered ? 0.6 : 1,
                            }}
                            onMouseEnter={() => setHoveredDonutCategory(slice.category)}
                            onMouseLeave={() => setHoveredDonutCategory(null)}
                          />
                        );
                      })}
                    </svg>

                    {/* Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[11px] text-[#69736B]">Total</span>
                      <span className="text-xs font-bold text-[#202820]">
                        {formatETB(expenseBreakdown.reduce((s, x) => s + x.amount, 0))}
                      </span>
                    </div>
                  </div>

                  {/* Categories Legend List */}
                  <div className="w-full space-y-1.5 mt-3 pt-2 border-t border-[#E3E7E1] text-xs">
                    {expenseBreakdown.map(cat => (
                      <div
                        key={cat.category}
                        className={`flex items-center justify-between py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                          hoveredDonutCategory === cat.category ? 'bg-[#FAFBF9] font-bold' : ''
                        }`}
                        onMouseEnter={() => setHoveredDonutCategory(cat.category)}
                        onMouseLeave={() => setHoveredDonutCategory(null)}
                      >
                        <div className="flex items-center gap-2 truncate max-w-[180px]">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="truncate text-[#202820]">{cat.category}</span>
                        </div>
                        <span className="font-semibold text-[#69736B] shrink-0">
                          {cat.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[#69736B] my-auto">
                  No expense records found for this period.
                </div>
              )}
            </div>
          </div>

          {/* 4. BOTTOM ROW: TRANSACTIONS TABLE (70%) + QUICK REPORTS (30%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column (8 cols): Financial Transactions Workspace */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
              {/* Header with Type Filter & Action Buttons */}
              <div className="p-4 border-b border-[#E3E7E1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-bold text-[#202820]">Financial Transactions</div>
                  <span className="text-xs text-[#69736B]">({totalCount})</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Type Filter */}
                  <select
                    value={typeFilter}
                    onChange={e => { setTypeFilter(e.target.value as any); setCurrentPage(1); }}
                    className="px-2.5 py-1.5 bg-white border border-[#E3E7E1] rounded-xl text-xs font-medium text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="ALL">All Types</option>
                    <option value="INCOME">Income Only</option>
                    <option value="EXPENSE">Expense Only</option>
                  </select>

                  {/* Export Button */}
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E3E7E1] bg-white text-xs font-semibold text-[#202820] hover:bg-[#FAFBF9] transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-[#69736B]" />
                    <span>Export</span>
                  </button>

                  {/* New Transaction Button */}
                  <button
                    onClick={() => setShowNewExpenseModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#276749] text-white text-xs font-semibold hover:bg-[#1E523A] transition-all shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>New Transaction</span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-4 py-2.5 border-b border-[#E3E7E1] bg-white flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[#69736B]" />
                <input
                  type="text"
                  placeholder="Search transactions by reference, customer, or category..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full text-xs bg-transparent border-none focus:outline-hidden text-[#202820] placeholder-[#9CA3AF]"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-[#69736B] hover:text-[#202820]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Transaction / Ref</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Counterparty</th>
                      <th className="py-3 px-4 text-right">Amount (ETB)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E7E1]">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-xs text-[#69736B]">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#276749] mb-2" />
                          <span>Loading financial transactions from database...</span>
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-xs text-[#69736B]">
                          No financial transactions matching the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      transactions.map(tx => (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTransactionDetail(tx)}
                          className="hover:bg-[#FAFBF9] transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#202820] flex items-center gap-1.5">
                              <span>{tx.description}</span>
                            </div>
                            <div className="text-[10px] font-mono text-[#69736B]">{tx.reference}</div>
                          </td>
                          <td className="py-3 px-4 text-[#69736B] whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#F3F4F6] text-[#4B5563]">
                              {tx.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#202820] font-medium">
                            {tx.counterparty}
                          </td>
                          <td className={`py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                            tx.type === 'INCOME' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}>
                            {tx.type === 'INCOME' ? `+ ${formatETB(tx.amount)}` : `- ${formatETB(tx.amount)}`}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              tx.status === 'Paid' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                              tx.status === 'Partial' ? 'bg-[#FEF3C7] text-[#D97706]' :
                              'bg-[#FEE2E2] text-[#DC2626]'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedTransactionDetail(tx); }}
                              className="p-1 hover:bg-[#EBF3EE] text-[#69736B] hover:text-[#276749] rounded-lg transition-colors"
                              title="View Detail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-3 border-t border-[#E3E7E1] flex items-center justify-between text-xs text-[#69736B]">
                  <span>Showing page {currentPage} of {totalPages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg border border-[#E3E7E1] bg-white disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg border border-[#E3E7E1] bg-white disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (4 cols): Quick Reports Card (Clicking opens dedicated views) */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E3E7E1]">
                <div className="w-7 h-7 rounded-lg bg-[#EBF3EE] text-[#276749] flex items-center justify-center">
                  <FileText className="w-4 h-4 stroke-[2.2]" />
                </div>
                <h3 className="text-sm font-bold text-[#202820]">Quick Reports</h3>
              </div>

              <div className="space-y-2">
                {/* 1. Sales Report */}
                <button
                  onClick={() => handleOpenReport('SALES')}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E3E7E1] hover:border-[#276749] hover:bg-[#FAFBF9] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] shrink-0">
                      <BarChart3 className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#202820] group-hover:text-[#276749] transition-colors">
                        Sales Report
                      </div>
                      <div className="text-[11px] text-[#69736B]">
                        Total sales, daily/weekly/monthly
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#276749] transition-transform group-hover:translate-x-0.5" />
                </button>



                {/* 3. Inventory Report */}
                <button
                  onClick={() => handleOpenReport('INVENTORY')}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E3E7E1] hover:border-[#276749] hover:bg-[#FAFBF9] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0">
                      <Package className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#202820] group-hover:text-[#276749] transition-colors">
                        Inventory Report
                      </div>
                      <div className="text-[11px] text-[#69736B]">
                        Stock levels and movement
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#276749] transition-transform group-hover:translate-x-0.5" />
                </button>

                {/* 4. Finance Report */}
                <button
                  onClick={() => handleOpenReport('FINANCE')}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E3E7E1] hover:border-[#276749] hover:bg-[#FAFBF9] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] shrink-0">
                      <Receipt className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#202820] group-hover:text-[#276749] transition-colors">
                        Finance Report
                      </div>
                      <div className="text-[11px] text-[#69736B]">
                        Income, expenses, profit & loss
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#276749] transition-transform group-hover:translate-x-0.5" />
                </button>

                {/* 5. Tax Report */}
                <button
                  onClick={() => handleOpenReport('TAX')}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[#E3E7E1] hover:border-[#276749] hover:bg-[#FAFBF9] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] shrink-0">
                      <FileText className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#202820] group-hover:text-[#276749] transition-colors">
                        Tax Report
                      </div>
                      <div className="text-[11px] text-[#69736B]">
                        Tax summary and filing details
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#276749] transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS & DRILLDOWN PANELS
      ========================================================================= */}

      {/* 1. Modal: Sale Detail Drilldown */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div>
                <h3 className="text-base font-bold text-[#202820]">Invoice {selectedSaleDetail.invoice_number}</h3>
                <p className="text-xs text-[#69736B]">
                  Date: {new Date(selectedSaleDetail.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedSaleDetail(null)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#FAFBF9] rounded-xl border border-[#E3E7E1]">
                <div className="text-[#69736B]">Customer Details</div>
                <div className="font-bold text-[#202820]">{selectedSaleDetail.customer?.name || 'Walk-in Customer'}</div>
                <div className="text-[#69736B]">{selectedSaleDetail.customer?.phone || 'No phone'}</div>
              </div>
              <div className="p-3 bg-[#FAFBF9] rounded-xl border border-[#E3E7E1]">
                <div className="text-[#69736B]">Payment Status</div>
                <div className="font-bold text-[#276749]">{selectedSaleDetail.status}</div>
                <div className="text-[#69736B]">Paid: {formatETB(Number(selectedSaleDetail.paid_amount || 0))}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-[#202820] mb-2">Itemized Furniture Products</div>
              <div className="border border-[#E3E7E1] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] text-[#69736B]">
                    <tr>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Cost</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E7E1]">
                    {selectedSaleDetail.items?.map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-2 px-3 font-medium text-[#202820]">
                          <div>{item.product?.name}</div>
                          <div className="text-[10px] text-[#69736B]">{item.product?.sku}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-bold">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatETB(Number(item.unit_price))}</td>
                        <td className="py-2 px-3 text-right text-[#69736B]">{formatETB(Number(item.cost_price))}</td>
                        <td className="py-2 px-3 text-right font-bold text-[#276749]">{formatETB(Number(item.total_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E3E7E1] flex justify-between items-center text-xs">
              <span className="font-bold text-[#202820]">Total Invoice Balance Due</span>
              <span className="text-base font-bold text-[#DC2626]">{formatETB(Number(selectedSaleDetail.balance_due || 0))}</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="px-4 py-2 bg-[#276749] text-white rounded-xl text-xs font-semibold hover:bg-[#1E523A]"
              >
                Close Invoice View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Purchase Detail Drilldown */}
      {selectedPurchaseDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div>
                <h3 className="text-base font-bold text-[#202820]">PO {selectedPurchaseDetail.purchase_number}</h3>
                <p className="text-xs text-[#69736B]">Supplier: {selectedPurchaseDetail.supplier?.name}</p>
              </div>
              <button onClick={() => setSelectedPurchaseDetail(null)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Order Date:</span>
                <span className="font-bold">{new Date(selectedPurchaseDetail.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Status:</span>
                <span className="font-bold text-[#9333EA]">{selectedPurchaseDetail.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Total Order Cost:</span>
                <span className="font-bold text-[#202820]">{formatETB(Number(selectedPurchaseDetail.total_cost || 0))}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Paid to Supplier:</span>
                <span className="font-bold text-[#16A34A]">{formatETB(Number(selectedPurchaseDetail.paid_amount || 0))}</span>
              </div>
              <div className="flex justify-between py-1 font-bold">
                <span className="text-[#DC2626]">Outstanding Payables:</span>
                <span className="text-[#DC2626]">{formatETB(Number(selectedPurchaseDetail.balance_due || 0))}</span>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setSelectedPurchaseDetail(null)}
                className="px-4 py-2 bg-[#276749] text-white rounded-xl text-xs font-semibold hover:bg-[#1E523A]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Product Inventory Detail Drilldown */}
      {selectedProductDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div>
                <h3 className="text-base font-bold text-[#202820]">{selectedProductDetail.productName}</h3>
                <p className="text-xs font-mono text-[#69736B]">SKU: {selectedProductDetail.sku}</p>
              </div>
              <button onClick={() => setSelectedProductDetail(null)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Location:</span>
                <span className="font-bold text-[#202820]">{selectedProductDetail.locationName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Quantity in Stock:</span>
                <span className="font-bold text-[#202820]">{selectedProductDetail.quantity} {selectedProductDetail.unitOfMeasure}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Unit Cost:</span>
                <span className="font-medium text-[#69736B]">{formatETB(selectedProductDetail.unitCost)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Selling Price:</span>
                <span className="font-bold text-[#276749]">{formatETB(selectedProductDetail.sellingPrice)}</span>
              </div>
              <div className="flex justify-between py-2 bg-[#FAFBF9] px-3 rounded-lg font-bold">
                <span>Total Asset Valuation:</span>
                <span className="text-[#276749]">{formatETB(selectedProductDetail.totalValuation)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setSelectedProductDetail(null)}
                className="px-4 py-2 bg-[#276749] text-white rounded-xl text-xs font-semibold hover:bg-[#1E523A]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: General Transaction Detail Drilldown */}
      {selectedTransactionDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  selectedTransactionDetail.type === 'INCOME' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEE2E2] text-[#DC2626]'
                }`}>
                  {selectedTransactionDetail.type === 'INCOME' ? <TrendingUp className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#202820]">Transaction Details</h3>
                  <p className="text-[11px] font-mono text-[#69736B]">{selectedTransactionDetail.reference}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTransactionDetail(null)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Date:</span>
                <span className="font-semibold text-[#202820]">{new Date(selectedTransactionDetail.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Description:</span>
                <span className="font-semibold text-[#202820] text-right">{selectedTransactionDetail.description}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Category:</span>
                <span className="font-semibold text-[#202820]">{selectedTransactionDetail.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E3E7E1]">
                <span className="text-[#69736B]">Counterparty:</span>
                <span className="font-semibold text-[#202820]">{selectedTransactionDetail.counterparty}</span>
              </div>
              <div className="flex justify-between py-2 bg-[#FAFBF9] px-3 rounded-lg font-bold text-sm">
                <span>Settled Amount:</span>
                <span className={selectedTransactionDetail.type === 'INCOME' ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                  {formatETB(selectedTransactionDetail.amount)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3">
              {selectedTransactionDetail.category === 'Expense' ? (
                <button
                  type="button"
                  onClick={() => handleDeleteExpense(selectedTransactionDetail)}
                  className="px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Move to Recovery Center
                </button>
              ) : <div />}
              <button
                onClick={() => setSelectedTransactionDetail(null)}
                className="px-4 py-2 bg-[#276749] text-white rounded-xl text-xs font-semibold hover:bg-[#1E523A]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Record New Operating Expense */}
      {showNewExpenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#EBF3EE] text-[#276749] flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#202820]">Record Operating Expense</h3>
                  <p className="text-[11px] text-[#69736B]">Direct debit entry to general ledger</p>
                </div>
              </div>
              <button onClick={() => setShowNewExpenseModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#202820] mb-1">Expense Category</label>
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="Workshop Consumables & Maintenance">Workshop Consumables & Maintenance</option>
                  <option value="Rent & Facility Overhead">Rent & Facility Overhead</option>
                  <option value="Electricity & Generator Fuel">Electricity & Generator Fuel</option>
                  <option value="Logistics & Delivery Transport">Logistics & Delivery Transport</option>
                  <option value="Administrative & Office Supplies">Administrative & Office Supplies</option>
                  <option value="Marketing & Showroom Display">Marketing & Showroom Display</option>
                  <option value="Worker Food & Refreshments">Worker Food & Refreshments</option>
                  <option value="General & Miscellaneous">General & Miscellaneous</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#202820] mb-1">Amount (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 1500.00"
                  value={expenseAmount || ''}
                  onChange={e => setExpenseAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl focus:border-[#276749] focus:outline-hidden font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#202820] mb-1">Payment Method</label>
                  <select
                    value={expensePaymentMethod}
                    onChange={e => setExpensePaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl focus:border-[#276749] focus:outline-hidden"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="EBIRR">eBirr</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#202820] mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#202820] mb-1">Description / Memo</label>
                <textarea
                  rows={2}
                  placeholder="Purpose of expense, receipt details..."
                  value={expenseDesc}
                  onChange={e => setExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E7E1]">
                <button
                  type="button"
                  onClick={() => setShowNewExpenseModal(false)}
                  className="px-4 py-2 border border-[#E3E7E1] rounded-xl font-semibold text-[#69736B] hover:bg-[#FAFBF9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExpense}
                  className="px-4 py-2 bg-[#276749] text-white rounded-xl font-semibold hover:bg-[#1E523A] transition-all disabled:opacity-50"
                >
                  {submittingExpense ? 'Recording...' : 'Post Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Audit Ledger & Cash Reconciliation */}
      {showReconciliationModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-[#E3E7E1] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#276749]" />
                <h3 className="text-sm font-bold text-[#202820]">Audit Ledger & Cash Integrity Verification</h3>
              </div>
              <button onClick={() => setShowReconciliationModal(false)} className="text-[#69736B] hover:text-[#202820]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {reconciliationLoading ? (
              <div className="py-12 text-center text-xs text-[#69736B]">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#276749] mb-2" />
                <span>Running automated multi-ledger integrity checks...</span>
              </div>
            ) : reconciliation ? (
              <div className="space-y-4 text-xs">
                {/* Integrity Checklist */}
                <div>
                  <div className="font-bold text-[#202820] mb-2">Automated Ledger Integrity Status</div>
                  <div className="space-y-2">
                    {reconciliation.integrityChecks?.map((chk, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl border border-[#E3E7E1] bg-[#FAFBF9]">
                        <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-[#202820]">{chk.check}</div>
                          <div className="text-[11px] text-[#69736B]">{chk.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cash Reconciliation Summary */}
                <div className="bg-[#FAFBF9] rounded-xl border border-[#E3E7E1] p-4 space-y-2">
                  <div className="font-bold text-[#202820] pb-2 border-b border-[#E3E7E1]">Cash Position Audit</div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#69736B]">Cash Collections (Physical Drawer):</span>
                    <span className="font-bold text-[#16A34A]">{formatETB(reconciliation.reconciliation.cashCollectedViaCash)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#69736B]">Bank Deposits & Transfers:</span>
                    <span className="font-bold text-[#202820]">{formatETB(reconciliation.reconciliation.cashCollectedViaBank)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#69736B]">eBirr / CBE Birr Settlements:</span>
                    <span className="font-bold text-[#202820]">
                      {formatETB(reconciliation.reconciliation.cashCollectedViaEbirr + reconciliation.reconciliation.cashCollectedViaCbeBirr)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-[#E3E7E1] font-bold text-sm">
                    <span>Reconciled System Cash Inflow:</span>
                    <span className="text-[#276749]">{formatETB(reconciliation.reconciliation.systemCashBalance)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowReconciliationModal(false)}
                className="px-4 py-2 bg-[#276749] text-white rounded-xl text-xs font-semibold hover:bg-[#1E523A]"
              >
                Close Audit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
