-- Migration: 20261023000002_workflow_integrity_fixes.sql
-- Description: Fix custom order linking, safe delivery fulfillment, atomic cancellation for sales and manufacturing
-- Authoritative Database: Supabase PostgreSQL 17

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
AS 
DECLARE
    v_sale_id UUID;
    v_prod_order_id UUID;
    v_balance_due NUMERIC(14, 2);
    v_order_num TEXT;
    v_bom_id UUID;
BEGIN
    v_balance_due := p_total_amount - COALESCE(p_deposit_amount, 0.00);

    SELECT id INTO v_bom_id
    FROM public.boms
    WHERE product_id = p_product_id AND is_active = true AND deleted_at IS NULL
    ORDER BY version DESC
    LIMIT 1;

    IF v_bom_id IS NULL THEN
        SELECT id INTO v_bom_id
        FROM public.boms
        WHERE product_id = p_product_id AND deleted_at IS NULL
        ORDER BY version DESC
        LIMIT 1;
    END IF;

    IF v_bom_id IS NULL THEN
        RAISE EXCEPTION 'No Bill of Materials (BOM) found for this product. Please define a BOM before creating a custom manufacturing order.';
    END IF;

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

    INSERT INTO public.sale_items (
        sale_id, product_id, quantity, unit_price, cost_price, total_price
    )
    VALUES (
        v_sale_id, p_product_id, p_quantity, p_unit_price, 0.00, p_total_amount
    );

    IF p_deposit_amount > 0 AND p_payment_method IS NOT NULL THEN
        INSERT INTO public.payments (
            reference_type, reference_id, amount, payment_method, notes, received_by
        )
        VALUES (
            'SALE', v_sale_id, p_deposit_amount, p_payment_method,
            'Advance deposit for custom order ' || p_invoice_number, p_user_id
        );
    END IF;

    IF v_balance_due > 0 AND p_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = outstanding_balance + v_balance_due, updated_at = now()
        WHERE id = p_customer_id;
    END IF;

    v_order_num := 'MO-CUST-' || p_invoice_number;
    INSERT INTO public.production_orders (
        order_number, product_id, bom_id, location_id, target_quantity, status,
        due_date, customer_id, sale_id, notes, created_by
    )
    VALUES (
        v_order_num, p_product_id, v_bom_id, p_location_id, p_quantity, 'PLANNED',
        p_target_completion_date, p_customer_id, v_sale_id,
        COALESCE(p_notes, 'Custom order for invoice ' || p_invoice_number), p_user_id
    )
    RETURNING id INTO v_prod_order_id;

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
;

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
AS 
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_new_paid NUMERIC(14, 2);
    v_new_balance NUMERIC(14, 2);
    v_new_status TEXT;
    v_curr_stock NUMERIC(12, 4);
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.status NOT IN ('READY_FOR_DELIVERY', 'PENDING_PRODUCTION') THEN
        RAISE EXCEPTION 'Sale % with status % cannot be fulfilled for delivery (already fulfilled or cancelled)',
            v_sale.invoice_number, v_sale.status;
    END IF;

    FOR v_item IN 
        SELECT si.*, p.name as prod_name 
        FROM public.sale_items si 
        JOIN public.products p ON p.id = si.product_id 
        WHERE si.sale_id = p_sale_id
    LOOP
        SELECT quantity INTO v_curr_stock
        FROM public.stock_levels
        WHERE product_id = v_item.product_id AND location_id = p_location_id
        FOR UPDATE;

        IF v_curr_stock IS NULL OR v_curr_stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %. Available: %, Required: %. Please ensure manufacturing is completed.',
                v_item.prod_name, COALESCE(v_curr_stock, 0), v_item.quantity;
        END IF;
    END LOOP;

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

    IF p_final_payment_amount > 0 AND p_payment_method IS NOT NULL THEN
        INSERT INTO public.payments (
            reference_type, reference_id, amount, payment_method, notes, received_by
        )
        VALUES (
            'SALE', p_sale_id, p_final_payment_amount, p_payment_method,
            COALESCE(p_notes, 'Final delivery settlement for ' || v_sale.invoice_number), p_user_id
        );
    END IF;

    v_new_paid := v_sale.paid_amount + COALESCE(p_final_payment_amount, 0.00);
    v_new_balance := GREATEST(0.00, v_sale.total_amount - v_new_paid);

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

    IF p_final_payment_amount > 0 AND v_sale.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET outstanding_balance = GREATEST(0.00, outstanding_balance - p_final_payment_amount), updated_at = now()
        WHERE id = v_sale.customer_id;
    END IF;

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
;

CREATE OR REPLACE FUNCTION public.cancel_sale_order(
    p_sale_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS 
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_has_stock_deduction BOOLEAN := false;
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Sale % is already cancelled', v_sale.invoice_number;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.inventory_movements
        WHERE reference_id = p_sale_id AND movement_type = 'SALE_DEDUCTION'
    ) INTO v_has_stock_deduction;

    IF v_has_stock_deduction THEN
        FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
        LOOP
            UPDATE public.stock_levels
            SET quantity = quantity + v_item.quantity, updated_at = now()
            WHERE product_id = v_item.product_id AND location_id = v_sale.location_id;

            INSERT INTO public.inventory_movements (
                product_id, location_id, movement_type, quantity, reference_id, notes, created_by
            )
            VALUES (
                v_item.product_id, v_sale.location_id, 'SALE_CANCEL_RETURN', v_item.quantity,
                p_sale_id, 'Inventory restored from cancelled sale ' || v_sale.invoice_number || COALESCE(': ' || p_reason, ''), p_user_id
            );
        END LOOP;
    END IF;

    IF v_sale.customer_id IS NOT NULL AND v_sale.balance_due > 0 THEN
        UPDATE public.customers
        SET outstanding_balance = GREATEST(0.00, outstanding_balance - v_sale.balance_due), updated_at = now()
        WHERE id = v_sale.customer_id;
    END IF;

    UPDATE public.production_orders
    SET status = 'CANCELLED', notes = COALESCE(notes || ' ', '') || '[Cancelled due to sale cancellation]'
    WHERE sale_id = p_sale_id AND status = 'PLANNED';

    UPDATE public.sales
    SET 
        status = 'CANCELLED',
        balance_due = 0.00,
        notes = CASE 
            WHEN notes IS NOT NULL THEN notes || ' ' || '[Cancelled: ' || COALESCE(p_reason, 'No reason given') || ']'
            ELSE '[Cancelled: ' || COALESCE(p_reason, 'No reason given') || ']'
        END,
        updated_at = now()
    WHERE id = p_sale_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'SALE_CANCELLED', 'sales', p_sale_id,
        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'previous_status', v_sale.status,
            'stock_restored', v_has_stock_deduction,
            'balance_due_reversed', v_sale.balance_due,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'invoice_number', v_sale.invoice_number,
        'stock_restored', v_has_stock_deduction,
        'balance_due_reversed', v_sale.balance_due
    );
END;
;

CREATE OR REPLACE FUNCTION public.cancel_production_order(
    p_production_order_id UUID,
    p_return_materials BOOLEAN DEFAULT true,
    p_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS 
DECLARE
    v_order RECORD;
    v_issue RECORD;
BEGIN
    SELECT * INTO v_order FROM public.production_orders WHERE id = p_production_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production order not found';
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Production order % is already cancelled', v_order.order_number;
    END IF;

    IF v_order.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot cancel completed production order %', v_order.order_number;
    END IF;

    IF v_order.status = 'IN_PROGRESS' AND p_return_materials THEN
        FOR v_issue IN SELECT * FROM public.production_material_issues WHERE production_order_id = p_production_order_id
        LOOP
            UPDATE public.stock_levels
            SET quantity = quantity + v_issue.quantity, updated_at = now()
            WHERE product_id = v_issue.raw_material_id AND location_id = v_order.location_id;

            INSERT INTO public.inventory_movements (
                product_id, location_id, movement_type, quantity, reference_id, notes, created_by
            )
            VALUES (
                v_issue.raw_material_id, v_order.location_id, 'MFG_RETURN', v_issue.quantity,
                p_production_order_id, 'Raw materials returned from cancelled order ' || v_order.order_number || COALESCE(': ' || p_reason, ''), p_user_id
            );
        END LOOP;
    END IF;

    UPDATE public.production_orders
    SET 
        status = 'CANCELLED',
        notes = CASE 
            WHEN notes IS NOT NULL THEN notes || ' ' || '[Cancelled: ' || COALESCE(p_reason, 'No reason given') || ']'
            ELSE '[Cancelled: ' || COALESCE(p_reason, 'No reason given') || ']'
        END
    WHERE id = p_production_order_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, payload)
    VALUES (
        p_user_id, 'CANCEL_PRODUCTION_ORDER', 'production_orders', p_production_order_id,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'previous_status', v_order.status,
            'materials_returned', p_return_materials,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'production_order_id', p_production_order_id,
        'order_number', v_order.order_number,
        'materials_returned', p_return_materials
    );
END;
;

GRANT EXECUTE ON FUNCTION public.create_custom_customer_order(TEXT, UUID, UUID, NUMERIC, NUMERIC, TEXT, UUID, NUMERIC, NUMERIC, DATE, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_custom_order_delivery(UUID, NUMERIC, TEXT, UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_order(UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_order(UUID, BOOLEAN, TEXT, UUID) TO anon, authenticated;
