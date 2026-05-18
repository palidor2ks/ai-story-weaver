-- Add foreign key constraint to enable Supabase embedded joins
-- Idempotent guard: skip if the named FK already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidate_committees_candidate_id_fkey'
  ) THEN
    ALTER TABLE public.candidate_committees
    ADD CONSTRAINT candidate_committees_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
    ON DELETE SET NULL;
  END IF;
END
$$;
