-- Helper inline: identify local/state officials by office keyword.
-- Delete federal-scope answers for any candidate whose office matches a local/state keyword.
WITH local_office_pattern AS (
  SELECT unnest(ARRAY[
    '%governor%','%state senator%','%state rep%','%mayor%','%city council%','%county%',
    '%alderman%','%selectman%','%town council%','%school board%','%sheriff%',
    '%district attorney%','%municipal%','%attorney general%','%secretary of state%',
    '%treasurer%','%auditor%','%comptroller%'
  ]) AS pat
),
local_candidates AS (
  SELECT DISTINCT id AS candidate_id
  FROM public.candidates c, local_office_pattern p
  WHERE lower(c.office) LIKE p.pat
  UNION
  SELECT DISTINCT co.candidate_id
  FROM public.candidate_overrides co, local_office_pattern p
  WHERE co.office IS NOT NULL AND lower(co.office) LIKE p.pat
  UNION
  SELECT DISTINCT s.id
  FROM public.static_officials s, local_office_pattern p
  WHERE s.office IS NOT NULL AND lower(s.office) LIKE p.pat
),
federal_question_ids AS (
  SELECT q.id
  FROM public.questions q
  JOIN public.topics t ON t.id = q.topic_id
  WHERE t.scope = 'all'
)
DELETE FROM public.candidate_answers ca
WHERE ca.candidate_id IN (SELECT candidate_id FROM local_candidates)
  AND ca.question_id IN (SELECT id FROM federal_question_ids);