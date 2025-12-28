-- Clean up duplicate committee C00879510 (AMERICA PAC)
-- Delete the incomplete duplicate first, then update the complete one

-- Delete the incomplete duplicate (no name, no designation)
DELETE FROM candidate_committees 
WHERE id = 'e7b6770b-f11a-441f-bd0f-fa7a65b36784';

-- Now update the complete record to have the candidate_id
UPDATE candidate_committees 
SET candidate_id = 'P80001571',
    updated_at = now()
WHERE id = '6edce528-4877-4f3e-bb13-40cce00d5a3c';