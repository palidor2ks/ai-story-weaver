-- Add unique constraint for pac_expenditures upsert on fec_candidate_id
CREATE UNIQUE INDEX IF NOT EXISTS pac_expenditures_committee_fec_candidate_support_cycle_key 
ON public.pac_expenditures (committee_id, fec_candidate_id, support_oppose, cycle);

-- Drop the old constraint if it exists (it was on candidate_id which can be null)
ALTER TABLE public.pac_expenditures DROP CONSTRAINT IF EXISTS pac_expenditures_unique_entry;