-- ============================================================================
-- Migration: 20261019000001_enhance_audit_logs.sql
-- Description: Complete User Activity History & Audit Trail Enhancement
-- ============================================================================

-- 1. Make entity_id nullable so system-wide, auth, and non-record events can be recorded
ALTER TABLE public.audit_logs ALTER COLUMN entity_id DROP NOT NULL;

-- 2. Add columns for immutable snapshotting and rich human-readable descriptions
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_reference TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;

-- 3. Create performance indexes for fast filtering and chronological queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_ref ON public.audit_logs(entity, entity_id);

-- 4. Backfill existing rows with module name
UPDATE public.audit_logs SET module = UPPER(entity) WHERE module IS NULL;
