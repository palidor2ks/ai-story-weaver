-- Corroboration rollout orchestrator — run via execute_sql MCP or psql
-- Fires net.http_post for each candidate's URL-less answers in batches of 25.
-- All requests are async (pg_net); staging rows arrive in _answer_corroboration
-- over the following 2-3 minutes as edge function background tasks complete.
--
-- Auth: uses Authorization: Bearer <anon_key> (gateway) + x-cron-secret (function).
--   The anon key is public by design; the cron secret is fetched live from get_cron_secret().
--   Do NOT use `apikey:` header format — the Supabase gateway v1 requires the
--   `Authorization: Bearer` format even for verify_jwt=false functions.
--
-- Scope: top N tier_1 federal (U.S.%) all-demoted candidates by answer count.
--   55-candidate rollout → 249 batches → 5,534 answers → ~$44 search-fee cost.
--   2026-06-17 actual: 5,534 staged, 130 corroborated (2.3%), 0 errors.
--
-- After run: inspect _answer_corroboration WHERE run_label = '<label>'
--   then run gated apply (see docs/HANDOFF.md) for corroborated=true rows only.

DO $$
DECLARE
  v_cron_secret text;
  -- anon key: public by design (RLS protects data; key is in client bundle).
  -- Get from: Supabase dashboard → Project Settings → API → "anon public" key,
  -- or from the VITE_SUPABASE_ANON_KEY value in .env.
  v_anon_key text := '<paste-anon-key-here>';
  v_url text := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/corroborate-answers';
  v_run_label text := 'rollout-2026-06-17';  -- change for new runs
  v_candidate_limit int := 55;               -- how many candidates to process
  v_batch_size int := 25;                    -- questions per invocation (keep ≤25 for background timer)
  cand record;
  all_qids text[];
  batch_qids text[];
  batch_start int;
  batch_end int;
  req_count int := 0;
BEGIN
  SELECT get_cron_secret() INTO v_cron_secret;
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE EXCEPTION 'get_cron_secret() returned empty — aborting';
  END IF;

  -- All-demoted tier_1 federal candidates, ordered by answer count desc
  FOR cand IN (
    WITH trusted AS (
      SELECT DISTINCT candidate_id
      FROM candidate_answers ca
      WHERE ca.evidence_type = 'voting_record'
        OR (ca.source_url IS NOT NULL AND ca.source_url !~ '^\s*$')
        OR EXISTS (SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND u !~ '^\s*$')
    )
    SELECT c.id AS candidate_id
    FROM candidates c
    LEFT JOIN trusted t ON t.candidate_id = c.id
    WHERE t.candidate_id IS NULL
      AND c.coverage_tier = 'tier_1'
      AND c.office LIKE 'U.S.%'
    ORDER BY (SELECT COUNT(*) FROM candidate_answers WHERE candidate_id = c.id) DESC
    LIMIT v_candidate_limit
  ) LOOP
    -- Collect all URL-less question_ids for this candidate
    SELECT array_agg(ca.question_id::text ORDER BY ca.question_id) INTO all_qids
    FROM candidate_answers ca
    WHERE ca.candidate_id = cand.candidate_id
      AND (ca.source_type IS NULL OR ca.source_type IN ('inferred', 'other'))
      AND (ca.source_url IS NULL OR ca.source_url = '' OR ca.source_url ~ '^\s*$')
      AND (ca.source_urls IS NULL OR ca.source_urls = '{}'
           OR NOT EXISTS (SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND u !~ '^\s*$'));

    IF all_qids IS NULL OR array_length(all_qids, 1) = 0 THEN
      CONTINUE;
    END IF;

    batch_start := 1;
    LOOP
      EXIT WHEN batch_start > array_length(all_qids, 1);
      batch_end := LEAST(batch_start + v_batch_size - 1, array_length(all_qids, 1));
      batch_qids := all_qids[batch_start:batch_end];

      PERFORM net.http_post(
        url := v_url,
        body := jsonb_build_object(
          'candidate_id', cand.candidate_id,
          'question_ids', to_jsonb(batch_qids),
          'run_label', v_run_label
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'x-cron-secret', v_cron_secret
        ),
        timeout_milliseconds := 15000
      );
      req_count := req_count + 1;
      batch_start := batch_start + v_batch_size;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Fired % net.http_post requests for run_label=%', req_count, v_run_label;
END $$;

-- Monitor progress after running:
-- SELECT COUNT(*) AS staged, COUNT(*) FILTER (WHERE corroborated) AS corroborated
-- FROM _answer_corroboration WHERE run_label = 'rollout-2026-06-17';
