-- Add lis_member_id column to candidates table for Senate XML member matching
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS lis_member_id TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_candidates_lis_member_id ON candidates(lis_member_id);