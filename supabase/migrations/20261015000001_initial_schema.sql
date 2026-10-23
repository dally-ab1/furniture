-- Migration: 20261015000001_initial_schema.sql
-- Description: Core Schema for Furniture ERP (Single Company in Ethiopia)
-- Authoritative Database: Supabase PostgreSQL 17

-- 1. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. DOMAIN A: USERS & PERMISSIONS
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'EMPLOYEE')),
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by UUID REFERENCES public.user_profiles(id),
    CONSTRAINT uq_user_permission UNIQUE (user_id, permission_key)
);

-- 3. DOMAIN B: LOCATIONS & MASTER INVENTORY
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('SHOP', 'WAREHOUSE', 'FACTORY')),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('RAW_MATERIAL', 'FINISHED_GOOD', 'SEMI_FINISHED')),
    unit_of_measure TEXT NOT NULL, -- e.g., 'pcs', 'm²', 'kg', 'L', 'm'
    selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (selling_price >= 0),
    cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
    min_stock_level NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (min_stock_level >= 0),
    attributes JSONB DEFAULT '{}'::jsonb,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_levels (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK (
        movement_type IN (
            'PURCHASE_RECEIPT',
            'SALE_DEDUCTION',
            'MFG_CONSUMPTION',
            'MFG_OUTPUT',
            'STOCK_ADJUSTMENT',
            'LOCATION_TRANSFER'
        )
    ),
    quantity NUMERIC(12, 4) NOT NULL, -- Positive for intake, negative for deduction
    reference_id UUID, -- Links to sale_id, goods_receipt_id, production_order_id
    notes TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. DOMAIN C: CUSTOMERS & SUPPLIERS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    outstanding_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    outstanding_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. DOMAIN D: SALES & POS
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
    paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    status TEXT NOT NULL CHECK (status IN ('PAID', 'PARTIAL', 'CREDIT', 'CANCELLED')),
    notes TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
    cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0), -- Snapshot for COGS
    total_price NUMERIC(14, 2) NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type TEXT NOT NULL CHECK (
        reference_type IN ('SALE', 'PURCHASE', 'CUSTOMER_DEBT', 'SUPPLIER_DEBT')
    ),
    reference_id UUID NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (
        payment_method IN ('CASH', 'BANK_TRANSFER', 'TELEBIRR', 'CBE_BIRR')
    ),
    transaction_reference TEXT,
    notes TEXT,
    received_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. DOMAIN E: PURCHASES & GOODS RECEIPTS
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_number TEXT NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    total_cost NUMERIC(14, 2) NOT NULL CHECK (total_cost >= 0),
    paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    notes TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    ordered_quantity NUMERIC(12, 4) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (received_quantity >= 0),
    unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC(14, 2) NOT NULL CHECK (total_cost >= 0)
);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT NOT NULL UNIQUE,
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    notes TEXT,
    received_by UUID REFERENCES public.user_profiles(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
    purchase_item_id UUID NOT NULL REFERENCES public.purchase_items(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    received_quantity NUMERIC(12, 4) NOT NULL CHECK (received_quantity > 0)
);

-- 7. DOMAIN F: MANUFACTURING (BOM & PRODUCTION)
CREATE TABLE IF NOT EXISTS public.boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    waste_tolerance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (waste_tolerance_pct >= 0)
);

CREATE TABLE IF NOT EXISTS public.production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    target_quantity NUMERIC(12, 4) NOT NULL CHECK (target_quantity > 0),
    completed_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (completed_quantity >= 0),
    waste_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (waste_quantity >= 0),
    status TEXT NOT NULL CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (progress_pct >= 0 AND progress_pct <= 100),
    due_date DATE,
    total_material_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_material_cost >= 0),
    labor_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (labor_cost >= 0),
    notes TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.production_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0),
    total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
    issued_by UUID REFERENCES public.user_profiles(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. DOMAIN G: EXPENSES, COMPANY SETTINGS & AUDIT
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (
        payment_method IN ('CASH', 'BANK_TRANSFER', 'TELEBIRR', 'CBE_BIRR')
    ),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    receipt_url TEXT,
    recorded_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL DEFAULT 'FurniERP Company',
    brand_name TEXT NOT NULL DEFAULT 'FurniERP',
    tin_number TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    currency TEXT NOT NULL DEFAULT 'ETB',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod_loc ON public.inventory_movements(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON public.inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_created ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_due ON public.production_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments(reference_type, reference_id);

-- 10. DEFAULT SEED DATA
-- Default single-company locations: Main Shop and Central Warehouse
INSERT INTO public.locations (name, type, address)
VALUES 
    ('Main Shop', 'SHOP', 'Addis Ababa Showroom'),
    ('Central Warehouse', 'WAREHOUSE', 'Addis Ababa Central Storage & Factory')
ON CONFLICT (name) DO NOTHING;

-- Default company setting record
INSERT INTO public.company_settings (company_name, brand_name, currency)
VALUES ('FurniERP Furniture Manufacturing & Retail', 'FurniERP', 'ETB')
ON CONFLICT DO NOTHING;
