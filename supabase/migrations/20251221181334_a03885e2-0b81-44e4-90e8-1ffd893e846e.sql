-- Grant admin role to reltemawi@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('dee436f4-a210-4ce0-bdb3-3d7630fea463', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;