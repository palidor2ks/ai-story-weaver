-- Add chamber discriminator to candidate_votes for NC state votes.
-- NULL = federal (no backfill of existing federal rows).
-- 'upper' = Senate, 'lower' = House (OpenStates classification values).
-- Allows per-chamber aggregation for bicameral bills that produce two
-- final-passage vote events (e.g. SB1080: Senate Third Reading + House Third Reading).
--
-- Safe ADD COLUMN: nullable text with no default → metadata-only in PG11+,
-- no table rewrite, sub-second ACCESS EXCLUSIVE lock.

alter table public.candidate_votes add column if not exists chamber text;
