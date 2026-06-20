-- Score-sanity sweeper: automated detect -> queue -> fix loop for the 2026-06-20 score-inversion
-- bug (see docs/score-inversion-fix.md). Background: generate-legislator-answers occasionally
-- stored answers whose answer_value sign contradicted their own evidence prose, and because those
-- rows carried real source URLs they counted as TRUSTED and flipped a legislator's persisted
-- overall_score to the wrong side (e.g. a Republican shown far-left). #501 added the stance guard
-- that prevents NEW inversions, but already-stored rows are only corrected when a candidate is
-- REGENERATED. Regenerating the ~100 affected legislators by hand is slow, so this automates it.
--
-- DESIGN (mirrors the existing requeue-stalled-research sweeper + drain-research-queue cron):
--   * Detector (score_sanity_detect): walks visible-state STATE/LOCAL legislators (the population
--     generate-legislator-answers handles — federal offices excluded) that have answers and aren't
--     yet in the queue, computes their full-answer average vs their TRUSTED-pool average, and
--     enqueues each as 'flagged' (egregious inversion signature) or 'done' (looks fine, no action).
--     Bounded to 300 candidates/run, so it sweeps the population over a few runs then idles —
--     this is the "stop once all visible-state reps have had a review" behaviour.
--   * Fixer (score_sanity_fix): drains 'flagged' rows in small batches. On the first pass it BACKS
--     UP then deletes the candidate's answers (so generate-legislator-answers' getMissingQuestions
--     treats them as missing) and fires generate-legislator-answers for them via pg_net. On later
--     passes it resumes/finalizes: once the regenerated score is no longer inverted it marks 'done';
--     an attempt cap stops it from looping forever on a stubborn candidate ('gave_up').
--
-- SAFETY (this cron auto-deletes answers and auto-spends Gemini budget, so it is deliberately timid):
--   * KILL-SWITCH, DEFAULT OFF. Both functions no-op unless admin_stats_cache key
--     'score_sweeper_enabled' is {"enabled": true}. Applying this migration does NOT start any work;
--     an admin flips the switch when ready (and can flip it back to pause instantly).
--   * Backup-before-delete: every deletion is copied to candidate_answers_score_sweep_backup first.
--   * Bounded batch (3 candidates fired/run) + 30-min cooldown per candidate => predictable spend.
--   * Attempt cap (3 delete+regen passes) => no infinite loops; a candidate that can't be fixed is
--     parked as 'gave_up' for human review rather than reprocessed forever.
--   * Egregious-only threshold (|trusted_avg| >= 5 AND |all_avg - trusted_avg| >= 5) so correctly
--     scored candidates whose voting record legitimately diverges from their full answer set
--     (e.g. a fixed legislator at +3.5 with full-avg ~0) are NOT re-fixed. Thresholds are simple
--     and tunable below.
--   * cron auth uses the vault publishable key + cron secret (the legacy anon JWT 401s at the
--     gateway under load), matching the score-inversion runbook.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- Queue + backup tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.score_review_queue (
  candidate_id text PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','fixing','done','gave_up')),
  all_avg      numeric,
  trusted_avg  numeric,
  attempts     int  NOT NULL DEFAULT 0,
  flagged_at   timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_review_queue_status ON public.score_review_queue (status);

-- Retains every answer the fixer deletes, so a bad regeneration can be investigated/reverted.
-- No PK/unique copied from candidate_answers (LIKE copies columns only) — a candidate can be
-- backed up across multiple attempts without conflict.
CREATE TABLE IF NOT EXISTS public.candidate_answers_score_sweep_backup (
  LIKE public.candidate_answers
);
ALTER TABLE public.candidate_answers_score_sweep_backup
  ADD COLUMN IF NOT EXISTS swept_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_score_sweep_backup_candidate
  ON public.candidate_answers_score_sweep_backup (candidate_id);

-- RLS: these are operational tables, not user data, but the security baseline is "RLS on every
-- table". Admin-only, mirroring admin_stats_cache.
ALTER TABLE public.score_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_answers_score_sweep_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_review_queue admin all" ON public.score_review_queue;
CREATE POLICY "score_review_queue admin all" ON public.score_review_queue
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "score_sweep_backup admin all" ON public.candidate_answers_score_sweep_backup;
CREATE POLICY "score_sweep_backup admin all" ON public.candidate_answers_score_sweep_backup
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Kill-switch, DEFAULT OFF. Enable with:
--   update admin_stats_cache set stat_value = '{"enabled": true}' where stat_key = 'score_sweeper_enabled';
INSERT INTO public.admin_stats_cache (stat_key, stat_value, updated_at)
VALUES ('score_sweeper_enabled', '{"enabled": false}'::jsonb, now())
ON CONFLICT (stat_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Detector: enqueue a review verdict for un-reviewed visible-state legislators
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_sanity_detect()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT coalesce((stat_value->>'enabled')::boolean, false) INTO v_enabled
    FROM public.admin_stats_cache WHERE stat_key = 'score_sweeper_enabled';
  IF NOT coalesce(v_enabled, false) THEN RETURN; END IF;

  INSERT INTO public.score_review_queue (candidate_id, status, all_avg, trusted_avg)
  SELECT x.id,
         CASE WHEN x.trusted_avg IS NOT NULL
                   AND abs(x.trusted_avg) >= 5                       -- tunable: trusted-pool magnitude
                   AND abs(coalesce(x.all_avg, 0) - x.trusted_avg) >= 5  -- tunable: divergence
              THEN 'flagged' ELSE 'done' END,
         round(x.all_avg::numeric, 2),
         round(x.trusted_avg::numeric, 2)
  FROM (
    SELECT c.id,
      avg(ca.answer_value) AS all_avg,
      avg(ca.answer_value) FILTER (WHERE
        ca.evidence_type = 'voting_record' OR ca.source_type = 'voting_record'
        OR (ca.source_url IS NOT NULL AND length(trim(ca.source_url)) > 0)
        OR (ca.source_urls IS NOT NULL AND EXISTS (
             SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND length(trim(u)) > 0))
      ) AS trusted_avg
    FROM public.candidates c
    JOIN public.candidate_answers ca ON ca.candidate_id = c.id
    WHERE c.id NOT IN (SELECT candidate_id FROM public.score_review_queue)
      -- state/local legislators only (matches generate-legislator-answers' batch office filter)
      AND c.office NOT ILIKE '%U.S. House%'
      AND c.office NOT ILIKE '%U.S. Senate%'
      AND c.office NOT ILIKE '%President%'
      AND c.office NOT ILIKE 'Representative'
      AND c.office NOT ILIKE 'Senator'
      -- visible states only (mirrors requeue-stalled-research / the drain gate)
      AND (upper(coalesce(c.state, '')) IN ('', 'US')
           OR upper(coalesce(c.state, '')) NOT IN (SELECT upper(state_code) FROM public.hidden_states))
    GROUP BY c.id
    LIMIT 300                                                       -- bounded sweep; idles when done
  ) x;
END $$;

-- ----------------------------------------------------------------------------
-- Fixer: regenerate flagged candidates via generate-legislator-answers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_sanity_fix()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_quiz     int;
  v_batch    int := 3;                       -- candidates fired per run (bounds Gemini spend)
  v_cap      int := 3;                        -- max delete+regen passes before giving up
  v_cooldown interval := interval '30 minutes';
  r          record;
  v_fire     text[] := '{}';
  v_inverted boolean;
  v_complete boolean;
BEGIN
  SELECT coalesce((stat_value->>'enabled')::boolean, false) INTO v_enabled
    FROM public.admin_stats_cache WHERE stat_key = 'score_sweeper_enabled';
  IF NOT coalesce(v_enabled, false) THEN RETURN; END IF;

  SELECT count(*) INTO v_quiz FROM public.questions WHERE include_in_politician_quiz;

  -- 1) Promote a few fresh 'flagged' rows to 'fixing': back up + delete their answers ONCE.
  FOR r IN
    SELECT candidate_id FROM public.score_review_queue
    WHERE status = 'flagged' ORDER BY flagged_at LIMIT v_batch
  LOOP
    INSERT INTO public.candidate_answers_score_sweep_backup
      SELECT ca.*, now() FROM public.candidate_answers ca WHERE ca.candidate_id = r.candidate_id;
    DELETE FROM public.candidate_answers WHERE candidate_id = r.candidate_id;
    UPDATE public.score_review_queue
      SET status = 'fixing', attempts = 0, last_fired_at = NULL, updated_at = now()
      WHERE candidate_id = r.candidate_id;
  END LOOP;

  -- 2) Advance / finalize 'fixing' rows that are off cooldown.
  FOR r IN
    SELECT q.candidate_id, q.attempts,
      (SELECT count(*) FROM public.candidate_answers ca WHERE ca.candidate_id = q.candidate_id) AS n,
      (SELECT avg(ca.answer_value) FROM public.candidate_answers ca WHERE ca.candidate_id = q.candidate_id) AS all_avg,
      (SELECT avg(ca.answer_value) FROM public.candidate_answers ca WHERE ca.candidate_id = q.candidate_id
        AND (ca.evidence_type = 'voting_record' OR ca.source_type = 'voting_record'
             OR (ca.source_url IS NOT NULL AND length(trim(ca.source_url)) > 0)
             OR (ca.source_urls IS NOT NULL AND EXISTS (
                  SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND length(trim(u)) > 0)))
      ) AS trusted_avg
    FROM public.score_review_queue q
    WHERE q.status = 'fixing'
      AND (q.last_fired_at IS NULL OR q.last_fired_at < now() - v_cooldown)
    ORDER BY q.flagged_at
    LIMIT 50
  LOOP
    v_inverted := r.trusted_avg IS NOT NULL
                  AND abs(r.trusted_avg) >= 5
                  AND abs(coalesce(r.all_avg, 0) - r.trusted_avg) >= 5;
    v_complete := r.n >= v_quiz - 5;          -- allow for a few guard-dropped answers

    IF v_complete OR r.attempts >= v_cap THEN
      IF NOT v_inverted THEN
        UPDATE public.score_review_queue
          SET status = 'done', all_avg = round(r.all_avg::numeric,2),
              trusted_avg = round(r.trusted_avg::numeric,2), updated_at = now()
          WHERE candidate_id = r.candidate_id;
      ELSIF r.attempts >= v_cap THEN
        UPDATE public.score_review_queue
          SET status = 'gave_up', all_avg = round(r.all_avg::numeric,2),
              trusted_avg = round(r.trusted_avg::numeric,2), updated_at = now()
          WHERE candidate_id = r.candidate_id;
      ELSE
        -- complete but still inverted and under cap: another backup+delete+regen pass
        IF coalesce(array_length(v_fire,1),0) < v_batch THEN
          INSERT INTO public.candidate_answers_score_sweep_backup
            SELECT ca.*, now() FROM public.candidate_answers ca WHERE ca.candidate_id = r.candidate_id;
          DELETE FROM public.candidate_answers WHERE candidate_id = r.candidate_id;
          UPDATE public.score_review_queue
            SET attempts = attempts + 1, last_fired_at = now(), updated_at = now()
            WHERE candidate_id = r.candidate_id;
          v_fire := array_append(v_fire, r.candidate_id);
        END IF;
      END IF;
    ELSE
      -- incomplete and under cap: resume (generate-legislator-answers fills missing, idempotent)
      IF coalesce(array_length(v_fire,1),0) < v_batch THEN
        UPDATE public.score_review_queue
          SET attempts = attempts + 1, last_fired_at = now(), updated_at = now()
          WHERE candidate_id = r.candidate_id;
        v_fire := array_append(v_fire, r.candidate_id);
      END IF;
    END IF;
  END LOOP;

  -- 3) Fire generate-legislator-answers once for the collected batch.
  IF coalesce(array_length(v_fire,1),0) >= 1 THEN
    PERFORM net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/generate-legislator-answers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_publishable_key'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_publishable_key'),
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := jsonb_build_object('candidateIds', to_jsonb(v_fire))
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Schedules (offset from the existing drain :00/:30 and requeue :20). The functions are no-ops
-- while the kill-switch is off, so these are safe to register here.
-- ----------------------------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('score-sanity-detector'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('score-sanity-fixer');    EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('score-sanity-detector', '10,40 * * * *', $cron$ SELECT public.score_sanity_detect(); $cron$);
SELECT cron.schedule('score-sanity-fixer',    '25,55 * * * *', $cron$ SELECT public.score_sanity_fix();    $cron$);
