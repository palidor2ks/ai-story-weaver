-- Helper RPC to refresh donor consolidated materialized view after alias changes.
CREATE OR REPLACE FUNCTION public.refresh_donor_consolidated_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() FROM anon;

-- Ensure unique index exists for CONCURRENTLY refresh.
CREATE UNIQUE INDEX IF NOT EXISTS donor_consolidated_mv_row_id_idx
  ON private.donor_consolidated_mv (row_id);

COMMENT ON FUNCTION public.refresh_donor_display_names()
IS 'DEPRECATED: use alias-scoped apply-donor-alias/unapply-donor-alias edge functions for incremental updates.';
