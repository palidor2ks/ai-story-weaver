DROP INDEX IF EXISTS private.donor_consolidated_all_mv_amount_active_idx;
DROP INDEX IF EXISTS private.donor_consolidated_mv_cycle_amount_active_idx;

CREATE INDEX donor_consolidated_all_mv_amount_active_idx
  ON private.donor_consolidated_all_mv (total_amount DESC NULLS LAST, display_name ASC NULLS LAST)
  WHERE is_refund = false;

CREATE INDEX donor_consolidated_mv_cycle_amount_active_idx
  ON private.donor_consolidated_mv (cycle, total_amount DESC NULLS LAST, display_name ASC NULLS LAST)
  WHERE is_refund = false;

REVOKE ALL ON FUNCTION public.refresh_donor_consolidated_mv() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_donor_consolidated_mv() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() TO authenticated, service_role;