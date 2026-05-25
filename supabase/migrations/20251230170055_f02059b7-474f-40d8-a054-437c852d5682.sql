-- Add foreign key constraint to enable Supabase embedded joins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidate_committees_candidate_id_fkey'
      AND conrelid = 'candidate_committees'::regclass
  ) THEN
    ALTER TABLE candidate_committees
    ADD CONSTRAINT candidate_committees_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    ON DELETE SET NULL;
  END IF;
END $$;
