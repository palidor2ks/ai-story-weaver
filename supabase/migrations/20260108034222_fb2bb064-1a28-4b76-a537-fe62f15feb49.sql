-- Insert Agriculture and Food questions (10 questions, maps to 'environment' topic)
-- Question IDs: agri01-agri10

INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
  ('agri01', 'environment', 'Should the federal government expand subsidies for sustainable farming practices?', false, null),
  ('agri02', 'environment', 'Should crop insurance programs be increased to protect small farmers from climate risks?', false, null),
  ('agri03', 'environment', 'Should the government limit the use of certain pesticides linked to health risks?', false, null),
  ('agri04', 'environment', 'Should federal nutrition assistance benefits be increased to address food insecurity?', false, null),
  ('agri05', 'environment', 'Should the U.S. prioritize domestic food production over imports?', false, null),
  ('agri06', 'environment', 'Should the government encourage more local and regional food supply chains?', false, null),
  ('agri07', 'environment', 'Should genetically modified crops face stricter federal labeling requirements?', false, null),
  ('agri08', 'environment', 'Should federal grants prioritize regenerative agriculture research?', false, null),
  ('agri09', 'environment', 'Should the government increase oversight of meatpacking industry safety?', false, null),
  ('agri10', 'environment', 'Should federal policy reduce food waste through national standards?', false, null);

-- Insert answer options for each question
INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
  -- agri01
  ('agri01-opt-1', 'agri01', 'Yes—because rapid scaling of sustainable farming is urgent.', -10, 1, false),
  ('agri01-opt-2', 'agri01', 'Yes—but prioritize support for small and sustainable farms.', -5, 2, false),
  ('agri01-opt-3', 'agri01', 'Neutral—support targeted incentives without major expansion.', 0, 3, false),
  ('agri01-opt-4', 'agri01', 'No—but allow limited incentives where cost-effective.', 5, 4, false),
  ('agri01-opt-5', 'agri01', 'No—because subsidies should be minimized.', 10, 5, false),
  ('agri01-skip', 'agri01', 'Not important to me', 0, 6, true),
  -- agri02
  ('agri02-opt-1', 'agri02', 'Yes—because climate shocks require strong federal protection.', -10, 1, false),
  ('agri02-opt-2', 'agri02', 'Yes—but focus increases on small farms.', -5, 2, false),
  ('agri02-opt-3', 'agri02', 'Neutral—support modest, targeted adjustments.', 0, 3, false),
  ('agri02-opt-4', 'agri02', 'No—but maintain current protections.', 5, 4, false),
  ('agri02-opt-5', 'agri02', 'No—because insurance should be private.', 10, 5, false),
  ('agri02-skip', 'agri02', 'Not important to me', 0, 6, true),
  -- agri03
  ('agri03-opt-1', 'agri03', 'Yes—because public health should override industry use.', -10, 1, false),
  ('agri03-opt-2', 'agri03', 'Yes—but only for clearly high-risk chemicals.', -5, 2, false),
  ('agri03-opt-3', 'agri03', 'Neutral—limit only when evidence is strong.', 0, 3, false),
  ('agri03-opt-4', 'agri03', 'No—but prefer voluntary guidelines.', 5, 4, false),
  ('agri03-opt-5', 'agri03', 'No—because regulation should be minimal.', 10, 5, false),
  ('agri03-skip', 'agri03', 'Not important to me', 0, 6, true),
  -- agri04
  ('agri04-opt-1', 'agri04', 'Yes—because hunger prevention is a core federal role.', -10, 1, false),
  ('agri04-opt-2', 'agri04', 'Yes—but target benefits to those most in need.', -5, 2, false),
  ('agri04-opt-3', 'agri04', 'Neutral—support modest, targeted increases.', 0, 3, false),
  ('agri04-opt-4', 'agri04', 'No—but maintain current benefit levels.', 5, 4, false),
  ('agri04-opt-5', 'agri04', 'No—because benefits should be reduced.', 10, 5, false),
  ('agri04-skip', 'agri04', 'Not important to me', 0, 6, true),
  -- agri05
  ('agri05-opt-1', 'agri05', 'Yes—because food security should be national.', -10, 1, false),
  ('agri05-opt-2', 'agri05', 'Yes—but allow imports where needed.', -5, 2, false),
  ('agri05-opt-3', 'agri05', 'Neutral—balance domestic and trade sources.', 0, 3, false),
  ('agri05-opt-4', 'agri05', 'No—but ensure fair trade rules.', 5, 4, false),
  ('agri05-opt-5', 'agri05', 'No—because markets should decide sourcing.', 10, 5, false),
  ('agri05-skip', 'agri05', 'Not important to me', 0, 6, true),
  -- agri06
  ('agri06-opt-1', 'agri06', 'Yes—because resilient local systems are essential.', -10, 1, false),
  ('agri06-opt-2', 'agri06', 'Yes—but keep incentives targeted.', -5, 2, false),
  ('agri06-opt-3', 'agri06', 'Neutral—support only where cost-effective.', 0, 3, false),
  ('agri06-opt-4', 'agri06', 'No—but allow limited local grants.', 5, 4, false),
  ('agri06-opt-5', 'agri06', 'No—because supply chains should be private.', 10, 5, false),
  ('agri06-skip', 'agri06', 'Not important to me', 0, 6, true),
  -- agri07
  ('agri07-opt-1', 'agri07', 'Yes—because consumers deserve full transparency.', -10, 1, false),
  ('agri07-opt-2', 'agri07', 'Yes—but focus on clear, practical labels.', -5, 2, false),
  ('agri07-opt-3', 'agri07', 'Neutral—require labeling only where differences matter.', 0, 3, false),
  ('agri07-opt-4', 'agri07', 'No—but allow voluntary labeling.', 5, 4, false),
  ('agri07-opt-5', 'agri07', 'No—because special labels are unnecessary.', 10, 5, false),
  ('agri07-skip', 'agri07', 'Not important to me', 0, 6, true),
  -- agri08
  ('agri08-opt-1', 'agri08', 'Yes—because regenerative agriculture is critical.', -10, 1, false),
  ('agri08-opt-2', 'agri08', 'Yes—but focus on scalable methods.', -5, 2, false),
  ('agri08-opt-3', 'agri08', 'Neutral—support limited research funding.', 0, 3, false),
  ('agri08-opt-4', 'agri08', 'No—but allow private sector leadership.', 5, 4, false),
  ('agri08-opt-5', 'agri08', 'No—because federal grants should shrink.', 10, 5, false),
  ('agri08-skip', 'agri08', 'Not important to me', 0, 6, true),
  -- agri09
  ('agri09-opt-1', 'agri09', 'Yes—because worker and food safety need strict enforcement.', -10, 1, false),
  ('agri09-opt-2', 'agri09', 'Yes—but focus on high-risk facilities.', -5, 2, false),
  ('agri09-opt-3', 'agri09', 'Neutral—maintain current oversight with improvements.', 0, 3, false),
  ('agri09-opt-4', 'agri09', 'No—but keep essential inspections.', 5, 4, false),
  ('agri09-opt-5', 'agri09', 'No—because oversight is too burdensome.', 10, 5, false),
  ('agri09-skip', 'agri09', 'Not important to me', 0, 6, true),
  -- agri10
  ('agri10-opt-1', 'agri10', 'Yes—because waste reduction should be a national priority.', -10, 1, false),
  ('agri10-opt-2', 'agri10', 'Yes—but combine standards with incentives.', -5, 2, false),
  ('agri10-opt-3', 'agri10', 'Neutral—prefer voluntary programs with limited standards.', 0, 3, false),
  ('agri10-opt-4', 'agri10', 'No—but encourage private initiatives.', 5, 4, false),
  ('agri10-opt-5', 'agri10', 'No—because federal standards are unnecessary.', 10, 5, false),
  ('agri10-skip', 'agri10', 'Not important to me', 0, 6, true);