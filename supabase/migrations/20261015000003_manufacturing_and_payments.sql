-- Migration: 20261015000003_manufacturing_and_payments.sql
-- Description: Manufacturing & BOMs, Customer/Supplier Payments, and Purchasing Schema Alignment
-- Authoritative Database: Supabase PostgreSQL 17

-- 1. SCHEMA ALIGNMENT FOR PURCHASES TABLE
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
UPDATE public.purchases SET total_amount = total_cost WHERE total_amount = 0 AND total_cost > 0;

-- 2. ROW LEVEL SECURITY (RLS) POLICIES FOR MANUFACTURING, EXPENSES & PAYMENTS
DROP POLICY IF EXISTS "Authenticated can read bom_items" ON public.bom_items;
DROP POLICY IF EXISTS "Read bom_items" ON public.bom_items;
CREATE POLICY "Read bom_items" ON public.bom_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read boms" ON public.boms;
DROP POLICY IF EXISTS "Read boms" ON public.boms;
CREATE POLICY "Read boms" ON public.boms FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Read production_orders" ON public.production_orders;
CREATE POLICY "Read production_orders" ON public.production_orders FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read production_material_issues" ON public.production_material_issues;
DROP POLICY IF EXISTS "Read production_material_issues" ON public.production_material_issues;
CREATE POLICY "Read production_material_issues" ON public.production_material_issues FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Read expenses" ON public.expenses;
CREATE POLICY "Read expenses" ON public.expenses FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read payments" ON public.payments;
DROP POLICY IF EXISTS "Read payments" ON public.payments;
CREATE POLICY "Read payments" ON public.payments FOR SELECT TO anon, authenticated USING (true);

-- 3. ATOMIC RPC FUNCTION: record_customer_payment
CREATE OR REPLACE FUNCTION public.record_customer_payment(
    p_customer_id UUID,
    p_amount NUMERIC(14, 2),
    p_payment_method TEXT,
    p_transaction_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id UUID;
    v_old_balance NUMERIC(14, 2);
    v_new_balance NUMERIC(14, 2);
    v_sale_balance NUMERIC(14, 2);
    v_sale_paid NUMERIC(14, 2);
    v_sale_total NUMERIC(14, 2);
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Lock and verify customer
    SELECT outstanding_balance INTO v_old_balance
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    v_new_balance := GREATEST(0.00, v_old_balance - p_amount);

    UPDATE public.customers
    SET outstanding_balance = v_new_balance, updated_at = now()
    WHERE id = p_customer_id;

    -- If linked to a sale, update the sale record
    IF p_sale_id IS NOT NULL THEN
        SELECT total_amount, paid_amount, balance_due INTO v_sale_total, v_sale_paid, v_sale_balance
        FROM public.sales
        WHERE id = p_sale_id
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.sales
            SET 
                paid_amount = paid_amount + p_amount,
                balance_due = GREATEST(0.00, total_amount - (paid_amount + p_amount)),
                status = CASE 
                    WHEN (total_amount - (paid_amount + p_amount)) <= 0.001 THEN 'PAID'
                    ELSE 'PARTIAL'
                END
            WHERE id = p_sale_id;
        END IF;
    END IF;

    -- Insert into payments
    INSERT INTO public.payments (
        reference_type, reference_id, amount, payment_method,
        transaction_reference, notes, received_by
    )
    VALUES (
        CASE WHEN p_sale_id IS NOT NULL THEN 'SALE' ELSE 'CUSTOMER_DEBT' END,
        COALESCE(p_sale_id, p_customer_id),
        p_amount,
        p_payment_method,
        p_transaction_reference,
        p_notes,
        p_user_id
    )
    RETURNING id INTO v_payment_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'CUSTOMER_PAYMENT', 'customers', p_customer_id,
        jsonb_build_object(
            'payment_id', v_payment_id,
            'amount', p_amount,
            'payment_method', p_payment_method,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance,
            'sale_id', p_sale_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'customer_id', p_customer_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance
    );
END;
$$;

-- 4. ATOMIC RPC FUNCTION: record_supplier_payment
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
    p_supplier_id UUID,
    p_amount NUMERIC(14, 2),
    p_payment_method TEXT,
    p_transaction_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_purchase_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id UUID;
    v_old_balance NUMERIC(14, 2);
    v_new_balance NUMERIC(14, 2);
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Lock and verify supplier
    SELECT outstanding_balance INTO v_old_balance
    FROM public.suppliers
    WHERE id = p_supplier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found';
    END IF;

    v_new_balance := GREATEST(0.00, v_old_balance - p_amount);

    UPDATE public.suppliers
    SET outstanding_balance = v_new_balance, updated_at = now()
    WHERE id = p_supplier_id;

    -- If linked to a purchase, update purchase record
    IF p_purchase_id IS NOT NULL THEN
        UPDATE public.purchases
        SET 
            paid_amount = paid_amount + p_amount,
            balance_due = GREATEST(0.00, total_amount - (paid_amount + p_amount))
        WHERE id = p_purchase_id;
    END IF;

    -- Insert into payments
    INSERT INTO public.payments (
        reference_type, reference_id, amount, payment_method,
        transaction_reference, notes, received_by
    )
    VALUES (
        CASE WHEN p_purchase_id IS NOT NULL THEN 'PURCHASE' ELSE 'SUPPLIER_DEBT' END,
        COALESCE(p_purchase_id, p_supplier_id),
        p_amount,
        p_payment_method,
        p_transaction_reference,
        p_notes,
        p_user_id
    )
    RETURNING id INTO v_payment_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'SUPPLIER_PAYMENT', 'suppliers', p_supplier_id,
        jsonb_build_object(
            'payment_id', v_payment_id,
            'amount', p_amount,
            'payment_method', p_payment_method,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance,
            'purchase_id', p_purchase_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'supplier_id', p_supplier_id,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance
    );
END;
$$;

-- 5. ATOMIC RPC FUNCTION: issue_production_materials
CREATE OR REPLACE FUNCTION public.issue_production_materials(
    p_production_order_id UUID,
    p_location_id UUID,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_status TEXT;
    v_order_number TEXT;
    v_item JSONB;
    v_raw_id UUID;
    v_req_qty NUMERIC(12, 4);
    v_unit_cost NUMERIC(14, 2);
    v_curr_stock NUMERIC(12, 4);
    v_total_added_cost NUMERIC(14, 2) := 0.00;
    v_line_cost NUMERIC(14, 2);
BEGIN
    SELECT status, order_number INTO v_order_status, v_order_number
    FROM public.production_orders
    WHERE id = p_production_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production order not found';
    END IF;

    IF v_order_status NOT IN ('PLANNED', 'IN_PROGRESS') THEN
        RAISE EXCEPTION 'Materials cannot be issued to an order in % status', v_order_status;
    END IF;

    -- Loop through each raw material item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_raw_id := (v_item->>'raw_material_id')::UUID;
        v_req_qty := (v_item->>'quantity')::NUMERIC(12, 4);
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC(14, 2), 0.00);

        IF v_req_qty <= 0 THEN
            RAISE EXCEPTION 'Material issue quantity must be greater than zero';
        END IF;

        -- Check available stock
        SELECT COALESCE(quantity, 0.00) INTO v_curr_stock
        FROM public.stock_levels
        WHERE product_id = v_raw_id AND location_id = p_location_id
        FOR UPDATE;

        IF v_curr_stock IS NULL OR v_curr_stock < v_req_qty THEN
            RAISE EXCEPTION 'Insufficient stock for raw material ID %. Available: %, Requested: %',
                v_raw_id, COALESCE(v_curr_stock, 0), v_req_qty;
        END IF;

        v_line_cost := v_req_qty * v_unit_cost;
        v_total_added_cost := v_total_added_cost + v_line_cost;

        -- Deduct stock level
        UPDATE public.stock_levels
        SET quantity = quantity - v_req_qty, updated_at = now()
        WHERE product_id = v_raw_id AND location_id = p_location_id;

        -- Record inventory movement (negative quantity for consumption)
        INSERT INTO public.inventory_movements (
            product_id, location_id, movement_type, quantity, reference_id, notes, created_by
        )
        VALUES (
            v_raw_id, p_location_id, 'MFG_CONSUMPTION', -v_req_qty, p_production_order_id,
            'Material issue for Production Order ' || v_order_number, p_user_id
        );

        -- Record in production_material_issues
        INSERT INTO public.production_material_issues (
            production_order_id, raw_material_id, quantity, unit_cost, total_cost, issued_by
        )
        VALUES (
            p_production_order_id, v_raw_id, v_req_qty, v_unit_cost, v_line_cost, p_user_id
        );
    END LOOP;

    -- Update production order status and material cost
    UPDATE public.production_orders
    SET 
        status = 'IN_PROGRESS',
        total_material_cost = total_material_cost + v_total_added_cost,
        progress_pct = CASE WHEN progress_pct < 25.00 THEN 25.00 ELSE progress_pct END
    WHERE id = p_production_order_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'ISSUE_MATERIALS', 'production_orders', p_production_order_id,
        jsonb_build_object(
            'order_number', v_order_number,
            'added_cost', v_total_added_cost,
            'items_count', jsonb_array_length(p_items)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'production_order_id', p_production_order_id,
        'order_number', v_order_number,
        'added_material_cost', v_total_added_cost
    );
END;
$$;

-- 6. ATOMIC RPC FUNCTION: complete_production_order
CREATE OR REPLACE FUNCTION public.complete_production_order(
    p_production_order_id UUID,
    p_completed_quantity NUMERIC(12, 4),
    p_waste_quantity NUMERIC(12, 4) DEFAULT 0.00,
    p_labor_cost NUMERIC(14, 2) DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_status TEXT;
    v_order_number TEXT;
    v_product_id UUID;
    v_location_id UUID;
    v_total_mat_cost NUMERIC(14, 2);
    v_total_cost NUMERIC(14, 2);
    v_unit_cost NUMERIC(14, 2) := 0.00;
BEGIN
    IF p_completed_quantity <= 0 THEN
        RAISE EXCEPTION 'Completed quantity must be greater than zero';
    END IF;

    SELECT status, order_number, product_id, location_id, total_material_cost
    INTO v_order_status, v_order_number, v_product_id, v_location_id, v_total_mat_cost
    FROM public.production_orders
    WHERE id = p_production_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production order not found';
    END IF;

    IF v_order_status = 'COMPLETED' THEN
        RAISE EXCEPTION 'Production order % is already completed', v_order_number;
    END IF;

    IF v_order_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Cannot complete cancelled production order %', v_order_number;
    END IF;

    -- Compute total and unit cost
    v_total_cost := v_total_mat_cost + COALESCE(p_labor_cost, 0.00);
    IF p_completed_quantity > 0 THEN
        v_unit_cost := ROUND(v_total_cost / p_completed_quantity, 2);
    END IF;

    -- Upsert finished good stock level at the specified location
    INSERT INTO public.stock_levels (product_id, location_id, quantity)
    VALUES (v_product_id, v_location_id, p_completed_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.stock_levels.quantity + EXCLUDED.quantity, updated_at = now();

    -- Record inventory movement (positive quantity for intake)
    INSERT INTO public.inventory_movements (
        product_id, location_id, movement_type, quantity, reference_id, notes, created_by
    )
    VALUES (
        v_product_id, v_location_id, 'MFG_OUTPUT', p_completed_quantity, p_production_order_id,
        'Finished production intake for Order ' || v_order_number, p_user_id
    );

    -- Update product cost baseline if computed unit cost is positive
    IF v_unit_cost > 0 THEN
        UPDATE public.products
        SET cost_price = v_unit_cost, updated_at = now()
        WHERE id = v_product_id;
    END IF;

    -- Update production order
    UPDATE public.production_orders
    SET 
        status = 'COMPLETED',
        completed_quantity = p_completed_quantity,
        waste_quantity = COALESCE(p_waste_quantity, 0.00),
        labor_cost = COALESCE(p_labor_cost, 0.00),
        progress_pct = 100.00,
        completed_at = now(),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_production_order_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'COMPLETE_PRODUCTION', 'production_orders', p_production_order_id,
        jsonb_build_object(
            'order_number', v_order_number,
            'completed_quantity', p_completed_quantity,
            'waste_quantity', p_waste_quantity,
            'total_cost', v_total_cost,
            'unit_cost', v_unit_cost
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'production_order_id', p_production_order_id,
        'order_number', v_order_number,
        'completed_quantity', p_completed_quantity,
        'unit_cost', v_unit_cost,
        'total_cost', v_total_cost
    );
END;
$$;

-- 7. GRANTS FOR EXECUTING FUNCTIONS
GRANT EXECUTE ON FUNCTION public.record_customer_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_production_materials(UUID, UUID, JSONB, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production_order(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID) TO anon, authenticated;
