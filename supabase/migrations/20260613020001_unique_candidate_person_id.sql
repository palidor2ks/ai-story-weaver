-- Prevent duplicate candidate rows for the same person.
-- The persons layer already resolves identity; this constraint ensures no code
-- path (current or future) can bypass the dedup funnel and mint a second
-- candidate row for an already-known person.  NULL person_ids are allowed
-- (candidates discovered before person resolution runs).
CREATE UNIQUE INDEX IF NOT EXISTS candidates_person_id_unique
  ON public.candidates (person_id)
  WHERE person_id IS NOT NULL;
