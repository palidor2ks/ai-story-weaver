-- First, delete orphan candidate_answers (where candidate no longer exists)
DELETE FROM candidate_answers 
WHERE candidate_id NOT IN (SELECT id FROM candidates);

-- Add foreign key constraint from candidate_answers to candidates
ALTER TABLE candidate_answers
ADD CONSTRAINT candidate_answers_candidate_id_fkey
FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;