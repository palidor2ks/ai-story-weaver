-- Create contributions table for per-transaction detail
CREATE TABLE IF NOT EXISTS public.contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash text NOT NULL,
  fec_transaction_id text,
  candidate_id text, -- Nullable for unattributed contributions
  recipient_committee_id text NOT NULL,
  recipient_committee_name text,
  contributor_name text NOT NULL,
  contributor_type text NOT NULL DEFAULT 'Unknown',
  amount integer NOT NULL,
  receipt_date date,
  cycle text NOT NULL,
  line_number text,
  is_contribution boolean DEFAULT true,
  is_transfer boolean DEFAULT false,
  is_earmarked boolean DEFAULT false,
  earmarked_for_candidate_id text,
  conduit_committee_id text,
  memo_text text,
  contributor_city text,
  contributor_state text,
  contributor_zip text,
  employer text,
  occupation text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(identity_hash, cycle)
);

-- Enable RLS
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Contributions are viewable by everyone"
  ON public.contributions FOR SELECT
  USING (true);

-- Admin management
CREATE POLICY "Admins can manage contributions"
  ON public.contributions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage contributions (for edge functions)
CREATE POLICY "Service role can manage contributions"
  ON public.contributions FOR ALL
  USING (auth.role() = 'service_role'::text);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_contributions_candidate 
  ON public.contributions(candidate_id) WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contributions_committee 
  ON public.contributions(recipient_committee_id);

CREATE INDEX IF NOT EXISTS idx_contributions_cycle 
  ON public.contributions(cycle);

CREATE INDEX IF NOT EXISTS idx_contributions_earmarked 
  ON public.contributions(earmarked_for_candidate_id) WHERE is_earmarked = true;

CREATE INDEX IF NOT EXISTS idx_contributions_identity 
  ON public.contributions(identity_hash);

-- Add service role policy to donors for edge functions
CREATE POLICY "Service role can manage donors"
  ON public.donors FOR ALL
  USING (auth.role() = 'service_role'::text);