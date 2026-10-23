-- Migration: Connect production_orders to customers and sales, add custom order workflow
-- Date: 2026-10-23
-- Purpose: Complete Customer Workflow Integration (Custom Order, Deposit, Manufacturing, Delivery Fulfillment)

-- 1. Expand sales status check constraint to include PENDING_PRODUCTION and READY_FOR_DELIVERY
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check 
  CHECK (status IN ('PAID', 'PARTIAL', 'CREDIT', 'CANCELLED', 'PENDING_PRODUCTION', 'READY_FOR_DELIVERY'));

-- 2. Add customer_id and sale_id to production_orders
ALTER TABLE public.production_orders 
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_customer ON public.production_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_sale ON public.production_orders(sale_id);

-- 3. Update complete_production_order to advance linked sale to READY_FOR_DELIVERY
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
    v_sale_id UUID;
    v_total_mat_cost NUMERIC(14, 2);
    v_total_cost NUMERIC(14, 2);
    v_unit_cost NUMERIC(14, 2) := 0.00;
BEGIN
    IF p_completed_quantity <= 0 THEN
        RAISE EXCEPTION 'Completed quantity must be greater than zero';
    END IF;

    SELECT status, order_number, product_id, location_id, total_material_cost, sale_id
    INTO v_order_status, v_order_number, v_product_id, v_location_id, v_total_mat_cost, v_sale_id
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
    v_total_cost := COALESCE(v_total_mat_cost, 0.00) + COALESCE(p_labor_cost, 0.00);
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

    -- If linked to a custom sale in PENDING_PRODUCTION, advance to READY_FOR_DELIVERY
    IF v_sale_id IS NOT NULL THEN
        UPDATE public.sales
        SET status = 'READY_FOR_DELIVERY', updated_at = now()
        WHERE id = v_sale_id AND status = 'PENDING_PRODUCTION';
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'COMPLETE_PRODUCTION', 'production_orders', p_production_order_id,
        jsonb_build_object(
            'order_number', v_order_number,
            'completed_quantity', p_completed_quantity,
            'waste_quantity', p_waste_quantity,
            'total_cost', v_total_cost,
            'unit_cost', v_unit_cost,
            'linked_sale_id', v_sale_id
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

GRANT EXECUTE ON FUNCTION public.complete_production_order(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID) TO anon, authenticated;

-- 4. ATOMIC RPC: create_custom_customer_order
CREATE OR REPLACE FUNCTION public.create_custom_customer_order(
    p_invoice_number TEXT,
    p_customer_id UUID,
    p_location_id UUID,
    p_total_amount NUMERIC(14, 2),
    p_deposit_amount NUMERIC(14, 2),
    p_payment_method TEXT,
    p_product_id UUID,
    p_quantity NUMERIC(12, 4),
    p_unit_price NUMERIC(14, 2),
    p_target_completion_date DATE,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_prod_order_id UUID;
    v_balance_due NUMERIC(14, 2);
    v_order_num TEXT;
BEGIN
    v_balance_due := p_total_amount - COALESCE(p_deposit_amount, 0.00);

    -- 1. Insert Sale Header with status PENDING_PRODUCTION (No finished stock deduction yet)
    INSERT INTO public.sales (
        invoice_number, customer_id, location_id, subtotal, discount_amount,
        total_amount, paid_amount, balance_due, status, notes, created_by
    )
    VALUES (
        p_invoice_number, p_customer_id, p_location_id, p_total_amount, 0.00,
        p_total_amount, COALESCE(p_deposit_amount, 0.00), v_balance_due, 
        'PENDING_PRODUCTION', p_notes, p_user_id
    )
    RETURNING id INTO v_sale_id;

    -- 2. Insert Sale Item
    INSERT INTO public.sale_items (
        sale_id, product_id, quantity, unit_price, cost_price, total_price
    )
    VALUES (
        v_sale_id, p_product_id, p_quantity, p_unit_price, 0.00, p_total_amount
    );

    -- 3. Record Advance Deposit in payments ledger (Ensures finance reconciliation matches exactly)
    IF p_deposit_amount > 0 AND p_payment_method IS NOT NULL THEN
        INSERT INTO public.payments (
            reference_type, reference_id, amount, payment_method, notes, received_by
        )
        VALUES (
            'SALE', v_sale_id, p_deposit_amount, p_payment_method,
            'Advance deposit for custom order ' || p_invoice_number, p_user_id
        );
    END IF;

    -- 4. Update Customer Outstanding Balance if remaining balance > 0
    IF v_balance_due > 0 AND p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = outstanding_balance + v_balance_due, updated_at = now()
        WHERE id = p_customer_id;
    END IF;

    -- 5. Automatically generate linked Production Order
    v_order_num := 'MO-CUST-' || p_invoice_number;
    INSERT INTO public.production_orders (
        order_number, product_id, location_id, quantity, status, start_date, end_date,
        customer_id, sale_id, notes, created_by
    )
    VALUES (
        v_order_num, p_product_id, p_location_id, p_quantity, 'PLANNED',
        CURRENT_DATE, p_target_completion_date, p_customer_id, v_sale_id,
        COALESCE(p_notes, 'Custom order for invoice ' || p_invoice_number), p_user_id
    )
    RETURNING id INTO v_prod_order_id;

    -- 6. Audit Log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'CREATE_CUSTOM_ORDER', 'sales', v_sale_id,
        jsonb_build_object(
            'invoice_number', p_invoice_number,
            'customer_id', p_customer_id,
            'total_amount', p_total_amount,
            'deposit_amount', p_deposit_amount,
            'production_order_id', v_prod_order_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'production_order_id', v_prod_order_id,
        'invoice_number', p_invoice_number,
        'status', 'PENDING_PRODUCTION',
        'balance_due', v_balance_due
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_customer_order(TEXT, UUID, UUID, NUMERIC, NUMERIC, TEXT, UUID, NUMERIC, NUMERIC, DATE, TEXT, UUID) TO anon, authenticated;

-- 5. ATOMIC RPC: fulfill_custom_order_delivery
CREATE OR REPLACE FUNCTION public.fulfill_custom_order_delivery(
    p_sale_id UUID,
    p_final_payment_amount NUMERIC(14, 2),
    p_payment_method TEXT,
    p_location_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_new_paid NUMERIC(14, 2);
    v_new_balance NUMERIC(14, 2);
    v_new_status TEXT;
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.status NOT IN ('READY_FOR_DELIVERY', 'PENDING_PRODUCTION') THEN
        RAISE EXCEPTION 'Sale status % cannot be fulfilled for delivery', v_sale.status;
    END IF;

    -- 1. Relieve Finished Goods Stock Upon Physical Delivery
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
    LOOP
        UPDATE public.stock_levels
        SET quantity = quantity - v_item.quantity, updated_at = now()
        WHERE product_id = v_item.product_id AND location_id = p_location_id;

        INSERT INTO public.inventory_movements (
            product_id, location_id, movement_type, quantity, reference_id, notes, created_by
        )
        VALUES (
            v_item.product_id, p_location_id, 'SALE_DEDUCTION', -v_item.quantity,
            p_sale_id, 'Delivery fulfillment for ' || v_sale.invoice_number, p_user_id
        );
    END LOOP;

    -- 2. Record final payment in payments ledger if > 0
    IF p_final_payment_amount > 0 AND p_payment_method IS NOT NULL THEN
        INSERT INTO public.payments (
            reference_type, reference_id, amount, payment_method, notes, received_by
        )
        VALUES (
            'SALE', p_sale_id, p_final_payment_amount, p_payment_method,
            COALESCE(p_notes, 'Final delivery settlement for ' || v_sale.invoice_number), p_user_id
        );
    END IF;

    -- 3. Calculate final amounts and status
    v_new_paid := v_sale.paid_amount + COALESCE(p_final_payment_amount, 0.00);
    v_new_balance := v_sale.total_amount - v_new_paid;

    IF v_new_balance <= 0 THEN
        v_new_status := 'PAID';
        v_new_balance := 0.00;
    ELSIF v_new_paid > 0 THEN
        v_new_status := 'PARTIAL';
    ELSE
        v_new_status := 'CREDIT';
    END IF;

    UPDATE public.sales
    SET 
        paid_amount = v_new_paid, 
        balance_due = v_new_balance, 
        status = v_new_status, 
        updated_at = now()
    WHERE id = p_sale_id;

    -- 4. Adjust customer outstanding balance if final payment was made
    IF p_final_payment_amount > 0 AND v_sale.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = GREATEST(0.00, outstanding_balance - p_final_payment_amount), updated_at = now()
        WHERE id = v_sale.customer_id;
    END IF;

    -- 5. Audit Log
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'FULFILL_DELIVERY', 'sales', p_sale_id,
        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'final_payment', p_final_payment_amount,
            'final_status', v_new_status,
            'balance_due', v_new_balance
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'invoice_number', v_sale.invoice_number,
        'status', v_new_status,
        'paid_amount', v_new_paid,
        'balance_due', v_new_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfill_custom_order_delivery(UUID, NUMERIC, TEXT, UUID, TEXT, UUID) TO anon, authenticated;
