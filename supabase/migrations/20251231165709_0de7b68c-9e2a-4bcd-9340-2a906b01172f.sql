-- Add a flag to identify "skip" options that shouldn't count in scoring
ALTER TABLE question_options ADD COLUMN IF NOT EXISTS is_skip_option boolean DEFAULT false;

-- Add "Not important to me" option to every question that doesn't already have one
INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option)
SELECT 
  q.id || '_skip' as id,
  q.id as question_id,
  'Not important to me' as text,
  0 as value,
  99 as display_order,
  true as is_skip_option
FROM questions q
WHERE NOT EXISTS (
  SELECT 1 FROM question_options qo 
  WHERE qo.question_id = q.id AND qo.is_skip_option = true
);