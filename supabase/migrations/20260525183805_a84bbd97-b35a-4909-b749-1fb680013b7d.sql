-- Drop old simple table (empty, safe)
DROP TABLE IF EXISTS public.committee_aliases CASCADE;

CREATE TABLE public.committee_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  fec_committee_ids text[] NOT NULL DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX committee_aliases_fec_ids_idx
  ON public.committee_aliases USING GIN (fec_committee_ids);

ALTER TABLE public.committee_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read committee aliases"
  ON public.committee_aliases FOR SELECT
  USING (true);

CREATE POLICY "Admins manage committee aliases"
  ON public.committee_aliases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_committee_aliases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER committee_aliases_touch_updated_at
  BEFORE UPDATE ON public.committee_aliases
  FOR EACH ROW EXECUTE FUNCTION public.touch_committee_aliases_updated_at();