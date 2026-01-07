-- View for pre-aggregated answer counts per candidate
CREATE VIEW candidate_answer_coverage_stats AS
SELECT 
  candidate_id,
  COUNT(*) as answer_count,
  COUNT(*) FILTER (
    WHERE source_description IS NOT NULL 
    AND source_description NOT ILIKE '%platform%'
    AND source_description NOT ILIKE '%inferred from%'
    AND LENGTH(source_description) > 10
  ) as sourced_count
FROM candidate_answers
GROUP BY candidate_id;

-- View for answer counts by topic (for sync stats)
CREATE VIEW topic_answer_counts AS
SELECT 
  q.topic_id,
  COUNT(ca.id) as answer_count
FROM candidate_answers ca
JOIN questions q ON ca.question_id = q.id
GROUP BY q.topic_id;

-- View for donor counts per candidate
CREATE VIEW candidate_donor_counts AS
SELECT 
  candidate_id, 
  COUNT(*) as donor_count
FROM donors
WHERE candidate_id IS NOT NULL
GROUP BY candidate_id;