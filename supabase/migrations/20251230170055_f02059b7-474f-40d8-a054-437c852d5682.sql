-- Add foreign key constraint to enable Supabase embedded joins
ALTER TABLE candidate_committees
ADD CONSTRAINT candidate_committees_candidate_id_fkey
FOREIGN KEY (candidate_id) REFERENCES candidates(id)
ON DELETE SET NULL;