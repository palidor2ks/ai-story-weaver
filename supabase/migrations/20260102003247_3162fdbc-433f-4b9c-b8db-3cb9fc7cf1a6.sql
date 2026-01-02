-- Add evidence tracking columns to candidate_answers
ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS evidence_type TEXT DEFAULT 'mixed';
-- Values: 'voting_record', 'public_statement', 'inferred', 'mixed'

ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS voting_record_summary TEXT;

ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS public_statement_summary TEXT;

ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS has_discrepancy BOOLEAN DEFAULT false;

ALTER TABLE candidate_answers 
ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;

-- Add similar columns to party_answers for transparency
ALTER TABLE party_answers 
ADD COLUMN IF NOT EXISTS evidence_type TEXT DEFAULT 'platform';
-- Values: 'platform', 'inferred_from_reps', 'mixed'

ALTER TABLE party_answers 
ADD COLUMN IF NOT EXISTS rep_voting_summary TEXT;

ALTER TABLE party_answers 
ADD COLUMN IF NOT EXISTS has_discrepancy BOOLEAN DEFAULT false;

ALTER TABLE party_answers 
ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;

-- Create view for tracking candidate voting coverage
CREATE OR REPLACE VIEW candidate_voting_coverage AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.party,
  c.office,
  COUNT(v.id) as total_votes_stored,
  MAX(v.date) as last_vote_date,
  COUNT(DISTINCT v.topic) as topics_covered
FROM candidates c
LEFT JOIN votes v ON v.candidate_id = c.id
WHERE c.office LIKE '%Representative%' OR c.office LIKE '%Senator%'
GROUP BY c.id, c.name, c.party, c.office;

-- Add comment explaining the columns
COMMENT ON COLUMN candidate_answers.evidence_type IS 'Type of evidence: voting_record, public_statement, inferred, or mixed';
COMMENT ON COLUMN candidate_answers.has_discrepancy IS 'True if voting record differs from public statements';
COMMENT ON COLUMN party_answers.evidence_type IS 'Type of evidence: platform, inferred_from_reps, or mixed';
COMMENT ON COLUMN party_answers.has_discrepancy IS 'True if party platform differs from how reps actually vote';