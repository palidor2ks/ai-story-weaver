-- Fix old candidate_answers with non-discrete values by snapping to nearest valid score
-- Valid values: -10, -5, 0, 5, 10

UPDATE candidate_answers
SET answer_value = CASE
  WHEN answer_value <= -8 THEN -10
  WHEN answer_value > -8 AND answer_value <= -3 THEN -5
  WHEN answer_value > -3 AND answer_value <= 3 THEN 0
  WHEN answer_value > 3 AND answer_value <= 8 THEN 5
  WHEN answer_value > 8 THEN 10
END,
updated_at = NOW()
WHERE answer_value NOT IN (-10, -5, 0, 5, 10);

-- Fix old party_answers with non-discrete values
UPDATE party_answers
SET answer_value = CASE
  WHEN answer_value <= -8 THEN -10
  WHEN answer_value > -8 AND answer_value <= -3 THEN -5
  WHEN answer_value > -3 AND answer_value <= 3 THEN 0
  WHEN answer_value > 3 AND answer_value <= 8 THEN 5
  WHEN answer_value > 8 THEN 10
END,
updated_at = NOW()
WHERE answer_value NOT IN (-10, -5, 0, 5, 10);