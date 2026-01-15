-- Fix the security definer issue on the view by recreating with security_invoker
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage 
WITH (security_invoker = true)
AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.office,
  c.party,
  COUNT(cv.id) FILTER (WHERE cv.action_type IN ('sponsor', 'cosponsor')) as legislative_actions_count,
  COUNT(cv.id) FILTER (WHERE cv.action_type = 'floor_vote') as floor_votes_count,
  COUNT(cv.id) as total_votes_stored,
  COUNT(DISTINCT b.topic) as topics_covered,
  MAX(cv.action_date) as last_vote_date,
  MAX(cv.action_date) FILTER (WHERE cv.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN candidate_votes cv ON c.id = cv.candidate_id
LEFT JOIN bills b ON cv.bill_id = b.id
WHERE c.office IN ('Senator', 'Representative')
GROUP BY c.id, c.name, c.office, c.party;