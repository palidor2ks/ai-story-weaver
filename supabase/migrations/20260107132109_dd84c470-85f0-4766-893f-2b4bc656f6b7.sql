-- Update vote_sync_status with actual counts from votes table
-- This fixes the "3549/0" display issue where expected_total is 0 but actual data exists

UPDATE vote_sync_status vs
SET 
  persisted_count = actual.legislative_count,
  expected_total = actual.legislative_count,
  persisted_floor_votes = actual.floor_count,
  expected_floor_votes = actual.floor_count,
  last_sync_completed_at = COALESCE(vs.last_sync_completed_at, now()),
  updated_at = now()
FROM (
  SELECT 
    candidate_id,
    COUNT(*) FILTER (WHERE action_type IN ('sponsored', 'cosponsored')) as legislative_count,
    COUNT(*) FILTER (WHERE action_type = 'floor_vote') as floor_count
  FROM votes
  WHERE candidate_id ~ '^[A-Z][0-9]{6}$'
  GROUP BY candidate_id
) actual
WHERE vs.candidate_id = actual.candidate_id
  AND (
    vs.expected_total IS NULL
    OR vs.expected_total = 0 
    OR vs.persisted_count IS DISTINCT FROM actual.legislative_count
    OR vs.persisted_floor_votes IS DISTINCT FROM actual.floor_count
    OR vs.expected_floor_votes IS NULL
    OR vs.expected_floor_votes = 0
  );