-- Create table to store external committee finances (J, U, B, D designations)
-- J = Joint Fundraising Committee
-- U = Unauthorized (Super PACs, NRSC, DSCC, etc.)
-- B = Lobbyist/Bundler
-- D = Leadership PAC

CREATE TABLE public.external_committee_finance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id text NOT NULL,
  committee_name text,
  designation text NOT NULL,
  designation_full text,
  candidate_id text,
  cycle text NOT NULL,
  
  -- Contribution totals
  total_raised integer DEFAULT 0,
  individual_contributions integer DEFAULT 0,
  pac_contributions integer DEFAULT 0,
  party_contributions integer DEFAULT 0,
  
  -- Expense totals
  total_disbursed integer DEFAULT 0,
  operating_expenses integer DEFAULT 0,
  independent_expenditures integer DEFAULT 0,
  
  -- Support/Oppose tracking (for Super PACs)
  support_total integer DEFAULT 0,
  oppose_total integer DEFAULT 0,
  
  -- Metadata
  last_fec_check timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(committee_id, cycle)
);

-- Enable RLS
ALTER TABLE public.external_committee_finance ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "External committee finance is viewable by everyone"
  ON public.external_committee_finance 
  FOR SELECT 
  USING (true);

-- Admin write access  
CREATE POLICY "Admins can manage external committee finance"
  ON public.external_committee_finance 
  FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role access
CREATE POLICY "Service role can manage external committee finance"
  ON public.external_committee_finance 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Create index for common queries
CREATE INDEX idx_external_committee_finance_candidate ON public.external_committee_finance(candidate_id);
CREATE INDEX idx_external_committee_finance_cycle ON public.external_committee_finance(cycle);
CREATE INDEX idx_external_committee_finance_designation ON public.external_committee_finance(designation);