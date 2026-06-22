-- Add jurisdiction discriminator to candidate_votes and bills.
-- NULL = federal (no backfill of existing ~1.9M candidate_votes / 188K bills rows).
-- 'nc_state' = NC General Assembly rows bridged from nc_leg_* final-passage votes.
--
-- Safe ADD COLUMN on large tables: nullable text with no default triggers a
-- metadata-only operation in PG11+ (no table rewrite, sub-second ACCESS EXCLUSIVE).
--
-- Federal sync functions (fetch-floor-votes etc.) can guard their upserts with
-- WHERE jurisdiction IS NULL or WHERE congress IS NOT NULL to avoid touching state rows.
-- The clear-congress-bills admin fn already scopes by congress = $1, so it is
-- inherently safe (NC bills land with congress = NULL).

alter table public.candidate_votes add column if not exists jurisdiction text;
alter table public.bills           add column if not exists jurisdiction text;
