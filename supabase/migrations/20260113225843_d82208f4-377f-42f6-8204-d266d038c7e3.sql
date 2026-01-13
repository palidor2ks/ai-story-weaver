-- Fix topic structure: separate Defense from Foreign Affairs
-- Must create new topic FIRST before updating foreign key references

-- Step 1: Insert the new foreign-affairs topic first
INSERT INTO topics (id, name, icon, weight) 
VALUES ('foreign-affairs', 'Foreign Affairs', '🌐', 1);

-- Step 2: Update all questions from 'defense' to 'foreign-affairs'
UPDATE questions SET topic_id = 'foreign-affairs' WHERE topic_id = 'defense';

-- Step 3: Update the old 'defense' topic to be the real Defense topic
UPDATE topics 
SET name = 'Defense & Military', icon = '🛡️'
WHERE id = 'defense';