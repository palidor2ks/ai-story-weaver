-- Add Sponsored and Cosponsored to vote_position enum
ALTER TYPE vote_position ADD VALUE IF NOT EXISTS 'Sponsored';
ALTER TYPE vote_position ADD VALUE IF NOT EXISTS 'Cosponsored';

-- Update source_type check constraint to include web_research
ALTER TABLE candidate_answers DROP CONSTRAINT IF EXISTS candidate_answers_source_type_check;
ALTER TABLE candidate_answers ADD CONSTRAINT candidate_answers_source_type_check 
CHECK (source_type = ANY (ARRAY['voting_record'::text, 'public_statement'::text, 'campaign_website'::text, 'interview'::text, 'legislation'::text, 'web_research'::text, 'other'::text]));

-- Update existing votes to have correct action_type (they're all currently NULL or 'sponsored')
UPDATE votes SET action_type = 'sponsored' WHERE action_type IS NULL;