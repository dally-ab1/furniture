-- Migration 20261015000005_fix_bootstrap_and_rls.sql
-- Fix user_profiles RLS recursion and provide atomic initial Super Admin bootstrap

-- 1. Helper function to check super admin status without RLS recursion
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
    );
$$;

-- 2. Drop recursive policy on user_profiles if present and recreate safely
DROP POLICY IF EXISTS "Super Admin can manage user profiles" ON public.user_profiles;
CREATE POLICY "Super Admin can manage user profiles"
    ON public.user_profiles
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 3. Atomic Super Admin registration & bootstrap function (bypasses GoTrue external SMTP rate limits)
CREATE OR REPLACE FUNCTION public.create_initial_super_admin(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Check if a Super Admin already exists in user_profiles
    SELECT id INTO v_user_id
    FROM public.user_profiles
    WHERE role = 'SUPER_ADMIN'
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- Update existing Super Admin auth record with the new email and password
        UPDATE auth.users
        SET 
            email = p_email,
            encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = now(),
            raw_user_meta_data = jsonb_build_object('full_name', p_full_name),
            raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
            confirmation_token = '',
            recovery_token = '',
            email_change_token_new = '',
            email_change = '',
            email_change_token_current = '',
            reauthentication_token = '',
            phone_change = '',
            phone_change_token = '',
            updated_at = now()
        WHERE id = v_user_id;

        -- Update or insert identity
        UPDATE auth.identities
        SET 
            identity_data = jsonb_build_object('sub', v_user_id::text, 'email', p_email),
            updated_at = now()
        WHERE user_id = v_user_id;

        IF NOT FOUND THEN
            INSERT INTO auth.identities (
                id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_user_id::text, v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', p_email),
                'email', now(), now(), now()
            );
        END IF;

        -- Update profile
        UPDATE public.user_profiles
        SET 
            full_name = p_full_name,
            phone = p_phone,
            role = 'SUPER_ADMIN',
            is_active = true,
            updated_at = now()
        WHERE id = v_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'user_id', v_user_id,
            'email', p_email,
            'role', 'SUPER_ADMIN',
            'message', 'Super Admin successfully registered'
        );
    END IF;

    -- Check if user with this email exists in auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET 
            encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = now(),
            raw_user_meta_data = jsonb_build_object('full_name', p_full_name),
            raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
            confirmation_token = '',
            recovery_token = '',
            email_change_token_new = '',
            email_change = '',
            email_change_token_current = '',
            reauthentication_token = '',
            phone_change = '',
            phone_change_token = '',
            updated_at = now()
        WHERE id = v_user_id;

        UPDATE auth.identities
        SET 
            identity_data = jsonb_build_object('sub', v_user_id::text, 'email', p_email),
            updated_at = now()
        WHERE user_id = v_user_id;
    ELSE
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            email_change_token_current,
            reauthentication_token,
            phone_change,
            phone_change_token,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            p_email,
            crypt(p_password, gen_salt('bf')),
            now(),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', p_full_name),
            '', '', '', '', '', '', '', '',
            now(),
            now()
        );

        INSERT INTO auth.identities (
            id,
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', p_email),
            'email',
            now(),
            now(),
            now()
        );
    END IF;

    -- Upsert profile
    INSERT INTO public.user_profiles (id, full_name, role, phone, is_active)
    VALUES (v_user_id, p_full_name, 'SUPER_ADMIN', p_phone, true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = 'SUPER_ADMIN', is_active = true;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', p_email,
        'role', 'SUPER_ADMIN',
        'message', 'Super Admin successfully registered'
    );
END;
$$;
