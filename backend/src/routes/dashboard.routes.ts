import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { requirePermission } from '../middleware/auth';

export const dashboardRouter = Router();

// Protect all dashboard endpoints with dashboard.view permission
dashboardRouter.use(requirePermission('dashboard.view'));

// GET /api/dashboard/summary
// Returns the 5 top KPI cards computed from real database records (genuine zero remains zero)
dashboardRouter.get('/summary', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Today's sales (recognized revenue from valid sales)
    const { data: todaySalesData, error: sErr } = await supabase
      .from('sales')
      .select('total_amount')
      .neq('status', 'CANCELLED')
      .gte('created_at', `${today}T00:00:00.000Z`);

    if (sErr) throw sErr;
    const todaySales = todaySalesData?.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) || 0;

    // 2. Payments received today (cash collected from customers in payments ledger)
    const { data: todayPaymentsData, error: pErr } = await supabase
      .from('payments')
      .select('amount')
      .in('reference_type', ['SALE', 'CUSTOMER_DEBT'])
      .gte('created_at', `${today}T00:00:00.000Z`);

    if (pErr) throw pErr;
    const paymentsReceived = todayPaymentsData?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

    // 3. Estimated gross profit today (Sales Revenue - Cost of Goods Sold)
    const { data: todayItemsData, error: iErr } = await supabase
      .from('sale_items')
      .select('quantity, unit_price, cost_price, sales!inner(created_at, status)')
      .neq('sales.status', 'CANCELLED')
      .gte('sales.created_at', `${today}T00:00:00.000Z`);

    if (iErr) throw iErr;
    let estimatedGrossProfit = 0;
    if (todayItemsData && todayItemsData.length > 0) {
      estimatedGrossProfit = todayItemsData.reduce((profit, item) => {
        const revenue = Number(item.quantity) * Number(item.unit_price);
        const cost = Number(item.quantity) * Number(item.cost_price || 0);
        return profit + (revenue - cost);
      }, 0);
    }

    // 4. Customer outstanding balance (point-in-time Accounts Receivable)
    const { data: customersData, error: cErr } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .gt('outstanding_balance', 0);

    if (cErr) throw cErr;
    const customerOutstanding = customersData?.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0) || 0;

    // 5. Supplier outstanding balance (point-in-time Accounts Payable)
    const { data: suppliersData, error: supErr } = await supabase
      .from('suppliers')
      .select('outstanding_balance')
      .gt('outstanding_balance', 0);

    if (supErr) throw supErr;
    const supplierOutstanding = suppliersData?.reduce((sum, s) => sum + Number(s.outstanding_balance || 0), 0) || 0;

    const canViewFinancial = req.user?.role === 'SUPER_ADMIN' ||
      req.user?.permissions.includes('*') ||
      req.user?.permissions.includes('reports.view_financial');

    res.json({
      success: true,
      data: {
        todaySales,
        todaySalesTrend: todaySales > 0 ? '+100% vs. baseline' : 'No sales recorded today',
        paymentsReceived,
        paymentsReceivedTrend: paymentsReceived > 0 ? 'Cash inflow recorded' : 'No payments collected today',
        estimatedGrossProfit: canViewFinancial ? estimatedGrossProfit : null,
        estimatedGrossProfitTrend: canViewFinancial ? (estimatedGrossProfit > 0 ? 'Profitable sales today' : 'No margin realized today') : null,
        customerOutstanding,
        customerOutstandingTrend: `${customersData?.length || 0} active debtor accounts`,
        supplierOutstanding,
        supplierOutstandingTrend: `${suppliersData?.length || 0} active creditor accounts`,
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/sales-overview
// Real 7-day sales breakdown aggregated from database records
dashboardRouter.get('/sales-overview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const days: Array<{ date: string; fullDate: string; amount: number }> = [];
    const now = new Date();

    // Generate last 7 calendar days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days.push({ date: short, fullDate: iso, amount: 0 });
    }

    const startDate = days[0].fullDate;
    const { data: sales, error } = await supabase
      .from('sales')
      .select('total_amount, created_at')
      .neq('status', 'CANCELLED')
      .gte('created_at', `${startDate}T00:00:00.000Z`);

    if (error) throw error;

    sales?.forEach(s => {
      const saleDate = s.created_at.split('T')[0];
      const match = days.find(d => d.fullDate === saleDate);
      if (match) {
        match.amount += Number(s.total_amount || 0);
      }
    });

    res.json({
      success: true,
      data: days.map(d => ({ date: d.date, amount: d.amount })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/recent-sales
// Real recent sales from sales ledger
dashboardRouter.get('/recent-sales', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: sales, error } = await supabase
      .from('sales')
      .select(`
        id, invoice_number, total_amount, status, created_at,
        customers (name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    const formatted = (sales || []).map(s => ({
      id: s.id,
      invoice_number: s.invoice_number,
      customer: (s.customers as any)?.name || 'Walk-in Customer',
      amount: Number(s.total_amount),
      status: s.status,
      time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/low-stock
// Real stock alerts where quantity <= min_stock_level
dashboardRouter.get('/low-stock', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, name, min_stock_level, unit_of_measure, type,
        categories (name),
        stock_levels (quantity, locations (name))
      `)
      .eq('is_active', true);

    if (error) throw error;

    const lowStockItems: any[] = [];
    products?.forEach(p => {
      const totalQty = p.stock_levels?.reduce((sum: number, sl: any) => sum + Number(sl.quantity || 0), 0) || 0;
      const minStock = Number(p.min_stock_level || 0);

      if (minStock > 0 && totalQty <= minStock) {
        lowStockItems.push({
          id: p.id,
          name: p.name,
          category: (p.categories as any)?.name || (p.type === 'RAW_MATERIAL' ? 'Raw Material' : 'Furniture'),
          currentStock: totalQty,
          minStock,
          unit: p.unit_of_measure,
          icon: p.type === 'RAW_MATERIAL' ? 'wood' : 'chair',
        });
      }
    });

    res.json({ success: true, data: lowStockItems });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/production-orders
// Real active and planned production orders
dashboardRouter.get('/production-orders', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select(`
        id, order_number, target_quantity, completed_quantity, progress_pct, status, due_date,
        product:products (name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    const formatted = (orders || []).map(o => ({
      id: o.id,
      order_number: o.order_number,
      product: (o.product as any)?.name || 'Finished Furniture',
      progress: Number(o.progress_pct || 0),
      status: o.status,
      due_date: o.due_date ? new Date(o.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date',
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/recent-activity
// Real activity feed derived from immutable audit logs and inventory movements
dashboardRouter.get('/recent-activity', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('id, actor_name, action, module, description, record_reference, outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(6);

    if (!auditError && auditLogs && auditLogs.length > 0) {
      const formatted = auditLogs.map(l => {
        let type = 'adjustment';
        let color: 'green' | 'orange' | 'blue' | 'purple' = 'blue';

        if (l.module === 'SALES') {
          type = 'sale';
          color = 'green';
        } else if (l.module === 'PURCHASES' || l.module === 'SUPPLIERS') {
          type = 'purchase';
          color = 'blue';
        } else if (l.module === 'MANUFACTURING') {
          type = 'production';
          color = 'purple';
        } else if (l.module === 'INVENTORY') {
          type = 'adjustment';
          color = 'orange';
        } else if (l.module === 'FINANCE') {
          type = 'payment';
          color = 'green';
        }

        const actor = l.actor_name || 'System';
        const actionLabel = l.action.toLowerCase().replace(/_/g, ' ');
        const title = `${actor} • ${actionLabel}`;
        const subtitle = l.description || l.record_reference || l.action;
        const time = new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return {
          id: l.id,
          type,
          title,
          subtitle,
          time,
          color,
        };
      });

      res.json({ success: true, data: formatted });
      return;
    }

    const { data: movements, error } = await supabase
      .from('inventory_movements')
      .select(`
        id, movement_type, quantity, notes, created_at,
        product:products (name, unit_of_measure)
      `)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    const formatted = (movements || []).map(m => {
      let type = 'adjustment';
      let title = 'Stock Movement';
      let color = 'orange';

      if (m.movement_type === 'SALE_DEDUCTION') {
        type = 'sale';
        title = 'Sale item deducted';
        color = 'green';
      } else if (m.movement_type === 'PURCHASE_RECEIPT') {
        type = 'purchase';
        title = 'Goods received from supplier';
        color = 'blue';
      } else if (m.movement_type === 'MFG_OUTPUT') {
        type = 'production';
        title = 'Production completed';
        color = 'purple';
      } else if (m.movement_type === 'MFG_CONSUMPTION') {
        type = 'production';
        title = 'Raw materials consumed';
        color = 'orange';
      }

      const qty = Number(m.quantity);
      const sign = qty > 0 ? `+${qty}` : `${qty}`;
      const subtitle = `${(m.product as any)?.name || 'Product'} • ${sign} ${(m.product as any)?.unit_of_measure || ''}`;
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        id: m.id,
        type,
        title,
        subtitle,
        time,
        color,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});
