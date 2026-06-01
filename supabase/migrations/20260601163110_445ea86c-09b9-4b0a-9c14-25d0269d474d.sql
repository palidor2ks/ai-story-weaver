-- 1) Re-add the candidate_committees FK idempotently (replaces a deleted, non-idempotent migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidate_committees_candidate_id_fkey'
      AND conrelid = 'public.candidate_committees'::regclass
  ) THEN
    ALTER TABLE public.candidate_committees
      ADD CONSTRAINT candidate_committees_candidate_id_fkey
      FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Add AI provenance fields to elections
ALTER TABLE public.elections
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS confidence text;
