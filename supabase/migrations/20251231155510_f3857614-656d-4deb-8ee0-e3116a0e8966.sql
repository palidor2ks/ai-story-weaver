-- Create user_party_comparisons table for storing AI-generated party comparison summaries
CREATE TABLE public.user_party_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  party_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  deep_analysis TEXT,
  key_agreements TEXT[] DEFAULT ARRAY[]::TEXT[],
  key_disagreements TEXT[] DEFAULT ARRAY[]::TEXT[],
  sources JSONB DEFAULT '[]'::JSONB,
  match_score INTEGER,
  user_answers_hash TEXT,
  party_answers_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deep_analysis_generated_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_user_party UNIQUE (user_id, party_id)
);

-- Enable RLS
ALTER TABLE public.user_party_comparisons ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own party comparisons"
  ON public.user_party_comparisons
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own party comparisons"
  ON public.user_party_comparisons
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own party comparisons"
  ON public.user_party_comparisons
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own party comparisons"
  ON public.user_party_comparisons
  FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role can manage party comparisons"
  ON public.user_party_comparisons
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_party_comparisons_updated_at
  BEFORE UPDATE ON public.user_party_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();