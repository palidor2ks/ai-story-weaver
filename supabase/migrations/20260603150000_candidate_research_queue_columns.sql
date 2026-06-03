-- Phase 2 — enrichment queue drainer support.
-- Attempt tracking so drain-research-queue can lease candidates (cooldown via
-- last_research_at) and cap retries (research_attempts), keeping the drain idempotent
-- and preventing re-kicking research that is still in flight.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS research_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_research_at timestamptz;

-- Fast queue selection: only pending candidates, most-stale (or never-tried) first.
CREATE INDEX IF NOT EXISTS idx_candidates_research_queue
  ON public.candidates (last_research_at NULLS FIRST)
  WHERE answers_source = 'pending_research';
