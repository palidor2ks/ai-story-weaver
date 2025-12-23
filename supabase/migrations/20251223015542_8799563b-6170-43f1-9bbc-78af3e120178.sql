
-- Phase 1: Fix Gun Policy Scoring Inversion & Reword Leading Questions

-- 1. INVERT gun1 question option values (multiply by -1)
-- This makes "support stricter checks" = Left (-10) and "oppose checks" = Right (+10)
UPDATE question_options 
SET value = value * -1
WHERE question_id = 'gun1';

-- 2. INVERT gun2 question option values (multiply by -1)
-- This makes "support ban" = Left (-10) and "oppose ban" = Right (+10)
UPDATE question_options 
SET value = value * -1
WHERE question_id = 'gun2';

-- 3. INVERT party_answers for gun1 and gun2
UPDATE party_answers 
SET answer_value = answer_value * -1
WHERE question_id IN ('gun1', 'gun2');

-- 4. INVERT candidate_answers for gun1 and gun2
UPDATE candidate_answers 
SET answer_value = answer_value * -1
WHERE question_id IN ('gun1', 'gun2');

-- 5. REWORD cj11 question to use neutral terminology
-- Change "three-strikes" to "mandatory minimum sentencing"
UPDATE questions 
SET text = 'Should mandatory minimum sentencing laws, which require fixed prison terms regardless of circumstances, be reformed or repealed?'
WHERE id = 'cj11';

-- 6. REWORD gun2 question to use neutral terminology
-- Change "assault-style weapons" to "semi-automatic rifles"
UPDATE questions 
SET text = 'Should semi-automatic rifles be banned for civilian ownership?'
WHERE id = 'gun2';

-- 7. REWORD cj14 question to use neutral terminology (also uses "assault weapons")
UPDATE questions 
SET text = 'Should the federal government reinstate the ban on semi-automatic rifles?'
WHERE id = 'cj14';
