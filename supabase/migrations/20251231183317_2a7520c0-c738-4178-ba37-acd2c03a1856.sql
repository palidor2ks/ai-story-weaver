-- Backfill conduit_committee_id for Line 12 transfers
-- Match contributor_name in donors/contributions to candidate_committees.name
-- This enables clickable committee transfer links in the UI

-- Update donors table
UPDATE donors d
SET conduit_committee_id = cc.fec_committee_id
FROM candidate_committees cc
WHERE d.is_transfer = true
  AND d.conduit_committee_id IS NULL
  AND d.name = cc.name;

-- Update contributions table  
UPDATE contributions c
SET conduit_committee_id = cc.fec_committee_id
FROM candidate_committees cc
WHERE c.is_transfer = true
  AND c.conduit_committee_id IS NULL
  AND c.contributor_name = cc.name;