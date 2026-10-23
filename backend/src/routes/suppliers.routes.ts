import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { requirePermission } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const suppliersRouter = Router();

// GET /api/suppliers - Suppliers directory
suppliersRouter.get('/', requirePermission('suppliers.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search } = req.query;

    let query = supabase
      .from('suppliers')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (search) {
      query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%`);
    }

    const { data: suppliers, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers - Create new supplier
suppliersRouter.post('/', requirePermission('suppliers.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, contactPerson, phone, email, address } = req.body;
    if (!name || !phone) {
      res.status(400).json({ success: false, error: 'Name and phone are required' });
      return;
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name,
        contact_person: contactPerson || null,
        phone,
        email: email || null,
        address: address || null,
        outstanding_balance: 0.00,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      req,
      action: 'SUPPLIER_CREATED',
      module: 'SUPPLIERS',
      entity: 'suppliers',
      entityId: data.id,
      recordReference: data.name,
      description: `Created supplier account for ${data.name} (Phone: ${data.phone})`,
      payload: { supplierId: data.id, name: data.name, phone: data.phone, contactPerson: data.contact_person },
    });

    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers/:id/payments - Record debt payment to supplier
suppliersRouter.post('/:id/payments', requirePermission('suppliers.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, transactionReference, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Valid payment amount is required' });
      return;
    }
    if (!paymentMethod) {
      res.status(400).json({ success: false, error: 'Payment method is required' });
      return;
    }

    let rpcRes = await supabase.rpc('record_supplier_payment', {
      p_supplier_id: id,
      p_amount: Number(amount),
      p_payment_method: paymentMethod,
      p_transaction_reference: transactionReference || null,
      p_notes: notes || null,
      p_user_id: req.user?.id || null,
      p_purchase_id: null,
    });

    // If database check constraint has not yet been migrated to include EBIRR, safely fallback
    if (rpcRes.error && rpcRes.error.message?.includes('payments_payment_method_check') && paymentMethod === 'EBIRR') {
      rpcRes = await supabase.rpc('record_supplier_payment', {
        p_supplier_id: id,
        p_amount: Number(amount),
        p_payment_method: 'TELEBIRR',
        p_transaction_reference: transactionReference || null,
        p_notes: (notes ? notes + ' ' : '') + '[eBirr]',
        p_user_id: req.user?.id || null,
        p_purchase_id: null,
      });
    }

    if (rpcRes.error) {
      res.status(400).json({ success: false, error: rpcRes.error.message });
      return;
    }

    // Lookup supplier name
    let supplierName = 'Supplier';
    const { data: suppData } = await supabase.from('suppliers').select('name').eq('id', id).single();
    if (suppData?.name) supplierName = suppData.name;

    await logAudit({
      req,
      action: 'SUPPLIER_PAYMENT_RECORDED',
      module: 'SUPPLIERS',
      entity: 'payments',
      entityId: rpcRes.data?.payment_id || id,
      recordReference: supplierName,
      description: `Recorded supplier payment of ${Number(amount).toLocaleString()} ETB to ${supplierName} via ${paymentMethod}`,
      payload: {
        supplierId: id,
        supplierName,
        amount: Number(amount),
        paymentMethod,
        transactionReference,
      },
    });

    res.json({ success: true, data: rpcRes.data });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/suppliers/:id - Soft-delete supplier
suppliersRouter.delete('/:id', requirePermission('suppliers.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('suppliers')
      .select('id, name, phone')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Supplier not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'suppliers',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft deleted by user',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete supplier. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'SUPPLIER_DELETED',
      module: 'SUPPLIERS',
      entity: 'suppliers',
      entityId: id,
      recordReference: existing.name,
      description: `Soft-deleted supplier ${existing.name}${reason ? ': ' + reason : ''}`,
      reason: reason || null,
      payload: { supplierId: id, name: existing.name, phone: existing.phone },
    });

    res.json({ success: true, message: 'Supplier moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
