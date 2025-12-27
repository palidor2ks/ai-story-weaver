-- Create candidate_fec_ids linking table for multiple FEC IDs per candidate
CREATE TABLE public.candidate_fec_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL,
  fec_candidate_id text NOT NULL,
  office text NOT NULL,
  state text,
  district text,
  is_primary boolean DEFAULT false,
  cycle text,
  match_method text DEFAULT 'manual',
  match_score integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, fec_candidate_id)
);

-- Add index for faster lookups
CREATE INDEX idx_candidate_fec_ids_candidate ON public.candidate_fec_ids(candidate_id);
CREATE INDEX idx_candidate_fec_ids_fec ON public.candidate_fec_ids(fec_candidate_id);

-- Add source_fec_candidate_id to candidate_committees to track origin
ALTER TABLE public.candidate_committees 
ADD COLUMN source_fec_candidate_id text;

-- Enable RLS
ALTER TABLE public.candidate_fec_ids ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can view FEC IDs
CREATE POLICY "FEC IDs are viewable by everyone"
  ON public.candidate_fec_ids
  FOR SELECT
  USING (true);

-- RLS: Admins can manage FEC IDs
CREATE POLICY "Admins can manage FEC IDs"
  ON public.candidate_fec_ids
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Service role can manage FEC IDs
CREATE POLICY "Service role can manage FEC IDs"
  ON public.candidate_fec_ids
  FOR ALL
  USING (auth.role() = 'service_role');

-- Migrate existing fec_candidate_id data from candidates table
INSERT INTO public.candidate_fec_ids (candidate_id, fec_candidate_id, office, state, district, is_primary, match_method)
SELECT 
  id as candidate_id,
  fec_candidate_id,
  office,
  state,
  district,
  true as is_primary,
  'migrated' as match_method
FROM public.candidates
WHERE fec_candidate_id IS NOT NULL
ON CONFLICT (candidate_id, fec_candidate_id) DO NOTHING;

-- Update existing candidate_committees with source_fec_candidate_id from candidates table
UPDATE public.candidate_committees cc
SET source_fec_candidate_id = c.fec_candidate_id
FROM public.candidates c
WHERE cc.candidate_id = c.id
  AND c.fec_candidate_id IS NOT NULL
  AND cc.source_fec_candidate_id IS NULL;