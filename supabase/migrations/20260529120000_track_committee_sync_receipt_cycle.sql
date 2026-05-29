-- Track which FEC two-year transaction period a committee sync cursor belongs to.
-- This keeps resumable receipt syncs scoped to the selected receipt cycle instead
-- of accidentally reusing a cursor from a candidate's election year or another cycle.
ALTER TABLE public.candidate_committees
  ADD COLUMN IF NOT EXISTS last_cycle text;

CREATE INDEX IF NOT EXISTS idx_candidate_committees_last_cycle
  ON public.candidate_committees(candidate_id, last_cycle);
