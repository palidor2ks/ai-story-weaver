-- Migrate override from exec_trump to federal_president
UPDATE candidate_overrides 
SET candidate_id = 'federal_president', updated_at = NOW()
WHERE candidate_id = 'exec_trump';

-- Also migrate any exec_vance to federal_vice_president if it exists
UPDATE candidate_overrides 
SET candidate_id = 'federal_vice_president', updated_at = NOW()
WHERE candidate_id = 'exec_vance';