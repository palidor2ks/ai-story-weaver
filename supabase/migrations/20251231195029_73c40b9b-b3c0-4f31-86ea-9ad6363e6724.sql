-- Add source_urls array column to party_answers for multiple citations
ALTER TABLE party_answers ADD COLUMN IF NOT EXISTS source_urls text[] DEFAULT '{}';

-- Add source_urls array column to candidate_answers for multiple citations
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS source_urls text[] DEFAULT '{}';