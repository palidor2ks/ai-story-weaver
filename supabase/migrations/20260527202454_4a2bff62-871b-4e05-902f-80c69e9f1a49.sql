-- Fix: IE rollup views were filtering with a subquery on ie_excluded_committees,
-- but that base table is admin-only since the security hardening. For anon/auth
-- users the subquery returns 0 rows, so excluded junk filings reappeared in the
-- public Top Spenders rollup.
--
-- Solution: route exclusions through a SECURITY DEFINER function so the views
-- can apply them regardless of the caller's read access to the base table.

CREATE OR REPLACE FUNCTION public.ie_excluded_committee_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fec_committee_id FROM public.ie_excluded_committees;
$$;

GRANT EXECUTE ON FUNCTION public.ie_excluded_committee_ids() TO anon, authenticated, service_role;

-- Recreate the committee-level rollup to filter via the helper function.
CREATE OR REPLACE VIEW public.committee_independent_expenditure_totals AS
SELECT
  ie.spending_committee_fec_id,
  MAX(ie.spending_committee_name) AS spending_committee_name,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
WHERE ie.spending_committee_fec_id NOT IN (SELECT public.ie_excluded_committee_ids())
GROUP BY ie.spending_committee_fec_id;

ALTER VIEW public.committee_independent_expenditure_totals SET (security_invoker = true);

-- Recreate the candidate-level rollup with the same filter.
CREATE OR REPLACE VIEW public.candidate_independent_expenditure_totals AS
SELECT
  ie.candidate_id,
  ie.target_fec_candidate_id,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
WHERE ie.spending_committee_fec_id NOT IN (SELECT public.ie_excluded_committee_ids())
GROUP BY ie.candidate_id, ie.target_fec_candidate_id;

ALTER VIEW public.candidate_independent_expenditure_totals SET (security_invoker = true);