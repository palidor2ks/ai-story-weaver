
-- External PACs library: FEC-registered committees not tied to a candidate
CREATE TABLE IF NOT EXISTS public.external_pacs (
  fec_committee_id text PRIMARY KEY,
  name text NOT NULL,
  committee_type text,
  committee_type_full text,
  designation text,
  designation_full text,
  party text,
  state text,
  treasurer_name text,
  street_1 text,
  city text,
  zip text,
  filing_frequency text,
  organization_type text,
  cycles text[] DEFAULT '{}',
  first_file_date date,
  last_file_date date,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'fec_api',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_pacs_committee_type ON public.external_pacs (committee_type);
CREATE INDEX IF NOT EXISTS idx_external_pacs_name_lower ON public.external_pacs (lower(name));

ALTER TABLE public.external_pacs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External PACs are viewable by everyone"
  ON public.external_pacs FOR SELECT USING (true);

CREATE POLICY "Admins can manage external pacs"
  ON public.external_pacs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage external pacs"
  ON public.external_pacs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_external_pacs_updated_at
  BEFORE UPDATE ON public.external_pacs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sync status tracking
CREATE TABLE IF NOT EXISTS public.fec_committee_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  total_fetched integer NOT NULL DEFAULT 0,
  total_upserted integer NOT NULL DEFAULT 0,
  last_page integer NOT NULL DEFAULT 0,
  error_message text,
  triggered_by uuid
);

ALTER TABLE public.fec_committee_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fec committee sync status"
  ON public.fec_committee_sync_status FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage fec committee sync status"
  ON public.fec_committee_sync_status FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
