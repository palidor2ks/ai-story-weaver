-- Normalize question option values to the canonical five-point scale.
-- This avoids exposing unsupported values like -3/+3 in quiz scoring.
UPDATE public.question_options
SET value = CASE
  WHEN value <= -8 THEN -10
  WHEN value <= -3 THEN -5
  WHEN value < 3 THEN 0
  WHEN value < 8 THEN 5
  ELSE 10
END
WHERE is_skip_option = false
  AND value NOT IN (-10, -5, 0, 5, 10);

-- Enforce canonical answer option values for all non-skip options.
ALTER TABLE public.question_options
  DROP CONSTRAINT IF EXISTS question_options_non_skip_value_check;

ALTER TABLE public.question_options
  ADD CONSTRAINT question_options_non_skip_value_check
  CHECK (
    is_skip_option = true
    OR value IN (-10, -5, 0, 5, 10)
  );
