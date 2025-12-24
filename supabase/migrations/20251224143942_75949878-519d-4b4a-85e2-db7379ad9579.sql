-- Create candidate_committees join table for multiple committees per candidate
CREATE TABLE IF NOT EXISTS public.candidate_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL,
  fec_committee_id text NOT NULL,
  role text NOT NULL DEFAULT 'authorized', -- 'principal', 'authorized', 'joint'
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, fec_committee_id)
);

-- Enable RLS
ALTER TABLE public.candidate_committees ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Committee mappings are viewable by everyone"
  ON public.candidate_committees FOR SELECT
  USING (true);

-- Admin management
CREATE POLICY "Admins can manage committee mappings"
  ON public.candidate_committees FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add is_transfer flag to donors table
ALTER TABLE public.donors 
ADD COLUMN IF NOT EXISTS is_transfer boolean DEFAULT false;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_candidate_committees_candidate 
  ON public.candidate_committees(candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_committees_committee 
  ON public.candidate_committees(fec_committee_id);

CREATE INDEX IF NOT EXISTS idx_donors_is_transfer 
  ON public.donors(is_transfer) WHERE is_transfer = true;