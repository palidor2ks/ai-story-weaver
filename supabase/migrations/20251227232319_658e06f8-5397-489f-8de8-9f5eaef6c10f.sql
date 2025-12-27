-- Add additional AIPAC alias pattern for "american israel" variations
INSERT INTO donor_aliases (canonical_name, alias_pattern, donor_type, donor_types, is_active, notes)
VALUES ('AIPAC', '%american israel%', 'PAC', ARRAY['PAC', 'Individual', 'Organization', 'Unknown'], true, 'Matches American Israel Public Affairs Committee variations');

-- Update WINRED alias to include Organization type  
UPDATE donor_aliases 
SET donor_types = ARRAY['PAC', 'Organization', 'Individual', 'Unknown']
WHERE canonical_name = 'WinRed';