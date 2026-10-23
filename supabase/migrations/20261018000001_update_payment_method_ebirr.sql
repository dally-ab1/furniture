-- Migration: 20261018000001_update_payment_method_ebirr.sql
-- Description: Update payment_method check constraints on payments and expenses to support EBIRR

-- 1. Update payments table check constraint
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check 
  CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR'));

-- 2. Update expenses table check constraint
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check 
  CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'EBIRR', 'TELEBIRR', 'CBE_BIRR'));

-- 3. Migrate historical TELEBIRR records to EBIRR
UPDATE public.payments SET payment_method = 'EBIRR' WHERE payment_method = 'TELEBIRR';
UPDATE public.expenses SET payment_method = 'EBIRR' WHERE payment_method = 'TELEBIRR';
