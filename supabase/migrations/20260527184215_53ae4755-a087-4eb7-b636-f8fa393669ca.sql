INSERT INTO public.vendor_refund_organizations (name, is_active)
VALUES ('BLITZ CANVASSING', true)
ON CONFLICT (name) DO UPDATE SET is_active = true;