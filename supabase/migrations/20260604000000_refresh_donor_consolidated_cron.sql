-- Schedule a daily refresh of the donor-consolidation materialized views so new
-- federal (FEC) and state (NJ ELEC, and any future state) contributions flow into
-- the donor explorer automatically.
--
-- Today nothing refreshes these MVs on a schedule -- they only update when an
-- unrelated alias attach/detach happens to trigger refresh_donor_consolidated_mv().
-- This closes that gap for every source at once (the MVs read the unified view).
--
-- Mechanics:
--   * Runs at 08:00 UTC (~3-4am ET), a low-traffic window.
--   * Non-concurrent REFRESH: pg_cron runs each job inside a transaction, where
--     REFRESH ... CONCURRENTLY is disallowed. It briefly takes ACCESS EXCLUSIVE on
--     the MVs (~minutes) during the off-peak window.
--   * `SET statement_timeout = 0` runs first, as its own statement, so the
--     subsequent (heavy) all-cycles refresh isn't killed by the role's default cap.

create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('refresh-donor-consolidated-daily'); exception when others then null; end $$;

select cron.schedule('refresh-donor-consolidated-daily', '0 8 * * *', $cron$
  SET statement_timeout = 0;
  REFRESH MATERIALIZED VIEW private.donor_consolidated_mv;
  REFRESH MATERIALIZED VIEW private.donor_consolidated_all_mv;
  REFRESH MATERIALIZED VIEW private.donor_consolidated_counts_mv;
$cron$);
