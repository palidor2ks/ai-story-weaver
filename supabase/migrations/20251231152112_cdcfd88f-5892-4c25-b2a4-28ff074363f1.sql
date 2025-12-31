-- Create table for caching AI-generated user-representative comparisons
CREATE TABLE public.user_rep_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  candidate_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  deep_analysis TEXT,
  key_agreements TEXT[] DEFAULT ARRAY[]::TEXT[],
  key_disagreements TEXT[] DEFAULT ARRAY[]::TEXT[],
  sources JSONB DEFAULT '[]'::JSONB,
  match_score INTEGER,
  user_answers_hash TEXT,
  rep_answers_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deep_analysis_generated_at TIMESTAMPTZ,
  UNIQUE(user_id, candidate_id)
);

-- Enable RLS
ALTER TABLE public.user_rep_comparisons ENABLE ROW LEVEL SECURITY;

-- Users can view their own comparisons
CREATE POLICY "Users can view their own comparisons"
ON public.user_rep_comparisons
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own comparisons
CREATE POLICY "Users can insert their own comparisons"
ON public.user_rep_comparisons
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own comparisons
CREATE POLICY "Users can update their own comparisons"
ON public.user_rep_comparisons
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own comparisons
CREATE POLICY "Users can delete their own comparisons"
ON public.user_rep_comparisons
FOR DELETE
USING (auth.uid() = user_id);

-- Service role can manage all comparisons
CREATE POLICY "Service role can manage comparisons"
ON public.user_rep_comparisons
FOR ALL
USING (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_user_rep_comparisons_updated_at
BEFORE UPDATE ON public.user_rep_comparisons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();