CREATE TABLE IF NOT EXISTS public.independent_expenditures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fec_transaction_id text NOT NULL,
  image_number text,
  expenditure_date date,
  cycle text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  purpose text,
  communication_type text,
  support_oppose_indicator text NOT NULL CHECK (support_oppose_indicator IN ('S','O')),

  spending_committee_fec_id text NOT NULL,
  spending_committee_name text,

  target_fec_candidate_id text,
  target_candidate_name text,
  candidate_id text REFERENCES public.candidates(id) ON DELETE SET NULL,

  state text,
  office text,
  district text,
  election_type text,
  report_type text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'fec_processed_notice',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (fec_transaction_id, spending_committee_fec_id)
);

CREATE INDEX IF NOT EXISTS idx_ie_candidate_id ON public.independent_expenditures(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ie_spending_committee_fec_id ON public.independent_expenditures(spending_committee_fec_id);
CREATE INDEX IF NOT EXISTS idx_ie_target_fec_candidate_id ON public.independent_expenditures(target_fec_candidate_id);
CREATE INDEX IF NOT EXISTS idx_ie_cycle_date ON public.independent_expenditures(cycle, expenditure_date DESC);

ALTER TABLE public.independent_expenditures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Independent expenditures are publicly readable"
ON public.independent_expenditures
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage independent expenditures"
ON public.independent_expenditures
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_independent_expenditures_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_independent_expenditures_updated_at ON public.independent_expenditures;
CREATE TRIGGER set_independent_expenditures_updated_at
BEFORE UPDATE ON public.independent_expenditures
FOR EACH ROW EXECUTE FUNCTION public.set_independent_expenditures_updated_at();

CREATE OR REPLACE VIEW public.committee_independent_expenditure_totals AS
SELECT
  ie.spending_committee_fec_id,
  MAX(ie.spending_committee_name) AS spending_committee_name,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
GROUP BY ie.spending_committee_fec_id;

CREATE OR REPLACE VIEW public.candidate_independent_expenditure_totals AS
SELECT
  ie.candidate_id,
  ie.target_fec_candidate_id,
  COUNT(*) AS expenditure_count,
  COALESCE(SUM(ie.amount), 0)::numeric(14,2) AS total_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'S' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS support_amount,
  COALESCE(SUM(CASE WHEN ie.support_oppose_indicator = 'O' THEN ie.amount ELSE 0 END), 0)::numeric(14,2) AS oppose_amount
FROM public.independent_expenditures ie
GROUP BY ie.candidate_id, ie.target_fec_candidate_id;