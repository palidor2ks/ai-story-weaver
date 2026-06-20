-- Per-answer source audit (tables + functions). The pg_cron SCHEDULES live in the companion
-- migration 20260620230001_answer_source_audit_cron.sql, kept separate so
-- apply-missing-migrations.sh pauses on the cron gate (--include-crons) per guardrail #2 — this
-- file is safe to apply on its own and registers no scheduled work.
--
-- Background: the aggregate score-sanity sweeper (20260620220000/...0001) works per-CANDIDATE and
-- assumes an inverted trusted-pool average is wrong. The owner wanted a MORE PRECISE design that
-- (a) works per-ANSWER, (b) does NOT assume party-opposite == wrong, and (c) NEVER bulk-deletes a
-- candidate's whole answer set. This is that auditor: detect → AI-verify → targeted-fix.
--
-- DESIGN (three stages):
--   * PREFILTER (answer_audit_detect): cheap SQL that enqueues, into answer_source_audit, the
--     individual CITED answers whose L/R direction is OPPOSITE the candidate's party. Same office +
--     hidden_states population scope as score_sanity_detect (visible-state STATE/LOCAL legislators;
--     federal/President excluded). Party-opposite is only a SUSPICION, never a verdict.
--   * AI CHECK (edge function audit-answer-sources, scheduled in the companion migration): for each
--     'pending' row it asks Gemini whether the answer's OWN cited source tells the same story as the
--     stored answer_value, and whether the source URL is real/reachable. It writes verdict ∈
--     {consistent, contradicts, unverifiable}.
--   * FIX (answer_audit_fix): drains ONLY verdict='contradicts' rows. For each, it backs up just
--     those specific (candidate_id, question_id) rows, DELETEs only those rows, and fires
--     generate-legislator-answers for the candidate so the guard chain regenerates exactly those
--     questions. All non-contradicting answers are LEFT IN PLACE. It NEVER deletes a candidate's
--     whole answer set.
--
-- SAFETY (this can delete answers + spend Gemini budget when enabled, so it is deliberately timid):
--   * KILL-SWITCH, DEFAULT OFF (admin_stats_cache 'answer_audit_enabled'). Every stage no-ops until
--     it is flipped on; applying this migration starts nothing.
--   * Backup-before-delete: the fixer copies the exact rows it deletes into
--     candidate_answers_audit_backup in the same transaction as the delete.
--   * Bounded: detector enqueues <=300/run; fixer touches <=3 candidates/run with a 30-min
--     per-candidate cooldown and a 3-attempt cap; the AI check runs a bounded batch.
--   * Targeted: only verdict='contradicts' rows are ever deleted, and only those exact rows — a
--     candidate's other answers are untouched.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- Audit queue + per-answer backup tables
-- ----------------------------------------------------------------------------
-- One row per suspicious (candidate, question) answer. PK is the answer's natural key so the
-- prefilter can enqueue idempotently (ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS public.answer_source_audit (
  candidate_id text NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  question_id  text NOT NULL REFERENCES public.questions(id),
  answer_value int,
  verdict      text NOT NULL DEFAULT 'pending'
                 CHECK (verdict IN ('pending','consistent','contradicts','unverifiable')),
  reason       text,
  attempts     int  NOT NULL DEFAULT 0,
  checked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_answer_source_audit_verdict
  ON public.answer_source_audit (verdict);

-- Retains every answer the fixer deletes, so a bad regeneration can be investigated/reverted.
-- LIKE copies columns only (no PK/unique/check) — intentional: the same (candidate, question) can
-- be backed up across multiple attempts without conflict, and the backup never feeds the app.
CREATE TABLE IF NOT EXISTS public.candidate_answers_audit_backup (
  LIKE public.candidate_answers
);
ALTER TABLE public.candidate_answers_audit_backup
  ADD COLUMN IF NOT EXISTS swept_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_answer_audit_backup_candidate
  ON public.candidate_answers_audit_backup (candidate_id);

-- RLS: operational tables, not user data, but the security baseline is "RLS on every table".
-- Admin-only, mirroring score_review_queue. (service_role bypasses RLS in Supabase, and the cron
-- functions are SECURITY DEFINER, so neither tooling nor the cron is blocked by these policies.)
-- NOTE: the ::app_role cast is REQUIRED (regression fixed in #507).
ALTER TABLE public.answer_source_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_answers_audit_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "answer_source_audit admin all" ON public.answer_source_audit;
CREATE POLICY "answer_source_audit admin all" ON public.answer_source_audit
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "answer_audit_backup admin all" ON public.candidate_answers_audit_backup;
CREATE POLICY "answer_audit_backup admin all" ON public.candidate_answers_audit_backup
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Kill-switch, DEFAULT OFF. Enable with:
--   update admin_stats_cache set stat_value = '{"enabled": true}' where stat_key = 'answer_audit_enabled';
-- ON CONFLICT DO NOTHING means re-running this migration after the switch was turned ON leaves it
-- ON (it will not be reset to off). Intentional — re-migration must not clobber a deliberate enable.
INSERT INTO public.admin_stats_cache (stat_key, stat_value, updated_at)
VALUES ('answer_audit_enabled', '{"enabled": false}'::jsonb, now())
ON CONFLICT (stat_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PREFILTER: enqueue party-opposite CITED answers for in-scope legislators
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.answer_audit_detect()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT coalesce((stat_value->>'enabled')::boolean, false) INTO v_enabled
    FROM public.admin_stats_cache WHERE stat_key = 'answer_audit_enabled';
  IF NOT coalesce(v_enabled, false) THEN RETURN; END IF;

  INSERT INTO public.answer_source_audit (candidate_id, question_id, answer_value, verdict)
  SELECT ca.candidate_id, ca.question_id, ca.answer_value, 'pending'
  FROM public.candidate_answers ca
  JOIN public.candidates c ON c.id = ca.candidate_id
  WHERE
    -- CITED answers only: a real source_url, a non-empty source_urls element, or a vote label.
    (
      ca.evidence_type = 'voting_record' OR ca.source_type = 'voting_record'
      OR (ca.source_url IS NOT NULL AND length(trim(ca.source_url)) > 0)
      OR (ca.source_urls IS NOT NULL AND EXISTS (
           SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND length(trim(u)) > 0))
    )
    -- Party-opposite direction (mirrors isPartyOpposite in _shared/answer-source-audit.ts).
    AND (
      (c.party ILIKE 'Republican%' AND ca.answer_value <= -3)
      OR (c.party ILIKE 'Democrat%'  AND ca.answer_value >= 3)
    )
    -- state/local legislators only (EXACT office filter from score_sanity_detect).
    AND c.office NOT ILIKE '%U.S. House%'
    AND c.office NOT ILIKE '%U.S. Senate%'
    AND c.office NOT ILIKE '%President%'
    AND c.office NOT ILIKE 'Representative'
    AND c.office NOT ILIKE 'Senator'
    -- visible states only (EXACT hidden_states filter from score_sanity_detect).
    AND (upper(coalesce(c.state, '')) IN ('', 'US')
         OR upper(coalesce(c.state, '')) NOT IN (SELECT upper(state_code) FROM public.hidden_states))
    -- not already enqueued (idempotent across runs).
    AND NOT EXISTS (
      SELECT 1 FROM public.answer_source_audit a
      WHERE a.candidate_id = ca.candidate_id AND a.question_id = ca.question_id)
  ORDER BY ca.candidate_id, ca.question_id
  LIMIT 300                                                          -- bounded sweep; idles when done
  ON CONFLICT (candidate_id, question_id) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- FIX: targeted regeneration of CONFIRMED (verdict='contradicts') answers only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.answer_audit_fix()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_batch    int := 3;                       -- shared per-run budget: bounds the candidates touched
  v_cap      int := 3;                        -- max regen passes per candidate before giving up
  v_cooldown interval := interval '30 minutes';
  r          record;
  v_fire     text[] := '{}';
BEGIN
  SELECT coalesce((stat_value->>'enabled')::boolean, false) INTO v_enabled
    FROM public.admin_stats_cache WHERE stat_key = 'answer_audit_enabled';
  IF NOT coalesce(v_enabled, false) THEN RETURN; END IF;

  -- Pick up to v_batch candidates that have at least one CONFIRMED-inverted answer, that are off
  -- cooldown and under the attempt cap. We process per-candidate so one generate-legislator-answers
  -- fire covers all of that candidate's contradicting questions.
  FOR r IN
    SELECT a.candidate_id,
           array_agg(a.question_id) AS qids,
           max(a.attempts)          AS max_attempts
    FROM public.answer_source_audit a
    WHERE a.verdict = 'contradicts'
      AND a.attempts < v_cap
      AND (a.checked_at IS NULL OR a.checked_at < now() - v_cooldown)
    GROUP BY a.candidate_id
    ORDER BY min(a.created_at)
    LIMIT v_batch
  LOOP
    -- Back up ONLY these specific (candidate_id, question_id) rows, then delete ONLY those rows.
    -- Non-contradicting answers for this candidate are NEVER touched. (NB: this is the precise
    -- opposite of score_sanity_fix, which deletes the candidate's whole set.)
    INSERT INTO public.candidate_answers_audit_backup
      SELECT ca.*, now()
      FROM public.candidate_answers ca
      WHERE ca.candidate_id = r.candidate_id
        AND ca.question_id = ANY(r.qids);

    DELETE FROM public.candidate_answers ca
      WHERE ca.candidate_id = r.candidate_id
        AND ca.question_id = ANY(r.qids);

    -- Mark these audit rows processed: bump attempts + checked_at so the cooldown applies and the
    -- attempt cap eventually parks a candidate whose regeneration keeps re-confirming. We retain
    -- the 'contradicts' verdict as the historical record; a re-detect after regeneration enqueues
    -- a fresh 'pending' row keyed identically only if the new answer is still party-opposite.
    UPDATE public.answer_source_audit a
      SET attempts = a.attempts + 1,
          checked_at = now(),
          reason = coalesce(a.reason, '') || ' [regen fired]',
          updated_at = now()
      WHERE a.candidate_id = r.candidate_id
        AND a.question_id = ANY(r.qids);

    v_fire := array_append(v_fire, r.candidate_id);
  END LOOP;

  -- Fire generate-legislator-answers once for the whole batch (same header/auth pattern as
  -- score_sanity_fix: publishable key for apikey/Authorization, vault cron_secret for x-cron-secret).
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
