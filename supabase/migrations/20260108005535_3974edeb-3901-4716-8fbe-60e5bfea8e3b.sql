-- Clean up old answer data and insert new topics
DELETE FROM question_update_notifications;
DELETE FROM quiz_answers;
DELETE FROM candidate_answers;
DELETE FROM party_answers;
DELETE FROM user_topic_scores;
DELETE FROM user_topics;
UPDATE profiles SET overall_score = NULL;
DELETE FROM question_options;
DELETE FROM questions;
DELETE FROM topics;

-- Insert new 32 topics
INSERT INTO topics (id, name, icon, weight) VALUES
  ('agriculture-and-food', 'Agriculture and Food', '🌾', 1),
  ('animals', 'Animals', '🐾', 1),
  ('armed-forces-national-security', 'Armed Forces and National Security', '🎖️', 1),
  ('arts-culture-religion', 'Arts, Culture, Religion', '🎭', 1),
  ('civil-rights-liberties', 'Civil Rights and Liberties, Minority Issues', '⚖️', 1),
  ('commerce', 'Commerce', '🏪', 1),
  ('congress', 'Congress', '🏛️', 1),
  ('crime-law-enforcement', 'Crime and Law Enforcement', '🚔', 1),
  ('economics-public-finance', 'Economics and Public Finance', '📊', 1),
  ('education', 'Education', '📚', 1),
  ('emergency-management', 'Emergency Management', '🚨', 1),
  ('energy', 'Energy', '⚡', 1),
  ('environmental-protection', 'Environmental Protection', '🌍', 1),
  ('families', 'Families', '👨‍👩‍👧', 1),
  ('finance-financial-sector', 'Finance and Financial Sector', '🏦', 1),
  ('foreign-trade-international-finance', 'Foreign Trade and International Finance', '🚢', 1),
  ('government-operations-politics', 'Government Operations and Politics', '🗳️', 1),
  ('health', 'Health', '🏥', 1),
  ('housing-community-development', 'Housing and Community Development', '🏘️', 1),
  ('immigration', 'Immigration', '🛂', 1),
  ('international-affairs', 'International Affairs', '🌐', 1),
  ('labor-employment', 'Labor and Employment', '👷', 1),
  ('law', 'Law', '📜', 1),
  ('native-americans', 'Native Americans', '🪶', 1),
  ('public-lands-natural-resources', 'Public Lands and Natural Resources', '🏞️', 1),
  ('science-technology-communications', 'Science, Technology, Communications', '🔬', 1),
  ('social-sciences-history', 'Social Sciences and History', '📖', 1),
  ('social-welfare', 'Social Welfare', '🤝', 1),
  ('sports-recreation', 'Sports and Recreation', '⚽', 1),
  ('taxation', 'Taxation', '💵', 1),
  ('transportation-public-works', 'Transportation and Public Works', '🚇', 1),
  ('water-resources-development', 'Water Resources Development', '💧', 1);