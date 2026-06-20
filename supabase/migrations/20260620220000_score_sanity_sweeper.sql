-- Score-sanity sweeper (tables + functions). The pg_cron SCHEDULES live in the companion migration
-- 20260620220001_score_sanity_sweeper_cron.sql, kept separate so apply-missing-migrations.sh pauses
-- on the cron gate (--include-crons) per guardrail #2 — this file is safe to apply on its own and
-- registers no scheduled work.
--
-- Background: the 2026-06-20 score-inversion bug (docs/score-inversion-fix.md). generate-legislator-
-- answers occasionally stored answers whose answer_value sign contradicted their own evidence prose,
-- and because those rows carried real source URLs they counted as TRUSTED and flipped a legislator's
-- persisted overall_score to the wrong side (e.g. a Republican shown far-left). #501 added the stance
-- guard that prevents NEW inversions, but already-stored rows are only corrected when a candidate is
-- REGENERATED. Regenerating the ~100 affected legislators by hand is slow, so this automates it.
--
-- DESIGN (mirrors requeue-stalled-research + drain-research-queue):
--   * Detector (score_sanity_detect): walks visible-state STATE/LOCAL legislators (the population
--     generate-legislator-answers handles — federal offices excluded) that have answers and aren't
--     yet in the queue, compares each one's full-answer average vs its TRUSTED-pool average, and
--     enqueues a verdict: 'flagged' (egregious inversion signature) or 'done' (looks fine). Bounded
--     to 300/run, so it sweeps the population over a few runs then idles — the "stop once all
--     visible-state reps have had a review" behaviour.
--   * Fixer (score_sanity_fix): drains 'flagged' rows. It BACKS UP then deletes a candidate's answers
--     (so generate-legislator-answers' getMissingQuestions treats them as missing) and fires
--     generate-legislator-answers via pg_net to regenerate them through the guard. It resumes on
--     later passes; once the regenerated score is no longer inverted it marks 'done'; an attempt cap
--     parks a stubborn candidate as 'gave_up' for human review.
--
-- SAFETY (this auto-deletes answers + spends Gemini budget when enabled, so it is deliberately timid):
--   * KILL-SWITCH, DEFAULT OFF (admin_stats_cache 'score_sweeper_enabled'). Both functions no-op
--     until it is flipped on; applying this migration starts nothing.
--   * Backup-before-delete: every deletion is copied to candidate_answers_score_sweep_backup first,
--     in the same transaction as the delete.
--   * One shared per-run budget (3) bounds BOTH the delete blast radius and the regen fires; every
--     delete is paired with a regen fire in the same run; 30-min per-candidate cooldown.
--   * Attempt cap (3) => no infinite loops; a candidate that can't be fixed is parked 'gave_up'.
--   * Egregious-only threshold (|trusted_avg| >= 5 AND |all_avg - trusted_avg| >= 5) so correctly
--     scored candidates whose voting record legitimately diverges from their full answer set are NOT
--     re-fixed. Thresholds/batch/cap/cooldown are simple constants at the top of each function.

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
-- LIKE copies columns only (no PK/unique/check) — intentional: a candidate can be backed up across
-- multiple attempts without conflict, and the backup never feeds the app.
CREATE TABLE IF NOT EXISTS public.candidate_answers_score_sweep_backup (
  LIKE public.candidate_answers
);
ALTER TABLE public.candidate_answers_score_sweep_backup
  ADD COLUMN IF NOT EXISTS swept_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_score_sweep_backup_candidate
  ON public.candidate_answers_score_sweep_backup (candidate_id);

-- RLS: operational tables, not user data, but the security baseline is "RLS on every table".
-- Admin-only, mirroring admin_stats_cache. (service_role bypasses RLS in Supabase, and the cron
-- functions are SECURITY DEFINER, so neither tooling nor the cron is blocked by these policies.)
ALTER TABLE public.score_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_answers_score_sweep_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_review_queue admin all" ON public.score_review_queue;
CREATE POLICY "score_review_queue admin all" ON public.score_review_queue
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "score_sweep_backup admin all" ON public.candidate_answers_score_sweep_backup;
CREATE POLICY "score_sweep_backup admin all" ON public.candidate_answers_score_sweep_backup
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Kill-switch, DEFAULT OFF. Enable with:
--   update admin_stats_cache set stat_value = '{"enabled": true}' where stat_key = 'score_sweeper_enabled';
-- NOTE: ON CONFLICT DO NOTHING means re-running this migration after the switch was turned ON leaves
-- it ON (it will not be reset to off). Intentional — re-migration must not clobber a deliberate enable.
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
                   AND abs(x.trusted_avg) >= 5                          -- tunable: trusted-pool magnitude
                   AND abs(coalesce(x.all_avg, 0) - x.trusted_avg) >= 5 -- tunable: divergence
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
    LIMIT 300                                                          -- bounded sweep; idles when done
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
  v_batch    int := 3;                       -- shared per-run budget: bounds BOTH deletes and fires
  v_cap      int := 3;                        -- max regen passes before giving up
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
  IF v_quiz IS NULL OR v_quiz <= 0 THEN RETURN; END IF;   -- no active quiz => nothing sensible to do

  -- Pass A: advance / finalize in-progress ('fixing') candidates first (uses the shared budget).
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
    LIMIT 100
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
      ELSIF coalesce(array_length(v_fire,1),0) < v_batch THEN
        -- complete but still inverted and under cap: another backup+delete+regen pass (uses budget)
        INSERT INTO public.candidate_answers_score_sweep_backup
          SELECT ca.*, now() FROM public.candidate_answers ca WHERE ca.candidate_id = r.candidate_id;
        DELETE FROM public.candidate_answers WHERE candidate_id = r.candidate_id;
        UPDATE public.score_review_queue
          SET attempts = attempts + 1, last_fired_at = now(), updated_at = now()
          WHERE candidate_id = r.candidate_id;
        v_fire := array_append(v_fire, r.candidate_id);
      END IF;
    ELSIF coalesce(array_length(v_fire,1),0) < v_batch THEN
      -- incomplete and under cap: resume regeneration (NO delete; getMissingQuestions fills the rest)
      UPDATE public.score_review_queue
        SET attempts = attempts + 1, last_fired_at = now(), updated_at = now()
        WHERE candidate_id = r.candidate_id;
      v_fire := array_append(v_fire, r.candidate_id);
    END IF;
  END LOOP;

  -- Pass B: promote fresh 'flagged' candidates with whatever budget remains (back up + delete + fire).
  FOR r IN
    SELECT candidate_id FROM public.score_review_queue
    WHERE status = 'flagged'
    ORDER BY flagged_at
    LIMIT GREATEST(v_batch - coalesce(array_length(v_fire,1),0), 0)
  LOOP
    INSERT INTO public.candidate_answers_score_sweep_backup
      SELECT ca.*, now() FROM public.candidate_answers ca WHERE ca.candidate_id = r.candidate_id;
    DELETE FROM public.candidate_answers WHERE candidate_id = r.candidate_id;
    UPDATE public.score_review_queue
      SET status = 'fixing', attempts = 1, last_fired_at = now(), updated_at = now()
      WHERE candidate_id = r.candidate_id;
    v_fire := array_append(v_fire, r.candidate_id);
  END LOOP;

  -- Fire generate-legislator-answers once for the whole batch.
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
