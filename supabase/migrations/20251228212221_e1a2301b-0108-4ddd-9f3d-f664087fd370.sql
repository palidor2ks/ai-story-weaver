-- Set existing America PAC to active
UPDATE candidate_committees 
SET active = true 
WHERE fec_committee_id = 'C00879510';