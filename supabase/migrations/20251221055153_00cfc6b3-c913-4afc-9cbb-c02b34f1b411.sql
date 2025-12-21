-- Add missing topics (PRD requires 14 total)
INSERT INTO topics (id, name, icon, weight) VALUES
  ('social-issues', 'Social Issues', '👥', 1),
  ('israel-palestine', 'Israel/Palestine', '🕊️', 1),
  ('domestic-policy', 'Domestic Policy', '🏠', 1),
  ('government-reform', 'Government Reform', '⚖️', 1),
  ('electoral-reform', 'Electoral Reform', '🗳️', 1),
  ('china-taiwan', 'China/Taiwan Conflict', '🌏', 1)
ON CONFLICT (id) DO NOTHING;

-- Add canonical onboarding question fields to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_onboarding_canonical BOOLEAN DEFAULT false;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS onboarding_slot INTEGER DEFAULT NULL;

-- Add coverage tier enum and field to candidates
DO $$ BEGIN
    CREATE TYPE coverage_tier AS ENUM ('tier_1', 'tier_2', 'tier_3');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS coverage_tier coverage_tier DEFAULT 'tier_3';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_incumbent BOOLEAN DEFAULT true;

-- Change scores to use decimal precision (numeric type)
ALTER TABLE profiles ALTER COLUMN overall_score TYPE NUMERIC(5,2) USING overall_score::numeric(5,2);
ALTER TABLE candidates ALTER COLUMN overall_score TYPE NUMERIC(5,2) USING overall_score::numeric(5,2);
ALTER TABLE candidate_topic_scores ALTER COLUMN score TYPE NUMERIC(5,2) USING score::numeric(5,2);
ALTER TABLE user_topic_scores ALTER COLUMN score TYPE NUMERIC(5,2) USING score::numeric(5,2);

-- Add confidence level enum and field for candidates
DO $$ BEGIN
    CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS confidence confidence_level DEFAULT 'medium';

-- Add score version tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS score_version TEXT DEFAULT 'v1.0';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score_version TEXT DEFAULT 'v1.0';

-- Update existing candidates to have coverage tier based on available data
UPDATE candidates SET coverage_tier = 'tier_1' WHERE id IN (
  SELECT DISTINCT candidate_id FROM donors
);

-- Mark existing questions as canonical and assign slots (2 per topic)
-- We'll update economy questions
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q1';
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'q2';

-- Healthcare
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q3';

-- Immigration
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q4';

-- Environment
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q5';

-- Education
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q6';

-- Gun Policy
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q7';

-- Criminal Justice
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'q8';

-- Insert additional canonical questions to ensure 2 per topic
INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
  ('q9', 'healthcare', 'The government should negotiate lower drug prices directly with pharmaceutical companies.', true, 2),
  ('q10', 'immigration', 'Border security should be strengthened before addressing immigration reform.', true, 2),
  ('q11', 'environment', 'The U.S. should rejoin and strengthen international climate agreements.', true, 2),
  ('q12', 'education', 'Parents should have more choice in where to send their children to school, including private schools.', true, 2),
  ('q13', 'gun-policy', 'Assault-style weapons should be banned for civilian use.', true, 2),
  ('q14', 'criminal-justice', 'Non-violent drug offenders should receive treatment instead of prison sentences.', true, 2),
  ('q15', 'civil-rights', 'Affirmative action policies are necessary to address historical discrimination.', true, 1),
  ('q16', 'civil-rights', 'Religious organizations should be exempt from anti-discrimination laws.', true, 2),
  ('q17', 'technology', 'Large tech companies should be broken up to prevent monopolistic behavior.', true, 1),
  ('q18', 'technology', 'The government should regulate artificial intelligence development.', true, 2),
  ('q19', 'foreign-policy', 'The U.S. should reduce military spending and focus on domestic issues.', true, 1),
  ('q20', 'foreign-policy', 'The U.S. should maintain strong alliances with NATO countries.', true, 2),
  ('q21', 'social-issues', 'Marriage should be defined as between a man and a woman.', true, 1),
  ('q22', 'social-issues', 'Transgender individuals should be able to use the bathroom of their choice.', true, 2),
  ('q23', 'israel-palestine', 'The U.S. should continue providing military aid to Israel.', true, 1),
  ('q24', 'israel-palestine', 'The U.S. should push for a two-state solution in the Israeli-Palestinian conflict.', true, 2),
  ('q25', 'domestic-policy', 'The federal government has too much power over state and local matters.', true, 1),
  ('q26', 'domestic-policy', 'Social Security benefits should be expanded.', true, 2),
  ('q27', 'government-reform', 'Term limits should be imposed on members of Congress.', true, 1),
  ('q28', 'government-reform', 'Campaign finance laws should be stricter to reduce money in politics.', true, 2),
  ('q29', 'electoral-reform', 'The Electoral College should be replaced with a national popular vote.', true, 1),
  ('q30', 'electoral-reform', 'Voter ID laws are necessary to prevent election fraud.', true, 2),
  ('q31', 'china-taiwan', 'The U.S. should defend Taiwan militarily if China invades.', true, 1),
  ('q32', 'china-taiwan', 'The U.S. should reduce economic dependence on China.', true, 2)
ON CONFLICT (id) DO UPDATE SET 
  is_onboarding_canonical = EXCLUDED.is_onboarding_canonical,
  onboarding_slot = EXCLUDED.onboarding_slot;

-- Insert question options for new questions
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  -- q9 - Healthcare drug prices
  ('q9-o1', 'q9', 'Strongly Agree', 10, 1),
  ('q9-o2', 'q9', 'Agree', 5, 2),
  ('q9-o3', 'q9', 'Disagree', -5, 3),
  ('q9-o4', 'q9', 'Strongly Disagree', -10, 4),
  -- q10 - Immigration border security
  ('q10-o1', 'q10', 'Strongly Agree', -10, 1),
  ('q10-o2', 'q10', 'Agree', -5, 2),
  ('q10-o3', 'q10', 'Disagree', 5, 3),
  ('q10-o4', 'q10', 'Strongly Disagree', 10, 4),
  -- q11 - Environment climate agreements
  ('q11-o1', 'q11', 'Strongly Agree', 10, 1),
  ('q11-o2', 'q11', 'Agree', 5, 2),
  ('q11-o3', 'q11', 'Disagree', -5, 3),
  ('q11-o4', 'q11', 'Strongly Disagree', -10, 4),
  -- q12 - Education school choice
  ('q12-o1', 'q12', 'Strongly Agree', -10, 1),
  ('q12-o2', 'q12', 'Agree', -5, 2),
  ('q12-o3', 'q12', 'Disagree', 5, 3),
  ('q12-o4', 'q12', 'Strongly Disagree', 10, 4),
  -- q13 - Gun policy assault weapons
  ('q13-o1', 'q13', 'Strongly Agree', 10, 1),
  ('q13-o2', 'q13', 'Agree', 5, 2),
  ('q13-o3', 'q13', 'Disagree', -5, 3),
  ('q13-o4', 'q13', 'Strongly Disagree', -10, 4),
  -- q14 - Criminal justice drug treatment
  ('q14-o1', 'q14', 'Strongly Agree', 10, 1),
  ('q14-o2', 'q14', 'Agree', 5, 2),
  ('q14-o3', 'q14', 'Disagree', -5, 3),
  ('q14-o4', 'q14', 'Strongly Disagree', -10, 4),
  -- q15 - Civil rights affirmative action
  ('q15-o1', 'q15', 'Strongly Agree', 10, 1),
  ('q15-o2', 'q15', 'Agree', 5, 2),
  ('q15-o3', 'q15', 'Disagree', -5, 3),
  ('q15-o4', 'q15', 'Strongly Disagree', -10, 4),
  -- q16 - Civil rights religious exemptions
  ('q16-o1', 'q16', 'Strongly Agree', -10, 1),
  ('q16-o2', 'q16', 'Agree', -5, 2),
  ('q16-o3', 'q16', 'Disagree', 5, 3),
  ('q16-o4', 'q16', 'Strongly Disagree', 10, 4),
  -- q17 - Technology break up tech
  ('q17-o1', 'q17', 'Strongly Agree', 10, 1),
  ('q17-o2', 'q17', 'Agree', 5, 2),
  ('q17-o3', 'q17', 'Disagree', -5, 3),
  ('q17-o4', 'q17', 'Strongly Disagree', -10, 4),
  -- q18 - Technology AI regulation
  ('q18-o1', 'q18', 'Strongly Agree', 5, 1),
  ('q18-o2', 'q18', 'Agree', 3, 2),
  ('q18-o3', 'q18', 'Disagree', -3, 3),
  ('q18-o4', 'q18', 'Strongly Disagree', -5, 4),
  -- q19 - Foreign policy reduce military
  ('q19-o1', 'q19', 'Strongly Agree', 10, 1),
  ('q19-o2', 'q19', 'Agree', 5, 2),
  ('q19-o3', 'q19', 'Disagree', -5, 3),
  ('q19-o4', 'q19', 'Strongly Disagree', -10, 4),
  -- q20 - Foreign policy NATO
  ('q20-o1', 'q20', 'Strongly Agree', 5, 1),
  ('q20-o2', 'q20', 'Agree', 3, 2),
  ('q20-o3', 'q20', 'Disagree', -3, 3),
  ('q20-o4', 'q20', 'Strongly Disagree', -5, 4),
  -- q21 - Social issues marriage
  ('q21-o1', 'q21', 'Strongly Agree', -10, 1),
  ('q21-o2', 'q21', 'Agree', -5, 2),
  ('q21-o3', 'q21', 'Disagree', 5, 3),
  ('q21-o4', 'q21', 'Strongly Disagree', 10, 4),
  -- q22 - Social issues transgender
  ('q22-o1', 'q22', 'Strongly Agree', 10, 1),
  ('q22-o2', 'q22', 'Agree', 5, 2),
  ('q22-o3', 'q22', 'Disagree', -5, 3),
  ('q22-o4', 'q22', 'Strongly Disagree', -10, 4),
  -- q23 - Israel military aid
  ('q23-o1', 'q23', 'Strongly Agree', -5, 1),
  ('q23-o2', 'q23', 'Agree', -3, 2),
  ('q23-o3', 'q23', 'Disagree', 3, 3),
  ('q23-o4', 'q23', 'Strongly Disagree', 5, 4),
  -- q24 - Israel two-state
  ('q24-o1', 'q24', 'Strongly Agree', 5, 1),
  ('q24-o2', 'q24', 'Agree', 3, 2),
  ('q24-o3', 'q24', 'Disagree', -3, 3),
  ('q24-o4', 'q24', 'Strongly Disagree', -5, 4),
  -- q25 - Domestic policy federal power
  ('q25-o1', 'q25', 'Strongly Agree', -10, 1),
  ('q25-o2', 'q25', 'Agree', -5, 2),
  ('q25-o3', 'q25', 'Disagree', 5, 3),
  ('q25-o4', 'q25', 'Strongly Disagree', 10, 4),
  -- q26 - Domestic policy social security
  ('q26-o1', 'q26', 'Strongly Agree', 10, 1),
  ('q26-o2', 'q26', 'Agree', 5, 2),
  ('q26-o3', 'q26', 'Disagree', -5, 3),
  ('q26-o4', 'q26', 'Strongly Disagree', -10, 4),
  -- q27 - Government reform term limits
  ('q27-o1', 'q27', 'Strongly Agree', 0, 1),
  ('q27-o2', 'q27', 'Agree', 0, 2),
  ('q27-o3', 'q27', 'Disagree', 0, 3),
  ('q27-o4', 'q27', 'Strongly Disagree', 0, 4),
  -- q28 - Government reform campaign finance
  ('q28-o1', 'q28', 'Strongly Agree', 10, 1),
  ('q28-o2', 'q28', 'Agree', 5, 2),
  ('q28-o3', 'q28', 'Disagree', -5, 3),
  ('q28-o4', 'q28', 'Strongly Disagree', -10, 4),
  -- q29 - Electoral reform electoral college
  ('q29-o1', 'q29', 'Strongly Agree', 10, 1),
  ('q29-o2', 'q29', 'Agree', 5, 2),
  ('q29-o3', 'q29', 'Disagree', -5, 3),
  ('q29-o4', 'q29', 'Strongly Disagree', -10, 4),
  -- q30 - Electoral reform voter ID
  ('q30-o1', 'q30', 'Strongly Agree', -10, 1),
  ('q30-o2', 'q30', 'Agree', -5, 2),
  ('q30-o3', 'q30', 'Disagree', 5, 3),
  ('q30-o4', 'q30', 'Strongly Disagree', 10, 4),
  -- q31 - China/Taiwan defend Taiwan
  ('q31-o1', 'q31', 'Strongly Agree', 0, 1),
  ('q31-o2', 'q31', 'Agree', 0, 2),
  ('q31-o3', 'q31', 'Disagree', 0, 3),
  ('q31-o4', 'q31', 'Strongly Disagree', 0, 4),
  -- q32 - China/Taiwan reduce dependence
  ('q32-o1', 'q32', 'Strongly Agree', -3, 1),
  ('q32-o2', 'q32', 'Agree', -2, 2),
  ('q32-o3', 'q32', 'Disagree', 2, 3),
  ('q32-o4', 'q32', 'Strongly Disagree', 3, 4)
ON CONFLICT (id) DO NOTHING;