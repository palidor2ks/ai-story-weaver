-- Create candidate_overrides table for admin edits
CREATE TABLE public.candidate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL UNIQUE,
  name TEXT,
  party TEXT,
  office TEXT,
  state TEXT,
  district TEXT,
  image_url TEXT,
  overall_score NUMERIC,
  coverage_tier TEXT,
  confidence TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.candidate_overrides ENABLE ROW LEVEL SECURITY;

-- Everyone can view overrides (needed for merging in UI)
CREATE POLICY "Overrides are viewable by everyone"
ON public.candidate_overrides
FOR SELECT
USING (true);

-- Only admins can manage overrides
CREATE POLICY "Admins can manage overrides"
ON public.candidate_overrides
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_candidate_overrides_updated_at
  BEFORE UPDATE ON public.candidate_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();