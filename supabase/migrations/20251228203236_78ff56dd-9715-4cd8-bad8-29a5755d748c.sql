-- Table to store PAC independent expenditures (Schedule E data)
CREATE TABLE public.pac_expenditures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id text NOT NULL,
  committee_name text,
  candidate_id text,
  candidate_name text,
  fec_candidate_id text,
  support_oppose text NOT NULL CHECK (support_oppose IN ('support', 'oppose')),
  total_amount integer NOT NULL DEFAULT 0,
  expenditure_count integer NOT NULL DEFAULT 0,
  cycle text NOT NULL,
  last_expenditure_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (committee_id, candidate_id, support_oppose, cycle)
);

-- Pre-computed totals for quick ratio calculations
CREATE TABLE public.pac_candidate_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id text NOT NULL,
  committee_name text,
  candidate_id text NOT NULL,
  candidate_name text,
  support_total integer NOT NULL DEFAULT 0,
  oppose_total integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  support_ratio numeric(5,4) DEFAULT 0,
  oppose_ratio numeric(5,4) DEFAULT 0,
  cycle text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (committee_id, candidate_id, cycle)
);

-- Create view to calculate donor attributed impact
CREATE OR REPLACE VIEW public.donor_attributed_impact AS
SELECT 
  d.id as donor_id,
  d.name as donor_name,
  d.display_name,
  d.type as donor_type,
  d.amount as donation_amount,
  d.cycle,
  pct.committee_id,
  pct.candidate_id,
  pct.candidate_name,
  pct.support_ratio,
  pct.oppose_ratio,
  ROUND(d.amount * pct.support_ratio) as attributed_support_amount,
  ROUND(d.amount * pct.oppose_ratio) as attributed_oppose_amount,
  CASE 
    WHEN pct.support_ratio > 0 THEN 'support'
    WHEN pct.oppose_ratio > 0 THEN 'oppose'
    ELSE NULL
  END as impact_type
FROM donors d
JOIN candidate_committees cc ON cc.fec_committee_id = d.recipient_committee_id
JOIN pac_candidate_totals pct ON pct.committee_id = cc.fec_committee_id AND pct.cycle = d.cycle
WHERE cc.role = 'external';

-- Enable RLS
ALTER TABLE public.pac_expenditures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pac_candidate_totals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pac_expenditures
CREATE POLICY "PAC expenditures are viewable by everyone"
ON public.pac_expenditures
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage PAC expenditures"
ON public.pac_expenditures
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage PAC expenditures"
ON public.pac_expenditures
FOR ALL
USING (auth.role() = 'service_role');

-- RLS Policies for pac_candidate_totals
CREATE POLICY "PAC candidate totals are viewable by everyone"
ON public.pac_candidate_totals
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage PAC candidate totals"
ON public.pac_candidate_totals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage PAC candidate totals"
ON public.pac_candidate_totals
FOR ALL
USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_pac_expenditures_updated_at
BEFORE UPDATE ON public.pac_expenditures
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pac_candidate_totals_updated_at
BEFORE UPDATE ON public.pac_candidate_totals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();