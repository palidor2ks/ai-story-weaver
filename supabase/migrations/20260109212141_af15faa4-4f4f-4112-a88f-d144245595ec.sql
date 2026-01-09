-- Create partial index to speed up chamber backfill queries
-- This index only includes rows where chamber IS NULL and action_type is sponsored/cosponsored
CREATE INDEX IF NOT EXISTS idx_votes_chamber_null_sponsored 
ON votes (id, bill_id) 
WHERE chamber IS NULL AND action_type IN ('sponsored', 'cosponsored');