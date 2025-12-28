-- Make candidate_id nullable in donors table to support PAC donations (where there's no direct candidate)
ALTER TABLE public.donors 
  ALTER COLUMN candidate_id DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN public.donors.candidate_id IS 'NULL for donations to Super PACs that are not directly tied to a candidate';