import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const manufacturingRouter = Router();

const createBomSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(2),
  version: z.number().int().positive().default(1),
  items: z.array(z.object({
    rawMaterialId: z.string().uuid(),
    quantity: z.number().positive(),
    wasteTolerancePct: z.number().nonnegative().default(0),
  })).min(1),
});

const createProductionOrderSchema = z.object({
  orderNumber: z.string().min(1),
  productId: z.string().uuid(),
  bomId: z.string().uuid(),
  locationId: z.string().uuid(),
  targetQuantity: z.number().positive(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  customerId: z.string().uuid().optional(),
  saleId: z.string().uuid().optional(),
});

const issueMaterialsSchema = z.object({
  locationId: z.string().uuid(),
  items: z.array(z.object({
    rawMaterialId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
});

const completeOrderSchema = z.object({
  completedQuantity: z.number().positive(),
  wasteQuantity: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  notes: z.string().optional(),
});

// GET /api/manufacturing/boms - List all BOMs with items and product details
manufacturingRouter.get('/boms', requirePermission('manufacturing.view', 'manufacturing.manage'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: boms, error } = await supabase
      .from('boms')
      .select(`
        id, name, version, is_active, created_at,
        product:products (id, sku, name, unit_of_measure, cost_price, selling_price, type),
        items:bom_items (
          id, quantity, waste_tolerance_pct,
          raw_material:products (id, sku, name, unit_of_measure, cost_price)
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data: boms });
  } catch (error) {
    next(error);
  }
});

// POST /api/manufacturing/boms - Create a new Bill of Materials
manufacturingRouter.post('/boms', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createBomSchema.parse(req.body);

    const { data: bom, error: bomError } = await supabase
      .from('boms')
      .insert({
        product_id: validated.productId,
        name: validated.name,
        version: validated.version,
        is_active: true,
      })
      .select()
      .single();

    if (bomError) throw bomError;

    const bomItems = validated.items.map(item => ({
      bom_id: bom.id,
      raw_material_id: item.rawMaterialId,
      quantity: item.quantity,
      waste_tolerance_pct: item.wasteTolerancePct,
    }));

    const { error: itemsError } = await supabase
      .from('bom_items')
      .insert(bomItems);

    if (itemsError) throw itemsError;

    // Fetch product name for description
    let prodName = 'Product';
    const { data: pData } = await supabase.from('products').select('name, sku').eq('id', validated.productId).single();
    if (pData?.name) prodName = `${pData.name} (${pData.sku})`;

    await logAudit({
      req,
      action: 'BOM_CREATED',
      module: 'MANUFACTURING',
      entity: 'boms',
      entityId: bom.id,
      recordReference: `${bom.name} v${bom.version}`,
      description: `Created Bill of Materials '${bom.name}' v${bom.version} for ${prodName} (${validated.items.length} components)`,
      payload: {
        bomId: bom.id,
        name: bom.name,
        version: bom.version,
        productId: validated.productId,
        productName: prodName,
        componentCount: validated.items.length,
      },
    });

    res.status(201).json({ success: true, data: bom });
  } catch (error) {
    next(error);
  }
});

// GET /api/manufacturing/orders/next-number - Get next production order number
manufacturingRouter.get('/orders/next-number', requirePermission('manufacturing.view', 'manufacturing.manage'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { count, error } = await supabase
      .from('production_orders')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;
    const nextNum = (count || 0) + 1;
    res.json({ success: true, orderNumber: `MO-${String(nextNum).padStart(5, '0')}` });
  } catch (error) {
    next(error);
  }
});

// GET /api/manufacturing/orders - List all production orders
manufacturingRouter.get('/orders', requirePermission('manufacturing.view', 'manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select(`
        id, order_number, target_quantity, completed_quantity, waste_quantity, status, progress_pct,
        due_date, total_material_cost, labor_cost, notes, created_at, completed_at, customer_id, sale_id,
        product:products (id, sku, name, unit_of_measure, cost_price, selling_price),
        customer:customers (id, name, phone),
        sale:sales (id, invoice_number, total_amount, status),
        bom:boms (
          id, name, version,
          items:bom_items (
            id, quantity, waste_tolerance_pct,
            raw_material:products (id, sku, name, unit_of_measure, cost_price)
          )
        ),
        location:locations (id, name, type),
        material_issues:production_material_issues (
          id, quantity, unit_cost, total_cost, issued_at,
          raw_material:products (id, sku, name, unit_of_measure)
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter by customerId if provided (query param)
    let filteredOrders = orders || [];
    const customerId = (req as any).query?.customerId;
    if (customerId && typeof customerId === 'string') {
      filteredOrders = filteredOrders.filter((o: any) => o.customer_id === customerId);
    }

    res.json({ success: true, data: filteredOrders });
  } catch (error) {
    next(error);
  }
});

// POST /api/manufacturing/orders - Create a new Production Order (Does NOT consume stock)
manufacturingRouter.post('/orders', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = createProductionOrderSchema.parse(req.body);

    const { data: order, error } = await supabase
      .from('production_orders')
      .insert({
        order_number: validated.orderNumber,
        product_id: validated.productId,
        bom_id: validated.bomId,
        location_id: validated.locationId,
        target_quantity: validated.targetQuantity,
        completed_quantity: 0.00,
        waste_quantity: 0.00,
        status: 'PLANNED',
        progress_pct: 0.00,
        due_date: validated.dueDate || null,
        total_material_cost: 0.00,
        labor_cost: 0.00,
        notes: validated.notes || null,
        created_by: req.user?.id || null,
        customer_id: validated.customerId || null,
        sale_id: validated.saleId || null,
      })
      .select(`
        *,
        product:products (id, sku, name, unit_of_measure),
        bom:boms (id, name),
        location:locations (id, name)
      `)
      .single();

    if (error) throw error;

    const prodName = order.product?.name || 'Finished Product';
    await logAudit({
      req,
      action: 'PRODUCTION_ORDER_CREATED',
      module: 'MANUFACTURING',
      entity: 'production_orders',
      entityId: order.id,
      recordReference: order.order_number,
      description: `Created production order ${order.order_number} to manufacture ${order.target_quantity} units of ${prodName}`,
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        productId: validated.productId,
        targetQuantity: validated.targetQuantity,
        dueDate: validated.dueDate,
      },
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

// POST /api/manufacturing/orders/:id/issue-materials - Atomically issue raw materials
manufacturingRouter.post('/orders/:id/issue-materials', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = issueMaterialsSchema.parse(req.body);

    const { data, error } = await supabase.rpc('issue_production_materials', {
      p_production_order_id: id,
      p_location_id: validated.locationId,
      p_items: validated.items.map(item => ({
        raw_material_id: item.rawMaterialId,
        quantity: item.quantity,
        unit_cost: item.unitCost,
      })),
      p_user_id: req.user?.id || null,
    });

    if (error) {
      await logAudit({
        req,
        action: 'MATERIALS_ISSUE_FAILED',
        module: 'MANUFACTURING',
        entity: 'production_orders',
        entityId: id,
        outcome: 'FAILURE',
        reason: error.message,
        description: `Failed to issue materials for production order ${id}: ${error.message}`,
      });
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    // Lookup order number
    let orderNumber = 'MO';
    const { data: ord } = await supabase.from('production_orders').select('order_number').eq('id', id).single();
    if (ord?.order_number) orderNumber = ord.order_number;

    const totalQty = validated.items.reduce((s, it) => s + it.quantity, 0);

    await logAudit({
      req,
      action: 'PRODUCTION_MATERIALS_ISSUED',
      module: 'MANUFACTURING',
      entity: 'production_orders',
      entityId: id,
      recordReference: orderNumber,
      description: `Issued ${totalQty} units of raw materials for production order ${orderNumber}`,
      payload: {
        orderId: id,
        orderNumber,
        itemCount: validated.items.length,
        totalQuantity: totalQty,
        locationId: validated.locationId,
      },
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/manufacturing/orders/:id/complete - Complete order and take finished goods into inventory
manufacturingRouter.post('/orders/:id/complete', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = completeOrderSchema.parse(req.body);

    const { data, error } = await supabase.rpc('complete_production_order', {
      p_production_order_id: id,
      p_completed_quantity: validated.completedQuantity,
      p_waste_quantity: validated.wasteQuantity,
      p_labor_cost: validated.laborCost,
      p_notes: validated.notes || null,
      p_user_id: req.user?.id || null,
    });

    if (error) {
      await logAudit({
        req,
        action: 'PRODUCTION_COMPLETE_FAILED',
        module: 'MANUFACTURING',
        entity: 'production_orders',
        entityId: id,
        outcome: 'FAILURE',
        reason: error.message,
        description: `Failed to complete production order ${id}: ${error.message}`,
      });
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    let orderNumber = 'MO';
    const { data: ord } = await supabase.from('production_orders').select('order_number').eq('id', id).single();
    if (ord?.order_number) orderNumber = ord.order_number;

    await logAudit({
      req,
      action: 'PRODUCTION_ORDER_COMPLETED',
      module: 'MANUFACTURING',
      entity: 'production_orders',
      entityId: id,
      recordReference: orderNumber,
      description: `Completed production order ${orderNumber}: produced ${validated.completedQuantity} units (Scrap: ${validated.wasteQuantity}, Labor: ${validated.laborCost} ETB)`,
      payload: {
        orderId: id,
        orderNumber,
        completedQuantity: validated.completedQuantity,
        wasteQuantity: validated.wasteQuantity,
        laborCost: validated.laborCost,
        notes: validated.notes,
      },
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/manufacturing/boms/:id - Soft-delete BOM
manufacturingRouter.delete('/boms/:id', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('boms')
      .select('id, name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'BOM not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'boms',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft-deleted BOM',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete BOM. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'BOM_DELETED',
      module: 'MANUFACTURING',
      entity: 'boms',
      entityId: id,
      recordReference: existing.name,
      description: `Soft-deleted BOM: ${existing.name}${reason ? ': ' + reason : ''}`,
      reason: reason || null,
    });

    res.json({ success: true, message: 'BOM moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/manufacturing/orders/:id - Soft-delete production order
manufacturingRouter.delete('/orders/:id', requirePermission('manufacturing.manage'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('production_orders')
      .select('id, order_number, status')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Production order not found or already deleted' });
      return;
    }

    if (existing.status === 'IN_PROGRESS') {
      res.status(400).json({ success: false, error: 'Cannot delete order in IN_PROGRESS status. Please complete or cancel it first.' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'production_orders',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft-deleted order',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete production order. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'PRODUCTION_ORDER_DELETED',
      module: 'MANUFACTURING',
      entity: 'production_orders',
      entityId: id,
      recordReference: existing.order_number,
      description: `Soft-deleted production order: ${existing.order_number}${reason ? ': ' + reason : ''}`,
      reason: reason || null,
    });

    res.json({ success: true, message: 'Production order moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
