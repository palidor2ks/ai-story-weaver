-- Prefer a specific secondary cause over a generic partisan primary.
-- Example: Progressive (general) + Pro-Immigration should display and persist
-- Pro-Immigration as the primary cause while retaining Progressive as context.
WITH ranked_specific_secondaries AS (
  SELECT
    t.fec_committee_id,
    t.primary_cause_id AS old_primary_cause_id,
    s.cause_id AS new_primary_cause_id,
    s.ordinality
  FROM public.committee_topics t
  CROSS JOIN LATERAL unnest(
    COALESCE(t.secondary_cause_ids, '{}'::text[])
  ) WITH ORDINALITY AS s(cause_id, ordinality)
  WHERE t.primary_cause_id IN ('progressive', 'conservative', 'libertarian')
    AND s.cause_id NOT IN ('progressive', 'conservative', 'libertarian')
), promoted AS (
  SELECT DISTINCT ON (fec_committee_id)
    fec_committee_id,
    old_primary_cause_id,
    new_primary_cause_id
  FROM ranked_specific_secondaries
  ORDER BY fec_committee_id, ordinality
)
UPDATE public.committee_topics t
SET
  primary_cause_id = p.new_primary_cause_id,
  secondary_cause_ids = ARRAY(
    SELECT secondary.cause_id
    FROM unnest(
      ARRAY[p.old_primary_cause_id]
      || array_remove(
        COALESCE(t.secondary_cause_ids, '{}'::text[]),
        p.new_primary_cause_id
      )
    ) WITH ORDINALITY AS secondary(cause_id, ordinality)
    WHERE secondary.cause_id IS NOT NULL
    GROUP BY secondary.cause_id
    ORDER BY min(secondary.ordinality)
  ),
  updated_at = now()
FROM promoted p
WHERE t.fec_committee_id = p.fec_committee_id;