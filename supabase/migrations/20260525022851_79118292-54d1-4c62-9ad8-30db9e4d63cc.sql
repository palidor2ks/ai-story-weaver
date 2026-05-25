
INSERT INTO public.questions (id, topic_id, text, source, include_in_politician_quiz)
VALUES
  ('civil-rights-q21', 'rights-justice', 'Should Congress require universal background checks for all gun sales?', 'standard', true),
  ('civil-rights-q22', 'rights-justice', 'Should federal law protect the right to abortion nationwide?', 'standard', true),
  ('government-q21', 'government-democracy', 'Should Congress act to overturn Citizens United and limit super PAC spending?', 'standard', true)
ON CONFLICT (id) DO NOTHING;
