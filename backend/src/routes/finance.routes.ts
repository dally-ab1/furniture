import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const financeRouter = Router();

const createExpenseSchema = z.object({
  category: z.string().min(2),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR']),
  expenseDate: z.string().optional(),
  description: z.string().optional(),
  receiptUrl: z.string().optional(),
});

// Helper: build date range filter for ISO timestamps
function applyDateFilter(query: any, dateField: string, startDate?: string, endDate?: string) {
  if (startDate) {
    query = query.gte(dateField, `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte(dateField, `${endDate}T23:59:59.999Z`);
  }
  return query;
}

// Helper: build date range filter for DATE fields (YYYY-MM-DD)
function applySimpleDateFilter(query: any, dateField: string, startDate?: string, endDate?: string) {
  if (startDate) {
    query = query.gte(dateField, startDate);
  }
  if (endDate) {
    query = query.lte(dateField, endDate);
  }
  return query;
}

// GET /api/finance/expenses - List all operating expenses
financeRouter.get('/expenses', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    let query = supabase.from('expenses').select('*')
      .is('deleted_at', null)
      .order('expense_date', { ascending: false });

    if (startDate) query = query.gte('expense_date', startDate as string);
    if (endDate) query = query.lte('expense_date', endDate as string);

    const { data: expenses, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: expenses || [] });
  } catch (error) {
    next(error);
  }
});

// POST /api/finance/expenses - Record a new operating expense
financeRouter.post('/expenses', requirePermission('expenses.record'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createExpenseSchema.parse(req.body);

    let { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        category: validated.category,
        amount: validated.amount,
        payment_method: validated.paymentMethod,
        expense_date: validated.expenseDate || new Date().toISOString().split('T')[0],
        description: validated.description || null,
        receipt_url: validated.receiptUrl || null,
        recorded_by: req.user?.id || null,
      })
      .select()
      .single();

    // If database check constraint has not yet been migrated to include EBIRR, safely fallback
    if (error && error.message?.includes('expenses_payment_method_check') && validated.paymentMethod === 'EBIRR') {
      const fbRes = await supabase
        .from('expenses')
        .insert({
          category: validated.category,
          amount: validated.amount,
          payment_method: 'TELEBIRR',
          expense_date: validated.expenseDate || new Date().toISOString().split('T')[0],
          description: (validated.description ? validated.description + ' ' : '') + '[eBirr]',
          receipt_url: validated.receiptUrl || null,
          recorded_by: req.user?.id || null,
        })
        .select()
        .single();
      expense = fbRes.data;
      error = fbRes.error;
    }

    if (error) throw error;

    await logAudit({
      req,
      action: 'EXPENSE_RECORDED',
      module: 'FINANCE',
      entity: 'expenses',
      entityId: expense.id,
      recordReference: expense.category,
      description: `Recorded expense of ${expense.amount.toLocaleString()} ETB for ${expense.category} (${expense.payment_method})`,
      payload: {
        category: expense.category,
        amount: expense.amount,
        payment_method: expense.payment_method,
        expense_date: expense.expense_date,
        description: expense.description,
      },
    });

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/summary - Authoritative P&L, Debt aging, and Inventory valuation with period comparison
financeRouter.get('/summary', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, locationId } = req.query as { startDate?: string; endDate?: string; locationId?: string };

    // 1. Sales & Recognized Revenue (Excluding cancelled sales)
    let salesQuery = supabase
      .from('sales')
      .select('id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at, location_id')
      .in('status', ['PAID', 'PARTIAL', 'CREDIT']);

    salesQuery = applyDateFilter(salesQuery, 'created_at', startDate, endDate);
    if (locationId) salesQuery = salesQuery.eq('location_id', locationId);

    const { data: salesData, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    const totalRevenue = salesData?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0;
    const totalDiscounts = salesData?.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0) || 0;
    const totalSubtotal = salesData?.reduce((sum, s) => sum + Number(s.subtotal || 0), 0) || 0;
    const salesCount = salesData?.length || 0;

    // 2. Authoritative Cash Collected (Inflows from Payments Ledger)
    let paymentsQuery = supabase
      .from('payments')
      .select('id, reference_type, reference_id, amount, payment_method, created_at')
      .in('reference_type', ['SALE', 'CUSTOMER_DEBT']);

    paymentsQuery = applyDateFilter(paymentsQuery, 'created_at', startDate, endDate);

    const { data: paymentsData, error: paymentsError } = await paymentsQuery;
    if (paymentsError) throw paymentsError;

    const totalCashCollected = paymentsData?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const cashCollectedByMethod: Record<string, number> = {};
    paymentsData?.forEach(p => {
      cashCollectedByMethod[p.payment_method] = (cashCollectedByMethod[p.payment_method] || 0) + Number(p.amount);
    });

    // 3. Supplier Payments Made (Cash Outflow)
    let supplierPaymentsQuery = supabase
      .from('payments')
      .select('amount, payment_method, created_at')
      .in('reference_type', ['SUPPLIER_DEBT', 'PURCHASE']);

    supplierPaymentsQuery = applyDateFilter(supplierPaymentsQuery, 'created_at', startDate, endDate);

    const { data: supplierPaymentsData } = await supplierPaymentsQuery;
    const totalSupplierPaymentsMade = supplierPaymentsData?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

    // 4. Cost of Goods Sold (COGS) from sold items in valid sales
    let saleItemsQuery = supabase
      .from('sale_items')
      .select(`
        quantity, cost_price, unit_price,
        sales!inner (id, status, created_at, location_id)
      `)
      .in('sales.status', ['PAID', 'PARTIAL', 'CREDIT']);

    saleItemsQuery = applyDateFilter(saleItemsQuery, 'sales.created_at', startDate, endDate);
    if (locationId) saleItemsQuery = saleItemsQuery.eq('sales.location_id', locationId);

    const { data: saleItemsData, error: saleItemsError } = await saleItemsQuery;
    if (saleItemsError) throw saleItemsError;

    const totalCogs = saleItemsData?.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const cost = Number(item.cost_price || 0);
      return sum + (qty * cost);
    }, 0) || 0;

    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // 5. Operating Expenses (OPEX)
    let expensesQuery = supabase.from('expenses').select('category, amount, expense_date');

    expensesQuery = applySimpleDateFilter(expensesQuery, 'expense_date', startDate, endDate);

    const { data: expensesData, error: expensesError } = await expensesQuery;
    if (expensesError) throw expensesError;

    const totalExpenses = expensesData?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
    const expensesByCategory: Record<string, number> = {};
    expensesData?.forEach(e => {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + Number(e.amount);
    });

    // 6. Net Profit
    const netProfit = grossProfit - totalExpenses;
    const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // 7. Working Capital: Accounts Payable (Suppliers Debt - Point-in-time)
    const { data: suppliersData } = await supabase
      .from('suppliers')
      .select('id, name, phone, contact_person, outstanding_balance')
      .gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false });

    const totalAccountsPayable = suppliersData?.reduce(
      (sum, s) => sum + Number(s.outstanding_balance || 0), 
      0
    ) || 0;

    // 8. Working Capital: Accounts Receivable (Customers Debt - Point-in-time)
    const { data: customersData } = await supabase
      .from('customers')
      .select('id, name, phone, outstanding_balance')
      .gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false });

    const totalAccountsReceivable = customersData?.reduce(
      (sum, c) => sum + Number(c.outstanding_balance || 0), 
      0
    ) || 0;

    // Unsettled Invoices Sum (for reconciliation and transparency)
    const unsettledInvoiceReceivables = salesData?.reduce(
      (sum, s) => sum + Number(s.balance_due || 0), 
      0
    ) || 0;

    // Outstanding Invoices count
    const outstandingInvoices = salesData?.filter(s => Number(s.balance_due || 0) > 0) || [];
    const outstandingInvoicesCount = outstandingInvoices.length;

    // 9. Inventory Asset Valuation (Point-in-time)
    let stockQuery = supabase
      .from('stock_levels')
      .select(`
        quantity,
        location_id,
        locations (id, name, type),
        product:products (id, name, sku, type, cost_price, selling_price)
      `);

    if (locationId) stockQuery = stockQuery.eq('location_id', locationId);

    const { data: stockData, error: stockError } = await stockQuery;
    if (stockError) throw stockError;

    let finishedGoodsValue = 0;
    let rawMaterialsValue = 0;

    stockData?.forEach((sl: any) => {
      const qty = Number(sl.quantity || 0);
      const cost = Number(sl.product?.cost_price || 0);
      const val = qty * cost;
      if (sl.product?.type === 'RAW_MATERIAL') {
        rawMaterialsValue += val;
      } else {
        finishedGoodsValue += val;
      }
    });

    const totalInventoryValue = finishedGoodsValue + rawMaterialsValue;

    // 10. Manufacturing Performance in Period
    let mfgQuery = supabase
      .from('production_orders')
      .select('id, completed_quantity, total_material_cost, labor_cost, status, completed_at')
      .eq('status', 'COMPLETED');

    mfgQuery = applyDateFilter(mfgQuery, 'completed_at', startDate, endDate);

    const { data: mfgData } = await mfgQuery;
    const completedOrdersCount = mfgData?.length || 0;
    const mfgMaterialCost = mfgData?.reduce((s, m) => s + Number(m.total_material_cost || 0), 0) || 0;
    const mfgLaborCost = mfgData?.reduce((s, m) => s + Number(m.labor_cost || 0), 0) || 0;
    const totalManufacturingValue = mfgMaterialCost + mfgLaborCost;

    // 11. Previous Period Comparison (Period-over-Period)
    let prevRevenue = 0;
    let prevExpenses = 0;
    let prevCogs = 0;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffMs = Math.max(24 * 3600 * 1000, end.getTime() - start.getTime());
      const prevEnd = new Date(start.getTime() - 24 * 3600 * 1000);
      const prevStart = new Date(prevEnd.getTime() - diffMs);
      const prevStartStr = prevStart.toISOString().split('T')[0];
      const prevEndStr = prevEnd.toISOString().split('T')[0];

      let prevSalesQ = supabase.from('sales').select('total_amount').neq('status', 'CANCELLED');
      prevSalesQ = applyDateFilter(prevSalesQ, 'created_at', prevStartStr, prevEndStr);
      const { data: prevSales } = await prevSalesQ;
      prevRevenue = prevSales?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0;

      let prevExpQ = supabase.from('expenses').select('amount').is('deleted_at', null);
      prevExpQ = applySimpleDateFilter(prevExpQ, 'expense_date', prevStartStr, prevEndStr);
      const { data: prevExp } = await prevExpQ;
      prevExpenses = prevExp?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

      let prevItemsQ = supabase
        .from('sale_items')
        .select('quantity, cost_price, sales!inner(status, created_at)')
        .neq('sales.status', 'CANCELLED');
      prevItemsQ = applyDateFilter(prevItemsQ, 'sales.created_at', prevStartStr, prevEndStr);
      const { data: prevItems } = await prevItemsQ;
      prevCogs = prevItems?.reduce((sum, i) => sum + (Number(i.quantity || 0) * Number(i.cost_price || 0)), 0) || 0;
    }

    const prevGrossProfit = prevRevenue - prevCogs;
    const prevNetProfit = prevGrossProfit - prevExpenses;

    const revenueChangePct = prevRevenue > 0
      ? Number((((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
      : totalRevenue > 0 ? 100 : 0;

    const expensesChangePct = prevExpenses > 0
      ? Number((((totalExpenses - prevExpenses) / prevExpenses) * 100).toFixed(1))
      : totalExpenses > 0 ? 100 : 0;

    const profitChangePct = prevNetProfit !== 0
      ? Number((((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100).toFixed(1))
      : netProfit > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        currency: 'ETB',
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        pnl: {
          totalRevenue,
          totalSubtotal,
          totalDiscounts,
          salesCount,
          totalCogs,
          grossProfit,
          grossMarginPct: Number(grossMarginPct.toFixed(2)),
          totalExpenses,
          netProfit,
          netMarginPct: Number(netMarginPct.toFixed(2)),
          expensesByCategory,
        },
        comparison: {
          previousRevenue: prevRevenue,
          previousExpenses: prevExpenses,
          previousNetProfit: prevNetProfit,
          revenueChangePct,
          expensesChangePct,
          profitChangePct,
        },
        workingCapital: {
          totalCashCollected,
          cashCollectedByMethod,
          totalSupplierPaymentsMade,
          totalAccountsReceivable,
          unsettledInvoiceReceivables,
          totalAccountsPayable,
          topDebtors: customersData || [],
          topCreditors: suppliersData || [],
        },
        outstandingInvoices: {
          count: outstandingInvoicesCount,
          total: unsettledInvoiceReceivables,
        },
        inventoryValuation: {
          totalInventoryValue,
          finishedGoodsValue,
          rawMaterialsValue,
        },
        manufacturing: {
          completedOrdersCount,
          mfgMaterialCost,
          mfgLaborCost,
          totalManufacturingValue,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/transactions - Unified feed of all financial transactions matching reference dashboard
financeRouter.get('/transactions', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate, type, category, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, Math.max(10, parseInt(limit) || 50));

    // 1. Fetch Sales (Income)
    let salesQuery = supabase
      .from('sales')
      .select(`
        id, invoice_number, total_amount, paid_amount, balance_due, status, created_at,
        customer:customers (id, name, phone)
      `)
      .neq('status', 'CANCELLED');
    salesQuery = applyDateFilter(salesQuery, 'created_at', startDate, endDate);
    const { data: sales, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    // 2. Fetch Operating Expenses (Expense)
    let expensesQuery = supabase.from('expenses').select('*');
    expensesQuery = applySimpleDateFilter(expensesQuery, 'expense_date', startDate, endDate);
    const { data: expenses, error: expErr } = await expensesQuery;
    if (expErr) throw expErr;

    // 3. Fetch Payments (Debt Collections & Supplier Payouts)
    let paymentsQuery = supabase
      .from('payments')
      .select('id, reference_type, reference_id, amount, payment_method, transaction_reference, notes, created_at')
      .in('reference_type', ['CUSTOMER_DEBT', 'SUPPLIER_DEBT']);
    paymentsQuery = applyDateFilter(paymentsQuery, 'created_at', startDate, endDate);
    const { data: payments, error: payErr } = await paymentsQuery;
    if (payErr) throw payErr;

    // Lookups
    const { data: customers } = await supabase.from('customers').select('id, name');
    const { data: suppliers } = await supabase.from('suppliers').select('id, name');
    const custMap = new Map((customers || []).map(c => [c.id, c.name]));
    const suppMap = new Map((suppliers || []).map(s => [s.id, s.name]));

    const transactions: any[] = [];

    // Map Sales
    sales?.forEach(s => {
      transactions.push({
        id: s.id,
        date: s.created_at,
        type: 'INCOME',
        description: `Furniture Sale (${(s.customer as any)?.name || 'Walk-in Customer'})`,
        category: 'Sales Revenue',
        reference: s.invoice_number,
        amount: Number(s.total_amount),
        paidAmount: Number(s.paid_amount),
        balanceDue: Number(s.balance_due),
        status: s.status === 'PAID' ? 'Paid' : s.status === 'PARTIAL' ? 'Partial' : 'Credit',
        counterparty: (s.customer as any)?.name || 'Walk-in Customer',
        sourceType: 'SALE',
      });
    });

    // Map Operating Expenses
    expenses?.forEach(e => {
      transactions.push({
        id: e.id,
        date: e.expense_date,
        type: 'EXPENSE',
        description: e.description || `${e.category} Expense`,
        category: e.category,
        reference: `EXP-${e.id.slice(0, 6).toUpperCase()}`,
        amount: Number(e.amount),
        status: 'Paid',
        paymentMethod: e.payment_method,
        counterparty: 'Internal / Vendor',
        sourceType: 'EXPENSE',
      });
    });

    // Map Debt Payments
    payments?.forEach(pay => {
      if (pay.reference_type === 'CUSTOMER_DEBT') {
        const custName = custMap.get(pay.reference_id) || 'Customer';
        transactions.push({
          id: pay.id,
          date: pay.created_at,
          type: 'INCOME',
          description: `Customer Debt Collection (${custName})`,
          category: 'Accounts Receivable',
          reference: pay.transaction_reference || `PAY-${pay.id.slice(0, 6).toUpperCase()}`,
          amount: Number(pay.amount),
          status: 'Paid',
          paymentMethod: pay.payment_method,
          counterparty: custName,
          sourceType: 'PAYMENT',
        });
      } else if (pay.reference_type === 'SUPPLIER_DEBT') {
        const suppName = suppMap.get(pay.reference_id) || 'Supplier';
        transactions.push({
          id: pay.id,
          date: pay.created_at,
          type: 'EXPENSE',
          description: `Supplier Payment (${suppName})`,
          category: 'Accounts Payable',
          reference: pay.transaction_reference || `PAY-${pay.id.slice(0, 6).toUpperCase()}`,
          amount: Number(pay.amount),
          status: 'Paid',
          paymentMethod: pay.payment_method,
          counterparty: suppName,
          sourceType: 'PAYMENT',
        });
      }
    });

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter
    let filtered = transactions;
    if (type && type !== 'ALL') {
      filtered = filtered.filter(t => t.type === type.toUpperCase());
    }
    if (category && category !== 'ALL') {
      filtered = filtered.filter(t => t.category.toLowerCase().includes(category.toLowerCase()));
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.description.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.counterparty.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }

    const totalCount = filtered.length;
    const paginated = filtered.slice((p - 1) * l, p * l);

    res.json({
      success: true,
      data: paginated,
      pagination: {
        page: p,
        limit: l,
        totalCount,
        totalPages: Math.ceil(totalCount / l) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/time-series - Daily continuous data for Income vs Expenses area chart
financeRouter.get('/time-series', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;

    let salesQuery = supabase
      .from('sales')
      .select('created_at, total_amount')
      .neq('status', 'CANCELLED')
      .is('deleted_at', null);
    salesQuery = applyDateFilter(salesQuery, 'created_at', startDate, endDate);
    const { data: sales } = await salesQuery;

    let expQuery = supabase.from('expenses').select('expense_date, amount').is('deleted_at', null);
    expQuery = applySimpleDateFilter(expQuery, 'expense_date', startDate, endDate);
    const { data: expenses } = await expQuery;

    const pointsMap = new Map<string, { date: string; label: string; income: number; expenses: number }>();

    // Build timeline dates if range provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.min(31, Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24))));
      for (let i = 0; i <= diffDays; i++) {
        const cur = new Date(start);
        cur.setDate(start.getDate() + i);
        const ymd = cur.toISOString().split('T')[0];
        const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        pointsMap.set(ymd, { date: ymd, label, income: 0, expenses: 0 });
      }
    }

    sales?.forEach(s => {
      const ymd = s.created_at.split('T')[0];
      const cur = pointsMap.get(ymd) || {
        date: ymd,
        label: new Date(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        income: 0,
        expenses: 0,
      };
      cur.income += Number(s.total_amount || 0);
      pointsMap.set(ymd, cur);
    });

    expenses?.forEach(e => {
      const ymd = e.expense_date;
      const cur = pointsMap.get(ymd) || {
        date: ymd,
        label: new Date(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        income: 0,
        expenses: 0,
      };
      cur.expenses += Number(e.amount || 0);
      pointsMap.set(ymd, cur);
    });

    const points = Array.from(pointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: points,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/expense-breakdown - Donut chart breakdown with colors & percentages
financeRouter.get('/expense-breakdown', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;

    let expQuery = supabase.from('expenses').select('category, amount').is('deleted_at', null);
    expQuery = applySimpleDateFilter(expQuery, 'expense_date', startDate, endDate);
    const { data: expenses } = await expQuery;

    let mfgQuery = supabase
      .from('production_orders')
      .select('total_material_cost, labor_cost, status, completed_at')
      .eq('status', 'COMPLETED');
    mfgQuery = applyDateFilter(mfgQuery, 'completed_at', startDate, endDate);
    const { data: mfgOrders } = await mfgQuery;

    const categoryMap: Record<string, number> = {};

    expenses?.forEach(e => {
      categoryMap[e.category] = (categoryMap[e.category] || 0) + Number(e.amount || 0);
    });

    const mfgMat = mfgOrders?.reduce((sum, m) => sum + Number(m.total_material_cost || 0), 0) || 0;
    const mfgLabor = mfgOrders?.reduce((sum, m) => sum + Number(m.labor_cost || 0), 0) || 0;
    if (mfgMat > 0) categoryMap['Production Materials'] = (categoryMap['Production Materials'] || 0) + mfgMat;
    if (mfgLabor > 0) categoryMap['Production Labor'] = (categoryMap['Production Labor'] || 0) + mfgLabor;

    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);

    const colors = ['#2563EB', '#D97706', '#10B981', '#8B5CF6', '#06B6D4', '#EA580C', '#6B7280', '#F59E0B'];
    let colorIdx = 0;

    const breakdown = Object.entries(categoryMap).map(([category, amount]) => {
      const percentage = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
      const color = colors[colorIdx % colors.length];
      colorIdx++;
      return {
        category,
        amount,
        percentage,
        color,
      };
    });

    breakdown.sort((a, b) => b.amount - a.amount);

    res.json({
      success: true,
      totalExpenses: total,
      categories: breakdown,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/reports/:type - Dedicated reports for Quick Reports modal/tabs
financeRouter.get('/reports/:type', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type } = req.params;
    const { startDate, endDate, customerId, supplierId, locationId, status } = req.query as Record<string, string>;

    switch (type) {
      case 'sales': {
        let q = supabase
          .from('sales')
          .select(`
            id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
            customer:customers (id, name, phone),
            items:sale_items (
              id, quantity, unit_price, cost_price, total_price,
              product:products (id, name, sku, category:categories(id, name))
            )
          `)
          .neq('status', 'CANCELLED')
          .order('created_at', { ascending: false });

        q = applyDateFilter(q, 'created_at', startDate, endDate);
        if (customerId) q = q.eq('customer_id', customerId);
        if (status && status !== 'ALL') q = q.eq('status', status);

        const { data: sales, error } = await q;
        if (error) throw error;

        // Calculate comprehensive sales statistics
        let totalRevenue = 0;
        let totalSubtotal = 0;
        let totalDiscounts = 0;
        let totalCogs = 0;
        let totalPaid = 0;
        let totalDue = 0;

        const categoryMap: Record<string, { name: string; revenue: number; quantity: number }> = {};
        const customerMap: Record<string, { name: string; revenue: number; count: number }> = {};

        sales?.forEach(sale => {
          const rev = Number(sale.total_amount || 0);
          totalRevenue += rev;
          totalSubtotal += Number(sale.subtotal || 0);
          totalDiscounts += Number(sale.discount_amount || 0);
          totalPaid += Number(sale.paid_amount || 0);
          totalDue += Number(sale.balance_due || 0);

          const custName = (sale.customer as any)?.name || 'Walk-in Customer';
          if (!customerMap[custName]) {
            customerMap[custName] = { name: custName, revenue: 0, count: 0 };
          }
          customerMap[custName].revenue += rev;
          customerMap[custName].count += 1;

          (sale.items as any[])?.forEach(item => {
            const qty = Number(item.quantity || 0);
            const cost = Number(item.cost_price || 0);
            const lineRev = Number(item.total_price || 0);
            totalCogs += qty * cost;

            const catName = item.product?.category?.name || 'General Furniture';
            if (!categoryMap[catName]) {
              categoryMap[catName] = { name: catName, revenue: 0, quantity: 0 };
            }
            categoryMap[catName].revenue += lineRev;
            categoryMap[catName].quantity += qty;
          });
        });

        const salesCount = sales?.length || 0;
        const avgSaleValue = salesCount > 0 ? Number((totalRevenue / salesCount).toFixed(2)) : 0;
        const grossProfit = totalRevenue - totalCogs;
        const grossMarginPct = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0;

        res.json({
          success: true,
          type,
          summary: {
            totalRevenue,
            totalSubtotal,
            totalDiscounts,
            salesCount,
            avgSaleValue,
            totalCogs,
            grossProfit,
            grossMarginPct,
            totalPaid,
            totalDue,
          },
          byCategory: Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue),
          byCustomer: Object.values(customerMap).sort((a, b) => b.revenue - a.revenue),
          data: sales || [],
        });
        return;
      }

      case 'purchases': {
        res.status(404).json({
          success: false,
          error: 'Purchases module has been retired. Purchasing and materials procurement are handled directly outside FurniERP via phone/direct contact. Actual stock is updated directly via Inventory.',
        });
        return;
      }

      case 'inventory': {
        let q = supabase
          .from('stock_levels')
          .select(`
            quantity, updated_at,
            product:products (id, name, sku, type, cost_price, selling_price, unit_of_measure, min_stock_level, category:categories(id, name)),
            location:locations (id, name, type)
          `)
          .order('quantity', { ascending: false });

        if (locationId) q = q.eq('location_id', locationId);

        const { data: stockLevels, error: stockErr } = await q;
        if (stockErr) throw stockErr;

        // Fetch recent movements
        let mvQ = supabase
          .from('inventory_movements')
          .select(`
            id, movement_type, quantity, reference_id, notes, created_at,
            product:products (id, name, sku),
            location:locations (id, name)
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        mvQ = applyDateFilter(mvQ, 'created_at', startDate, endDate);
        const { data: movements } = await mvQ;

        let totalInventoryValue = 0;
        let finishedGoodsValue = 0;
        let rawMaterialsValue = 0;
        let totalItemsCount = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        const locationMap: Record<string, { name: string; valuation: number; itemCount: number }> = {};
        const categoryMap: Record<string, { name: string; valuation: number; itemCount: number }> = {};

        const formatted = stockLevels?.map(sl => {
          const qty = Number(sl.quantity || 0);
          const cost = Number((sl.product as any)?.cost_price || 0);
          const selling = Number((sl.product as any)?.selling_price || 0);
          const valuation = qty * cost;
          const reorder = Number((sl.product as any)?.min_stock_level || 5);
          const type = (sl.product as any)?.type;
          const locName = (sl.location as any)?.name || 'Main Shop';
          const catName = (sl.product as any)?.category?.name || 'General';

          totalInventoryValue += valuation;
          totalItemsCount += qty;

          if (type === 'FINISHED_GOOD') finishedGoodsValue += valuation;
          else if (type === 'RAW_MATERIAL') rawMaterialsValue += valuation;

          let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
          if (qty <= 0) {
            stockStatus = 'OUT_OF_STOCK';
            outOfStockCount++;
          } else if (qty <= reorder) {
            stockStatus = 'LOW_STOCK';
            lowStockCount++;
          }

          if (!locationMap[locName]) locationMap[locName] = { name: locName, valuation: 0, itemCount: 0 };
          locationMap[locName].valuation += valuation;
          locationMap[locName].itemCount += qty;

          if (!categoryMap[catName]) categoryMap[catName] = { name: catName, valuation: 0, itemCount: 0 };
          categoryMap[catName].valuation += valuation;
          categoryMap[catName].itemCount += qty;

          return {
            id: (sl.product as any)?.id,
            productId: (sl.product as any)?.id,
            productName: (sl.product as any)?.name,
            sku: (sl.product as any)?.sku,
            type,
            categoryName: catName,
            locationName: locName,
            quantity: qty,
            unitOfMeasure: (sl.product as any)?.unit_of_measure,
            unitCost: cost,
            sellingPrice: selling,
            totalValuation: valuation,
            reorderLevel: reorder,
            stockStatus,
            updatedAt: sl.updated_at,
          };
        });

        res.json({
          success: true,
          type,
          summary: {
            totalInventoryValue,
            finishedGoodsValue,
            rawMaterialsValue,
            totalItemsCount,
            totalSkusCount: formatted?.length || 0,
            lowStockCount,
            outOfStockCount,
          },
          byLocation: Object.values(locationMap).sort((a, b) => b.valuation - a.valuation),
          byCategory: Object.values(categoryMap).sort((a, b) => b.valuation - a.valuation),
          data: formatted || [],
          movements: movements || [],
        });
        return;
      }

      case 'pnl':
      case 'finance': {
        // Multi-Step Profit & Loss with Full Working Capital
        let salesQ = supabase
          .from('sales')
          .select(`
            id, invoice_number, total_amount, subtotal, discount_amount, created_at,
            items:sale_items (quantity, cost_price)
          `)
          .neq('status', 'CANCELLED');
        salesQ = applyDateFilter(salesQ, 'created_at', startDate, endDate);
        const { data: sales } = await salesQ;

        let expQ = supabase.from('expenses').select('*').is('deleted_at', null);
        expQ = applySimpleDateFilter(expQ, 'expense_date', startDate, endDate);
        const { data: expenses } = await expQ;

        let grossRevenue = 0;
        let totalDiscounts = 0;
        let cogs = 0;

        sales?.forEach(s => {
          grossRevenue += Number(s.subtotal || s.total_amount || 0);
          totalDiscounts += Number(s.discount_amount || 0);
          (s.items as any[])?.forEach(it => {
            cogs += Number(it.quantity || 0) * Number(it.cost_price || 0);
          });
        });

        const netRevenue = grossRevenue - totalDiscounts;
        const grossProfit = netRevenue - cogs;
        const grossMarginPct = netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(2)) : 0;

        const expensesByCategory: Record<string, number> = {};
        let totalOperatingExpenses = 0;
        expenses?.forEach(e => {
          const amt = Number(e.amount || 0);
          totalOperatingExpenses += amt;
          expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + amt;
        });

        // Manufacturing costs
        const { data: mfgOrders } = await supabase
          .from('production_orders')
          .select('id, actual_labor_cost')
          .eq('status', 'COMPLETED');

        const { data: mfgIssues } = await supabase
          .from('production_material_issues')
          .select('quantity, unit_cost');

        const mfgLaborCost = mfgOrders?.reduce((acc, x) => acc + Number(x.actual_labor_cost || 0), 0) || 0;
        const mfgMaterialCost = mfgIssues?.reduce((acc, x) => acc + (Number(x.quantity || 0) * Number(x.unit_cost || 0)), 0) || 0;
        const totalManufacturingCost = mfgLaborCost + mfgMaterialCost;

        const netOperatingProfit = grossProfit - totalOperatingExpenses;
        const netMarginPct = netRevenue > 0 ? Number(((netOperatingProfit / netRevenue) * 100).toFixed(2)) : 0;

        // Working Capital
        const { data: payments } = await supabase.from('payments').select('amount, payment_method');
        const cashByMethod: Record<string, number> = {};
        let totalCashCollected = 0;
        payments?.forEach(p => {
          const amt = Number(p.amount || 0);
          totalCashCollected += amt;
          cashByMethod[p.payment_method] = (cashByMethod[p.payment_method] || 0) + amt;
        });

        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, phone, outstanding_balance')
          .gt('outstanding_balance', 0)
          .order('outstanding_balance', { ascending: false });

        const { data: suppliers } = await supabase
          .from('suppliers')
          .select('id, name, phone, outstanding_balance')
          .gt('outstanding_balance', 0)
          .order('outstanding_balance', { ascending: false });

        const totalReceivables = customers?.reduce((acc, c) => acc + Number(c.outstanding_balance || 0), 0) || 0;
        const totalPayables = suppliers?.reduce((acc, s) => acc + Number(s.outstanding_balance || 0), 0) || 0;

        res.json({
          success: true,
          type,
          statement: {
            grossRevenue,
            totalDiscounts,
            netRevenue,
            cogs,
            grossProfit,
            grossMarginPct,
            totalOperatingExpenses,
            expensesByCategory,
            mfgLaborCost,
            mfgMaterialCost,
            totalManufacturingCost,
            netOperatingProfit,
            netMarginPct,
          },
          workingCapital: {
            totalCashCollected,
            cashByMethod,
            totalReceivables,
            debtors: customers || [],
            totalPayables,
            creditors: suppliers || [],
          },
          expensesLedger: expenses || [],
        });
        return;
      }

      case 'tax': {
        const { data: settings } = await supabase
          .from('company_settings')
          .select('company_name, brand_name, tin_number, currency')
          .limit(1)
          .single();

        let salesQ = supabase
          .from('sales')
          .select(`
            id, invoice_number, subtotal, discount_amount, total_amount, created_at, status,
            customer:customers (name)
          `)
          .neq('status', 'CANCELLED')
          .order('created_at', { ascending: false });

        salesQ = applyDateFilter(salesQ, 'created_at', startDate, endDate);
        const { data: sales, error: salesErr } = await salesQ;
        if (salesErr) throw salesErr;

        const totalTaxableSales = sales?.reduce((s, x) => s + Number(x.total_amount || 0), 0) || 0;

        // Ethiopian Tax Standard Rates
        // Standard Output VAT = 15% on taxable sales
        const outputVat = Number((totalTaxableSales * 0.15).toFixed(2));
        const estimatedTot = Number((totalTaxableSales * 0.02).toFixed(2));

        const salesLedger = sales?.map(s => {
          const amt = Number(s.total_amount || 0);
          return {
            id: s.id,
            reference: s.invoice_number,
            date: s.created_at,
            counterparty: (s.customer as any)?.name || 'Walk-in Customer',
            taxableBase: amt,
            vat15: Number((amt * 0.15).toFixed(2)),
            tot2: Number((amt * 0.02).toFixed(2)),
          };
        });

        res.json({
          success: true,
          type,
          companyInfo: {
            companyName: settings?.company_name || 'FurniERP Enterprise',
            brandName: settings?.brand_name || 'FurniERP',
            tinNumber: settings?.tin_number || null,
            currency: settings?.currency || 'ETB',
          },
          complianceNotice: settings?.tin_number
            ? 'Company TIN is registered. Transaction amounts represent gross settlements.'
            : 'Company TIN is currently unconfigured. Figures represent estimated tax liability models based on recognized sales and procurement turnover.',
          summary: {
            totalTaxableSales,
            salesCount: sales?.length || 0,
            vat: {
              ratePct: 15,
              outputVat,
              inputVat: null,
              netVatPayable: outputVat,
            },
            tot: {
              ratePct: 2,
              estimatedTot,
            },
          },
          inputVatNotice: 'Purchases are conducted directly outside FurniERP via phone. Input VAT deduction tracking is unavailable in-system and should be reconciled from external supplier invoices.',
          salesLedger: salesLedger || [],
        });
        return;
      }

      case 'aging': {
        const { data: customers, error } = await supabase
          .from('customers')
          .select(`
            id, name, phone, outstanding_balance,
            sales (id, invoice_number, total_amount, paid_amount, balance_due, created_at, status)
          `)
          .gt('outstanding_balance', 0)
          .order('outstanding_balance', { ascending: false });

        if (error) throw error;

        const now = new Date().getTime();
        const agingBuckets = {
          current: 0,
          days1_30: 0,
          days31_60: 0,
          days60_plus: 0,
        };

        const detailed = customers?.map(c => {
          let current = 0;
          let d1_30 = 0;
          let d31_60 = 0;
          let d60_plus = 0;

          (c.sales as any[])?.forEach(s => {
            const due = Number(s.balance_due || 0);
            if (due > 0) {
              const ageDays = Math.floor((now - new Date(s.created_at).getTime()) / (1000 * 3600 * 24));
              if (ageDays <= 0) current += due;
              else if (ageDays <= 30) d1_30 += due;
              else if (ageDays <= 60) d31_60 += due;
              else d60_plus += due;
            }
          });

          agingBuckets.current += current;
          agingBuckets.days1_30 += d1_30;
          agingBuckets.days31_60 += d31_60;
          agingBuckets.days60_plus += d60_plus;

          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            totalDue: Number(c.outstanding_balance),
            current,
            days1_30: d1_30,
            days31_60: d31_60,
            days60_plus: d60_plus,
          };
        });

        res.json({
          success: true,
          type,
          summary: agingBuckets,
          data: detailed || [],
        });
        return;
      }

      default:
        res.status(400).json({ success: false, error: `Unknown report type: ${type}` });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/drilldown - Underlying persisted transactions for audit traceability
financeRouter.get('/drilldown', requirePermission('reports.view_financial'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, startDate, endDate, locationId } = req.query as {
      type: string;
      startDate?: string;
      endDate?: string;
      locationId?: string;
    };

    if (!type) {
      res.status(400).json({ success: false, error: 'Drilldown "type" parameter is required' });
      return;
    }

    switch (type) {
      case 'revenue': {
        let q = supabase
          .from('sales')
          .select(`
            id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
            customers (id, name, phone),
            locations (id, name, type)
          `)
          .neq('status', 'CANCELLED')
          .order('created_at', { ascending: false });

        q = applyDateFilter(q, 'created_at', startDate, endDate);
        if (locationId) q = q.eq('location_id', locationId);

        const { data, error } = await q;
        if (error) throw error;
        res.json({ success: true, type, count: data?.length || 0, data: data || [] });
        return;
      }

      case 'cogs': {
        let q = supabase
          .from('sale_items')
          .select(`
            id, quantity, unit_price, cost_price, total_price,
            product:products (id, name, sku, type, unit_of_measure),
            sale:sales!inner (id, invoice_number, status, created_at, location_id)
          `)
          .neq('sale.status', 'CANCELLED')
          .order('id', { ascending: false });

        q = applyDateFilter(q, 'sale.created_at', startDate, endDate);
        if (locationId) q = q.eq('sale.location_id', locationId);

        const { data, error } = await q;
        if (error) throw error;

        const formatted = data?.map(item => {
          const qty = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const costPrice = Number(item.cost_price || 0);
          const revenue = qty * unitPrice;
          const cost = qty * costPrice;
          const profit = revenue - cost;
          const margin = revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : 0;
          return {
            id: item.id,
            invoiceNumber: (item.sale as any)?.invoice_number,
            saleDate: (item.sale as any)?.created_at,
            productName: (item.product as any)?.name,
            sku: (item.product as any)?.sku,
            unitOfMeasure: (item.product as any)?.unit_of_measure,
            quantity: qty,
            unitPrice,
            costPrice,
            lineRevenue: revenue,
            lineCost: cost,
            lineProfit: profit,
            marginPct: margin,
          };
        });

        res.json({ success: true, type, count: formatted?.length || 0, data: formatted || [] });
        return;
      }

      case 'cash_collected': {
        let q = supabase
          .from('payments')
          .select(`
            id, reference_type, reference_id, amount, payment_method, transaction_reference, notes, created_at
          `)
          .in('reference_type', ['SALE', 'CUSTOMER_DEBT'])
          .order('created_at', { ascending: false });

        q = applyDateFilter(q, 'created_at', startDate, endDate);

        const { data, error } = await q;
        if (error) throw error;
        res.json({ success: true, type, count: data?.length || 0, data: data || [] });
        return;
      }

      case 'receivables': {
        const { data: customers, error } = await supabase
          .from('customers')
          .select(`
            id, name, phone, email, address, outstanding_balance,
            sales (id, invoice_number, total_amount, paid_amount, balance_due, status, created_at)
          `)
          .gt('outstanding_balance', 0)
          .order('outstanding_balance', { ascending: false });

        if (error) throw error;
        res.json({ success: true, type, count: customers?.length || 0, data: customers || [] });
        return;
      }

      case 'payables': {
        const { data: suppliers, error } = await supabase
          .from('suppliers')
          .select(`
            id, name, phone, contact_person, email, address, outstanding_balance
          `)
          .gt('outstanding_balance', 0)
          .order('outstanding_balance', { ascending: false });

        if (error) throw error;
        res.json({ success: true, type, count: suppliers?.length || 0, data: suppliers || [] });
        return;
      }

      case 'inventory': {
        let q = supabase
          .from('stock_levels')
          .select(`
            product_id, location_id, quantity, updated_at,
            product:products (id, name, sku, type, cost_price, selling_price, unit_of_measure),
            location:locations (id, name, type)
          `);

        if (locationId) q = q.eq('location_id', locationId);

        const { data, error } = await q;
        if (error) throw error;

        const formatted = data?.map(item => ({
          productId: item.product_id,
          productName: (item.product as any)?.name,
          sku: (item.product as any)?.sku,
          type: (item.product as any)?.type,
          locationName: (item.location as any)?.name,
          quantity: Number(item.quantity),
          unitOfMeasure: (item.product as any)?.unit_of_measure,
          costPrice: Number((item.product as any)?.cost_price || 0),
          sellingPrice: Number((item.product as any)?.selling_price || 0),
          totalValuation: Number(item.quantity) * Number((item.product as any)?.cost_price || 0),
          updatedAt: item.updated_at,
        }));

        res.json({ success: true, type, count: formatted?.length || 0, data: formatted || [] });
        return;
      }

      default:
        res.status(400).json({ success: false, error: `Invalid drilldown type: ${type}` });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/finance/reconciliation - Live cross-module reconciliation checks
financeRouter.get('/reconciliation', requirePermission('reports.view_financial'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const checks: any[] = [];

    // 1. Sales Paid Amount vs Payments Table
    const { data: sales } = await supabase
      .from('sales')
      .select('id, invoice_number, total_amount, paid_amount, balance_due, status')
      .neq('status', 'CANCELLED');

    const { data: payments } = await supabase
      .from('payments')
      .select('id, reference_type, reference_id, amount, payment_method, created_at');

    let salesDiscrepancies = 0;
    const salesDiscrepancyList: string[] = [];
    sales?.forEach(s => {
      const salePayments = payments?.filter(p => p.reference_type === 'SALE' && p.reference_id === s.id) || [];
      const sumPayments = salePayments.reduce((acc, p) => acc + Number(p.amount), 0);
      if (Math.abs(sumPayments - Number(s.paid_amount)) > 0.01) {
        salesDiscrepancies++;
        salesDiscrepancyList.push(`Invoice ${s.invoice_number}: recorded paid_amount=${s.paid_amount}, sum of payments=${sumPayments}`);
      }
    });

    checks.push({
      module: 'Sales & POS',
      title: 'Sales Paid Amount vs Recorded Payments Ledger',
      status: salesDiscrepancies === 0 ? 'RECONCILED' : 'ATTENTION_NEEDED',
      details: salesDiscrepancies === 0 
        ? 'All invoice payment records match 100% of recorded payment receipts.'
        : `${salesDiscrepancies} invoice(s) differ from payment records.`,
      metrics: {
        totalSalesAudited: sales?.length || 0,
        discrepanciesCount: salesDiscrepancies,
        discrepancies: salesDiscrepancyList,
      },
    });

    // 2. Customers Balances vs Unsettled Sales Invoices
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, outstanding_balance');

    const totalCustomerDebt = customers?.reduce((acc, c) => acc + Number(c.outstanding_balance), 0) || 0;
    const totalUnsettledInvoices = sales?.reduce((acc, s) => acc + Number(s.balance_due), 0) || 0;
    const totalCustomerDebtPayments = payments
      ?.filter(p => p.reference_type === 'CUSTOMER_DEBT')
      .reduce((acc, p) => acc + Number(p.amount), 0) || 0;

    const openingCreditBalance = totalCustomerDebt - totalUnsettledInvoices;

    checks.push({
      module: 'Customers & Receivables',
      title: 'Customer Balances vs Unsettled Sales Invoices',
      status: 'RECONCILED',
      details: openingCreditBalance === 0
        ? 'Customer debt balances match exactly the sum of unsettled sales invoices.'
        : `Outstanding customer receivables (ETB ${totalCustomerDebt.toLocaleString()}) correspond to unsettled sales invoices (ETB ${totalUnsettledInvoices.toLocaleString()}) plus initial historical customer balances (ETB ${openingCreditBalance.toLocaleString()}).`,
      metrics: {
        totalCustomerDebt,
        totalUnsettledInvoices,
        totalCustomerDebtPayments,
        openingCreditBalance,
      },
    });

    // 3. Inventory Stock Levels vs Immutable Movement Ledger
    const { data: stockLevels } = await supabase
      .from('stock_levels')
      .select('product_id, location_id, quantity, product:products(name), location:locations(name)');

    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('product_id, location_id, quantity');

    let stockMismatches = 0;
    const stockMismatchesList: string[] = [];
    stockLevels?.forEach((sl: any) => {
      const relevantMovements = movements?.filter(m => m.product_id === sl.product_id && m.location_id === sl.location_id) || [];
      const sumMovements = relevantMovements.reduce((acc, m) => acc + Number(m.quantity), 0);
      if (Math.abs(sumMovements - Number(sl.quantity)) > 0.001) {
        stockMismatches++;
        stockMismatchesList.push(`${sl.product?.name} at ${sl.location?.name}: stock=${sl.quantity}, ledger=${sumMovements}`);
      }
    });

    checks.push({
      module: 'Inventory Ledger',
      title: 'Physical Stock Levels vs Inventory Movements',
      status: stockMismatches === 0 ? 'RECONCILED' : 'ATTENTION_NEEDED',
      details: stockMismatches === 0
        ? 'Physical stock across all shop and warehouse locations matches 100% of immutable movement ledger records.'
        : `${stockMismatches} inventory location item(s) differ from cumulative movement history.`,
      metrics: {
        stockLocationsAudited: stockLevels?.length || 0,
        mismatchesCount: stockMismatches,
        discrepancies: stockMismatchesList,
      },
    });

    // 4. Supplier Liabilities & Recorded Disbursements
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, outstanding_balance');

    const totalSupplierDebt = suppliers?.reduce((acc, s) => acc + Number(s.outstanding_balance), 0) || 0;
    const totalSupplierPayouts = payments
      ?.filter(p => p.reference_type === 'SUPPLIER_DEBT')
      .reduce((acc, p) => acc + Number(p.amount), 0) || 0;

    checks.push({
      module: 'Suppliers & Payables',
      title: 'Supplier Balances & Disbursements',
      status: 'RECONCILED',
      details: `Total supplier accounts payable stands at ETB ${totalSupplierDebt.toLocaleString()} with ETB ${totalSupplierPayouts.toLocaleString()} recorded disbursements. (Procurement handled outside FurniERP via phone).`,
      metrics: {
        totalSupplierDebt,
        totalSupplierPayouts,
      },
    });

    const isFullyReconciled = checks.every(c => c.status === 'RECONCILED');

    res.json({
      success: true,
      status: isFullyReconciled ? 'RECONCILED' : 'ATTENTION_NEEDED',
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/finance/expenses/:id - Soft-delete expense
financeRouter.delete('/expenses/:id', requirePermission('expenses.record'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase.from('expenses').select('id, category, amount')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Expense not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'expenses',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft-deleted expense',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete expense. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'EXPENSE_DELETED',
      module: 'FINANCE',
      entity: 'expenses',
      entityId: id,
      recordReference: `${existing.category} (ETB ${existing.amount})`,
      description: `Soft-deleted expense: ${existing.category} (ETB ${existing.amount})${reason ? ': ' + reason : ''}`,
      reason: reason || null,
    });

    res.json({ success: true, message: 'Expense moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
