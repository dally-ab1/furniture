import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const salesRouter = Router();

const checkoutSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid(),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR']).nullable().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    costPrice: z.number().nonnegative().optional(),
  })).min(1),
  notes: z.string().optional(),
});

// GET /api/sales/next-invoice-number
salesRouter.get('/next-invoice-number', requirePermission('sales.create', 'pos.create_sale'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { count, error } = await supabase
      .from('sales')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    const nextNum = (count || 0) + 1;
    const invoiceNumber = `INV-${String(nextNum).padStart(5, '0')}`;
    res.json({ success: true, invoiceNumber });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales/checkout
salesRouter.post('/checkout', requirePermission('sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = checkoutSchema.parse(req.body);

    // Call atomic PostgreSQL RPC function
    let rpcRes = await supabase.rpc('execute_sale_checkout', {
      p_invoice_number: validated.invoiceNumber,
      p_customer_id: validated.customerId || null,
      p_location_id: validated.locationId,
      p_subtotal: validated.subtotal,
      p_discount_amount: validated.discountAmount,
      p_total_amount: validated.totalAmount,
      p_paid_amount: validated.paidAmount,
      p_payment_method: validated.paymentMethod || null,
      p_items: validated.items.map(item => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        cost_price: item.costPrice || 0,
      })),
      p_notes: validated.notes || null,
      p_user_id: req.user?.id || null,
    });

    // If database check constraint has not yet been migrated to include EBIRR, safely fallback
    if (rpcRes.error && rpcRes.error.message?.includes('payments_payment_method_check') && validated.paymentMethod === 'EBIRR') {
      rpcRes = await supabase.rpc('execute_sale_checkout', {
        p_invoice_number: validated.invoiceNumber,
        p_customer_id: validated.customerId || null,
        p_location_id: validated.locationId,
        p_subtotal: validated.subtotal,
        p_discount_amount: validated.discountAmount,
        p_total_amount: validated.totalAmount,
        p_paid_amount: validated.paidAmount,
        p_payment_method: 'TELEBIRR',
        p_items: validated.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          cost_price: item.costPrice || 0,
        })),
        p_notes: (validated.notes ? validated.notes + ' ' : '') + '[eBirr]',
        p_user_id: req.user?.id || null,
      });
    }

    if (rpcRes.error) {
      res.status(400).json({ success: false, error: rpcRes.error.message });
      return;
    }

    // Record Audit Event
    await logAudit({
      req,
      action: 'SALE_COMPLETED',
      module: 'SALES',
      entity: 'sales',
      entityId: rpcRes.data?.sale_id || null,
      recordReference: validated.invoiceNumber,
      description: `${req.user?.full_name || 'Cashier'} completed sale ${validated.invoiceNumber} for ETB ${(validated.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      payload: {
        invoice_number: validated.invoiceNumber,
        subtotal: validated.subtotal,
        discount_amount: validated.discountAmount,
        total_amount: validated.totalAmount,
        paid_amount: validated.paidAmount,
        balance_due: (validated.totalAmount || 0) - (validated.paidAmount || 0),
        payment_method: validated.paymentMethod,
        items_count: validated.items.length,
      },
    });

    res.json({ success: true, data: rpcRes.data });
  } catch (error) {
    next(error);
  }
});


// POST /api/sales/custom-order - Create a pending-production order (no stock deduction)
const customOrderSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerId: z.string().uuid(),
  locationId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    costPrice: z.number().nonnegative().optional(),
  })).min(1),
  depositAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR']).nullable().optional(),
  notes: z.string().optional(),
});

salesRouter.post('/custom-order', requirePermission('sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = customOrderSchema.parse(req.body);

    // Calculate totals
    const subtotal = validated.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalAmount = subtotal;
    const balanceDue = totalAmount - validated.depositAmount;

    // 1. Create sale record with PENDING_PRODUCTION status (NO stock deduction)
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        invoice_number: validated.invoiceNumber,
        customer_id: validated.customerId,
        location_id: validated.locationId,
        subtotal,
        discount_amount: 0,
        total_amount: totalAmount,
        paid_amount: validated.depositAmount,
        balance_due: balanceDue,
        status: 'PENDING_PRODUCTION',
        notes: validated.notes || 'Custom order - awaiting manufacturing',
        created_by: req.user?.id || null,
      })
      .select()
      .single();

    if (saleError) throw saleError;

    // 2. Insert sale items (without stock deduction)
    const saleItems = validated.items.map(item => ({
      sale_id: sale.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      cost_price: item.costPrice || 0,
      total_price: item.quantity * item.unitPrice,
    }));

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsError) throw itemsError;

    // 3. Record deposit payment if any
    if (validated.depositAmount > 0 && validated.paymentMethod) {
      let payMethod: string = validated.paymentMethod;
      let payNotes = 'Deposit for custom manufacturing order';

      // Handle EBIRR fallback
      if (payMethod === 'EBIRR') {
        payMethod = 'TELEBIRR';
        payNotes += ' [eBirr]';
      }

      await supabase
        .from('payments')
        .insert({
          reference_type: 'SALE',
          reference_id: sale.id,
          amount: validated.depositAmount,
          payment_method: payMethod,
          notes: payNotes,
          received_by: req.user?.id || null,
        });
    }

    // 4. Update customer outstanding balance for the balance due
    if (balanceDue > 0) {
      const { data: cust } = await supabase.from('customers').select('outstanding_balance').eq('id', validated.customerId).single();
      if (cust) {
        await supabase
          .from('customers')
          .update({ outstanding_balance: Number(cust.outstanding_balance || 0) + balanceDue })
          .eq('id', validated.customerId);
      }
    }

    const custName = validated.items.map(i => i.productName).join(', ');
    await logAudit({
      req,
      action: 'CUSTOM_ORDER_CREATED',
      module: 'SALES',
      entity: 'sales',
      entityId: sale.id,
      recordReference: validated.invoiceNumber,
      description: 'Created custom manufacturing order ' + validated.invoiceNumber + ' for ETB ' + totalAmount.toFixed(2) + (validated.depositAmount > 0 ? ' (Deposit: ETB ' + validated.depositAmount.toFixed(2) + ')' : ''),
      payload: {
        invoice_number: validated.invoiceNumber,
        customer_id: validated.customerId,
        subtotal,
        total_amount: totalAmount,
        deposit_amount: validated.depositAmount,
        balance_due: balanceDue,
        items: custName,
        items_count: validated.items.length,
      },
    });

    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales/:id/cancel - Cancel a sale with cancellation reason
salesRouter.post('/:id/cancel', requirePermission('sales.cancel', 'sales.view_all'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: sale, error: fetchErr } = await supabase
      .from('sales')
      .select('id, invoice_number, total_amount, status')
      .eq('id', id)
      .single();

    if (fetchErr || !sale) {
      res.status(404).json({ success: false, error: 'Sale record not found' });
      return;
    }

    if (sale.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: 'Sale is already cancelled' });
      return;
    }

    const { error: updateErr } = await supabase
      .from('sales')
      .update({
        status: 'CANCELLED',
        notes: reason ? `[Cancelled by ${req.user?.full_name || 'User'}: ${reason}]` : `[Cancelled by ${req.user?.full_name || 'User'}]`,
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logAudit({
      req,
      action: 'SALE_CANCELLED',
      module: 'SALES',
      entity: 'sales',
      entityId: id,
      recordReference: sale.invoice_number,
      description: `${req.user?.full_name || 'User'} cancelled sale ${sale.invoice_number}${reason ? `. Reason: ${reason}` : ''}`,
      reason: reason || null,
      payload: {
        invoice_number: sale.invoice_number,
        total_amount: sale.total_amount,
        reason: reason || 'Not specified',
      },
    });

    res.json({ success: true, message: `Sale ${sale.invoice_number} cancelled successfully` });
  } catch (error) {
    next(error);
  }
});


// PATCH /api/sales/:id/fulfill - Fulfill a PENDING_PRODUCTION sale after manufacturing completes
salesRouter.patch('/:id/fulfill', requirePermission('sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    // Get the pending sale
    const { data: sale, error: fetchErr } = await supabase
      .from('sales')
      .select('id, invoice_number, total_amount, paid_amount, balance_due, status, customer_id, location_id')
      .eq('id', id)
      .single();

    if (fetchErr || !sale) {
      res.status(404).json({ success: false, error: 'Sale record not found' });
      return;
    }

    if (sale.status !== 'PENDING_PRODUCTION') {
      res.status(400).json({ success: false, error: 'Only PENDING_PRODUCTION sales can be fulfilled' });
      return;
    }

    // Determine new status based on payment
    const newStatus = sale.balance_due <= 0 ? 'PAID' : (sale.paid_amount > 0 ? 'PARTIAL' : 'CREDIT');

    // Get sale items to deduct stock
    const { data: saleItems, error: itemsErr } = await supabase
      .from('sale_items')
      .select('product_id, quantity')
      .eq('sale_id', id);

    if (itemsErr) throw itemsErr;

    // Deduct stock for each item
    for (const item of (saleItems || [])) {
      const { data: stockData } = await supabase
        .from('stock_levels')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id)
        .single();

      if (!stockData || Number(stockData.quantity) < Number(item.quantity)) {
        res.status(400).json({
          success: false,
          error: 'Insufficient stock. Available: ' + (stockData?.quantity || 0) + ', Required: ' + item.quantity + '. Complete manufacturing first.',
        });
        return;
      }

      // Deduct stock
      await supabase
        .from('stock_levels')
        .update({ quantity: Number(stockData.quantity) - Number(item.quantity) })
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id);

      // Record inventory movement
      await supabase.from('inventory_movements').insert({
        product_id: item.product_id,
        location_id: sale.location_id,
        movement_type: 'SALE_DEDUCTION',
        quantity: -Number(item.quantity),
        reference_id: id,
        notes: 'Stock deducted for fulfilled custom order ' + sale.invoice_number,
      });
    }

    // Update sale status
    const { error: updateErr } = await supabase
      .from('sales')
      .update({ status: newStatus })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logAudit({
      req,
      action: 'CUSTOM_ORDER_FULFILLED',
      module: 'SALES',
      entity: 'sales',
      entityId: id,
      recordReference: sale.invoice_number,
      description: 'Fulfilled custom order ' + sale.invoice_number + '. Status: ' + newStatus,
      payload: { saleId: id, invoice_number: sale.invoice_number, newStatus },
    });

    res.json({ success: true, message: 'Order ' + sale.invoice_number + ' fulfilled successfully', data: { ...sale, status: newStatus } });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales - List recent sales
salesRouter.get('/', requirePermission('sales.create', 'sales.view_all', 'sales.view'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: sales, error } = await supabase
      .from('sales')
      .select(`
        id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
        customer:customers (id, name, phone),
        location:locations (id, name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ success: true, data: sales });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id - Invoice details with line items
salesRouter.get('/:id', requirePermission('sales.create', 'sales.view_all', 'sales.view'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: sale, error } = await supabase
      .from('sales')
      .select(`
        id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, notes, created_at,
        customer:customers (id, name, phone),
        location:locations (id, name),
        items:sale_items (
          id, quantity, unit_price, cost_price, total_price,
          product:products (id, sku, name, unit_of_measure)
        ),
        payments (id, amount, payment_method, created_at)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    res.json({ success: true, data: sale });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/sales/:id - Soft-delete sale record (Super Admin only)
salesRouter.delete('/:id', requirePermission('sales.cancel', 'sales.view_all'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('sales')
      .select('id, invoice_number, total_amount')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Sale record not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from('sales')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: req.user?.id || null,
        deletion_reason: reason || 'Soft-deleted sale record',
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    await logAudit({
      req,
      action: 'SALE_DELETED',
      module: 'SALES',
      entity: 'sales',
      entityId: id,
      recordReference: existing.invoice_number,
      description: `Soft-deleted sale ${existing.invoice_number} (ETB ${existing.total_amount})${reason ? ': ' + reason : ''}`,
      reason: reason || null,
      payload: { saleId: id, invoice_number: existing.invoice_number, total_amount: existing.total_amount },
    });

    res.json({ success: true, message: 'Sale moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
