-- Step 1: Delete duplicate candidate_votes using ROW_NUMBER approach
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY bill_id, candidate_id, action_type, COALESCE(vote_number, 0)
    ORDER BY created_at ASC NULLS LAST, id ASC
  ) as rn
  FROM candidate_votes
)
DELETE FROM candidate_votes
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: Delete records with invalid bill_ids
DELETE FROM candidate_votes
WHERE bill_id = 'null.undefined' 
   OR bill_id IS NULL 
   OR bill_id LIKE '%null%' 
   OR bill_id LIKE '%undefined%';

-- Step 3: Recreate the view to count DISTINCT bills instead of raw records
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage 
WITH (security_invoker = true)
AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.office,
  c.party,
  COUNT(DISTINCT cv.bill_id) FILTER (WHERE cv.action_type IN ('sponsor', 'cosponsor')) as legislative_actions_count,
  COUNT(DISTINCT CONCAT(cv.bill_id, '-', COALESCE(cv.vote_number, 0))) FILTER (WHERE cv.action_type = 'floor_vote') as floor_votes_count,
  COUNT(DISTINCT cv.bill_id) as total_votes_stored,
  COUNT(DISTINCT b.topic) as topics_covered,
  MAX(cv.action_date) as last_vote_date,
  MAX(cv.action_date) FILTER (WHERE cv.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN candidate_votes cv ON c.id = cv.candidate_id
LEFT JOIN bills b ON cv.bill_id = b.id
WHERE c.office IN ('Senator', 'Representative')
GROUP BY c.id, c.name, c.office, c.party;