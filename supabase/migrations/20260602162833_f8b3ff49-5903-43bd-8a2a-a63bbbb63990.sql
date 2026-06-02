CREATE OR REPLACE FUNCTION public.get_admin_user_last_signins()
RETURNS TABLE(user_id uuid, last_sign_in_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.last_sign_in_at
  FROM auth.users u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_user_last_signins() TO authenticated;