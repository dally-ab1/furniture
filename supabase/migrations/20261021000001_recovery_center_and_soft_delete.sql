-- Migration: 20261021000001_recovery_center_and_soft_delete.sql
-- Description: Adds soft-delete tracking columns and performance indexes across core business entities for the Super Admin Recovery Center.

-- 1. User Profiles
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted ON public.user_profiles(deleted_at);

-- 2. Products
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_deleted ON public.products(deleted_at);

-- 3. Customers
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_deleted ON public.customers(deleted_at);

-- 4. Suppliers
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_deleted ON public.suppliers(deleted_at);

-- 5. Bills of Materials (BOMs)
ALTER TABLE public.boms
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_boms_deleted ON public.boms(deleted_at);

-- 6. Production Orders
ALTER TABLE public.production_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_deleted ON public.production_orders(deleted_at);

-- 7. Expenses
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON public.expenses(deleted_at);

-- 8. Sales
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_deleted ON public.sales(deleted_at);
