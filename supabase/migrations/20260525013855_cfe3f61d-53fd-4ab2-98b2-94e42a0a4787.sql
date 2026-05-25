-- Step 1: Insert 6 new federal topics
INSERT INTO topics (id, name, icon, scope, weight) VALUES
  ('economy-work', 'Economy & Work', '💼', 'all', 1),
  ('health-safety-net', 'Health, Education & Social Safety Net', '🤝', 'all', 1),
  ('environment-energy', 'Environment & Energy', '🌍', 'all', 1),
  ('national-security-borders', 'National Security & Borders', '🛡️', 'all', 1),
  ('rights-justice', 'Rights & Justice', '⚖️', 'all', 1),
  ('government-democracy', 'Government & Democracy', '🏛️', 'all', 1)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, scope=EXCLUDED.scope;

-- Step 2: Remap questions.topic_id
UPDATE questions SET topic_id = CASE topic_id
  WHEN 'economy' THEN 'economy-work'
  WHEN 'technology' THEN 'economy-work'
  WHEN 'healthcare' THEN 'health-safety-net'
  WHEN 'education' THEN 'health-safety-net'
  WHEN 'social-programs' THEN 'health-safety-net'
  WHEN 'environment' THEN 'environment-energy'
  WHEN 'defense' THEN 'national-security-borders'
  WHEN 'immigration' THEN 'national-security-borders'
  WHEN 'foreign-affairs' THEN 'national-security-borders'
  WHEN 'civil-rights' THEN 'rights-justice'
  WHEN 'judicial' THEN 'rights-justice'
  WHEN 'government' THEN 'government-democracy'
  ELSE topic_id
END
WHERE topic_id IN ('economy','technology','healthcare','education','social-programs','environment','defense','immigration','foreign-affairs','civil-rights','judicial','government');

-- Step 3: Remap committee_causes.quiz_topic_id
UPDATE committee_causes SET quiz_topic_id = CASE quiz_topic_id
  WHEN 'economy' THEN 'economy-work'
  WHEN 'technology' THEN 'economy-work'
  WHEN 'healthcare' THEN 'health-safety-net'
  WHEN 'education' THEN 'health-safety-net'
  WHEN 'social-programs' THEN 'health-safety-net'
  WHEN 'environment' THEN 'environment-energy'
  WHEN 'defense' THEN 'national-security-borders'
  WHEN 'immigration' THEN 'national-security-borders'
  WHEN 'foreign-affairs' THEN 'national-security-borders'
  WHEN 'civil-rights' THEN 'rights-justice'
  WHEN 'judicial' THEN 'rights-justice'
  WHEN 'government' THEN 'government-democracy'
  ELSE quiz_topic_id
END
WHERE quiz_topic_id IN ('economy','technology','healthcare','education','social-programs','environment','defense','immigration','foreign-affairs','civil-rights','judicial','government');

-- Step 4: Remap bills.topic (stored as display label, not id)
UPDATE bills SET topic = CASE topic
  WHEN 'Economy' THEN 'Economy & Work'
  WHEN 'Technology' THEN 'Economy & Work'
  WHEN 'Healthcare' THEN 'Health, Education & Social Safety Net'
  WHEN 'Education' THEN 'Health, Education & Social Safety Net'
  WHEN 'Social Programs' THEN 'Health, Education & Social Safety Net'
  WHEN 'Environment' THEN 'Environment & Energy'
  WHEN 'Defense' THEN 'National Security & Borders'
  WHEN 'Immigration' THEN 'National Security & Borders'
  WHEN 'Foreign Affairs' THEN 'National Security & Borders'
  WHEN 'Civil Rights' THEN 'Rights & Justice'
  WHEN 'Judicial' THEN 'Rights & Justice'
  WHEN 'Government' THEN 'Government & Democracy'
  ELSE topic
END
WHERE topic IN ('Economy','Technology','Healthcare','Education','Social Programs','Environment','Defense','Immigration','Foreign Affairs','Civil Rights','Judicial','Government');

ALTER TABLE bills ALTER COLUMN topic SET DEFAULT 'Government & Democracy';

-- Step 5: Delete old federal topics (questions/causes already remapped; candidate_topic_scores is empty)
DELETE FROM topics WHERE id IN ('economy','technology','healthcare','education','social-programs','environment','defense','immigration','foreign-affairs','civil-rights','judicial','government');
