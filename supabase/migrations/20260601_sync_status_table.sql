-- =====================================================================
-- DATA SYNC STATUS TRACKING
-- =====================================================================

-- Track sync status for each table
CREATE TABLE IF NOT EXISTS public.sync_status (
  table_name text PRIMARY KEY,
  last_sync_at timestamptz,
  last_sync_duration_seconds integer,
  records_synced integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_deleted integer DEFAULT 0,
  last_error text,
  status text DEFAULT 'pending', -- pending, running, completed, failed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_status TO anon, authenticated;
GRANT ALL ON public.sync_status TO service_role;

ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_status public read"
  ON public.sync_status FOR SELECT
  USING (true);

CREATE POLICY "sync_status admin write"
  ON public.sync_status FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Sync history for auditing
CREATE TABLE IF NOT EXISTS public.sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  sync_started_at timestamptz NOT NULL,
  sync_completed_at timestamptz,
  duration_seconds integer,
  records_processed integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_deleted integer DEFAULT 0,
  status text NOT NULL, -- completed, failed, paused
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_history_table_date
  ON public.sync_history(table_name, sync_started_at DESC);

GRANT SELECT ON public.sync_history TO authenticated;
GRANT ALL ON public.sync_history TO service_role;

ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_history admin read"
  ON public.sync_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sync_history admin write"
  ON public.sync_history FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Initialize sync status for known tables
INSERT INTO public.sync_status (table_name, status)
VALUES
  ('candidates', 'pending'),
  ('candidate_committees', 'pending'),
  ('contributions', 'pending'),
  ('donors', 'pending'),
  ('bills', 'pending'),
  ('bill_sponsors', 'pending'),
  ('votes', 'pending'),
  ('static_officials', 'pending')
ON CONFLICT (table_name) DO NOTHING;

