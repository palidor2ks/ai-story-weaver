-- Restore the FK from candidate_answers to candidates.
-- The constraint was added in 20260108235033 then dropped in 20260507121738.
-- We clean up any orphaned rows first so the constraint can be added cleanly.

DELETE FROM public.candidate_answers
WHERE candidate_id NOT IN (SELECT id FROM public.candidates);

ALTER TABLE public.candidate_answers
  ADD CONSTRAINT candidate_answers_candidate_id_fkey
  FOREIGN KEY (candidate_id)
  REFERENCES public.candidates(id)
  ON DELETE CASCADE;
