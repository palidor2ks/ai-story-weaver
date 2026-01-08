-- Insert Animals questions (10 questions, maps to 'environment' topic)
-- Question IDs: anim01-anim10

INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
  ('anim01', 'environment', 'Should the federal government strengthen animal cruelty laws nationwide?', false, null),
  ('anim02', 'environment', 'Should commercial breeding facilities face stricter federal regulations?', false, null),
  ('anim03', 'environment', 'Should animal testing be phased out where alternatives exist?', false, null),
  ('anim04', 'environment', 'Should the U.S. ban the trade of certain exotic animals as pets?', false, null),
  ('anim05', 'environment', 'Should federal law require larger space standards for farm animals?', false, null),
  ('anim06', 'environment', 'Should wildlife trafficking penalties be increased?', false, null),
  ('anim07', 'environment', 'Should the government fund more wildlife conservation programs?', false, null),
  ('anim08', 'environment', 'Should marine mammal captivity be restricted by federal law?', false, null),
  ('anim09', 'environment', 'Should federal agencies regulate the use of animals in entertainment?', false, null),
  ('anim10', 'environment', 'Should the government expand protections for endangered species habitats?', false, null);

INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
  -- anim01
  ('anim01-opt-1', 'anim01', 'Yes—because strong national standards protect animals.', -10, 1, false),
  ('anim01-opt-2', 'anim01', 'Yes—but allow states some flexibility.', -5, 2, false),
  ('anim01-opt-3', 'anim01', 'Neutral—support moderate national standards.', 0, 3, false),
  ('anim01-opt-4', 'anim01', 'No—but maintain current protections.', 5, 4, false),
  ('anim01-opt-5', 'anim01', 'No—because states should decide.', 10, 5, false),
  ('anim01-skip', 'anim01', 'Not important to me', 0, 6, true),
  -- anim02
  ('anim02-opt-1', 'anim02', 'Yes—because animal welfare requires strong oversight.', -10, 1, false),
  ('anim02-opt-2', 'anim02', 'Yes—but focus on problem facilities.', -5, 2, false),
  ('anim02-opt-3', 'anim02', 'Neutral—support moderate, targeted rules.', 0, 3, false),
  ('anim02-opt-4', 'anim02', 'No—but maintain baseline standards.', 5, 4, false),
  ('anim02-opt-5', 'anim02', 'No—because federal regulation should be limited.', 10, 5, false),
  ('anim02-skip', 'anim02', 'Not important to me', 0, 6, true),
  -- anim03
  ('anim03-opt-1', 'anim03', 'Yes—because alternatives should replace animal testing quickly.', -10, 1, false),
  ('anim03-opt-2', 'anim03', 'Yes—but phase out only when proven alternatives exist.', -5, 2, false),
  ('anim03-opt-3', 'anim03', 'Neutral—allow limited testing when necessary.', 0, 3, false),
  ('anim03-opt-4', 'anim03', 'No—but encourage alternatives voluntarily.', 5, 4, false),
  ('anim03-opt-5', 'anim03', 'No—because regulation should not restrict research.', 10, 5, false),
  ('anim03-skip', 'anim03', 'Not important to me', 0, 6, true),
  -- anim04
  ('anim04-opt-1', 'anim04', 'Yes—because exotic pet trade harms wildlife.', -10, 1, false),
  ('anim04-opt-2', 'anim04', 'Yes—but focus on high-risk species.', -5, 2, false),
  ('anim04-opt-3', 'anim04', 'Neutral—allow trade with strict permits.', 0, 3, false),
  ('anim04-opt-4', 'anim04', 'No—but keep limited federal oversight.', 5, 4, false),
  ('anim04-opt-5', 'anim04', 'No—because trade should be unrestricted.', 10, 5, false),
  ('anim04-skip', 'anim04', 'Not important to me', 0, 6, true),
  -- anim05
  ('anim05-opt-1', 'anim05', 'Yes—because humane space should be mandated.', -10, 1, false),
  ('anim05-opt-2', 'anim05', 'Yes—but allow phased compliance.', -5, 2, false),
  ('anim05-opt-3', 'anim05', 'Neutral—support moderate standards with flexibility.', 0, 3, false),
  ('anim05-opt-4', 'anim05', 'No—but maintain baseline standards.', 5, 4, false),
  ('anim05-opt-5', 'anim05', 'No—because federal mandates are unnecessary.', 10, 5, false),
  ('anim05-skip', 'anim05', 'Not important to me', 0, 6, true),
  -- anim06
  ('anim06-opt-1', 'anim06', 'Yes—because trafficking requires strong deterrence.', -10, 1, false),
  ('anim06-opt-2', 'anim06', 'Yes—but focus on major offenders.', -5, 2, false),
  ('anim06-opt-3', 'anim06', 'Neutral—support modest penalty increases.', 0, 3, false),
  ('anim06-opt-4', 'anim06', 'No—but keep current penalties.', 5, 4, false),
  ('anim06-opt-5', 'anim06', 'No—because penalties are already sufficient.', 10, 5, false),
  ('anim06-skip', 'anim06', 'Not important to me', 0, 6, true),
  -- anim07
  ('anim07-opt-1', 'anim07', 'Yes—because conservation is a federal responsibility.', -10, 1, false),
  ('anim07-opt-2', 'anim07', 'Yes—but target funds to critical habitats.', -5, 2, false),
  ('anim07-opt-3', 'anim07', 'Neutral—support limited, targeted increases.', 0, 3, false),
  ('anim07-opt-4', 'anim07', 'No—but maintain current funding.', 5, 4, false),
  ('anim07-opt-5', 'anim07', 'No—because conservation should be private.', 10, 5, false),
  ('anim07-skip', 'anim07', 'Not important to me', 0, 6, true),
  -- anim08
  ('anim08-opt-1', 'anim08', 'Yes—because captivity harms animal welfare.', -10, 1, false),
  ('anim08-opt-2', 'anim08', 'Yes—but allow limited exceptions.', -5, 2, false),
  ('anim08-opt-3', 'anim08', 'Neutral—permit with strict welfare standards.', 0, 3, false),
  ('anim08-opt-4', 'anim08', 'No—but maintain basic rules.', 5, 4, false),
  ('anim08-opt-5', 'anim08', 'No—because federal restrictions are unnecessary.', 10, 5, false),
  ('anim08-skip', 'anim08', 'Not important to me', 0, 6, true),
  -- anim09
  ('anim09-opt-1', 'anim09', 'Yes—because entertainment should not harm animals.', -10, 1, false),
  ('anim09-opt-2', 'anim09', 'Yes—but focus on high-risk uses.', -5, 2, false),
  ('anim09-opt-3', 'anim09', 'Neutral—support moderate oversight.', 0, 3, false),
  ('anim09-opt-4', 'anim09', 'No—but maintain basic rules.', 5, 4, false),
  ('anim09-opt-5', 'anim09', 'No—because federal regulation is unnecessary.', 10, 5, false),
  ('anim09-skip', 'anim09', 'Not important to me', 0, 6, true),
  -- anim10
  ('anim10-opt-1', 'anim10', 'Yes—because habitat protection should expand.', -10, 1, false),
  ('anim10-opt-2', 'anim10', 'Yes—but focus on most critical habitats.', -5, 2, false),
  ('anim10-opt-3', 'anim10', 'Neutral—support targeted protections.', 0, 3, false),
  ('anim10-opt-4', 'anim10', 'No—but maintain current protections.', 5, 4, false),
  ('anim10-opt-5', 'anim10', 'No—because federal protections should be reduced.', 10, 5, false),
  ('anim10-skip', 'anim10', 'Not important to me', 0, 6, true);