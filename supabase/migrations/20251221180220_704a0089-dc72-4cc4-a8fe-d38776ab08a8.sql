-- Add tracking columns for answer syncing and rep claiming
ALTER TABLE candidates 
  ADD COLUMN IF NOT EXISTS last_answers_sync TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS answers_source TEXT DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;

-- Add index for claimed profiles lookup
CREATE INDEX IF NOT EXISTS idx_candidates_claimed_by ON candidates(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;