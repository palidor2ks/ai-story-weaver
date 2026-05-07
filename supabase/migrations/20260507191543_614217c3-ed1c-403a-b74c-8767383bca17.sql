-- Add prior_offices column to track historical positions held
ALTER TABLE public.candidate_overrides 
ADD COLUMN prior_offices JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.candidate_overrides.prior_offices IS 'Array of prior offices held, e.g. [{"office":"Representative","state":"NJ","district":"11","start_year":2019,"end_year":2025,"candidate_id":"S001207"}]';