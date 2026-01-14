-- Clear Dan Sullivan's problematic answers that have:
-- 1. Relevance flags indicating mismatched or needs review
-- 2. Description stating "no evidence" type patterns
DELETE FROM candidate_answers 
WHERE candidate_id = 'S001198' 
AND (
  relevance_flag IN ('mismatch', 'needs_review')
  OR source_description ILIKE '%NO EVIDENCE FOUND%'
  OR source_description ILIKE '%no concrete evidence%'
  OR source_description ILIKE '%no documented position%'
  OR source_description ILIKE '%no direct evidence%'
);

-- Also clear any answers from Dan Sullivan that have a non-zero score but inferred type with no real evidence
DELETE FROM candidate_answers
WHERE candidate_id = 'S001198'
AND evidence_type = 'inferred'
AND answer_value != 0
AND (source_urls IS NULL OR array_length(source_urls, 1) IS NULL);