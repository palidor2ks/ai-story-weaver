-- Part 1: Fix the candidate_voting_coverage view with correct office names
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.office,
  c.party,
  -- Count legislative actions (sponsored/cosponsored)
  COUNT(cv.id) FILTER (WHERE cv.action_type IN ('sponsor', 'cosponsor')) as legislative_actions_count,
  -- Count floor votes (yea/nay/present/not voting)
  COUNT(cv.id) FILTER (WHERE cv.action_type = 'floor_vote') as floor_votes_count,
  -- Total votes stored
  COUNT(cv.id) as total_votes_stored,
  -- Count distinct topics covered
  COUNT(DISTINCT b.topic) as topics_covered,
  -- Last vote date
  MAX(cv.action_date) as last_vote_date,
  -- Last floor vote date
  MAX(cv.action_date) FILTER (WHERE cv.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN candidate_votes cv ON c.id = cv.candidate_id
LEFT JOIN bills b ON cv.bill_id = b.id
WHERE c.office IN ('Senator', 'Representative')
GROUP BY c.id, c.name, c.office, c.party;

-- Part 2: Fix malformed bill_type values (bill names stored in bill_type column)
UPDATE bills
SET 
  bill_type = 'S',
  bill_number = 0
WHERE bill_type NOT IN ('HR', 'S', 'HRES', 'SRES', 'HJRES', 'SJRES', 'HCONRES', 'SCONRES', 'PROC')
  AND bill_type IS NOT NULL
  AND LENGTH(bill_type) > 10;