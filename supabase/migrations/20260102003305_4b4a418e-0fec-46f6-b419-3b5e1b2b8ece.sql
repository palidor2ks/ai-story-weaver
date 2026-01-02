-- Fix security definer on the new view by recreating with explicit security invoker
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage 
WITH (security_invoker = true)
AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.party,
  c.office,
  COUNT(v.id) as total_votes_stored,
  MAX(v.date) as last_vote_date,
  COUNT(DISTINCT v.topic) as topics_covered
FROM candidates c
LEFT JOIN votes v ON v.candidate_id = c.id
WHERE c.office LIKE '%Representative%' OR c.office LIKE '%Senator%'
GROUP BY c.id, c.name, c.party, c.office;