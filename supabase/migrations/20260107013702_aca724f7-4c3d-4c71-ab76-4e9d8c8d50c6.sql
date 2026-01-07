-- Add index for action_type filtering to speed up COUNT queries
CREATE INDEX IF NOT EXISTS idx_votes_action_type_only ON votes(action_type);

-- Drop and recreate the view with optimized range filter instead of regex
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.party,
  c.office,
  COUNT(v.id) FILTER (WHERE v.action_type IN ('sponsored', 'cosponsored')) as legislative_actions_count,
  COUNT(v.id) FILTER (WHERE v.action_type = 'floor_vote') as floor_votes_count,
  COUNT(v.id) as total_votes_stored,
  COUNT(DISTINCT v.topic) as topics_covered,
  MAX(v.date) as last_vote_date,
  MAX(v.date) FILTER (WHERE v.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN votes v ON c.id = v.candidate_id
WHERE c.id >= 'A000000' AND c.id <= 'Z999999'
GROUP BY c.id, c.name, c.party, c.office;