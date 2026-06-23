-- Backfill chamber on NC candidate_votes rows where the edge function's upsert
-- left chamber=null.  Derives chamber from candidates.office, which is the same
-- logic used by get_poliscore_record_nc:
--   State Senator  → 'upper'
--   anything else  → 'lower'
--
-- Idempotent: WHERE chamber IS NULL means re-running is a no-op once rows are set.
-- NULL federal rows are unaffected (jurisdiction filter).

UPDATE public.candidate_votes cv
SET chamber = CASE
  WHEN c.office = 'State Senator' THEN 'upper'
  ELSE 'lower'
END
FROM public.candidates c
WHERE cv.candidate_id = c.id
  AND cv.jurisdiction = 'nc_state'
  AND cv.chamber IS NULL;
