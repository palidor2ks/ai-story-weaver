-- Complete Answer Options Update - Part 2: Remaining Topics
-- This migration updates remaining question_options from Document 2

-- ============================================
-- Families (f01-f10)
-- ============================================
UPDATE question_options SET text = 'Yes—because paid leave should be universal.' WHERE question_id = 'f01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow employer flexibility.' WHERE question_id = 'f01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted paid leave.' WHERE question_id = 'f01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary policies.' WHERE question_id = 'f01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal mandates are unnecessary.' WHERE question_id = 'f01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because families need strong support.' WHERE question_id = 'f02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-income households.' WHERE question_id = 'f02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'f02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'f02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because credits should be reduced.' WHERE question_id = 'f02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because childcare should be universally supported.' WHERE question_id = 'f03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase in by income.' WHERE question_id = 'f03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted subsidies.' WHERE question_id = 'f03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited assistance.' WHERE question_id = 'f03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because subsidies should be private.' WHERE question_id = 'f03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because protections should be expanded.' WHERE question_id = 'f04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on enforcement.' WHERE question_id = 'f04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted improvements.' WHERE question_id = 'f04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current laws.' WHERE question_id = 'f04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be limited.' WHERE question_id = 'f04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because early support improves outcomes.' WHERE question_id = 'f05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk families.' WHERE question_id = 'f05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'f05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'f05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'f05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because adoption support should expand.' WHERE question_id = 'f06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on special-needs adoptions.' WHERE question_id = 'f06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'f06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'f06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'f06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because flexibility should be protected by law.' WHERE question_id = 'f07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but use incentives over mandates.' WHERE question_id = 'f07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support voluntary employer policies.' WHERE question_id = 'f07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private decisions.' WHERE question_id = 'f07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because government should not intervene.' WHERE question_id = 'f07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because mental health support should expand.' WHERE question_id = 'f08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved communities.' WHERE question_id = 'f08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'f08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'f08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'f08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because kinship care needs more support.' WHERE question_id = 'f09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income caregivers.' WHERE question_id = 'f09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted assistance.' WHERE question_id = 'f09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current programs.' WHERE question_id = 'f09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support should be reduced.' WHERE question_id = 'f09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because paid leave should be mandatory.' WHERE question_id = 'f10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased implementation.' WHERE question_id = 'f10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited requirements.' WHERE question_id = 'f10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary leave.' WHERE question_id = 'f10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates harm employers.' WHERE question_id = 'f10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Finance and Financial Sector (ffs01-ffs10)
-- ============================================
UPDATE question_options SET text = 'Yes—because stronger oversight is needed.' WHERE question_id = 'ffs01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target systemically important banks.' WHERE question_id = 'ffs01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate oversight.' WHERE question_id = 'ffs01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'ffs01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be reduced.' WHERE question_id = 'ffs01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because separation prevents risky behavior.' WHERE question_id = 'ffs02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited integration.' WHERE question_id = 'ffs02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support partial safeguards.' WHERE question_id = 'ffs02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but enforce current safeguards.' WHERE question_id = 'ffs02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because separation is unnecessary.' WHERE question_id = 'ffs02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because a transaction tax curbs speculation.' WHERE question_id = 'ffs03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep rates low.' WHERE question_id = 'ffs03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—study feasibility first.' WHERE question_id = 'ffs03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current taxes.' WHERE question_id = 'ffs03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because such taxes harm markets.' WHERE question_id = 'ffs03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because borrowers need strong protections.' WHERE question_id = 'ffs04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk products.' WHERE question_id = 'ffs04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted rules.' WHERE question_id = 'ffs04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'ffs04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be reduced.' WHERE question_id = 'ffs04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strict oversight is needed.' WHERE question_id = 'ffs05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow innovation safeguards.' WHERE question_id = 'ffs05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate regulation.' WHERE question_id = 'ffs05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require transparency only.' WHERE question_id = 'ffs05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'ffs05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize jobs and equity.' WHERE question_id = 'ffs06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but balance inflation and employment.' WHERE question_id = 'ffs06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain the dual mandate.' WHERE question_id = 'ffs06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but still consider employment.' WHERE question_id = 'ffs06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because inflation control should dominate.' WHERE question_id = 'ffs06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because payday lending is predatory.' WHERE question_id = 'ffs07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow regulated short-term credit.' WHERE question_id = 'ffs07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate limits.' WHERE question_id = 'ffs07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require transparency.' WHERE question_id = 'ffs07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because lending should be market-driven.' WHERE question_id = 'ffs07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger buffers are needed.' WHERE question_id = 'ffs08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target systemically important banks.' WHERE question_id = 'ffs08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ffs08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current requirements.' WHERE question_id = 'ffs08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because requirements should be lowered.' WHERE question_id = 'ffs08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should be universal.' WHERE question_id = 'ffs09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on targeted support.' WHERE question_id = 'ffs09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'ffs09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private initiatives.' WHERE question_id = 'ffs09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because government should not intervene.' WHERE question_id = 'ffs09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because bailouts should be banned.' WHERE question_id = 'ffs10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow only extreme emergencies.' WHERE question_id = 'ffs10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited authority.' WHERE question_id = 'ffs10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'ffs10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because bailouts may be necessary.' WHERE question_id = 'ffs10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Foreign Trade and International Finance (ftif01-ftif10)
-- ============================================
UPDATE question_options SET text = 'No—but pursue diplomatic solutions.' WHERE question_id = 'ftif01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but use targeted tariffs sparingly.' WHERE question_id = 'ftif01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—use tariffs selectively.' WHERE question_id = 'ftif01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key industries.' WHERE question_id = 'ftif01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because broad tariffs are needed.' WHERE question_id = 'ftif01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize labor and environment standards.' WHERE question_id = 'ftif02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited agreements with strong safeguards.' WHERE question_id = 'ftif02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—expand selectively with standards.' WHERE question_id = 'ftif02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep some safeguards.' WHERE question_id = 'ftif02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because free trade should expand.' WHERE question_id = 'ftif02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because national security requires strict limits.' WHERE question_id = 'ftif03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key sectors only.' WHERE question_id = 'ftif03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—conduct risk-based reviews.' WHERE question_id = 'ftif03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited reviews.' WHERE question_id = 'ftif03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because restrictions harm investment.' WHERE question_id = 'ftif03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because security requires strict controls.' WHERE question_id = 'ftif04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but apply narrowly.' WHERE question_id = 'ftif04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted controls.' WHERE question_id = 'ftif04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current controls.' WHERE question_id = 'ftif04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because controls harm competitiveness.' WHERE question_id = 'ftif04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because reshoring is essential for resilience.' WHERE question_id = 'ftif05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical sectors only.' WHERE question_id = 'ftif05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 'ftif05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited reshoring incentives.' WHERE question_id = 'ftif05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should decide.' WHERE question_id = 'ftif05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because workers need strong support.' WHERE question_id = 'ftif06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target displaced workers.' WHERE question_id = 'ftif06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'ftif06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'ftif06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because assistance should be reduced.' WHERE question_id = 'ftif06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize domestic food needs.' WHERE question_id = 'ftif07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited export expansion.' WHERE question_id = 'ftif07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance exports with domestic needs.' WHERE question_id = 'ftif07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain safeguards.' WHERE question_id = 'ftif07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because exports should expand.' WHERE question_id = 'ftif07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong enforcement is needed.' WHERE question_id = 'ftif08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major offenders.' WHERE question_id = 'ftif08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted enforcement.' WHERE question_id = 'ftif08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current levels.' WHERE question_id = 'ftif08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because enforcement should be reduced.' WHERE question_id = 'ftif08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because global development needs more support.' WHERE question_id = 'ftif09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic regions.' WHERE question_id = 'ftif09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'ftif09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ftif09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ftif09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger reviews protect security.' WHERE question_id = 'ftif10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key sectors.' WHERE question_id = 'ftif10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate reviews.' WHERE question_id = 'ftif10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current process.' WHERE question_id = 'ftif10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because reviews harm investment.' WHERE question_id = 'ftif10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Government Operations and Politics (gop01-gop10)
-- ============================================
UPDATE question_options SET text = 'Yes—because transparency should be mandatory.' WHERE question_id = 'gop01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased adoption.' WHERE question_id = 'gop01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage open data where feasible.' WHERE question_id = 'gop01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current practices.' WHERE question_id = 'gop01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'gop01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong protections are needed.' WHERE question_id = 'gop02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major misconduct cases.' WHERE question_id = 'gop02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'gop02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'gop02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections are sufficient.' WHERE question_id = 'gop02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize fair global competition.' WHERE question_id = 'gop03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited domestic preference.' WHERE question_id = 'gop03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—prioritize U.S. suppliers in key sectors.' WHERE question_id = 'gop03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep some flexibility.' WHERE question_id = 'gop03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strict Buy American rules are needed.' WHERE question_id = 'gop03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because efficiency matters without cutting services.' WHERE question_id = 'gop04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but protect essential programs.' WHERE question_id = 'gop04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate consolidation.' WHERE question_id = 'gop04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but reduce agencies aggressively.' WHERE question_id = 'gop04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major consolidation is needed.' WHERE question_id = 'gop04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should be easier.' WHERE question_id = 'gop05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep accountability standards.' WHERE question_id = 'gop05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest simplification.' WHERE question_id = 'gop05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current requirements.' WHERE question_id = 'gop05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'gop05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because full transparency is needed.' WHERE question_id = 'gop06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep processes efficient.' WHERE question_id = 'gop06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate transparency improvements.' WHERE question_id = 'gop06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'gop06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because transparency rules are excessive.' WHERE question_id = 'gop06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public services should be modernized.' WHERE question_id = 'gop07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on accessibility.' WHERE question_id = 'gop07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted digital upgrades.' WHERE question_id = 'gop07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited expansion.' WHERE question_id = 'gop07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be limited.' WHERE question_id = 'gop07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but maintain protections.' WHERE question_id = 'gop08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited streamlining.' WHERE question_id = 'gop08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance efficiency with safeguards.' WHERE question_id = 'gop08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid eliminating key protections.' WHERE question_id = 'gop08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because aggressive deregulation is needed.' WHERE question_id = 'gop08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong oversight is essential.' WHERE question_id = 'gop09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk agencies.' WHERE question_id = 'gop09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support reasonable oversight.' WHERE question_id = 'gop09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but avoid micromanagement.' WHERE question_id = 'gop09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because oversight should be reduced.' WHERE question_id = 'gop09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because cyber defense is critical.' WHERE question_id = 'gop10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-risk systems.' WHERE question_id = 'gop10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited upgrades.' WHERE question_id = 'gop10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'gop10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be limited.' WHERE question_id = 'gop10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Health (h01-h10)
-- ============================================
UPDATE question_options SET text = 'Yes—because universal coverage should be the goal.' WHERE question_id = 'h01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on gaps in coverage.' WHERE question_id = 'h01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansion only.' WHERE question_id = 'h01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited public options.' WHERE question_id = 'h01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because private insurance should lead.' WHERE question_id = 'h01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because negotiation should be broad.' WHERE question_id = 'h02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but start with high-cost drugs.' WHERE question_id = 'h02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited negotiation.' WHERE question_id = 'h02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'h02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because negotiation harms innovation.' WHERE question_id = 'h02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong caps are needed.' WHERE question_id = 'h03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on essential care.' WHERE question_id = 'h03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited caps.' WHERE question_id = 'h03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow market solutions.' WHERE question_id = 'h03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because caps distort pricing.' WHERE question_id = 'h03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because mental health access should expand.' WHERE question_id = 'h04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved areas.' WHERE question_id = 'h04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'h04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'h04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'h04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because preparedness requires major investment.' WHERE question_id = 'h05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical systems.' WHERE question_id = 'h05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'h05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'h05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'h05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because transparency should be mandatory.' WHERE question_id = 'h06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased implementation.' WHERE question_id = 'h06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate transparency rules.' WHERE question_id = 'h06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary disclosure.' WHERE question_id = 'h06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'h06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural access is critical.' WHERE question_id = 'h07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved regions.' WHERE question_id = 'h07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'h07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'h07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'h07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because treatment should expand greatly.' WHERE question_id = 'h08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-need areas.' WHERE question_id = 'h08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'h08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'h08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'h08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong protections are needed.' WHERE question_id = 'h09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited exceptions.' WHERE question_id = 'h09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced protections.' WHERE question_id = 'h09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary compliance.' WHERE question_id = 'h09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'h09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because preparedness should be a top priority.' WHERE question_id = 'h10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key vulnerabilities.' WHERE question_id = 'h10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'h10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'h10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'h10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Housing and Community Development (hcd01-hcd10)
-- ============================================
UPDATE question_options SET text = 'Yes—because major expansion is needed.' WHERE question_id = 'hcd01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-cost regions.' WHERE question_id = 'hcd01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'hcd01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'hcd01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'hcd01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because vouchers should expand broadly.' WHERE question_id = 'hcd02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the lowest-income families.' WHERE question_id = 'hcd02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'hcd02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current vouchers.' WHERE question_id = 'hcd02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because vouchers should be reduced.' WHERE question_id = 'hcd02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because zoning reform is essential.' WHERE question_id = 'hcd03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but use incentives not mandates.' WHERE question_id = 'hcd03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced protections.' WHERE question_id = 'hcd03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'hcd03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal rules should be minimal.' WHERE question_id = 'hcd03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger enforcement is needed.' WHERE question_id = 'hcd04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major violations.' WHERE question_id = 'hcd04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted improvements.' WHERE question_id = 'hcd04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'hcd04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be reduced.' WHERE question_id = 'hcd04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because prevention should expand.' WHERE question_id = 'hcd05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk populations.' WHERE question_id = 'hcd05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'hcd05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current grants.' WHERE question_id = 'hcd05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'hcd05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because mixed-income housing improves equity.' WHERE question_id = 'hcd06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-need areas.' WHERE question_id = 'hcd06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 'hcd06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local decisions.' WHERE question_id = 'hcd06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be minimal.' WHERE question_id = 'hcd06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because first-time buyers need strong assistance.' WHERE question_id = 'hcd07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target middle-income buyers.' WHERE question_id = 'hcd07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited assistance.' WHERE question_id = 'hcd07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private lending solutions.' WHERE question_id = 'hcd07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support distorts markets.' WHERE question_id = 'hcd07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because community investment should expand.' WHERE question_id = 'hcd08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved areas.' WHERE question_id = 'hcd08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'hcd08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'hcd08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because programs should be reduced.' WHERE question_id = 'hcd08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strict protections are needed.' WHERE question_id = 'hcd09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased compliance.' WHERE question_id = 'hcd09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted updates.' WHERE question_id = 'hcd09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current standards.' WHERE question_id = 'hcd09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal mandates are unnecessary.' WHERE question_id = 'hcd09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural housing needs support.' WHERE question_id = 'hcd10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most underserved areas.' WHERE question_id = 'hcd10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'hcd10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current assistance.' WHERE question_id = 'hcd10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'hcd10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Public Lands and Natural Resources (plnr01-plnr10)
-- ============================================
UPDATE question_options SET text = 'Yes—because park funding should expand.' WHERE question_id = 'plnr01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target maintenance backlogs.' WHERE question_id = 'plnr01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'plnr01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'plnr01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'plnr01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because extraction should be strongly limited.' WHERE question_id = 'plnr02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on sensitive areas.' WHERE question_id = 'plnr02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'plnr02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current limits.' WHERE question_id = 'plnr02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because access should expand.' WHERE question_id = 'plnr02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because more wilderness should be protected.' WHERE question_id = 'plnr03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-value lands.' WHERE question_id = 'plnr03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'plnr03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'plnr03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections should be reduced.' WHERE question_id = 'plnr03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because fees should reflect true costs.' WHERE question_id = 'plnr04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase in increases.' WHERE question_id = 'plnr04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—adjust fees moderately.' WHERE question_id = 'plnr04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current fees.' WHERE question_id = 'plnr04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because fees should be reduced.' WHERE question_id = 'plnr04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because control programs should expand.' WHERE question_id = 'plnr05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk species.' WHERE question_id = 'plnr05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'plnr05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'plnr05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'plnr05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should be broadened.' WHERE question_id = 'plnr06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with conservation.' WHERE question_id = 'plnr06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited access improvements.' WHERE question_id = 'plnr06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'plnr06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because access should be restricted.' WHERE question_id = 'plnr06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because old-growth should be strictly protected.' WHERE question_id = 'plnr07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited sustainable use.' WHERE question_id = 'plnr07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'plnr07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'plnr07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections should be reduced.' WHERE question_id = 'plnr07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because logging should be strongly limited.' WHERE question_id = 'plnr08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow sustainable logging.' WHERE question_id = 'plnr08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—limit in sensitive areas.' WHERE question_id = 'plnr08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current levels.' WHERE question_id = 'plnr08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because logging should expand.' WHERE question_id = 'plnr08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because conservation easements should expand.' WHERE question_id = 'plnr09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key habitats.' WHERE question_id = 'plnr09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'plnr09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'plnr09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'plnr09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because recreation access should expand.' WHERE question_id = 'plnr10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on underserved areas.' WHERE question_id = 'plnr10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited improvements.' WHERE question_id = 'plnr10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'plnr10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'plnr10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Science, Technology, Communications (stc01-stc10)
-- ============================================
UPDATE question_options SET text = 'Yes—because public R&D should expand.' WHERE question_id = 'stc01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic technologies.' WHERE question_id = 'stc01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansion.' WHERE question_id = 'stc01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'stc01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'stc01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because universal broadband is essential.' WHERE question_id = 'stc02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize rural areas.' WHERE question_id = 'stc02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansion.' WHERE question_id = 'stc02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited funding.' WHERE question_id = 'stc02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should expand access.' WHERE question_id = 'stc02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strict oversight is needed.' WHERE question_id = 'stc03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow innovation safeguards.' WHERE question_id = 'stc03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance regulation and innovation.' WHERE question_id = 'stc03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep minimal rules.' WHERE question_id = 'stc03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be avoided.' WHERE question_id = 'stc03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because STEM investment should expand.' WHERE question_id = 'stc04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved schools.' WHERE question_id = 'stc04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'stc04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'stc04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be reduced.' WHERE question_id = 'stc04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong privacy rights are needed.' WHERE question_id = 'stc05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow business flexibility.' WHERE question_id = 'stc05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced protections.' WHERE question_id = 'stc05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require basic transparency.' WHERE question_id = 'stc05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'stc05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because space investment should expand.' WHERE question_id = 'stc06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-impact missions.' WHERE question_id = 'stc06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'stc06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'stc06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'stc06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because quantum research is critical.' WHERE question_id = 'stc07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic applications.' WHERE question_id = 'stc07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest funding.' WHERE question_id = 'stc07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private sector leadership.' WHERE question_id = 'stc07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding should shrink.' WHERE question_id = 'stc07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because transparency should be mandatory.' WHERE question_id = 'stc08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased implementation.' WHERE question_id = 'stc08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted transparency rules.' WHERE question_id = 'stc08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary disclosure.' WHERE question_id = 'stc08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'stc08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because cyber research should expand.' WHERE question_id = 'stc09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-priority threats.' WHERE question_id = 'stc09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'stc09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'stc09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'stc09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because security requires strong restrictions.' WHERE question_id = 'stc10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk vendors.' WHERE question_id = 'stc10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited restrictions.' WHERE question_id = 'stc10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'stc10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because restrictions harm competition.' WHERE question_id = 'stc10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Social Sciences and History (ssh01-ssh10)
-- ============================================
UPDATE question_options SET text = 'Yes—because research should expand.' WHERE question_id = 'ssh01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-impact studies.' WHERE question_id = 'ssh01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ssh01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ssh01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ssh01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because preservation should expand.' WHERE question_id = 'ssh02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on endangered sites.' WHERE question_id = 'ssh02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'ssh02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ssh02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should shrink.' WHERE question_id = 'ssh02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public history education should expand.' WHERE question_id = 'ssh03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved communities.' WHERE question_id = 'ssh03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'ssh03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'ssh03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be reduced.' WHERE question_id = 'ssh03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because data is essential for policy.' WHERE question_id = 'ssh04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but protect privacy strongly.' WHERE question_id = 'ssh04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted data collection.' WHERE question_id = 'ssh04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current collection.' WHERE question_id = 'ssh04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because data collection is intrusive.' WHERE question_id = 'ssh04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because preservation should expand.' WHERE question_id = 'ssh05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target under-documented communities.' WHERE question_id = 'ssh05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited funding.' WHERE question_id = 'ssh05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'ssh05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ssh05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public access should expand.' WHERE question_id = 'ssh06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize digitization.' WHERE question_id = 'ssh06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted improvements.' WHERE question_id = 'ssh06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'ssh06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because access is sufficient.' WHERE question_id = 'ssh06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because protections should expand.' WHERE question_id = 'ssh07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target highest-value sites.' WHERE question_id = 'ssh07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited protections.' WHERE question_id = 'ssh07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'ssh07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections should be reduced.' WHERE question_id = 'ssh07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because standards support should expand.' WHERE question_id = 'ssh08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow state flexibility.' WHERE question_id = 'ssh08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted assistance.' WHERE question_id = 'ssh08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'ssh08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'ssh08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because census improvements need funding.' WHERE question_id = 'ssh09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on accuracy upgrades.' WHERE question_id = 'ssh09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ssh09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ssh09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ssh09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should expand.' WHERE question_id = 'ssh10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on digitization.' WHERE question_id = 'ssh10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'ssh10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'ssh10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because access is sufficient.' WHERE question_id = 'ssh10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Social Welfare (sw01-sw10)
-- ============================================
UPDATE question_options SET text = 'Yes—because benefits should expand significantly.' WHERE question_id = 'sw01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most vulnerable.' WHERE question_id = 'sw01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'sw01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'sw01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because benefits should be reduced.' WHERE question_id = 'sw01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because eligibility should expand widely.' WHERE question_id = 'sw02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income households.' WHERE question_id = 'sw02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansions.' WHERE question_id = 'sw02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'sw02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because eligibility should be tightened.' WHERE question_id = 'sw02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because support services should expand.' WHERE question_id = 'sw03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-need families.' WHERE question_id = 'sw03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'sw03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current services.' WHERE question_id = 'sw03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because services should be reduced.' WHERE question_id = 'sw03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because disability funding should expand.' WHERE question_id = 'sw04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most severe needs.' WHERE question_id = 'sw04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'sw04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sw04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'sw04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because SNAP should expand.' WHERE question_id = 'sw05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income families.' WHERE question_id = 'sw05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansions.' WHERE question_id = 'sw05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'sw05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because SNAP should shrink.' WHERE question_id = 'sw05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because funding should expand greatly.' WHERE question_id = 'sw06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk communities.' WHERE question_id = 'sw06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'sw06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sw06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'sw06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because community services should expand.' WHERE question_id = 'sw07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on underserved areas.' WHERE question_id = 'sw07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'sw07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current services.' WHERE question_id = 'sw07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'sw07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because barriers should be reduced significantly.' WHERE question_id = 'sw08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain basic safeguards.' WHERE question_id = 'sw08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest simplification.' WHERE question_id = 'sw08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current requirements.' WHERE question_id = 'sw08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because stronger requirements prevent fraud.' WHERE question_id = 'sw08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because programs should expand broadly.' WHERE question_id = 'sw09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income children.' WHERE question_id = 'sw09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'sw09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'sw09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because programs should be reduced.' WHERE question_id = 'sw09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because protections should expand.' WHERE question_id = 'sw10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk groups.' WHERE question_id = 'sw10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited protections.' WHERE question_id = 'sw10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'sw10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections should be reduced.' WHERE question_id = 'sw10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Sports and Recreation (sr01-sr10)
-- ============================================
UPDATE question_options SET text = 'Yes—because programs should expand.' WHERE question_id = 'sr01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved areas.' WHERE question_id = 'sr01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'sr01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support is unnecessary.' WHERE question_id = 'sr01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger safety rules are needed.' WHERE question_id = 'sr02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk sports.' WHERE question_id = 'sr02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted regulations.' WHERE question_id = 'sr02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'sr02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal rules are unnecessary.' WHERE question_id = 'sr02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public access should expand.' WHERE question_id = 'sr03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved areas.' WHERE question_id = 'sr03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited projects.' WHERE question_id = 'sr03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'sr03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because adaptive sports support should expand.' WHERE question_id = 'sr04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target highest-need programs.' WHERE question_id = 'sr04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'sr04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'sr04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because youth sports need stronger support.' WHERE question_id = 'sr05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income communities.' WHERE question_id = 'sr05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'sr05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support is unnecessary.' WHERE question_id = 'sr05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because PE funding should expand.' WHERE question_id = 'sr06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target schools with low access.' WHERE question_id = 'sr06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'sr06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'sr06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong regulation is needed.' WHERE question_id = 'sr07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow state flexibility.' WHERE question_id = 'sr07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards.' WHERE question_id = 'sr07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but leave regulation to states.' WHERE question_id = 'sr07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation should be minimal.' WHERE question_id = 'sr07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because doping enforcement should expand.' WHERE question_id = 'sr08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major violations.' WHERE question_id = 'sr08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited oversight.' WHERE question_id = 'sr08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'sr08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'sr08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should expand nationally.' WHERE question_id = 'sr09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on underserved areas.' WHERE question_id = 'sr09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited improvements.' WHERE question_id = 'sr09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'sr09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'sr09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural recreation needs investment.' WHERE question_id = 'sr10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-need areas.' WHERE question_id = 'sr10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'sr10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'sr10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'sr10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Taxation (t01-t10)
-- ============================================
UPDATE question_options SET text = 'Yes—because top incomes should be taxed more.' WHERE question_id = 't01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on the highest earners.' WHERE question_id = 't01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest adjustments if needed.' WHERE question_id = 't01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rates.' WHERE question_id = 't01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because taxes should be lowered.' WHERE question_id = 't01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because corporate taxes should rise.' WHERE question_id = 't02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but raise rates modestly.' WHERE question_id = 't02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—keep rates roughly stable.' WHERE question_id = 't02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but reduce rates modestly.' WHERE question_id = 't02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because large cuts are needed.' WHERE question_id = 't02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because family credits should expand.' WHERE question_id = 't03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-income families.' WHERE question_id = 't03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansions.' WHERE question_id = 't03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current credits.' WHERE question_id = 't03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because credits should be reduced.' WHERE question_id = 't03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because small businesses need targeted relief.' WHERE question_id = 't04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but limit relief to true small firms.' WHERE question_id = 't04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance small business and overall equity.' WHERE question_id = 't04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 't04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because no special treatment is needed.' WHERE question_id = 't04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because simplification should protect progressivity.' WHERE question_id = 't05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep key deductions for fairness.' WHERE question_id = 't05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate simplification.' WHERE question_id = 't05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but reduce deductions and lower rates.' WHERE question_id = 't05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because a flat tax should be adopted.' WHERE question_id = 't05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because clean energy incentives should expand.' WHERE question_id = 't06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-impact technologies.' WHERE question_id = 't06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 't06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep some incentives.' WHERE question_id = 't06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incentives should be eliminated.' WHERE question_id = 't06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because the estate tax should increase.' WHERE question_id = 't07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but increase it modestly.' WHERE question_id = 't07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—keep current levels.' WHERE question_id = 't07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but reduce the estate tax.' WHERE question_id = 't07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because the estate tax should be eliminated.' WHERE question_id = 't07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because capital gains should be taxed more.' WHERE question_id = 't08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but increase rates modestly.' WHERE question_id = 't08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—keep rates similar.' WHERE question_id = 't08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but reduce capital gains taxes.' WHERE question_id = 't08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because taxes should be eliminated.' WHERE question_id = 't08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because EITC should expand widely.' WHERE question_id = 't09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-income workers.' WHERE question_id = 't09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 't09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current EITC.' WHERE question_id = 't09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because EITC should be reduced.' WHERE question_id = 't09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because loopholes should be closed broadly.' WHERE question_id = 't10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major loopholes first.' WHERE question_id = 't10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited reforms.' WHERE question_id = 't10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 't10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because loopholes are not a priority.' WHERE question_id = 't10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Transportation and Public Works (tpw01-tpw10)
-- ============================================
UPDATE question_options SET text = 'Yes—because major investment is needed.' WHERE question_id = 'tpw01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical repairs.' WHERE question_id = 'tpw01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'tpw01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'tpw01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'tpw01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because transit investment should expand.' WHERE question_id = 'tpw02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-ridership areas.' WHERE question_id = 'tpw02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'tpw02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'tpw02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because transit funding should be reduced.' WHERE question_id = 'tpw02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because repairs should come first.' WHERE question_id = 'tpw03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited new projects.' WHERE question_id = 'tpw03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance repairs and new builds.' WHERE question_id = 'tpw03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current priorities.' WHERE question_id = 'tpw03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because new construction should expand.' WHERE question_id = 'tpw03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because high-speed rail should expand.' WHERE question_id = 'tpw04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on dense corridors.' WHERE question_id = 'tpw04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited regional projects.' WHERE question_id = 'tpw04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current investments.' WHERE question_id = 'tpw04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because rail investment should shrink.' WHERE question_id = 'tpw04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural access needs investment.' WHERE question_id = 'tpw05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-need projects.' WHERE question_id = 'tpw05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'tpw05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'tpw05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'tpw05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because emissions rules should tighten.' WHERE question_id = 'tpw06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased compliance.' WHERE question_id = 'tpw06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate tightening.' WHERE question_id = 'tpw06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current standards.' WHERE question_id = 'tpw06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because standards should be relaxed.' WHERE question_id = 'tpw06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because EV adoption needs infrastructure.' WHERE question_id = 'tpw07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved regions.' WHERE question_id = 'tpw07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'tpw07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private investment.' WHERE question_id = 'tpw07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'tpw07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because bridge safety needs major investment.' WHERE question_id = 'tpw08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target structurally deficient bridges.' WHERE question_id = 'tpw08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'tpw08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'tpw08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'tpw08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because safety should be prioritized.' WHERE question_id = 'tpw09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk areas.' WHERE question_id = 'tpw09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced investments.' WHERE question_id = 'tpw09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current priorities.' WHERE question_id = 'tpw09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because priorities should stay with roads.' WHERE question_id = 'tpw09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because modernization needs expansion.' WHERE question_id = 'tpw10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major hubs first.' WHERE question_id = 'tpw10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited upgrades.' WHERE question_id = 'tpw10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'tpw10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'tpw10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Water Resources Development (wrd01-wrd10)
-- ============================================
UPDATE question_options SET text = 'Yes—because clean water infrastructure needs major funding.' WHERE question_id = 'wrd01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk systems.' WHERE question_id = 'wrd01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited upgrades.' WHERE question_id = 'wrd01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'wrd01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'wrd01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stricter protections are needed.' WHERE question_id = 'wrd02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major polluters.' WHERE question_id = 'wrd02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'wrd02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'wrd02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections are too strict.' WHERE question_id = 'wrd02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because drought resilience should expand.' WHERE question_id = 'wrd03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk regions.' WHERE question_id = 'wrd03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited projects.' WHERE question_id = 'wrd03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'wrd03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'wrd03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because flood control needs major investment.' WHERE question_id = 'wrd04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target highest-risk areas.' WHERE question_id = 'wrd04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited upgrades.' WHERE question_id = 'wrd04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'wrd04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'wrd04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because lead pipes should be replaced quickly.' WHERE question_id = 'wrd05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-risk communities.' WHERE question_id = 'wrd05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted replacement.' WHERE question_id = 'wrd05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'wrd05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal priority is unnecessary.' WHERE question_id = 'wrd05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because conservation should expand.' WHERE question_id = 'wrd06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-use areas.' WHERE question_id = 'wrd06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 'wrd06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'wrd06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incentives should be reduced.' WHERE question_id = 'wrd06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because desalination needs public investment.' WHERE question_id = 'wrd07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target efficient technologies.' WHERE question_id = 'wrd07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited research.' WHERE question_id = 'wrd07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'wrd07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because research should be private.' WHERE question_id = 'wrd07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because restoration should expand.' WHERE question_id = 'wrd08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical watersheds.' WHERE question_id = 'wrd08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'wrd08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'wrd08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'wrd08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because groundwater needs stricter limits.' WHERE question_id = 'wrd09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow regional flexibility.' WHERE question_id = 'wrd09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted regulation.' WHERE question_id = 'wrd09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep minimal rules.' WHERE question_id = 'wrd09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because groundwater should be state-controlled.' WHERE question_id = 'wrd09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural systems need more support.' WHERE question_id = 'wrd10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most underserved areas.' WHERE question_id = 'wrd10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'wrd10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current grants.' WHERE question_id = 'wrd10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'wrd10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- International Affairs (ia01-ia10)
-- ============================================
UPDATE question_options SET text = 'Yes—because aid should expand significantly.' WHERE question_id = 'ia01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic humanitarian needs.' WHERE question_id = 'ia01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'ia01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because aid should be reduced.' WHERE question_id = 'ia01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because arms sales should be restricted.' WHERE question_id = 'ia02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but limit only high-risk recipients.' WHERE question_id = 'ia02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'ia02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current policy.' WHERE question_id = 'ia02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sales should expand.' WHERE question_id = 'ia02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because diplomacy should be prioritized.' WHERE question_id = 'ia03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep strong safeguards.' WHERE question_id = 'ia03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—engage selectively.' WHERE question_id = 'ia03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited dialogue.' WHERE question_id = 'ia03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because engagement weakens leverage.' WHERE question_id = 'ia03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because democracy promotion is essential.' WHERE question_id = 'ia04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on partner countries.' WHERE question_id = 'ia04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited democracy efforts.' WHERE question_id = 'ia04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'ia04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because U.S. should not intervene.' WHERE question_id = 'ia04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong sanctions deter abuse.' WHERE question_id = 'ia05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major offenders.' WHERE question_id = 'ia05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—use sanctions selectively.' WHERE question_id = 'ia05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'ia05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sanctions should be reduced.' WHERE question_id = 'ia05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because global health funding should grow.' WHERE question_id = 'ia06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-impact programs.' WHERE question_id = 'ia06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ia06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ia06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because alliances are essential.' WHERE question_id = 'ia07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require shared responsibilities.' WHERE question_id = 'ia07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance alliances with national interests.' WHERE question_id = 'ia07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain key alliances.' WHERE question_id = 'ia07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because U.S. independence should dominate.' WHERE question_id = 'ia07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because involvement should be reduced.' WHERE question_id = 'ia08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain strategic commitments.' WHERE question_id = 'ia08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—reduce selectively.' WHERE question_id = 'ia08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'ia08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because involvement protects interests.' WHERE question_id = 'ia08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because humanitarian aid should expand.' WHERE question_id = 'ia09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target urgent crises.' WHERE question_id = 'ia09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ia09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ia09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because global agreements should expand.' WHERE question_id = 'ia10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key agreements.' WHERE question_id = 'ia10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—participate selectively.' WHERE question_id = 'ia10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited agreements.' WHERE question_id = 'ia10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because agreements limit sovereignty.' WHERE question_id = 'ia10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Labor and Employment (le01-le10)
-- ============================================
UPDATE question_options SET text = 'Yes—because a living wage should be mandated.' WHERE question_id = 'le01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase in gradually.' WHERE question_id = 'le01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, regional adjustments.' WHERE question_id = 'le01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow state decisions.' WHERE question_id = 'le01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because wages should be market-set.' WHERE question_id = 'le01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because gig workers should be employees.' WHERE question_id = 'le02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow flexibility.' WHERE question_id = 'le02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance protections and flexibility.' WHERE question_id = 'le02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary benefits.' WHERE question_id = 'le02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation is unnecessary.' WHERE question_id = 'le02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because safety enforcement should expand.' WHERE question_id = 'le03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk industries.' WHERE question_id = 'le03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'le03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current standards.' WHERE question_id = 'le03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulations should be reduced.' WHERE question_id = 'le03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because unions should be strengthened.' WHERE question_id = 'le04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with employer rights.' WHERE question_id = 'le04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited reforms.' WHERE question_id = 'le04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'le04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because union expansion is harmful.' WHERE question_id = 'le04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because paid sick leave should be mandatory.' WHERE question_id = 'le05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased implementation.' WHERE question_id = 'le05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited requirements.' WHERE question_id = 'le05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary policies.' WHERE question_id = 'le05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates harm employers.' WHERE question_id = 'le05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because training should expand widely.' WHERE question_id = 'le06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-demand skills.' WHERE question_id = 'le06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'le06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'le06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'le06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because most non-competes should be banned.' WHERE question_id = 'le07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow for executives only.' WHERE question_id = 'le07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—restrict in limited cases.' WHERE question_id = 'le07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but ensure transparency.' WHERE question_id = 'le07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because contracts should be enforced.' WHERE question_id = 'le07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because benefits should expand automatically.' WHERE question_id = 'le08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target longer downturns.' WHERE question_id = 'le08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansions.' WHERE question_id = 'le08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep benefits limited.' WHERE question_id = 'le08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expanded benefits discourage work.' WHERE question_id = 'le08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because enforcement should be strong.' WHERE question_id = 'le09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major violators.' WHERE question_id = 'le09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'le09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current enforcement.' WHERE question_id = 'le09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because enforcement should be reduced.' WHERE question_id = 'le09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because transparency should be mandatory.' WHERE question_id = 'le10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased adoption.' WHERE question_id = 'le10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited disclosure rules.' WHERE question_id = 'le10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary transparency.' WHERE question_id = 'le10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'le10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Law (l01-l10)
-- ============================================
UPDATE question_options SET text = 'Yes—because sentencing should be reduced broadly.' WHERE question_id = 'l01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'l01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'l01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current guidelines.' WHERE question_id = 'l01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sentencing should be tougher.' WHERE question_id = 'l01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access to counsel should expand.' WHERE question_id = 'l02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the poorest households.' WHERE question_id = 'l02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'l02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'l02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'l02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because more judgeships are needed.' WHERE question_id = 'l03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but add judges where backlogs are worst.' WHERE question_id = 'l03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'l03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'l03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'l03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because forfeiture should be heavily restricted.' WHERE question_id = 'l04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow for major criminal cases.' WHERE question_id = 'l04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate reforms.' WHERE question_id = 'l04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but add transparency.' WHERE question_id = 'l04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because forfeiture is necessary.' WHERE question_id = 'l04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because protections should be much stronger.' WHERE question_id = 'l05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major abuses.' WHERE question_id = 'l05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'l05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'l05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections are sufficient.' WHERE question_id = 'l05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because ADR should be widely expanded.' WHERE question_id = 'l06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target civil disputes.' WHERE question_id = 'l06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'l06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current options.' WHERE question_id = 'l06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'l06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because detention should be reduced broadly.' WHERE question_id = 'l07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-risk cases.' WHERE question_id = 'l07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'l07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited reforms.' WHERE question_id = 'l07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because detention should increase.' WHERE question_id = 'l07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because defense resources should expand.' WHERE question_id = 'l08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-caseload areas.' WHERE question_id = 'l08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'l08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'l08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'l08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because forced arbitration should be banned.' WHERE question_id = 'l09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited exceptions.' WHERE question_id = 'l09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'l09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'l09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because arbitration should remain.' WHERE question_id = 'l09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because expungement should be widely available.' WHERE question_id = 'l10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent cases.' WHERE question_id = 'l10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansion.' WHERE question_id = 'l10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'l10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expungement should be limited.' WHERE question_id = 'l10' AND value = 10 AND is_skip_option = false;

-- ============================================
-- Native Americans (na01-na10)
-- ============================================
UPDATE question_options SET text = 'Yes—because sovereignty should be strengthened.' WHERE question_id = 'na01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key legal gaps.' WHERE question_id = 'na01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited improvements.' WHERE question_id = 'na01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current policy.' WHERE question_id = 'na01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'na01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because major funding increases are needed.' WHERE question_id = 'na02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most underserved areas.' WHERE question_id = 'na02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'na02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'na02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'na02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because education funding should expand.' WHERE question_id = 'na03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical programs.' WHERE question_id = 'na03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'na03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support should shrink.' WHERE question_id = 'na03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because sacred sites need strong protection.' WHERE question_id = 'na04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk sites.' WHERE question_id = 'na04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'na04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'na04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because restrictions should be reduced.' WHERE question_id = 'na04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because authority should expand broadly.' WHERE question_id = 'na05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but pair with resources and oversight.' WHERE question_id = 'na05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current authority.' WHERE question_id = 'na05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'na05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because housing support should expand.' WHERE question_id = 'na06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target highest-need communities.' WHERE question_id = 'na06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'na06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current assistance.' WHERE question_id = 'na06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because assistance should be reduced.' WHERE question_id = 'na06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because consultation should be mandatory.' WHERE question_id = 'na07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-impact policies.' WHERE question_id = 'na07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted consultation.' WHERE question_id = 'na07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current practice.' WHERE question_id = 'na07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because additional requirements are unnecessary.' WHERE question_id = 'na07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because economic support should expand.' WHERE question_id = 'na08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical development needs.' WHERE question_id = 'na08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current grants.' WHERE question_id = 'na08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'na08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because infrastructure needs major investment.' WHERE question_id = 'na09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on highest-need projects.' WHERE question_id = 'na09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'na09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'na09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'na09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because language preservation should expand.' WHERE question_id = 'na10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target endangered languages.' WHERE question_id = 'na10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'na10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'na10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support is unnecessary.' WHERE question_id = 'na10' AND value = 10 AND is_skip_option = false;