-- Create donor_aliases table for entity resolution
CREATE TABLE public.donor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  alias_pattern text NOT NULL,
  donor_type text NOT NULL CHECK (donor_type IN ('Individual', 'PAC', 'Organization', 'Unknown')),
  fec_committee_id text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(canonical_name, alias_pattern, donor_type)
);

-- Enable RLS
ALTER TABLE public.donor_aliases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Donor aliases are viewable by everyone"
ON public.donor_aliases FOR SELECT
USING (true);

CREATE POLICY "Admins can manage donor aliases"
ON public.donor_aliases FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated at trigger
CREATE TRIGGER update_donor_aliases_updated_at
BEFORE UPDATE ON public.donor_aliases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data for common PACs
INSERT INTO public.donor_aliases (canonical_name, alias_pattern, donor_type, notes) VALUES
('AIPAC', '%aipac%', 'PAC', 'American Israel Public Affairs Committee'),
('ActBlue', '%actblue%', 'PAC', 'Democratic fundraising platform'),
('WinRed', '%winred%', 'PAC', 'Republican fundraising platform'),
('Fidelity Investments', '%fidelity%', 'Organization', 'Fidelity investment company'),
('Goldman Sachs', '%goldman sachs%', 'Organization', 'Goldman Sachs investment bank'),
('Google', '%google%', 'Organization', 'Google/Alphabet'),
('Microsoft', '%microsoft%', 'Organization', 'Microsoft Corporation'),
('Amazon', '%amazon%', 'Organization', 'Amazon.com'),
('Apple Inc', '%apple%', 'Organization', 'Apple Inc'),
('Meta', '%meta%', 'Organization', 'Meta/Facebook'),
('JP Morgan', '%jp morgan%', 'Organization', 'JPMorgan Chase'),
('Blackstone', '%blackstone%', 'Organization', 'Blackstone Group'),
('Berkshire Hathaway', '%berkshire%', 'Organization', 'Berkshire Hathaway'),
('Democratic Congressional Campaign Committee', '%dccc%', 'PAC', 'DCCC'),
('National Republican Congressional Committee', '%nrcc%', 'PAC', 'NRCC'),
('Democratic Senatorial Campaign Committee', '%dscc%', 'PAC', 'DSCC'),
('National Republican Senatorial Committee', '%nrsc%', 'PAC', 'NRSC');

-- Create the consolidated donor view
CREATE OR REPLACE VIEW public.donor_consolidated AS
SELECT 
  COALESCE(da.canonical_name, d.name) as display_name,
  d.type,
  d.cycle,
  SUM(d.amount) as total_amount,
  SUM(COALESCE(d.transaction_count, 1)) as total_transactions,
  COUNT(DISTINCT d.candidate_id) as recipient_count,
  array_agg(DISTINCT d.name ORDER BY d.name) as name_variations,
  array_agg(DISTINCT d.id) as donor_ids,
  MIN(d.id) as primary_id,
  da.canonical_name IS NOT NULL as is_consolidated
FROM public.donors d
LEFT JOIN public.donor_aliases da 
  ON da.donor_type = d.type::text
  AND da.is_active = true
  AND LOWER(d.name) LIKE LOWER(da.alias_pattern)
GROUP BY COALESCE(da.canonical_name, d.name), d.type, d.cycle, da.canonical_name IS NOT NULL;