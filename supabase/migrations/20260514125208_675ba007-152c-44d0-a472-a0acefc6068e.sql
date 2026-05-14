CREATE OR REPLACE FUNCTION public.refresh_donor_consolidated_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
SET statement_timeout = '300000'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_donor_consolidated_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() TO authenticated, service_role;

COMMENT ON FUNCTION public.refresh_donor_display_names() IS 'DEPRECATED: Times out on large donor tables. Use apply-donor-alias edge function instead.';