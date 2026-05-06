
-- Step 1: Insert new candidate row with correct bioguide ID
INSERT INTO candidates (id, name, party, office, state, is_incumbent, overall_score, coverage_tier, confidence, score_version, created_at, last_updated)
SELECT 'V000137', name, party, office, state, is_incumbent, overall_score, coverage_tier, confidence, score_version, created_at, now()
FROM candidates WHERE id = 'S001236';

-- Step 2: Move candidate_answers to new ID
UPDATE candidate_answers SET candidate_id = 'V000137' WHERE candidate_id = 'S001236';

-- Step 3: Delete old candidate row
DELETE FROM candidates WHERE id = 'S001236';
