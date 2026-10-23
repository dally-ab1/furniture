-- Migration: 20261015000004_operational_rls_policies.sql
-- Description: Operational RLS write policies for production orders, expenses, purchases, settings, and audit logs
-- Authoritative Database: Supabase PostgreSQL 17

DROP POLICY IF EXISTS "Insert production_orders" ON public.production_orders;
CREATE POLICY "Insert production_orders" ON public.production_orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Update production_orders" ON public.production_orders;
CREATE POLICY "Update production_orders" ON public.production_orders FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insert expenses" ON public.expenses;
CREATE POLICY "Insert expenses" ON public.expenses FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Insert audit_logs" ON public.audit_logs;
CREATE POLICY "Insert audit_logs" ON public.audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Read audit_logs" ON public.audit_logs;
CREATE POLICY "Read audit_logs" ON public.audit_logs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insert purchases" ON public.purchases;
CREATE POLICY "Insert purchases" ON public.purchases FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Update purchases" ON public.purchases FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insert purchase_items" ON public.purchase_items;
CREATE POLICY "Insert purchase_items" ON public.purchase_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Insert goods_receipts" ON public.goods_receipts;
CREATE POLICY "Insert goods_receipts" ON public.goods_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Insert goods_receipt_items" ON public.goods_receipt_items;
CREATE POLICY "Insert goods_receipt_items" ON public.goods_receipt_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Insert company_settings" ON public.company_settings;
CREATE POLICY "Insert company_settings" ON public.company_settings FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Update company_settings" ON public.company_settings;
CREATE POLICY "Update company_settings" ON public.company_settings FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Read company_settings" ON public.company_settings;
CREATE POLICY "Read company_settings" ON public.company_settings FOR SELECT TO anon, authenticated USING (true);
