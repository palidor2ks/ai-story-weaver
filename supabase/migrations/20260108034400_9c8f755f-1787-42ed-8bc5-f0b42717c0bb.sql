-- Insert Armed Forces and National Security questions (10 questions, maps to 'defense' topic)
-- Question IDs: arms01-arms10

INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
  ('arms01', 'defense', 'Should defense spending increase to address emerging global threats?', false, null),
  ('arms02', 'defense', 'Should the U.S. reduce its overseas military footprint?', false, null),
  ('arms03', 'defense', 'Should Congress require explicit authorization for most overseas deployments?', false, null),
  ('arms04', 'defense', 'Should cyber defense be a top funding priority within the Pentagon?', false, null),
  ('arms05', 'defense', 'Should the U.S. invest more in missile defense systems?', false, null),
  ('arms06', 'defense', 'Should military aid to foreign allies be expanded?', false, null),
  ('arms07', 'defense', 'Should the draft registration system be revised or expanded?', false, null),
  ('arms08', 'defense', 'Should veterans'' healthcare funding be increased?', false, null),
  ('arms09', 'defense', 'Should the military prioritize climate resilience planning?', false, null),
  ('arms10', 'defense', 'Should Congress limit the use of private military contractors?', false, null);

INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
  -- arms01
  ('arms01-opt-1', 'arms01', 'No—but shift funds to diplomacy and prevention.', -10, 1, false),
  ('arms01-opt-2', 'arms01', 'No—but maintain strong readiness with efficiency.', -5, 2, false),
  ('arms01-opt-3', 'arms01', 'Neutral—adjust spending based on threats.', 0, 3, false),
  ('arms01-opt-4', 'arms01', 'Yes—but target key readiness gaps.', 5, 4, false),
  ('arms01-opt-5', 'arms01', 'Yes—because major increases are needed.', 10, 5, false),
  ('arms01-skip', 'arms01', 'Not important to me', 0, 6, true),
  -- arms02
  ('arms02-opt-1', 'arms02', 'Yes—because overseas bases should be cut significantly.', -10, 1, false),
  ('arms02-opt-2', 'arms02', 'Yes—but keep key strategic bases.', -5, 2, false),
  ('arms02-opt-3', 'arms02', 'Neutral—reduce where appropriate, retain critical bases.', 0, 3, false),
  ('arms02-opt-4', 'arms02', 'No—but streamline some deployments.', 5, 4, false),
  ('arms02-opt-5', 'arms02', 'No—because presence deters threats.', 10, 5, false),
  ('arms02-skip', 'arms02', 'Not important to me', 0, 6, true),
  -- arms03
  ('arms03-opt-1', 'arms03', 'Yes—because Congress must authorize all deployments.', -10, 1, false),
  ('arms03-opt-2', 'arms03', 'Yes—but allow limited executive flexibility.', -5, 2, false),
  ('arms03-opt-3', 'arms03', 'Neutral—balance oversight and operational needs.', 0, 3, false),
  ('arms03-opt-4', 'arms03', 'No—but maintain current authorization framework.', 5, 4, false),
  ('arms03-opt-5', 'arms03', 'No—because the president needs flexibility.', 10, 5, false),
  ('arms03-skip', 'arms03', 'Not important to me', 0, 6, true),
  -- arms04
  ('arms04-opt-1', 'arms04', 'Yes—because cyber threats are central.', -10, 1, false),
  ('arms04-opt-2', 'arms04', 'Yes—but balance with other defense needs.', -5, 2, false),
  ('arms04-opt-3', 'arms04', 'Neutral—support moderate increases.', 0, 3, false),
  ('arms04-opt-4', 'arms04', 'No—but maintain current levels.', 5, 4, false),
  ('arms04-opt-5', 'arms04', 'No—because traditional defense should dominate.', 10, 5, false),
  ('arms04-skip', 'arms04', 'Not important to me', 0, 6, true),
  -- arms05
  ('arms05-opt-1', 'arms05', 'No—but prioritize diplomacy and arms control.', -10, 1, false),
  ('arms05-opt-2', 'arms05', 'No—but allow limited upgrades.', -5, 2, false),
  ('arms05-opt-3', 'arms05', 'Neutral—support targeted improvements.', 0, 3, false),
  ('arms05-opt-4', 'arms05', 'Yes—but focus on key threats.', 5, 4, false),
  ('arms05-opt-5', 'arms05', 'Yes—because major expansion is needed.', 10, 5, false),
  ('arms05-skip', 'arms05', 'Not important to me', 0, 6, true),
  -- arms06
  ('arms06-opt-1', 'arms06', 'No—but increase diplomatic support.', -10, 1, false),
  ('arms06-opt-2', 'arms06', 'No—but allow limited aid for defense.', -5, 2, false),
  ('arms06-opt-3', 'arms06', 'Neutral—provide aid selectively.', 0, 3, false),
  ('arms06-opt-4', 'arms06', 'Yes—but prioritize key allies.', 5, 4, false),
  ('arms06-opt-5', 'arms06', 'Yes—because expanded aid strengthens security.', 10, 5, false),
  ('arms06-skip', 'arms06', 'Not important to me', 0, 6, true),
  -- arms07
  ('arms07-opt-1', 'arms07', 'Yes—because registration should be abolished.', -10, 1, false),
  ('arms07-opt-2', 'arms07', 'Yes—but keep registration with reforms.', -5, 2, false),
  ('arms07-opt-3', 'arms07', 'Neutral—maintain current system with updates.', 0, 3, false),
  ('arms07-opt-4', 'arms07', 'No—but expand to include all genders.', 5, 4, false),
  ('arms07-opt-5', 'arms07', 'No—because the current system works.', 10, 5, false),
  ('arms07-skip', 'arms07', 'Not important to me', 0, 6, true),
  -- arms08
  ('arms08-opt-1', 'arms08', 'Yes—because veterans deserve expanded care.', -10, 1, false),
  ('arms08-opt-2', 'arms08', 'Yes—but target funding to gaps.', -5, 2, false),
  ('arms08-opt-3', 'arms08', 'Neutral—support modest increases.', 0, 3, false),
  ('arms08-opt-4', 'arms08', 'No—but improve efficiency.', 5, 4, false),
  ('arms08-opt-5', 'arms08', 'No—because private options should lead.', 10, 5, false),
  ('arms08-skip', 'arms08', 'Not important to me', 0, 6, true),
  -- arms09
  ('arms09-opt-1', 'arms09', 'Yes—because climate risks threaten readiness.', -10, 1, false),
  ('arms09-opt-2', 'arms09', 'Yes—but integrate with core missions.', -5, 2, false),
  ('arms09-opt-3', 'arms09', 'Neutral—address climate risks where relevant.', 0, 3, false),
  ('arms09-opt-4', 'arms09', 'No—but keep limited planning.', 5, 4, false),
  ('arms09-opt-5', 'arms09', 'No—because it distracts from readiness.', 10, 5, false),
  ('arms09-skip', 'arms09', 'Not important to me', 0, 6, true),
  -- arms10
  ('arms10-opt-1', 'arms10', 'Yes—because contractors should be sharply restricted.', -10, 1, false),
  ('arms10-opt-2', 'arms10', 'Yes—but allow limited use with oversight.', -5, 2, false),
  ('arms10-opt-3', 'arms10', 'Neutral—permit with strong oversight.', 0, 3, false),
  ('arms10-opt-4', 'arms10', 'No—but maintain transparency.', 5, 4, false),
  ('arms10-opt-5', 'arms10', 'No—because contractors add flexibility.', 10, 5, false),
  ('arms10-skip', 'arms10', 'Not important to me', 0, 6, true);