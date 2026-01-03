-- Add floor vote tracking columns to votes table
ALTER TABLE votes ADD COLUMN IF NOT EXISTS vote_number integer;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS congress integer;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS session integer;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS chamber text;

-- Update vote_sync_status for floor vote tracking
ALTER TABLE vote_sync_status ADD COLUMN IF NOT EXISTS expected_floor_votes integer DEFAULT 0;
ALTER TABLE vote_sync_status ADD COLUMN IF NOT EXISTS persisted_floor_votes integer DEFAULT 0;
ALTER TABLE vote_sync_status ADD COLUMN IF NOT EXISTS last_floor_vote_date date;
ALTER TABLE vote_sync_status ADD COLUMN IF NOT EXISTS floor_vote_sync_error text;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_votes_action_type ON votes(candidate_id, action_type)