WITH agg AS (
  SELECT
    c.recipient_committee_id                        AS committee_id,
    c.cycle                                         AS cycle,
    COUNT(*)::int                                   AS contribution_count,
    COUNT(DISTINCT lower(btrim(c.contributor_name)))::int AS donor_count,
    LEAST(SUM(c.amount), 2147483647)::int           AS itemized
  FROM public.contributions c
  WHERE c.recipient_committee_id IS NOT NULL
    AND c.cycle IS NOT NULL
  GROUP BY c.recipient_committee_id, c.cycle
),
agg_with_cand AS (
  SELECT a.*,
         COALESCE(
           (SELECT cc.candidate_id
              FROM public.candidate_committees cc
             WHERE cc.fec_committee_id = a.committee_id
               AND cc.candidate_id IS NOT NULL
             ORDER BY cc.role = 'principal' DESC, cc.created_at ASC
             LIMIT 1),
           ''
         ) AS candidate_id
  FROM agg a
)
INSERT INTO public.committee_finance_rollups (
  committee_id, candidate_id, cycle,
  donor_count, contribution_count, local_itemized,
  last_sync, updated_at, created_at
)
SELECT committee_id, candidate_id, cycle,
       donor_count, contribution_count, itemized,
       now(), now(), now()
FROM agg_with_cand
ON CONFLICT (committee_id, cycle) DO UPDATE
SET donor_count = EXCLUDED.donor_count,
    contribution_count = EXCLUDED.contribution_count,
    local_itemized = GREATEST(public.committee_finance_rollups.local_itemized, EXCLUDED.local_itemized),
    candidate_id = COALESCE(NULLIF(public.committee_finance_rollups.candidate_id, ''), EXCLUDED.candidate_id),
    updated_at = now()
WHERE public.committee_finance_rollups.donor_count IS NULL
   OR public.committee_finance_rollups.donor_count = 0
   OR public.committee_finance_rollups.contribution_count IS NULL
   OR public.committee_finance_rollups.contribution_count = 0;