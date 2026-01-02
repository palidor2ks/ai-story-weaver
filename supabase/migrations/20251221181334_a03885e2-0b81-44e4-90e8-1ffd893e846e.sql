DO $$
DECLARE
    admin_user_id uuid := 'dee436f4-a210-4ce0-bdb3-3d7630fea463';
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = admin_user_id) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (admin_user_id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
        RAISE NOTICE 'Skipping admin role grant for % because user does not exist in auth.users', admin_user_id;
    END IF;
END $$;
