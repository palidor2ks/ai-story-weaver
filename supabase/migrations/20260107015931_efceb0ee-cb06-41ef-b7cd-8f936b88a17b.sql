-- Table to cache admin dashboard statistics
CREATE TABLE public.admin_stats_cache (
  stat_key TEXT PRIMARY KEY,
  stat_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_stats_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read stats cache" 
  ON public.admin_stats_cache FOR SELECT 
  TO authenticated 
  USING (true);

-- Allow admins to manage stats cache
CREATE POLICY "Admins can manage stats cache" 
  ON public.admin_stats_cache FOR ALL 
  TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed initial empty values so page loads immediately
INSERT INTO public.admin_stats_cache (stat_key, stat_value) VALUES
  ('voting_records_stats', '{"legislativeActions": 0, "floorVotes": 0, "totalRecords": 0, "membersSynced": 0, "coveragePercentage": 0}'::jsonb),
  ('candidate_answer_stats', '{"totalCandidates": 0, "totalQuestions": 0, "noAnswers": 0, "lowCoverage": 0, "fullCoverage": 0}'::jsonb),
  ('fec_stats', '{"withFecId": 0, "neverSynced": 0, "partialSync": 0, "complete": 0}'::jsonb);