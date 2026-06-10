-- Phase A: stop donor-MV refreshes from stampeding the database.
--
-- Background: public.refresh_donor_consolidated_mv() rebuilds three large
-- materialized views over the 11.6M-row contributions / 2.45M-row donors tables and
-- takes 1-5 minutes per call. The admin "donor alias" flows (attach/detach/delete)
-- were triggering it directly from the browser on every action, so dozens of these
-- multi-minute refreshes could pile up at once -- saturating CPU/IO and causing the
-- 8s API statement timeout to fire across unrelated user queries.
--
-- This adds a transaction-level advisory lock so that if a refresh is already running,
-- additional calls return immediately instead of queueing another full rebuild. The
-- lock auto-releases at transaction end (pg_try_advisory_xact_lock), so no explicit
-- unlock is needed and REFRESH ... CONCURRENTLY keeps working exactly as before.
-- The frontend is also changed (separately) to trigger this in the background instead
-- of blocking the admin's request on it.

CREATE OR REPLACE FUNCTION public.refresh_donor_consolidated_mv()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
 SET statement_timeout TO '600000'
AS $function$
BEGIN
  -- Coalesce stampedes: if another refresh already holds this lock, skip silently.
  -- A single in-flight refresh already picks up all pending changes, so skipping is safe.
  IF NOT pg_try_advisory_xact_lock(hashtext('donor_consolidated_mv_refresh')) THEN
    RAISE NOTICE 'donor consolidated MV refresh already in progress; skipping duplicate request';
    RETURN;
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_counts_mv;
END;
$function$;
