-- Fix 118-HR.662: Failed in Senate means it passed House first
UPDATE bills 
SET 
  status = 'passed_one_chamber', 
  passed_house = true 
WHERE id = '118-HR.662';

-- Fix 118-HJRES.44: Senate action message means it passed House first
UPDATE bills 
SET 
  status = 'passed_one_chamber', 
  passed_house = true 
WHERE id = '118-HJRES.44';