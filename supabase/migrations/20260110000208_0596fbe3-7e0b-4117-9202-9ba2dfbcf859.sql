-- Add columns to votes table for multi-topic tracking
ALTER TABLE votes ADD COLUMN IF NOT EXISTS additional_topics TEXT[] DEFAULT '{}';
ALTER TABLE votes ADD COLUMN IF NOT EXISTS topic_flag TEXT DEFAULT NULL;
-- topic_flag values: 'multi_topic_detected', 'possible_mismatch', 'omnibus_detected', 'omnibus_major', 'ai_review_needed', 'admin_reviewed'
ALTER TABLE votes ADD COLUMN IF NOT EXISTS ai_detected_topics TEXT[] DEFAULT '{}';
ALTER TABLE votes ADD COLUMN IF NOT EXISTS omnibus_type TEXT DEFAULT NULL;
-- omnibus_type values: 'appropriations', 'ndaa', 'infrastructure', 'reconciliation', 'other'
ALTER TABLE votes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS reviewed_by TEXT DEFAULT NULL;

-- Add topic_flag to candidate_answers for propagation
ALTER TABLE candidate_answers ADD COLUMN IF NOT EXISTS topic_flag TEXT DEFAULT NULL;

-- Index for efficient querying of flagged records
CREATE INDEX IF NOT EXISTS idx_votes_topic_flag ON votes(topic_flag) WHERE topic_flag IS NOT NULL;

-- Index for unreviewed flagged records (admin workflow)
CREATE INDEX IF NOT EXISTS idx_votes_unreviewed_flags ON votes(topic_flag, reviewed_at) 
WHERE topic_flag IS NOT NULL AND reviewed_at IS NULL;