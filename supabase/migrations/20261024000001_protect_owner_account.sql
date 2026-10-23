-- Migration: 20261024000001_protect_owner_account.sql
-- Description: Adds is_owner flag, owner protection triggers, and updates soft-delete function to permanently protect the Abdallah primary owner account.

-- 1. Add is_owner column to user_profiles if it does not already exist
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark the verified owner account (Abdallah)
UPDATE public.user_profiles
SET is_owner = true
WHERE id = 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e'
   OR username = 'abdallah';

-- 3. Create security trigger function to protect owner account from deletion, deactivation, demotion, or unflagging
CREATE OR REPLACE FUNCTION public.prevent_owner_modification_or_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent hard delete of the owner account
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_owner = true OR OLD.id = 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e'::uuid OR OLD.username = 'abdallah' THEN
            RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: The Primary Owner account (Abdallah) cannot be deleted.';
        END IF;
        RETURN OLD;
    END IF;

    -- If the row being updated is the owner account
    IF OLD.is_owner = true OR OLD.id = 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e'::uuid OR OLD.username = 'abdallah' THEN
        -- Prevent soft-delete
        IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
            RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: The Primary Owner account (Abdallah) cannot be soft-deleted or moved to Recovery Center.';
        END IF;

        -- Prevent deactivation
        IF NEW.is_active = false AND OLD.is_active = true THEN
            RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: The Primary Owner account (Abdallah) cannot be deactivated.';
        END IF;

        -- Prevent demotion
        IF NEW.role != 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: The Primary Owner account (Abdallah) must permanently retain SUPER_ADMIN role.';
        END IF;

        -- Prevent unflagging is_owner
        IF NEW.is_owner = false THEN
            RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: Owner status cannot be removed from the Primary Owner account.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger
DROP TRIGGER IF EXISTS trg_protect_owner ON public.user_profiles;
CREATE TRIGGER trg_protect_owner
    BEFORE UPDATE OR DELETE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_owner_modification_or_deletion();

-- 5. Update soft_delete_user_profile function to explicitly guard against deleting owner
CREATE OR REPLACE FUNCTION public.soft_delete_user_profile(
    p_user_id uuid,
    p_deleted_by uuid DEFAULT NULL::uuid,
    p_reason text DEFAULT 'Soft deleted by Super Admin'::text
)
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_valid_deleted_by UUID := NULL;
  v_role TEXT;
  v_is_owner BOOLEAN;
  v_username TEXT;
  v_count INT;
BEGIN
  SELECT role, is_owner, username INTO v_role, v_is_owner, v_username
  FROM public.user_profiles
  WHERE id = p_user_id AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_is_owner = true OR p_user_id = 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e'::uuid OR v_username = 'abdallah' THEN
    RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: The Primary Owner account (Abdallah) is permanently protected and cannot be deleted.';
  END IF;

  IF p_deleted_by IS NOT NULL THEN
    SELECT id INTO v_valid_deleted_by
    FROM public.user_profiles
    WHERE id = p_deleted_by;
  END IF;

  IF v_role = 'SUPER_ADMIN' THEN
    PERFORM pg_advisory_xact_lock(hashtext('super_admin_limit_lock'));
    SELECT count(*) INTO v_count
    FROM public.user_profiles
    WHERE role = 'SUPER_ADMIN'
      AND is_active = true
      AND deleted_at IS NULL
      AND id <> p_user_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION 'Cannot delete this Super Admin account. At least one active Super Admin must remain in the system.';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.user_profiles
  SET
    is_active = false,
    deleted_at = NOW(),
    deleted_by = v_valid_deleted_by,
    deletion_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_user_id
    AND deleted_at IS NULL
  RETURNING *;
END;
$function$;
