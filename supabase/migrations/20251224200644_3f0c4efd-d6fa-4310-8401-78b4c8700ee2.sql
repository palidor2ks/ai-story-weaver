-- Add committee metadata columns to candidate_committees
ALTER TABLE public.candidate_committees
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS designation text,
ADD COLUMN IF NOT EXISTS designation_full text;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_candidate_committees_candidate_active 
ON public.candidate_committees(candidate_id, active);