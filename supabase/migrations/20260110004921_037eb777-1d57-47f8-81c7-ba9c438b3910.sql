-- Drop the bills table if it was partially created
DROP TABLE IF EXISTS public.candidate_votes CASCADE;
DROP TABLE IF EXISTS public.bills CASCADE;
DROP VIEW IF EXISTS public.votes_expanded;

-- =============================================================================
-- Create normalized bills table - one row per unique bill
-- =============================================================================

CREATE TABLE public.bills (
  id TEXT PRIMARY KEY,                    -- e.g., "HR2799-119" or existing bill_id format
  bill_type TEXT,                         -- HR, S, HRES, SRES, HJRES, SJRES
  bill_number INTEGER,
  congress INTEGER,
  session INTEGER,
  chamber TEXT,                           -- house, senate
  
  -- Descriptive info
  name TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  summary_fetched_at TIMESTAMPTZ,
  
  -- Topics (single source of truth)
  topic TEXT NOT NULL DEFAULT 'Government',
  additional_topics TEXT[] DEFAULT '{}',
  ai_detected_topics TEXT[] DEFAULT '{}',
  omnibus_type TEXT,
  
  -- Review workflow
  topic_flag TEXT,                        -- 'needs_review', 'mismatch', 'low_confidence', etc.
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  
  -- Timestamps
  introduced_date DATE,
  last_action_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_bills_topic ON public.bills(topic);
CREATE INDEX idx_bills_topic_flag ON public.bills(topic_flag) WHERE topic_flag IS NOT NULL;
CREATE INDEX idx_bills_congress ON public.bills(congress);
CREATE INDEX idx_bills_reviewed ON public.bills(reviewed_at) WHERE reviewed_at IS NULL;

-- Enable RLS
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

-- RLS policies for bills
CREATE POLICY "Bills are viewable by everyone"
  ON public.bills FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage bills"
  ON public.bills FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage bills"
  ON public.bills FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Create candidate_votes table - links candidates to bills with their position
-- =============================================================================

CREATE TABLE public.candidate_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  bill_id TEXT NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  
  -- Vote details
  action_type TEXT NOT NULL,              -- 'floor_vote', 'sponsored', 'cosponsored'
  position TEXT NOT NULL,                 -- 'Yea', 'Nay', 'Present', 'Not Voting', 'Sponsored', 'Cosponsored'
  vote_number INTEGER,                    -- For floor votes
  action_date TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Use a unique index with COALESCE instead of table-level constraint
CREATE UNIQUE INDEX idx_candidate_votes_unique 
  ON public.candidate_votes(bill_id, candidate_id, action_type, COALESCE(vote_number, 0));

-- Create indexes for common queries
CREATE INDEX idx_candidate_votes_candidate ON public.candidate_votes(candidate_id);
CREATE INDEX idx_candidate_votes_bill ON public.candidate_votes(bill_id);
CREATE INDEX idx_candidate_votes_action_type ON public.candidate_votes(action_type);
CREATE INDEX idx_candidate_votes_date ON public.candidate_votes(action_date DESC);

-- Enable RLS
ALTER TABLE public.candidate_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for candidate_votes
CREATE POLICY "Candidate votes are viewable by everyone"
  ON public.candidate_votes FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage candidate votes"
  ON public.candidate_votes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage candidate votes"
  ON public.candidate_votes FOR ALL
  USING (auth.role() = 'service_role');