-- Migration: 20261015000002_business_logic_rpcs.sql
-- Description: Atomic Business Logic RPCs & Security Policies for FurniERP
-- Authoritative Database: Supabase PostgreSQL 17

-- 1. ROW LEVEL SECURITY (RLS) POLICIES
-- Service role key has full bypass in Supabase. For client/authenticated access:

-- User profiles: Users can read active profiles; only Super Admin can update
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.user_profiles;
CREATE POLICY "Authenticated users can read profiles" ON public.user_profiles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super Admin can manage user profiles" ON public.user_profiles;
CREATE POLICY "Super Admin can manage user profiles" ON public.user_profiles
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.id = auth.uid() AND up.role = 'SUPER_ADMIN'
        )
    );

-- Read access for operational master data
DROP POLICY IF EXISTS "Authenticated can read locations" ON public.locations;
DROP POLICY IF EXISTS "Read locations" ON public.locations;
CREATE POLICY "Read locations" ON public.locations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read categories" ON public.categories;
DROP POLICY IF EXISTS "Read categories" ON public.categories;
CREATE POLICY "Read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
DROP POLICY IF EXISTS "Read products" ON public.products;
CREATE POLICY "Read products" ON public.products FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read stock_levels" ON public.stock_levels;
DROP POLICY IF EXISTS "Read stock_levels" ON public.stock_levels;
CREATE POLICY "Read stock_levels" ON public.stock_levels FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Read inventory_movements" ON public.inventory_movements;
CREATE POLICY "Read inventory_movements" ON public.inventory_movements FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read customers" ON public.customers;
DROP POLICY IF EXISTS "Read customers" ON public.customers;
CREATE POLICY "Read customers" ON public.customers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Read suppliers" ON public.suppliers;
CREATE POLICY "Read suppliers" ON public.suppliers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read sales" ON public.sales;
DROP POLICY IF EXISTS "Read sales" ON public.sales;
CREATE POLICY "Read sales" ON public.sales FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Read sale_items" ON public.sale_items;
CREATE POLICY "Read sale_items" ON public.sale_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read payments" ON public.payments;
CREATE POLICY "Authenticated can read payments" ON public.payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read purchases" ON public.purchases;
CREATE POLICY "Authenticated can read purchases" ON public.purchases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read purchase_items" ON public.purchase_items;
CREATE POLICY "Authenticated can read purchase_items" ON public.purchase_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read goods_receipts" ON public.goods_receipts;
CREATE POLICY "Authenticated can read goods_receipts" ON public.goods_receipts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read boms" ON public.boms;
CREATE POLICY "Authenticated can read boms" ON public.boms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read production_orders" ON public.production_orders;
CREATE POLICY "Authenticated can read production_orders" ON public.production_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read company_settings" ON public.company_settings;
CREATE POLICY "Authenticated can read company_settings" ON public.company_settings FOR SELECT TO authenticated USING (true);


-- 2. ATOMIC RPC FUNCTION: execute_sale_checkout
-- Purpose: Deduct stock atomically, record movement, insert sale, sale items, and payment
CREATE OR REPLACE FUNCTION public.execute_sale_checkout(
    p_invoice_number TEXT,
    p_customer_id UUID,
    p_location_id UUID,
    p_subtotal NUMERIC(14, 2),
    p_discount_amount NUMERIC(14, 2),
    p_total_amount NUMERIC(14, 2),
    p_paid_amount NUMERIC(14, 2),
    p_payment_method TEXT,
    p_items JSONB, -- Array of objects: [{"product_id": "...", "quantity": 1, "unit_price": 500, "cost_price": 300}]
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_status TEXT;
    v_balance_due NUMERIC(14, 2);
    v_item JSONB;
    v_prod_id UUID;
    v_qty NUMERIC(12, 4);
    v_unit_price NUMERIC(14, 2);
    v_cost_price NUMERIC(14, 2);
    v_total_price NUMERIC(14, 2);
    v_current_stock NUMERIC(12, 4);
    v_item_name TEXT;
BEGIN
    -- 1. Determine Sale Status & Balance Due
    v_balance_due := p_total_amount - p_paid_amount;
    IF v_balance_due <= 0 THEN
        v_status := 'PAID';
        v_balance_due := 0.00;
    ELSIF p_paid_amount > 0 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'CREDIT';
    END IF;

    -- 2. Verify and Lock Stock Rows (Prevent Concurrency Race Conditions)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC(12, 4);

        -- Ensure stock_levels record exists (upsert 0 if none yet)
        INSERT INTO public.stock_levels (product_id, location_id, quantity)
        VALUES (v_prod_id, p_location_id, 0.00)
        ON CONFLICT (product_id, location_id) DO NOTHING;

        -- Lock row FOR UPDATE
        SELECT sl.quantity, p.name INTO v_current_stock, v_item_name
        FROM public.stock_levels sl
        JOIN public.products p ON p.id = sl.product_id
        WHERE sl.product_id = v_prod_id AND sl.location_id = p_location_id
        FOR UPDATE;

        IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product "%" at this location. Available: %, Requested: %',
                v_item_name, v_current_stock, v_qty;
        END IF;
    END LOOP;

    -- 3. Insert Sale Header
    INSERT INTO public.sales (
        invoice_number, customer_id, location_id, subtotal, discount_amount,
        total_amount, paid_amount, balance_due, status, notes, created_by
    )
    VALUES (
        p_invoice_number, p_customer_id, p_location_id, p_subtotal, p_discount_amount,
        p_total_amount, p_paid_amount, v_balance_due, v_status, p_notes, p_user_id
    )
    RETURNING id INTO v_sale_id;

    -- 4. Process Sale Items, Decrement Stock & Insert Movement
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC(12, 4);
        v_unit_price := (v_item->>'unit_price')::NUMERIC(14, 2);
        v_cost_price := COALESCE((v_item->>'cost_price')::NUMERIC(14, 2), 0.00);
        v_total_price := v_qty * v_unit_price;

        -- Insert line item
        INSERT INTO public.sale_items (
            sale_id, product_id, quantity, unit_price, cost_price, total_price
        )
        VALUES (
            v_sale_id, v_prod_id, v_qty, v_unit_price, v_cost_price, v_total_price
        );

        -- Decrement stock level
        UPDATE public.stock_levels
        SET quantity = quantity - v_qty, updated_at = now()
        WHERE product_id = v_prod_id AND location_id = p_location_id;

        -- Insert immutable inventory movement (negative quantity)
        INSERT INTO public.inventory_movements (
            product_id, location_id, movement_type, quantity, reference_id, notes, created_by
        )
        VALUES (
            v_prod_id, p_location_id, 'SALE_DEDUCTION', -v_qty, v_sale_id,
            'Sale Checkout ' || p_invoice_number, p_user_id
        );
    END LOOP;

    -- 5. Record Payment if paid > 0
    IF p_paid_amount > 0 AND p_payment_method IS NOT NULL THEN
        INSERT INTO public.payments (
            reference_type, reference_id, amount, payment_method, notes, received_by
        )
        VALUES (
            'SALE', v_sale_id, p_paid_amount, p_payment_method,
            'Checkout deposit for ' || p_invoice_number, p_user_id
        );
    END IF;

    -- 6. Update Customer Outstanding Debt if balance_due > 0
    IF v_balance_due > 0 AND p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = outstanding_balance + v_balance_due, updated_at = now()
        WHERE id = p_customer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'invoice_number', p_invoice_number,
        'status', v_status,
        'balance_due', v_balance_due
    );
END;
$$;


-- 3. ATOMIC RPC FUNCTION: confirm_goods_receipt
-- Purpose: Accept received goods, increment stock, record movements, update purchase order
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(
    p_receipt_number TEXT,
    p_purchase_id UUID,
    p_location_id UUID,
    p_items JSONB, -- Array: [{"purchase_item_id": "...", "product_id": "...", "received_quantity": 10}]
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receipt_id UUID;
    v_item JSONB;
    v_purchase_item_id UUID;
    v_prod_id UUID;
    v_rcv_qty NUMERIC(12, 4);
    v_purchase_number TEXT;
    v_supplier_id UUID;
    v_all_received BOOLEAN := true;
BEGIN
    -- 1. Check purchase order exists
    SELECT purchase_number, supplier_id INTO v_purchase_number, v_supplier_id
    FROM public.purchases
    WHERE id = p_purchase_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;

    -- 2. Insert goods receipt header
    INSERT INTO public.goods_receipts (
        receipt_number, purchase_id, location_id, notes, received_by
    )
    VALUES (
        p_receipt_number, p_purchase_id, p_location_id, p_notes, p_user_id
    )
    RETURNING id INTO v_receipt_id;

    -- 3. Process each received item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_purchase_item_id := (v_item->>'purchase_item_id')::UUID;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_rcv_qty := (v_item->>'received_quantity')::NUMERIC(12, 4);

        -- Insert receipt line item
        INSERT INTO public.goods_receipt_items (
            receipt_id, purchase_item_id, product_id, received_quantity
        )
        VALUES (
            v_receipt_id, v_purchase_item_id, v_prod_id, v_rcv_qty
        );

        -- Update purchase item received quantity
        UPDATE public.purchase_items
        SET received_quantity = received_quantity + v_rcv_qty
        WHERE id = v_purchase_item_id;

        -- Upsert stock level
        INSERT INTO public.stock_levels (product_id, location_id, quantity)
        VALUES (v_prod_id, p_location_id, v_rcv_qty)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET quantity = public.stock_levels.quantity + EXCLUDED.quantity, updated_at = now();

        -- Insert inventory movement (positive quantity)
        INSERT INTO public.inventory_movements (
            product_id, location_id, movement_type, quantity, reference_id, notes, created_by
        )
        VALUES (
            v_prod_id, p_location_id, 'PURCHASE_RECEIPT', v_rcv_qty, v_receipt_id,
            'Goods Receipt ' || p_receipt_number || ' for PO ' || v_purchase_number, p_user_id
        );
    END LOOP;

    -- 4. Check if all purchase items are completely received
    SELECT bool_and(received_quantity >= ordered_quantity) INTO v_all_received
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id;

    IF v_all_received THEN
        UPDATE public.purchases SET status = 'RECEIVED' WHERE id = p_purchase_id;
    ELSE
        UPDATE public.purchases SET status = 'PARTIALLY_RECEIVED' WHERE id = p_purchase_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'receipt_number', p_receipt_number
    );
END;
$$;


-- 4. ATOMIC RPC FUNCTION: record_stock_adjustment
-- Purpose: Perform authorized inventory adjustment with audit movement
CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
    p_product_id UUID,
    p_location_id UUID,
    p_new_quantity NUMERIC(12, 4),
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_quantity NUMERIC(12, 4) := 0.00;
    v_delta NUMERIC(12, 4);
    v_movement_id UUID;
BEGIN
    IF p_new_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity cannot be adjusted to a negative value';
    END IF;

    -- Upsert stock level to lock
    INSERT INTO public.stock_levels (product_id, location_id, quantity)
    VALUES (p_product_id, p_location_id, 0.00)
    ON CONFLICT (product_id, location_id) DO NOTHING;

    SELECT quantity INTO v_old_quantity
    FROM public.stock_levels
    WHERE product_id = p_product_id AND location_id = p_location_id
    FOR UPDATE;

    v_delta := p_new_quantity - v_old_quantity;

    -- Update stock level
    UPDATE public.stock_levels
    SET quantity = p_new_quantity, updated_at = now()
    WHERE product_id = p_product_id AND location_id = p_location_id;

    -- Record movement
    INSERT INTO public.inventory_movements (
        product_id, location_id, movement_type, quantity, notes, created_by
    )
    VALUES (
        p_product_id, p_location_id, 'STOCK_ADJUSTMENT', v_delta, p_reason, p_user_id
    )
    RETURNING id INTO v_movement_id;

    -- Record in audit log
    INSERT INTO public.audit_logs (
        user_id, action, entity, entity_id, payload
    )
    VALUES (
        p_user_id, 'STOCK_ADJUSTMENT', 'stock_levels', p_product_id,
        jsonb_build_object(
            'location_id', p_location_id,
            'old_quantity', v_old_quantity,
            'new_quantity', p_new_quantity,
            'delta', v_delta,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_quantity', v_old_quantity,
        'new_quantity', p_new_quantity,
        'delta', v_delta
    );
END;
$$;


-- 5. ATOMIC RPC FUNCTION: bootstrap_super_admin
-- Purpose: Initialize first-time Super Admin user profile securely bypassing RLS
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(
    p_user_id UUID,
    p_full_name TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_count INT;
BEGIN
    SELECT count(*) INTO v_admin_count
    FROM public.user_profiles
    WHERE role = 'SUPER_ADMIN';

    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'System already initialized with a Super Admin';
    END IF;

    INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
    VALUES (p_user_id, p_full_name, 'SUPER_ADMIN', p_phone, true);

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', 'SUPER_ADMIN'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sale_checkout(TEXT, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt(TEXT, UUID, UUID, JSONB, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(UUID, UUID, NUMERIC, TEXT, UUID) TO anon, authenticated;

