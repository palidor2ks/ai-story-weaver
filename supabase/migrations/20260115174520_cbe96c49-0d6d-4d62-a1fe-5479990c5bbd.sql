-- Step 1: Delete NULL vote_number records that have a 0 equivalent
DELETE FROM candidate_votes cv1
WHERE cv1.vote_number IS NULL
  AND cv1.action_type IN ('sponsor', 'cosponsor')
  AND EXISTS (
    SELECT 1 FROM candidate_votes cv2
    WHERE cv2.bill_id = cv1.bill_id
      AND cv2.candidate_id = cv1.candidate_id
      AND cv2.action_type = cv1.action_type
      AND cv2.vote_number = 0
  );

-- Step 2: Update remaining NULL vote_numbers to 0 (for records without a 0 equivalent)
UPDATE candidate_votes
SET vote_number = 0
WHERE vote_number IS NULL
  AND action_type IN ('sponsor', 'cosponsor');

-- Step 3: Add NOT NULL constraint to prevent future issues
ALTER TABLE candidate_votes 
ALTER COLUMN vote_number SET DEFAULT 0;

ALTER TABLE candidate_votes 
ALTER COLUMN vote_number SET NOT NULL;