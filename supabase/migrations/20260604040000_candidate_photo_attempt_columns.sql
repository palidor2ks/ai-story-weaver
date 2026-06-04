-- Automatic photo enrichment — attempt tracking.
-- Mirrors the research-queue columns so the scheduled photo drainer (enrich-official-photos
-- in 'missing' mode) can lease rows (cooldown via photo_checked_at) and cap retries
-- (photo_attempts). This stops the cron from re-hitting the AI photo finder every run for
-- candidates that have no verifiable portrait, while still letting it re-check occasionally.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS photo_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_checked_at timestamptz;

ALTER TABLE public.candidate_overrides
  ADD COLUMN IF NOT EXISTS photo_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_checked_at timestamptz;

-- Fast queue selection: rows still missing a photo, never-tried (or most-stale) first.
CREATE INDEX IF NOT EXISTS idx_candidates_photo_queue
  ON public.candidates (photo_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';

CREATE INDEX IF NOT EXISTS idx_candidate_overrides_photo_queue
  ON public.candidate_overrides (photo_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';
