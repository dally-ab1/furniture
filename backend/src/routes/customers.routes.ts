import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const customersRouter = Router();

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
});

// GET /api/customers - List all customers with balance
customersRouter.get('/', requirePermission('customers.manage', 'sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search } = req.query;

    let query = supabase
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: customers, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers - Create new customer
customersRouter.post('/', requirePermission('customers.manage', 'sales.create'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = customerSchema.parse(req.body);

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        name: validated.name,
        phone: validated.phone || null,
        email: validated.email || null,
        address: validated.address || null,
        outstanding_balance: 0.00,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      req,
      action: 'CUSTOMER_CREATED',
      module: 'SALES',
      entity: 'customers',
      entityId: customer.id,
      recordReference: customer.name,
      description: `${req.user?.full_name || 'User'} created customer profile: ${customer.name}`,
      payload: { name: customer.name, phone: customer.phone, email: customer.email },
    });

    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/:id - Customer profile and sales history
customersRouter.get('/:id', requirePermission('customers.manage', 'sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: customer, error } = await supabase
      .from('customers')
      .select(`
        *,
        sales:sales (
          id, invoice_number, total_amount, paid_amount, balance_due, status, created_at
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers/:id/payments - Record debt payment from customer
customersRouter.post('/:id/payments', requirePermission('customers.manage', 'sales.create', 'pos.create_sale'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, transactionReference, notes, saleId } = req.body;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Valid payment amount is required' });
      return;
    }
    if (!paymentMethod) {
      res.status(400).json({ success: false, error: 'Payment method is required' });
      return;
    }

    let rpcRes = await supabase.rpc('record_customer_payment', {
      p_customer_id: id,
      p_amount: Number(amount),
      p_payment_method: paymentMethod,
      p_transaction_reference: transactionReference || null,
      p_notes: notes || null,
      p_user_id: req.user?.id || null,
      p_sale_id: saleId || null,
    });

    // If database check constraint has not yet been migrated to include EBIRR, safely fallback
    if (rpcRes.error && rpcRes.error.message?.includes('payments_payment_method_check') && paymentMethod === 'EBIRR') {
      rpcRes = await supabase.rpc('record_customer_payment', {
        p_customer_id: id,
        p_amount: Number(amount),
        p_payment_method: 'TELEBIRR',
        p_transaction_reference: transactionReference || null,
        p_notes: (notes ? notes + ' ' : '') + '[eBirr]',
        p_user_id: req.user?.id || null,
        p_sale_id: saleId || null,
      });
    }

    if (rpcRes.error) {
      res.status(400).json({ success: false, error: rpcRes.error.message });
      return;
    }

    // Retrieve customer name for rich human-readable description
    const { data: customer } = await supabase.from('customers').select('name').eq('id', id).single();
    const customerName = customer?.name || 'Customer';

    await logAudit({
      req,
      action: 'CUSTOMER_PAYMENT_RECORDED',
      module: 'SALES',
      entity: 'customers',
      entityId: id,
      recordReference: transactionReference || `PAY-${id.slice(0, 6).toUpperCase()}`,
      description: `${req.user?.full_name || 'Cashier'} recorded payment of ETB ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} from customer ${customerName} via ${paymentMethod}`,
      payload: {
        customer_id: id,
        customer_name: customerName,
        amount: Number(amount),
        payment_method: paymentMethod,
        transaction_reference: transactionReference,
        sale_id: saleId || null,
      },
    });

    res.json({ success: true, data: rpcRes.data });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/customers/:id - Soft-delete customer
customersRouter.delete('/:id', requirePermission('customers.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('id, name, phone')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Customer not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'customers',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft deleted by user',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete customer. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'CUSTOMER_DELETED',
      module: 'SALES',
      entity: 'customers',
      entityId: id,
      recordReference: existing.name,
      description: `Soft-deleted customer ${existing.name}${reason ? ': ' + reason : ''}`,
      reason: reason || null,
      payload: { customerId: id, name: existing.name, phone: existing.phone },
    });

    res.json({ success: true, message: 'Customer moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
