import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { requireSuperAdmin } from '../middleware/auth';
import { logAudit } from '../services/audit.service';

export const recoveryRouter = Router();

// Protect all Recovery Center endpoints: STRICTLY Super Admin only!
recoveryRouter.use(requireSuperAdmin);

// Helper to get user names for deleted_by IDs
async function populateDeletedByNames(records: any[]): Promise<any[]> {
  const userIds = [...new Set(records.map(r => r.deleted_by).filter(Boolean))];
  if (userIds.length === 0) return records;

  const { data: users } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const userMap = new Map((users || []).map(u => [u.id, u.full_name || u.email]));
  return records.map(r => ({
    ...r,
    deleted_by_name: r.deleted_by ? userMap.get(r.deleted_by) || 'Super Admin' : 'System',
  }));
}

// GET /api/recovery/stats - Summary counts of deleted records per category
recoveryRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [
      { count: usersCount },
      { count: productsCount },
      { count: customersCount },
      { count: suppliersCount },
      { count: bomsCount },
      { count: ordersCount },
      { count: expensesCount },
      { count: salesCount },
    ] = await Promise.all([
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('products').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('customers').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('suppliers').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('boms').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('production_orders').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('expenses').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('sales').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    ]);

    const stats = {
      users: usersCount || 0,
      products: productsCount || 0,
      customers: customersCount || 0,
      suppliers: suppliersCount || 0,
      manufacturing: (bomsCount || 0) + (ordersCount || 0),
      boms: bomsCount || 0,
      productionOrders: ordersCount || 0,
      expenses: expensesCount || 0,
      sales: salesCount || 0,
      total: (usersCount || 0) + (productsCount || 0) + (customersCount || 0) + 
             (suppliersCount || 0) + (bomsCount || 0) + (ordersCount || 0) + 
             (expensesCount || 0) + (salesCount || 0),
    };

    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/recovery/records - Unified list of deleted records with conflict detection
recoveryRouter.get('/records', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, search } = req.query;
    const cat = (category as string || 'ALL').toUpperCase();
    const querySearch = search ? (search as string).toLowerCase().trim() : '';

    const records: any[] = [];

    // 1. User Profiles
    if (cat === 'ALL' || cat === 'USERS') {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (users && users.length > 0) {
        const enriched = await populateDeletedByNames(users);
        for (const u of enriched) {
          records.push({
            id: u.id,
            category: 'USERS',
            recordType: 'Employee Account',
            identifier: u.full_name,
            subIdentifier: u.email || u.phone || 'Employee',
            deletedAt: u.deleted_at,
            deletedBy: u.deleted_by,
            deletedByName: u.deleted_by_name,
            deletionReason: u.deletion_reason || 'Manual deactivation / deletion',
            canRestore: true,
            conflict: null,
            metadata: { role: u.role, phone: u.phone },
          });
        }
      }
    }

    // 2. Products
    if (cat === 'ALL' || cat === 'PRODUCTS') {
      const { data: prods } = await supabase
        .from('products')
        .select('*, categories (name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (prods && prods.length > 0) {
        const enriched = await populateDeletedByNames(prods);
        // Check active SKUs to detect conflict
        const { data: activeProds } = await supabase
          .from('products')
          .select('sku')
          .is('deleted_at', null);

        const activeSkus = new Set((activeProds || []).map(p => p.sku.toLowerCase()));

        for (const p of enriched) {
          const hasConflict = activeSkus.has(p.sku.toLowerCase());
          records.push({
            id: p.id,
            category: 'PRODUCTS',
            recordType: p.type === 'RAW_MATERIAL' ? 'Raw Material' : 'Finished Good Product',
            identifier: p.name,
            subIdentifier: `SKU: ${p.sku} | Unit: ${p.unit_of_measure}`,
            deletedAt: p.deleted_at,
            deletedBy: p.deleted_by,
            deletedByName: p.deleted_by_name,
            deletionReason: p.deletion_reason || 'Archived from catalog',
            canRestore: !hasConflict,
            conflict: hasConflict ? `An active product already exists with SKU "${p.sku}"` : null,
            metadata: {
              sku: p.sku,
              type: p.type,
              sellingPrice: p.selling_price,
              costPrice: p.cost_price,
              category: (p.categories as any)?.name || 'Unassigned',
            },
          });
        }
      }
    }

    // 3. Customers
    if (cat === 'ALL' || cat === 'CUSTOMERS') {
      const { data: custs } = await supabase
        .from('customers')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (custs && custs.length > 0) {
        const enriched = await populateDeletedByNames(custs);
        for (const c of enriched) {
          records.push({
            id: c.id,
            category: 'CUSTOMERS',
            recordType: 'Customer Record',
            identifier: c.name,
            subIdentifier: `Phone: ${c.phone || 'N/A'} | Balance: ETB ${Number(c.outstanding_balance || 0).toLocaleString()}`,
            deletedAt: c.deleted_at,
            deletedBy: c.deleted_by,
            deletedByName: c.deleted_by_name,
            deletionReason: c.deletion_reason || 'Archived customer account',
            canRestore: true,
            conflict: null,
            metadata: { phone: c.phone, email: c.email, address: c.address, balance: c.outstanding_balance },
          });
        }
      }
    }

    // 4. Suppliers
    if (cat === 'ALL' || cat === 'SUPPLIERS') {
      const { data: supps } = await supabase
        .from('suppliers')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (supps && supps.length > 0) {
        const enriched = await populateDeletedByNames(supps);
        for (const s of enriched) {
          records.push({
            id: s.id,
            category: 'SUPPLIERS',
            recordType: 'Supplier Record',
            identifier: s.name,
            subIdentifier: `Contact: ${s.contact_person || 'N/A'} | Phone: ${s.phone || 'N/A'}`,
            deletedAt: s.deleted_at,
            deletedBy: s.deleted_by,
            deletedByName: s.deleted_by_name,
            deletionReason: s.deletion_reason || 'Archived supplier account',
            canRestore: true,
            conflict: null,
            metadata: { phone: s.phone, contactPerson: s.contact_person, balance: s.outstanding_balance },
          });
        }
      }
    }

    // 5. Bills of Materials (BOMs)
    if (cat === 'ALL' || cat === 'MANUFACTURING' || cat === 'BOMS') {
      const { data: boms } = await supabase
        .from('boms')
        .select(`
          *,
          product:products (id, name, sku, deleted_at)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (boms && boms.length > 0) {
        const enriched = await populateDeletedByNames(boms);
        for (const b of enriched) {
          const parentProduct = b.product as any;
          const parentDeleted = parentProduct && parentProduct.deleted_at !== null;
          records.push({
            id: b.id,
            category: 'BOMS',
            recordType: 'Bill of Materials (BOM)',
            identifier: b.name,
            subIdentifier: `Product: ${parentProduct?.name || 'Unknown'} (${parentProduct?.sku || 'N/A'})`,
            deletedAt: b.deleted_at,
            deletedBy: b.deleted_by,
            deletedByName: b.deleted_by_name,
            deletionReason: b.deletion_reason || 'Retired manufacturing specification',
            canRestore: !parentDeleted,
            conflict: parentDeleted ? `Parent product "${parentProduct?.name}" is deleted. Restore product first.` : null,
            metadata: {
              productId: b.product_id,
              productName: parentProduct?.name,
              yieldQuantity: b.yield_quantity,
            },
          });
        }
      }
    }

    // 6. Production Orders
    if (cat === 'ALL' || cat === 'MANUFACTURING' || cat === 'PRODUCTION_ORDERS') {
      const { data: orders } = await supabase
        .from('production_orders')
        .select(`
          *,
          product:products (id, name, sku, deleted_at)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (orders && orders.length > 0) {
        const enriched = await populateDeletedByNames(orders);
        for (const o of enriched) {
          const prod = o.product as any;
          const prodDeleted = prod && prod.deleted_at !== null;
          records.push({
            id: o.id,
            category: 'PRODUCTION_ORDERS',
            recordType: 'Production Order',
            identifier: o.order_number,
            subIdentifier: `Manufacture ${o.target_quantity} units of ${prod?.name || 'Product'} | Status: ${o.status}`,
            deletedAt: o.deleted_at,
            deletedBy: o.deleted_by,
            deletedByName: o.deleted_by_name,
            deletionReason: o.deletion_reason || 'Cancelled/removed production order',
            canRestore: !prodDeleted,
            conflict: prodDeleted ? `Target product "${prod?.name}" is deleted. Restore product first.` : null,
            metadata: {
              orderNumber: o.order_number,
              status: o.status,
              targetQuantity: o.target_quantity,
              completedQuantity: o.completed_quantity,
            },
          });
        }
      }
    }

    // 7. Expenses
    if (cat === 'ALL' || cat === 'FINANCE' || cat === 'EXPENSES') {
      const { data: exps } = await supabase
        .from('expenses')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (exps && exps.length > 0) {
        const enriched = await populateDeletedByNames(exps);
        for (const e of enriched) {
          records.push({
            id: e.id,
            category: 'EXPENSES',
            recordType: 'Expense Record',
            identifier: `${e.category} - ETB ${Number(e.amount).toLocaleString()}`,
            subIdentifier: `Date: ${e.expense_date} | Method: ${e.payment_method}`,
            deletedAt: e.deleted_at,
            deletedBy: e.deleted_by,
            deletedByName: e.deleted_by_name,
            deletionReason: e.deletion_reason || 'Cancelled operating expense',
            canRestore: true,
            conflict: null,
            metadata: {
              category: e.category,
              amount: e.amount,
              paymentMethod: e.payment_method,
              description: e.description,
            },
          });
        }
      }
    }

    // 8. Sales
    if (cat === 'ALL' || cat === 'SALES') {
      const { data: salesList } = await supabase
        .from('sales')
        .select(`
          *,
          customer:customers (name)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (salesList && salesList.length > 0) {
        const enriched = await populateDeletedByNames(salesList);
        for (const s of enriched) {
          records.push({
            id: s.id,
            category: 'SALES',
            recordType: 'Sales Invoice',
            identifier: s.invoice_number,
            subIdentifier: `Customer: ${(s.customer as any)?.name || 'Walk-in'} | Total: ETB ${Number(s.total_amount).toLocaleString()}`,
            deletedAt: s.deleted_at,
            deletedBy: s.deleted_by,
            deletedByName: s.deleted_by_name,
            deletionReason: s.deletion_reason || 'Archived sale',
            canRestore: true,
            conflict: null,
            metadata: {
              invoiceNumber: s.invoice_number,
              totalAmount: s.total_amount,
              status: s.status,
            },
          });
        }
      }
    }

    // Sort all records descending by deletion date
    records.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    // Apply text search filtering if provided
    const filtered = querySearch
      ? records.filter(r =>
          (r.identifier || '').toLowerCase().includes(querySearch) ||
          (r.subIdentifier || '').toLowerCase().includes(querySearch) ||
          (r.deletionReason || '').toLowerCase().includes(querySearch) ||
          (r.recordType || '').toLowerCase().includes(querySearch)
        )
      : records;

    res.json({
      success: true,
      count: filtered.length,
      records: filtered,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/recovery/records/:category/:id - Inspect detailed record payload before restoring
recoveryRouter.get('/records/:category/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, id } = req.params;
    const cat = category.toUpperCase();

    let details: any = null;

    switch (cat) {
      case 'USERS': {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(`
            *,
            permissions:employee_permissions (permission_key)
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'PRODUCTS': {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            categories (name),
            stock_levels (quantity, locations (name, type))
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'CUSTOMERS': {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'SUPPLIERS': {
        const { data, error } = await supabase
          .from('suppliers')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'BOMS': {
        const { data, error } = await supabase
          .from('boms')
          .select(`
            *,
            product:products (id, name, sku, deleted_at),
            items:bom_items (
              id, quantity, scrap_percentage,
              raw_material:products (id, name, sku, unit_of_measure)
            )
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'PRODUCTION_ORDERS': {
        const { data, error } = await supabase
          .from('production_orders')
          .select(`
            *,
            product:products (id, name, sku),
            bom:boms (name),
            location:locations (name),
            issues:production_material_issues (
              quantity, unit_cost, total_cost,
              raw_material:products (name, sku)
            )
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'EXPENSES': {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      case 'SALES': {
        const { data, error } = await supabase
          .from('sales')
          .select(`
            *,
            customer:customers (name),
            items:sale_items (quantity, unit_price, total_price, product:products (name, sku)),
            payments (amount, payment_method, created_at)
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        details = data;
        break;
      }
      default:
        res.status(400).json({ success: false, error: `Invalid category: ${category}` });
        return;
    }

    res.json({ success: true, category: cat, data: details });
  } catch (error) {
    next(error);
  }
});

// POST /api/recovery/restore/:category/:id - Safely restore record and relationships
recoveryRouter.post('/restore/:category/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, id } = req.params;
    const cat = category.toUpperCase();
    const adminUser = req.user;

    switch (cat) {
      case 'USERS': {
        const { data: user, error: findErr } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !user) {
          res.status(404).json({ success: false, error: 'Deleted employee profile not found.' });
          return;
        }

        // Enforce Super Admin limit when restoring a Super Admin account
        if (user.role === 'SUPER_ADMIN') {
          const { count: activeAdminCount, error: countErr } = await supabase
            .from('user_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'SUPER_ADMIN')
            .eq('is_active', true)
            .is('deleted_at', null)
            .neq('id', id);

          if (countErr) throw countErr;

          if ((activeAdminCount || 0) >= 5) {
            res.status(400).json({
              success: false,
              error: 'Cannot restore Super Admin account. Maximum limit of 5 active Super Admin accounts reached.',
            });
            return;
          }
        }

        const safeRole = user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'EMPLOYEE';

        const { data: restoredUser, error: restoreErr } = await supabase
          .rpc('restore_user_profile', { p_user_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredUser || (Array.isArray(restoredUser) && restoredUser.length === 0)) {
          res.status(400).json({ success: false, error: 'Failed to restore user. The record may not exist or was already restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'USER_RESTORED',
          module: 'RECOVERY',
          entity: 'user_profiles',
          entityId: id,
          recordReference: user.full_name,
          description: `Super Admin restored ${user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'employee'} account: ${user.full_name} (${user.role})`,
          payload: { userId: id, name: user.full_name, role: safeRole },
        });

        res.json({ success: true, message: `${user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee'} account "${user.full_name}" restored successfully.` });
        return;
      }

      case 'PRODUCTS': {
        const { data: prod, error: findErr } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !prod) {
          res.status(404).json({ success: false, error: 'Deleted product not found.' });
          return;
        }

        // Check if an active product already holds this SKU
        const { data: conflicting } = await supabase
          .from('products')
          .select('id, name')
          .eq('sku', prod.sku)
          .is('deleted_at', null)
          .maybeSingle();

        if (conflicting) {
          res.status(400).json({
            success: false,
            error: `Cannot restore: An active product "${conflicting.name}" already uses SKU "${prod.sku}". Change or retire that SKU first.`,
          });
          return;
        }

        const { data: restoredProd, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'products', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredProd) {
          res.status(400).json({ success: false, error: 'Failed to restore product. It may already be restored.' });
          return;
        }

        // Note: Stock levels in stock_levels table remain intact and untouched!
        // No duplicate stock intake movements are generated.

        await logAudit({
          req,
          action: 'PRODUCT_RESTORED',
          module: 'RECOVERY',
          entity: 'products',
          entityId: id,
          recordReference: `${prod.name} (${prod.sku})`,
          description: `Super Admin restored product: ${prod.name} (SKU: ${prod.sku}). Stock levels preserved.`,
          payload: { productId: id, name: prod.name, sku: prod.sku, type: prod.type },
        });

        res.json({ success: true, message: `Product "${prod.name}" restored successfully. Stock levels preserved.` });
        return;
      }

      case 'CUSTOMERS': {
        const { data: cust, error: findErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !cust) {
          res.status(404).json({ success: false, error: 'Deleted customer not found.' });
          return;
        }

        const { data: restoredCust, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'customers', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredCust) {
          res.status(400).json({ success: false, error: 'Failed to restore customer. It may already be restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'CUSTOMER_RESTORED',
          module: 'RECOVERY',
          entity: 'customers',
          entityId: id,
          recordReference: cust.name,
          description: `Super Admin restored customer: ${cust.name}`,
          payload: { customerId: id, name: cust.name, phone: cust.phone },
        });

        res.json({ success: true, message: `Customer "${cust.name}" restored successfully.` });
        return;
      }

      case 'SUPPLIERS': {
        const { data: supp, error: findErr } = await supabase
          .from('suppliers')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !supp) {
          res.status(404).json({ success: false, error: 'Deleted supplier not found.' });
          return;
        }

        const { data: restoredSupp, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'suppliers', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredSupp) {
          res.status(400).json({ success: false, error: 'Failed to restore supplier. It may already be restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'SUPPLIER_RESTORED',
          module: 'RECOVERY',
          entity: 'suppliers',
          entityId: id,
          recordReference: supp.name,
          description: `Super Admin restored supplier: ${supp.name}`,
          payload: { supplierId: id, name: supp.name, phone: supp.phone },
        });

        res.json({ success: true, message: `Supplier "${supp.name}" restored successfully.` });
        return;
      }

      case 'BOMS': {
        const { data: bom, error: findErr } = await supabase
          .from('boms')
          .select('*, product:products (id, name, deleted_at)')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !bom) {
          res.status(404).json({ success: false, error: 'Deleted BOM not found.' });
          return;
        }

        const parentProduct = bom.product as any;
        if (parentProduct && parentProduct.deleted_at !== null) {
          res.status(400).json({
            success: false,
            error: `Cannot restore BOM "${bom.name}": The parent product "${parentProduct.name}" is currently deleted. Please restore the product first.`,
          });
          return;
        }

        const { data: restoredBom, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'boms', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredBom) {
          res.status(400).json({ success: false, error: 'Failed to restore BOM. It may already be restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'BOM_RESTORED',
          module: 'RECOVERY',
          entity: 'boms',
          entityId: id,
          recordReference: bom.name,
          description: `Super Admin restored Bill of Materials: ${bom.name}`,
          payload: { bomId: id, name: bom.name, productId: bom.product_id },
        });

        res.json({ success: true, message: `Bill of Materials "${bom.name}" restored successfully.` });
        return;
      }

      case 'PRODUCTION_ORDERS': {
        const { data: order, error: findErr } = await supabase
          .from('production_orders')
          .select('*, product:products (name, deleted_at)')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !order) {
          res.status(404).json({ success: false, error: 'Deleted production order not found.' });
          return;
        }

        const prod = order.product as any;
        if (prod && prod.deleted_at !== null) {
          res.status(400).json({
            success: false,
            error: `Cannot restore Production Order "${order.order_number}": The target product "${prod.name}" is currently deleted. Please restore the product first.`,
          });
          return;
        }

        const { data: restoredOrd, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'production_orders', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredOrd) {
          res.status(400).json({ success: false, error: 'Failed to restore production order. It may already be restored.' });
          return;
        }

        // Important: Do not re-consume materials or re-output finished stock!
        await logAudit({
          req,
          action: 'PRODUCTION_ORDER_RESTORED',
          module: 'RECOVERY',
          entity: 'production_orders',
          entityId: id,
          recordReference: order.order_number,
          description: `Super Admin restored production order: ${order.order_number} (Status: ${order.status}). Inventory movements preserved without duplication.`,
          payload: { orderId: id, orderNumber: order.order_number, status: order.status },
        });

        res.json({ success: true, message: `Production order "${order.order_number}" restored successfully.` });
        return;
      }

      case 'EXPENSES': {
        const { data: exp, error: findErr } = await supabase
          .from('expenses')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !exp) {
          res.status(404).json({ success: false, error: 'Deleted expense record not found.' });
          return;
        }

        const { data: restoredExp, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'expenses', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredExp) {
          res.status(400).json({ success: false, error: 'Failed to restore expense. It may already be restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'EXPENSE_RESTORED',
          module: 'RECOVERY',
          entity: 'expenses',
          entityId: id,
          recordReference: `${exp.category} (ETB ${exp.amount})`,
          description: `Super Admin restored expense record: ${exp.category} - ETB ${exp.amount}`,
          payload: { expenseId: id, category: exp.category, amount: exp.amount },
        });

        res.json({ success: true, message: `Expense record restored successfully.` });
        return;
      }

      case 'SALES': {
        const { data: sale, error: findErr } = await supabase
          .from('sales')
          .select('*')
          .eq('id', id)
          .not('deleted_at', 'is', null)
          .single();

        if (findErr || !sale) {
          res.status(404).json({ success: false, error: 'Deleted sale not found.' });
          return;
        }

        const { data: restoredSale, error: restoreErr } = await supabase
          .rpc('restore_record', { p_table_name: 'sales', p_record_id: id });

        if (restoreErr) throw restoreErr;
        if (!restoredSale) {
          res.status(400).json({ success: false, error: 'Failed to restore sale. It may already be restored.' });
          return;
        }

        await logAudit({
          req,
          action: 'SALE_RESTORED',
          module: 'RECOVERY',
          entity: 'sales',
          entityId: id,
          recordReference: sale.invoice_number,
          description: `Super Admin restored sales invoice: ${sale.invoice_number}. Financial ledger preserved without duplicate payments.`,
          payload: { saleId: id, invoiceNumber: sale.invoice_number, totalAmount: sale.total_amount },
        });

        res.json({ success: true, message: `Sales invoice "${sale.invoice_number}" restored successfully.` });
        return;
      }

      default:
        res.status(400).json({ success: false, error: `Invalid category: ${category}` });
    }
  } catch (error) {
    next(error);
  }
});
