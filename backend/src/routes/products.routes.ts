import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requirePermission, requireSuperAdmin } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const productsRouter = Router();

const createProductSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL']),
  categoryId: z.string().uuid().optional(),
  unitOfMeasure: z.string().min(1),
  sellingPrice: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  minStockLevel: z.number().min(0).default(0),
  initialLocationId: z.string().uuid().optional(),
  initialQuantity: z.number().min(0).optional(),
});

const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  newQuantity: z.number().min(0),
  reason: z.string().min(3),
  userId: z.string().uuid().optional(),
});

// GET /api/products - List all products with category and stock levels
productsRouter.get('/', requirePermission('inventory.view'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, categoryId, search } = req.query;

    let query = supabase
      .from('products')
      .select(`
        *,
        categories:category_id (id, name),
        stock_levels (
          quantity,
          locations (id, name, type)
        )
      `)
      .is('deleted_at', null)
      .order('name');

    if (type) {
      query = query.eq('type', type as string);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId as string);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data: products, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

// POST /api/products - Create a new product or raw material (Super Admin only)
productsRouter.post('/', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createProductSchema.parse(req.body);

    const { data: product, error: insertError } = await supabase
      .from('products')
      .insert({
        sku: parsed.sku,
        name: parsed.name,
        type: parsed.type,
        category_id: parsed.categoryId || null,
        unit_of_measure: parsed.unitOfMeasure,
        selling_price: parsed.sellingPrice,
        cost_price: parsed.costPrice,
        min_stock_level: parsed.minStockLevel,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Optional initial stock assignment
    if (parsed.initialLocationId && parsed.initialQuantity && parsed.initialQuantity > 0) {
      await supabase.from('stock_levels').insert({
        product_id: product.id,
        location_id: parsed.initialLocationId,
        quantity: parsed.initialQuantity,
      });

      await supabase.from('inventory_movements').insert({
        product_id: product.id,
        location_id: parsed.initialLocationId,
        movement_type: 'STOCK_ADJUSTMENT',
        quantity: parsed.initialQuantity,
        notes: 'Initial stock intake at creation',
      });
    }

    await logAudit({
      req,
      action: 'PRODUCT_CREATED',
      module: 'INVENTORY',
      entity: 'products',
      entityId: product.id,
      recordReference: `${product.name} (${product.sku})`,
      description: `Created new product ${product.name} [SKU: ${product.sku}, Type: ${product.type}]`,
      payload: {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        type: product.type,
        sellingPrice: product.selling_price,
        costPrice: product.cost_price,
        unitOfMeasure: product.unit_of_measure,
        initialQuantity: parsed.initialQuantity || 0,
      },
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/adjust-stock - Execute authorized atomic stock adjustment
productsRouter.post('/adjust-stock', requirePermission('inventory.adjust'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId, locationId, newQuantity, reason, userId } = adjustStockSchema.parse(req.body);
    const effectiveUserId = req.user?.id || userId || null;

    const { data, error } = await supabase.rpc('record_stock_adjustment', {
      p_product_id: productId,
      p_location_id: locationId,
      p_new_quantity: newQuantity,
      p_reason: reason,
      p_user_id: effectiveUserId,
    });

    if (error) {
      await logAudit({
        req,
        action: 'STOCK_ADJUSTMENT_FAILED',
        module: 'INVENTORY',
        entity: 'stock_levels',
        entityId: productId,
        outcome: 'FAILURE',
        reason: error.message,
        description: `Failed stock adjustment for product ${productId}: ${error.message}`,
      });
      throw error;
    }

    // Lookup product & location details
    let prodName = 'Product';
    let locName = 'Location';
    const { data: prodData } = await supabase.from('products').select('name, sku').eq('id', productId).single();
    if (prodData?.name) prodName = `${prodData.name} (${prodData.sku})`;
    const { data: locData } = await supabase.from('locations').select('name').eq('id', locationId).single();
    if (locData?.name) locName = locData.name;

    await logAudit({
      req,
      action: 'STOCK_ADJUSTED',
      module: 'INVENTORY',
      entity: 'stock_levels',
      entityId: productId,
      recordReference: prodName,
      reason,
      description: `Adjusted stock for ${prodName} at ${locName} to ${newQuantity} units (Reason: ${reason})`,
      payload: {
        productId,
        productName: prodName,
        locationId,
        locationName: locName,
        newQuantity,
        reason,
        adjustmentResult: data,
      },
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/movements - Immutable audit movements
productsRouter.get('/movements', requirePermission('inventory.view'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId, locationId, limit = 50 } = req.query;

    let query = supabase
      .from('inventory_movements')
      .select(`
        id, movement_type, quantity, notes, created_at,
        product:products (id, sku, name, unit_of_measure),
        location:locations (id, name, type)
      `)
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (productId) {
      query = query.eq('product_id', productId as string);
    }

    if (locationId) {
      query = query.eq('location_id', locationId as string);
    }

    const { data: movements, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/locations - Physical locations (Shop vs Warehouse)
productsRouter.get('/locations', requirePermission('inventory.view'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: locations, error } = await supabase
      .from('locations')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/categories - Product & material categories
productsRouter.get('/categories', requirePermission('inventory.view'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:id - Soft-delete product
productsRouter.delete('/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Product not found or already deleted' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_record', {
        p_table_name: 'products',
        p_record_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft deleted by user',
      });

    if (updateError) throw updateError;
    if (!updated) {
      res.status(400).json({ success: false, error: 'Failed to delete product. It may already be deleted.' });
      return;
    }

    await logAudit({
      req,
      action: 'PRODUCT_DELETED',
      module: 'INVENTORY',
      entity: 'products',
      entityId: id,
      recordReference: `${existing.name} (${existing.sku})`,
      description: `Soft-deleted product ${existing.name} (${existing.sku})${reason ? ': ' + reason : ''}`,
      reason: reason || null,
      payload: { productId: id, name: existing.name, sku: existing.sku },
    });

    res.json({ success: true, message: 'Product moved to Recovery Center', data: updated });
  } catch (error) {
    next(error);
  }
});
