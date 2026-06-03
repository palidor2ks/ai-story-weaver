-- Refresh the donor-consolidation MVs so the curated aliases seeded in
-- 20260603230300 take effect (the MVs were built earlier in this deploy, before
-- the aliases existed, so they don't yet reflect the merges).
--
-- Non-concurrent REFRESH (the prod apply runs each migration in a single
-- transaction, where REFRESH ... CONCURRENTLY is not allowed). statement_timeout
-- is disabled because the all-cycles MV refresh over full data exceeds the
-- default cap; the prod apply connects as `postgres`, which has no timeout, but
-- this makes the intent explicit and protects against capped sessions.

SET statement_timeout = 0;

REFRESH MATERIALIZED VIEW private.donor_consolidated_mv;
REFRESH MATERIALIZED VIEW private.donor_consolidated_all_mv;
REFRESH MATERIALIZED VIEW private.donor_consolidated_counts_mv;
