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


// POST /api/sales/custom-order - Create a pending-production order atomically linked to manufacturing
const customOrderSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  customerId: z.string().uuid(),
  locationId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string().optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    costPrice: z.number().nonnegative().optional(),
  })).min(1),
  depositAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR']).nullable().optional(),
  targetCompletionDate: z.string().optional(),
  notes: z.string().optional(),
});

salesRouter.post('/custom-order', requirePermission('sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = customOrderSchema.parse(req.body);
    const subtotal = validated.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalAmount = subtotal;
    const firstItem = validated.items[0];

    // Determine or generate unique invoice number
    let invoiceNumber = validated.invoiceNumber;
    if (!invoiceNumber) {
      const { count } = await supabase.from('sales').select('id', { count: 'exact', head: true });
      invoiceNumber = `INV-${String((count || 0) + 1).padStart(5, '0')}`;
    }

    const effectiveUserId = req.user?.id || 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e';

    // Atomically create sale (PENDING_PRODUCTION) + linked production order (PLANNED) + deposit payment
    let rpcRes = await supabase.rpc('create_custom_customer_order', {
      p_invoice_number: invoiceNumber,
      p_customer_id: validated.customerId,
      p_location_id: validated.locationId,
      p_total_amount: totalAmount,
      p_deposit_amount: validated.depositAmount,
      p_payment_method: validated.paymentMethod || null,
      p_product_id: firstItem.productId,
      p_quantity: firstItem.quantity,
      p_unit_price: firstItem.unitPrice,
      p_target_completion_date: validated.targetCompletionDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      p_notes: validated.notes || null,
      p_user_id: effectiveUserId,
    });

    if (rpcRes.error && rpcRes.error.message?.includes('payments_payment_method_check') && validated.paymentMethod === 'EBIRR') {
      rpcRes = await supabase.rpc('create_custom_customer_order', {
        p_invoice_number: validated.invoiceNumber,
        p_customer_id: validated.customerId,
        p_location_id: validated.locationId,
        p_total_amount: totalAmount,
        p_deposit_amount: validated.depositAmount,
        p_payment_method: 'TELEBIRR',
        p_product_id: firstItem.productId,
        p_quantity: firstItem.quantity,
        p_unit_price: firstItem.unitPrice,
        p_target_completion_date: validated.targetCompletionDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        p_notes: (validated.notes ? validated.notes + ' ' : '') + '[eBirr]',
        p_user_id: req.user?.id || null,
      });
    }

    if (rpcRes.error) {
      res.status(400).json({ success: false, error: rpcRes.error.message });
      return;
    }

    if (validated.items.length > 1 && rpcRes.data?.sale_id) {
      const extraItems = validated.items.slice(1).map(item => ({
        sale_id: rpcRes.data.sale_id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        cost_price: item.costPrice || 0,
        total_price: item.quantity * item.unitPrice,
      }));
      await supabase.from('sale_items').insert(extraItems);
    }

    res.status(201).json({ success: true, data: rpcRes.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales/:id/cancel - Atomically cancel sale, reverse stock (if fulfilled), and clear debt
salesRouter.post('/:id/cancel', requirePermission('sales.cancel', 'sales.view_all'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const effectiveUserId = req.user?.id || 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e';
    const { data, error } = await supabase.rpc('cancel_sale_order', {
      p_sale_id: id,
      p_reason: reason || null,
      p_user_id: effectiveUserId,
    });

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, message: 'Sale cancelled successfully', data });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/sales/:id/fulfill - Atomically fulfill custom order, deduct finished stock once, and collect final payment
salesRouter.patch('/:id/fulfill', requirePermission('sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { finalPaymentAmount = 0, paymentMethod = null, locationId, notes } = req.body || {};

    const { data: sale, error: fetchErr } = await supabase
      .from('sales')
      .select('id, invoice_number, location_id, status, balance_due')
      .eq('id', id)
      .single();

    if (fetchErr || !sale) {
      res.status(404).json({ success: false, error: 'Sale record not found' });
      return;
    }

    const effectiveLocationId = locationId || sale.location_id;

    const effectiveUserId = req.user?.id || 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e';
    let rpcRes = await supabase.rpc('fulfill_custom_order_delivery', {
      p_sale_id: id,
      p_final_payment_amount: Number(finalPaymentAmount) || 0,
      p_payment_method: paymentMethod || null,
      p_location_id: effectiveLocationId,
      p_notes: notes || null,
      p_user_id: effectiveUserId,
    });

    if (rpcRes.error && rpcRes.error.message?.includes('payments_payment_method_check') && paymentMethod === 'EBIRR') {
      rpcRes = await supabase.rpc('fulfill_custom_order_delivery', {
        p_sale_id: id,
        p_final_payment_amount: Number(finalPaymentAmount) || 0,
        p_payment_method: 'TELEBIRR',
        p_location_id: effectiveLocationId,
        p_notes: (notes ? notes + ' ' : '') + '[eBirr]',
        p_user_id: req.user?.id || null,
      });
    }

    if (rpcRes.error) {
      res.status(400).json({ success: false, error: rpcRes.error.message });
      return;
    }

    res.json({ success: true, message: 'Order ' + sale.invoice_number + ' fulfilled successfully', data: rpcRes.data });
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
