-- 2026-06-26 — Revive the stalled rep-answers drainer (Railway graphile-worker)
-- =============================================================================
-- SYMPTOM (observed 2026-06-26): net-new candidate research stopped ~2026-06-23.
--   - 322 candidates stuck in candidates.answers_source = 'pending_research'
--     (oldest last_answers_sync 2026-06-21), only ~14 synced in the prior 24h.
--   - graphile_worker task `drain_research_queue` is parked at attempts = 25/25
--     (max) with last_error = 'drain-research-queue HTTP 401: {"error":"Unauthorized"}'
--     and has not advanced since 2026-06-23 02:00. `nightly_bill_sync` shows the
--     same 401.
--
-- ROOT CAUSE: an AUTH break, not an empty queue. The Railway worker calls the
-- edge functions over HTTP with a credential the functions no longer accept
-- (see workers/CLAUDE.md: under the project's new API-key system the service-role
-- bearer no longer matches the functions' injected key — CRON_SECRET, sent as
-- x-cron-secret, is the working cron credential). A 401 means the worker's
-- CRON_SECRET / service-role key in Railway's env is stale or missing.
--
-- ORDER OF OPERATIONS (do NOT skip step 1 — re-arming before the credential is
-- fixed just burns another 25 attempts straight back to a parked 401):
--   1. In RAILWAY (platform env, not this repo): rotate/set CRON_SECRET to match
--      the vault `cron_secret` the edge functions check via _shared/cron-auth.ts,
--      and confirm SUPABASE_SERVICE_ROLE_KEY is current. Redeploy the worker.
--   2. Run step A below to confirm the worker can reach the edge function (a fresh
--      manual kick should NOT return 401).
--   3. Run step B to re-arm the parked drain_research_queue job.
--
-- These statements touch the graphile_worker schema on PRODUCTION. Run them
-- deliberately, one block at a time. Read-only health checks are safe anytime.


-- ── HEALTH CHECK (read-only — safe to run anytime) ───────────────────────────
-- Answer-pipeline Railway tasks: are they parked, and on what error?
SELECT t.identifier,
       j.attempts,
       j.max_attempts,
       j.run_at,
       j.locked_at,
       left(j.last_error, 120) AS last_error
FROM graphile_worker._private_jobs j
JOIN graphile_worker._private_tasks t ON t.id = j.task_id
WHERE t.identifier IN ('drain_research_queue', 'nightly_bill_sync')
ORDER BY t.identifier;

-- Backlog the drainer is supposed to be clearing:
SELECT answers_source,
       count(*)                                                          AS candidates,
       count(*) FILTER (WHERE last_answers_sync > now() - interval '24 hours') AS synced_24h,
       min(last_answers_sync)                                            AS oldest_sync,
       max(last_answers_sync)                                            AS newest_sync
FROM public.candidates
WHERE answers_source IN ('pending_research', 'ai_generated')
GROUP BY answers_source
ORDER BY answers_source;


-- ── STEP A — verify auth is fixed BEFORE re-arming (run from a shell, not SQL) ─
-- Replace <CRON_SECRET> with the value you set in Railway. A healthy worker gets
-- 200/started here; a stale credential still 401s — if so, STOP and fix step 1.
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -X POST 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-research-queue' \
--     -H 'Content-Type: application/json' \
--     -H 'x-cron-secret: <CRON_SECRET>' \
--     -d '{"batchSize":5}'


-- ── STEP B — re-arm the parked drain_research_queue job (run AFTER step A is 200) ─
-- The job's `key` was nulled when it permanently failed, so graphile_worker.remove_job()
-- can't target it; reset attempts/run_at in place so the next worker poll re-runs it.
-- Scoped to the one parked task; leaves every other job untouched.
UPDATE graphile_worker._private_jobs j
SET attempts   = 0,
    run_at     = now(),
    last_error = NULL
FROM graphile_worker._private_tasks t
WHERE t.id = j.task_id
  AND t.identifier = 'drain_research_queue'
  AND j.attempts >= j.max_attempts;   -- only the parked corpse, never a live/queued run

-- Same treatment for nightly_bill_sync once its auth is confirmed (it is at 11/25,
-- still retrying, so re-arm is optional — uncomment only if it parks at 25/25):
-- UPDATE graphile_worker._private_jobs j
-- SET attempts = 0, run_at = now(), last_error = NULL
-- FROM graphile_worker._private_tasks t
-- WHERE t.id = j.task_id AND t.identifier = 'nightly_bill_sync' AND j.attempts >= j.max_attempts;


-- ── VERIFY (read-only) — run ~10 min after step B ────────────────────────────
-- Expect drain_research_queue attempts back near 0 with no 401, and synced_24h on
-- 'pending_research' climbing as candidates flip to 'ai_generated'.
-- (Re-run the HEALTH CHECK block above.)
