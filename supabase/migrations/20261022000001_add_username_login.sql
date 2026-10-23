-- Migration: 20261022000001_add_username_login.sql
-- Description: Adds unique username field, case-insensitive index, backfills existing accounts,
-- and provides secure identifier resolution for username-based sign-in.

-- 1. Add username column to user_profiles
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Backfill existing user_profiles with username from auth.users email prefix
UPDATE public.user_profiles p
SET username = lower(trim(split_part(u.email, '@', 1)))
FROM auth.users u
WHERE p.id = u.id AND (p.username IS NULL OR p.username = '');

-- 3. Create case-insensitive unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
    ON public.user_profiles (lower(trim(username)))
    WHERE username IS NOT NULL;

-- 4. Secure username-to-identity resolver function
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT)
RETURNS TABLE (email TEXT, username TEXT, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean TEXT := lower(trim(p_identifier));
BEGIN
  IF v_clean = '' OR v_clean IS NULL THEN
    RETURN;
  END IF;

  IF position('@' in v_clean) > 0 THEN
    RETURN QUERY
    SELECT u.email::TEXT, p.username::TEXT, p.is_active
    FROM auth.users u
    JOIN public.user_profiles p ON u.id = p.id
    WHERE lower(trim(u.email)) = v_clean
      AND p.deleted_at IS NULL
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT u.email::TEXT, p.username::TEXT, p.is_active
    FROM public.user_profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE lower(trim(p.username)) = v_clean
      AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated, service_role, PUBLIC;
