-- Efficient bulk IE summary for the candidates directory.
--
-- Why: useCandidatesIE() previously fetched up to 50k raw rows from
-- independent_expenditures, then aggregated them in JavaScript — pure
-- network waste. This RPC does the aggregation server-side and returns
-- one row per candidate (latest cycle only), cutting the transfer from
-- ~50k rows to ≤25 rows for a typical page of results.
--
-- Uses a window function to pick the latest cycle per candidate before
-- projecting, so no extra round-trip is needed.

CREATE OR REPLACE FUNCTION public.get_candidate_ie_totals(p_candidate_ids text[])
RETURNS TABLE (
  candidate_id text,
  cycle        text,
  expenditure_count bigint,
  total_amount      numeric,
  support_amount    numeric,
  oppose_amount     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_cycle AS (
    SELECT
      ie.candidate_id::text,
      ie.cycle,
      COUNT(*)::bigint                                                      AS expenditure_count,
      COALESCE(SUM(ie.amount), 0)::numeric(14,2)                           AS total_amount,
      COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
      COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount,
      ROW_NUMBER() OVER (PARTITION BY ie.candidate_id ORDER BY ie.cycle DESC NULLS LAST) AS rn
    FROM public.independent_expenditures ie
    WHERE ie.candidate_id::text = ANY(p_candidate_ids)
      AND ie.spending_committee_fec_id NOT IN (
        SELECT fec_committee_id FROM public.ie_excluded_committees
      )
    GROUP BY ie.candidate_id, ie.cycle
  )
  SELECT candidate_id, cycle, expenditure_count, total_amount, support_amount, oppose_amount
  FROM per_cycle
  WHERE rn = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_candidate_ie_totals(text[]) TO anon, authenticated;
