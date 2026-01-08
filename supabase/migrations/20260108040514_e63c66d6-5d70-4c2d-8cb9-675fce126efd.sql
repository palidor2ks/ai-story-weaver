-- Set 20 canonical onboarding questions (2 per topic)
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'hlth01'; -- Healthcare: government role in health insurance
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'hlth02'; -- Healthcare: prescription drug prices

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 3 WHERE id = 'tax01'; -- Economy: income tax structure
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 4 WHERE id = 'labor02'; -- Economy: federal minimum wage

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 5 WHERE id = 'envp01'; -- Environment: carbon emissions
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 6 WHERE id = 'lands02'; -- Environment: oil/gas leasing on federal lands

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 7 WHERE id = 'imm01'; -- Immigration: overall approach to levels
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 8 WHERE id = 'imm02'; -- Immigration: undocumented immigrants

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 9 WHERE id = 'arms01'; -- Defense: military spending
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 10 WHERE id = 'intl03'; -- Defense: NATO policy

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 11 WHERE id = 'crl01'; -- Civil Rights: abortion rights
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 12 WHERE id = 'crl04'; -- Civil Rights: gun control

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 13 WHERE id = 'educ01'; -- Education: federal role in K-12
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 14 WHERE id = 'educ05'; -- Education: student loan debt

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 15 WHERE id = 'wel01'; -- Social Programs: poverty reduction
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 16 WHERE id = 'wel04'; -- Social Programs: Social Security reform

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 17 WHERE id = 'gov01'; -- Government: size of federal government
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 18 WHERE id = 'gov07'; -- Government: campaign finance

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 19 WHERE id = 'tech01'; -- Technology: big tech regulation
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 20 WHERE id = 'tech03'; -- Technology: AI regulation