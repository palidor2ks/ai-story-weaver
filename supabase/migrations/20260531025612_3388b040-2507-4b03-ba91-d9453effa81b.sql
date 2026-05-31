CREATE TABLE IF NOT EXISTS public.donor_cause_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_name text NOT NULL,
  donor_type text NOT NULL,
  primary_cause_id text NOT NULL REFERENCES public.committee_causes(id) ON DELETE CASCADE,
  assigned_by text NOT NULL DEFAULT 'admin',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (donor_name, donor_type)
);

CREATE INDEX IF NOT EXISTS idx_donor_cause_overrides_lookup
  ON public.donor_cause_overrides(donor_name, donor_type);
CREATE INDEX IF NOT EXISTS idx_donor_cause_overrides_primary_cause_id
  ON public.donor_cause_overrides(primary_cause_id);

GRANT SELECT ON public.donor_cause_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_cause_overrides TO authenticated;
GRANT ALL ON public.donor_cause_overrides TO service_role;

ALTER TABLE public.donor_cause_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Donor cause overrides are viewable by everyone"
  ON public.donor_cause_overrides FOR SELECT USING (true);

CREATE POLICY "Admins manage donor cause overrides"
  ON public.donor_cause_overrides FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages donor cause overrides"
  ON public.donor_cause_overrides FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
