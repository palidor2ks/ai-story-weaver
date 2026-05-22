-- Table tracking IE spending committees excluded platform-wide
CREATE TABLE IF NOT EXISTS public.ie_excluded_committees (
  fec_committee_id text PRIMARY KEY,
  reason text NOT NULL,
  excluded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  excluded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ie_excluded_committees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "IE exclusions are publicly readable"
ON public.ie_excluded_committees
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert IE exclusions"
ON public.ie_excluded_committees
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete IE exclusions"
ON public.ie_excluded_committees
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update IE exclusions"
ON public.ie_excluded_committees
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Recreate IE rollup views to filter out excluded committees
CREATE OR REPLACE VIEW public.committee_independent_expenditure_totals AS
SELECT
  ie.spending_committee_fec_id,
  MAX(ie.spending_committee_name) AS spending_committee_name,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
WHERE ie.spending_committee_fec_id NOT IN (SELECT fec_committee_id FROM public.ie_excluded_committees)
GROUP BY ie.spending_committee_fec_id;

ALTER VIEW public.committee_independent_expenditure_totals SET (security_invoker = true);

CREATE OR REPLACE VIEW public.candidate_independent_expenditure_totals AS
SELECT
  ie.candidate_id,
  ie.target_fec_candidate_id,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
WHERE ie.spending_committee_fec_id NOT IN (SELECT fec_committee_id FROM public.ie_excluded_committees)
GROUP BY ie.candidate_id, ie.target_fec_candidate_id;

ALTER VIEW public.candidate_independent_expenditure_totals SET (security_invoker = true);