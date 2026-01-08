-- ================================================================
-- TOPIC CONSOLIDATION: 32 → 10 Topics
-- ================================================================

-- 1. Create legacy mapping table (preserves Congress.gov vote syncing)
CREATE TABLE IF NOT EXISTS topic_legacy_mapping (
  legacy_topic_id TEXT PRIMARY KEY,
  new_topic_id TEXT NOT NULL
);

-- 2. Insert new 10 consolidated topics
INSERT INTO topics (id, name, icon, weight) VALUES
  ('economy', 'Economy & Jobs', '💼', 1),
  ('healthcare', 'Healthcare', '🏥', 1),
  ('environment', 'Environment & Energy', '🌍', 1),
  ('defense', 'Defense & Foreign Policy', '🌐', 1),
  ('civil-rights', 'Civil Rights & Justice', '⚖️', 1),
  ('social-programs', 'Social Programs', '🤝', 1),
  ('government', 'Government & Democracy', '🏛️', 1),
  ('technology', 'Technology & Science', '🔬', 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon;

-- Note: 'immigration' and 'education' already exist with same IDs, just update their names
UPDATE topics SET name = 'Immigration', icon = '🛂' WHERE id = 'immigration';
UPDATE topics SET name = 'Education', icon = '📚' WHERE id = 'education';

-- 3. Create legacy mappings (32 old → 10 new)
-- Economy & Jobs
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('economics-public-finance', 'economy'),
  ('labor-employment', 'economy'),
  ('taxation', 'economy'),
  ('commerce', 'economy'),
  ('finance-financial-sector', 'economy'),
  ('transportation-public-works', 'economy')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Healthcare
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('health', 'healthcare'),
  ('families', 'healthcare')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Environment & Energy
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('energy', 'environment'),
  ('environmental-protection', 'environment'),
  ('water-resources-development', 'environment'),
  ('public-lands-natural-resources', 'environment'),
  ('animals', 'environment'),
  ('agriculture-and-food', 'environment')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Immigration (already exists, just map it)
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('immigration', 'immigration')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Defense & Foreign Policy
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('armed-forces-national-security', 'defense'),
  ('international-affairs', 'defense'),
  ('foreign-trade-international-finance', 'defense')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Civil Rights & Justice (includes arts-culture-religion, sports-recreation)
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('civil-rights-liberties', 'civil-rights'),
  ('crime-law-enforcement', 'civil-rights'),
  ('law', 'civil-rights'),
  ('native-americans', 'civil-rights'),
  ('arts-culture-religion', 'civil-rights'),
  ('sports-recreation', 'civil-rights')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Education (includes social-sciences-history)
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('education', 'education'),
  ('social-sciences-history', 'education')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Social Programs
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('social-welfare', 'social-programs'),
  ('housing-community-development', 'social-programs')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Government & Democracy
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('congress', 'government'),
  ('government-operations-politics', 'government'),
  ('emergency-management', 'government')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- Technology & Science
INSERT INTO topic_legacy_mapping (legacy_topic_id, new_topic_id) VALUES
  ('science-technology-communications', 'technology')
ON CONFLICT (legacy_topic_id) DO UPDATE SET new_topic_id = EXCLUDED.new_topic_id;

-- 4. Update all questions to new topic IDs
UPDATE questions q
SET topic_id = m.new_topic_id
FROM topic_legacy_mapping m
WHERE q.topic_id = m.legacy_topic_id;

-- 5. Clear old onboarding flags
UPDATE questions SET is_onboarding_canonical = false, onboarding_slot = NULL;

-- 6. Delete old topics (they're now mapped in topic_legacy_mapping)
DELETE FROM topics WHERE id IN (
  'economics-public-finance', 'labor-employment', 'taxation', 'commerce', 
  'finance-financial-sector', 'transportation-public-works', 'health', 'families',
  'energy', 'environmental-protection', 'water-resources-development', 
  'public-lands-natural-resources', 'animals', 'agriculture-and-food',
  'armed-forces-national-security', 'international-affairs', 'foreign-trade-international-finance',
  'civil-rights-liberties', 'crime-law-enforcement', 'law', 'native-americans',
  'arts-culture-religion', 'sports-recreation', 'social-sciences-history',
  'social-welfare', 'housing-community-development', 'congress', 
  'government-operations-politics', 'emergency-management', 
  'science-technology-communications'
);

-- 7. Set new onboarding canonical questions (20 total, 2 per topic) using subqueries
-- Economy & Jobs
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'economy' AND text ILIKE '%minimum wage%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'economy' AND text ILIKE '%tax%' AND is_onboarding_canonical = false LIMIT 1);

-- Healthcare
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 3 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'healthcare' AND text ILIKE '%public health insurance%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 4 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'healthcare' AND text ILIKE '%abortion%' AND is_onboarding_canonical = false LIMIT 1);

-- Environment & Energy
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 5 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'environment' AND text ILIKE '%renewable energy%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 6 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'environment' AND text ILIKE '%climate%' AND is_onboarding_canonical = false LIMIT 1);

-- Immigration
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 7 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'immigration' AND text ILIKE '%border%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 8 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'immigration' AND text ILIKE '%path%citizenship%' AND is_onboarding_canonical = false LIMIT 1);

-- Defense & Foreign Policy
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 9 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'defense' AND text ILIKE '%military%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 10 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'defense' AND text ILIKE '%diplomacy%' OR text ILIKE '%foreign%' AND is_onboarding_canonical = false LIMIT 1);

-- Civil Rights & Justice
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 11 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'civil-rights' AND text ILIKE '%discrimination%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 12 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'civil-rights' AND text ILIKE '%gun%' AND is_onboarding_canonical = false LIMIT 1);

-- Education
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 13 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'education' AND text ILIKE '%public school%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 14 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'education' AND text ILIKE '%student loan%' AND is_onboarding_canonical = false LIMIT 1);

-- Social Programs
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 15 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'social-programs' AND text ILIKE '%welfare%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 16 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'social-programs' AND text ILIKE '%childcare%' OR text ILIKE '%housing%' AND is_onboarding_canonical = false LIMIT 1);

-- Government & Democracy
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 17 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'government' AND text ILIKE '%filibuster%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 18 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'government' AND text ILIKE '%term limit%' AND is_onboarding_canonical = false LIMIT 1);

-- Technology & Science
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 19 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'technology' AND text ILIKE '%social media%' AND is_onboarding_canonical = false LIMIT 1);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 20 
WHERE id = (SELECT id FROM questions WHERE topic_id = 'technology' AND text ILIKE '%AI%' OR text ILIKE '%technology%' AND is_onboarding_canonical = false LIMIT 1);