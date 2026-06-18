-- Disk reclaim (part 1): drop orphaned enrichment staging tables.
--
-- scripts/answers-enrichment/generate-vote-citation-sql.ts creates these `unlogged` staging tables
-- at the start of a run and drops them at the end. They were left behind when a run aborted before
-- its teardown — _enrich_member_bills alone was 504 MB (1.38M rows). Not read by any app or edge
-- function; the script recreates them on its next run. Idempotent (IF EXISTS) so replay/preview
-- branches that don't have them are a no-op.
--
-- Applied to Dev via MCP on 2026-06-18; this file keeps the repo migration history in sync.

DROP TABLE IF EXISTS public._enrich_member_bills;
DROP TABLE IF EXISTS public._enrich_bill_kw;
DROP TABLE IF EXISTS public._enrich_t2_hits;
DROP TABLE IF EXISTS public._enrich_vc_tier2;
DROP TABLE IF EXISTS public._enrich_vc_keywords;
