-- Update candidate_voting_coverage view to include separate legislative actions and floor votes counts
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.party,
  c.office,
  -- Legislative actions count (sponsored/cosponsored)
  COUNT(v.id) FILTER (WHERE v.action_type IN ('sponsored', 'cosponsored')) as legislative_actions_count,
  -- Floor votes count
  COUNT(v.id) FILTER (WHERE v.action_type = 'floor_vote') as floor_votes_count,
  -- Total (for backwards compatibility)
  COUNT(v.id) as total_votes_stored,
  COUNT(DISTINCT v.topic) as topics_covered,
  MAX(v.date) as last_vote_date,
  MAX(v.date) FILTER (WHERE v.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN votes v ON c.id = v.candidate_id
WHERE c.id ~ '^[A-Z][0-9]{6}$'
GROUP BY c.id, c.name, c.party, c.office;