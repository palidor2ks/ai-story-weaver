-- Move China/Taiwan questions to Foreign Policy
UPDATE questions SET topic_id = 'foreign-policy' WHERE topic_id = 'china-taiwan';

-- Move Israel/Palestine questions to Foreign Policy
UPDATE questions SET topic_id = 'foreign-policy' WHERE topic_id = 'israel-palestine';

-- Update any candidate answers that reference these topics
UPDATE candidate_topic_scores SET topic_id = 'foreign-policy' WHERE topic_id = 'china-taiwan';
UPDATE candidate_topic_scores SET topic_id = 'foreign-policy' WHERE topic_id = 'israel-palestine';

-- Update any user topic scores
UPDATE user_topic_scores SET topic_id = 'foreign-policy' WHERE topic_id = 'china-taiwan';
UPDATE user_topic_scores SET topic_id = 'foreign-policy' WHERE topic_id = 'israel-palestine';

-- Update any user topics (priority topics)
UPDATE user_topics SET topic_id = 'foreign-policy' WHERE topic_id = 'china-taiwan';
UPDATE user_topics SET topic_id = 'foreign-policy' WHERE topic_id = 'israel-palestine';

-- Delete the old topics
DELETE FROM topics WHERE id IN ('china-taiwan', 'israel-palestine');