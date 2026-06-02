-- Add foreign key constraint to enable Supabase embedded joins.
-- The table-creation migration (20251224120000) already defines this FK inline,
-- which PostgreSQL auto-names `candidate_committees_candidate_id_fkey`, so adding
-- it again unconditionally fails with 42710 (duplicate_object) on replay. Guard it
-- so the migration is idempotent. Use ON DELETE CASCADE to match the existing
-- constraint — candidate_id is NOT NULL, so ON DELETE SET NULL is invalid here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidate_committees_candidate_id_fkey'
      AND conrelid = 'public.candidate_committees'::regclass
  ) THEN
    ALTER TABLE public.candidate_committees
      ADD CONSTRAINT candidate_committees_candidate_id_fkey
      FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
      ON DELETE CASCADE;
  END IF;
END $$;
