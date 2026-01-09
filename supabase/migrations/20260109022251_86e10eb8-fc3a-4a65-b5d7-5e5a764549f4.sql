-- Add relevance_flag column to candidate_answers for evidence mismatch tracking
ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS relevance_flag text DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN candidate_answers.relevance_flag IS 'Evidence relevance status: NULL (not checked), verified, mismatch, needs_review';

-- Create index for efficient filtering of flagged answers
CREATE INDEX IF NOT EXISTS idx_candidate_answers_relevance_flag 
ON candidate_answers (relevance_flag) 
WHERE relevance_flag IS NOT NULL;