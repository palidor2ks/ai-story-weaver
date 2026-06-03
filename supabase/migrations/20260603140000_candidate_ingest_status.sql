-- Cursor + run metrics for scheduled candidate-discovery sources (fec, sos:*, gdelt, ...).
-- One persistent row per source so runs are resumable and monitorable. Mirrors the existing
-- *_sync_status convention (fec_committee_sync_status / bill_sync_status).
CREATE TABLE IF NOT EXISTS public.candidate_ingest_status (
  source text PRIMARY KEY,                              -- 'fec' | 'sos:NJ' | 'gdelt'
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,            -- e.g. {"pages": {"2026-H": 7}}
  status text NOT NULL DEFAULT 'idle',                  -- idle | running | error
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_total_fetched integer NOT NULL DEFAULT 0,
  last_total_new integer NOT NULL DEFAULT 0,
  last_page integer NOT NULL DEFAULT 0,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_ingest_status ENABLE ROW LEVEL SECURITY;

-- Readable by everyone (admin dashboards / status panels); writable only by service role / admins.
CREATE POLICY "Candidate ingest status readable by everyone"
  ON public.candidate_ingest_status FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage candidate ingest status"
  ON public.candidate_ingest_status FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can manage candidate ingest status"
  ON public.candidate_ingest_status FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_candidate_ingest_status_updated_at
  BEFORE UPDATE ON public.candidate_ingest_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
