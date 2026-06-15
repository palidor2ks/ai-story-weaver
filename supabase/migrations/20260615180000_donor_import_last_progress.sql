-- Heartbeat for donor import sessions.
--
-- Donor imports are driven entirely by the browser (DonorImportPanel.tsx slices the
-- CSV and calls import-fec-receipts-csv once per 500-row batch). The terminal status
-- is written only by the browser at the end of the loop, so any interruption (cancel,
-- tab close, navigation, network drop) orphans the row at status='running' forever.
-- Without a heartbeat there is no way to tell an actively-running import from one that
-- died hours ago.
--
-- This column lets the edge function stamp the last time a batch made progress, so the
-- admin UI can flag a stale 'running' session as "stalled". No new status value is
-- persisted by this migration; 'cancelled' (written by the client on cancel/reset) is
-- allowed because `status` is free-form text with no CHECK constraint.
ALTER TABLE public.donor_import_sessions
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;
