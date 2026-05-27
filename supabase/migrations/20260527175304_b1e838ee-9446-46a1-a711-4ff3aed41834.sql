ALTER TABLE public.donor_aliases
  ADD COLUMN IF NOT EXISTS primary_cause_id text REFERENCES public.committee_causes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cause_assigned_by text,
  ADD COLUMN IF NOT EXISTS cause_ai_confidence text,
  ADD COLUMN IF NOT EXISTS cause_ai_reasoning text,
  ADD COLUMN IF NOT EXISTS cause_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_donor_aliases_primary_cause_id ON public.donor_aliases(primary_cause_id);