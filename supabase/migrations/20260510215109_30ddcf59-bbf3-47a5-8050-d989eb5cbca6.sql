-- Merge duplicate Cory Booker candidate rows: keep B001288 (bioguide), remove S4NJ00185 (FEC id duplicate).

-- 1. Re-point election_candidates from S4NJ00185 → B001288 (skip if conflict).
UPDATE election_candidates ec
SET candidate_id = 'B001288'
WHERE ec.candidate_id = 'S4NJ00185'
  AND NOT EXISTS (
    SELECT 1 FROM election_candidates ec2
    WHERE ec2.election_id = ec.election_id
      AND ec2.candidate_id = 'B001288'
  );

-- Delete any leftover election_candidates rows that conflicted.
DELETE FROM election_candidates WHERE candidate_id = 'S4NJ00185';

-- 2. Delete duplicate child rows on S4NJ00185 (B001288 already has its own copies).
DELETE FROM candidate_answers WHERE candidate_id = 'S4NJ00185';
DELETE FROM candidate_committees WHERE candidate_id = 'S4NJ00185';
DELETE FROM candidate_overrides WHERE candidate_id = 'S4NJ00185';
DELETE FROM candidate_votes WHERE candidate_id = 'S4NJ00185';
DELETE FROM candidate_topic_scores WHERE candidate_id = 'S4NJ00185';
DELETE FROM candidate_fec_ids WHERE candidate_id = 'S4NJ00185';

-- 3. Delete the duplicate candidate row itself.
DELETE FROM candidates WHERE id = 'S4NJ00185';