-- Disk reclaim (part 2): drop unused indexes on the finance fact tables (~1.86 GB).
--
-- The DB sits at ~15 GB (the materialized-view refresh OOM'd on 2026-06-13). `contributions` and
-- `donors` carry more index than table (contributions: 3,975 MB idx / 4,499 MB table; donors:
-- 1,990 MB idx / 947 MB table). Every index below has idx_scan = 0 over cumulative stats
-- (pg_stat_user_indexes; stats never reset on this DB, and sibling indexes show 100s–100,000s of
-- scans — so 0 means genuinely unused, not a reset artifact). None are PRIMARY KEY or UNIQUE, none
-- back a constraint or FK, so dropping them is reversible (recreate) and cannot affect integrity.
--
-- Per-index rationale (size · why safe):
--   idx_contributions_identity (1068 MB) — single-col (identity_hash). Fully covered by the UNIQUE
--     (identity_hash, cycle) index `contributions_identity_hash_cycle_key` (879k scans) that ETL
--     dedup uses; this one is pure redundant dead weight.
--   idx_contributions_memo_code (67 MB) — partial (memo_code IS NOT NULL); redundant with the full
--     btree `contributions_memo_code_idx` on memo_code.
--   idx_contributions_earmarked (98 MB) — partial on earmarked_for_candidate_id; never scanned.
--   idx_donors_display_name_trgm (215 MB) — gin trigram on display_name; never scanned (donor
--     search uses idx_donors_name_trgm on `name`, 89 scans).
--   idx_donors_for_consolidation (146 MB) + idx_donors_consolidated_lookup (112 MB) — (cycle,type,
--     display_name[,name]) for the donor-consolidation matview; the full REFRESH seq-scans donors,
--     so neither has ever been used.
--   idx_donors_cycle_amount (69 MB) + idx_donors_cycle_type (59 MB) — overlap the used
--     idx_donors_cycle (187 scans); never scanned themselves.
--   idx_candidate_votes_date (24 MB) — (action_date DESC); never scanned.
--
-- Reads are routed through the one front-door data layer, so any later need is a deliberate
-- recreate. DROP INDEX (non-concurrent) takes a brief lock to unlink the index file only.

DROP INDEX IF EXISTS public.idx_contributions_identity;
DROP INDEX IF EXISTS public.idx_contributions_memo_code;
DROP INDEX IF EXISTS public.idx_contributions_earmarked;
DROP INDEX IF EXISTS public.idx_donors_display_name_trgm;
DROP INDEX IF EXISTS public.idx_donors_for_consolidation;
DROP INDEX IF EXISTS public.idx_donors_consolidated_lookup;
DROP INDEX IF EXISTS public.idx_donors_cycle_amount;
DROP INDEX IF EXISTS public.idx_donors_cycle_type;
DROP INDEX IF EXISTS public.idx_candidate_votes_date;
