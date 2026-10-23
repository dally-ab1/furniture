-- Migration: Connect production_orders to customers and sales
-- Date: 2026-10-23
-- Purpose: Enable customer workflow integration

-- 1. Add customer_id and sale_id to production_orders
ALTER TABLE public.production_orders 
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

-- 2. Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_production_orders_customer ON public.production_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_sale ON public.production_orders(sale_id);

-- 3. Add PENDING_PRODUCTION status to sales
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check 
  CHECK (status IN ('PAID', 'PARTIAL', 'CREDIT', 'CANCELLED', 'PENDING_PRODUCTION'));
