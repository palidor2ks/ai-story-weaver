-- Fix remaining 1,679 NULL chamber records by deriving chamber from candidate's office
-- These records have malformed bill_id = 'null.undefined' from incorrectly ingested amendment votes
UPDATE votes v
SET chamber = CASE 
  WHEN c.office = 'Senator' THEN 'senate'
  WHEN c.office = 'Representative' THEN 'house'
END
FROM candidates c
WHERE v.candidate_id = c.id
  AND v.chamber IS NULL
  AND v.action_type IN ('sponsored', 'cosponsored')
  AND v.bill_id = 'null.undefined'
  AND c.office IN ('Senator', 'Representative');