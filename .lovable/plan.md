# Railway Hybrid Plan — Answer Generation Pipeline First

Supabase stays as the system of record (Auth, Postgres, RLS, Storage, fast user-facing edge functions). Railway becomes the **worker plane** for long-running, fan-out, AI-heavy jobs that don't fit the edge runtime. We start with **rep answer generation**, because that's the pipeline that's currently failing today (429s, WORKER_LIMIT, 401s on `get-candidate-answers`, Perplexity quota issues).

This is a **plan only** — no code, no migrations until you greenlight.

---

## 1. What we're replacing

Today's answer-generation path on edge:

```text
admin UI / usePopulateCandidateAnswers
   └─ supabase.functions.invoke('get-candidate-answers')   ~1481 LOC
        ├─ Perplexity sonar-deep-research  (quota / 429s)
        ├─ Lovable AI Gateway (Gemini fallback)             (429s)
        └─ EdgeRuntime.waitUntil() background fanout         (WORKER_LIMIT)
```

Pain points this causes:
- 546 WORKER_LIMIT under fanout, forcing manual retry/backoff logic in the hook.
- 429 from AI Gateway with no global token budget.
- Perplexity 401 insufficient_quota with no circuit breaker.
- No durable queue — if the function dies mid-batch, work is lost.
- Auth coupling: function requires JWT, batch callers hit 401 when session expires.

The Railway worker fixes all of these structurally.

## 2. Target architecture

```text
                 ┌─────────────────────────────┐
   Admin UI ───▶ │ edge: enqueue-answer-job    │──┐  (short-lived, auth-gated)
                 └─────────────────────────────┘  │
                                                  ▼
                                    ┌──────────────────────┐
                                    │ Supabase Postgres    │
                                    │  job_queue           │
                                    │  job_runs            │
                                    │  job_dead_letters    │
                                    │  candidate_answers   │
                                    └──────────────────────┘
                                                  ▲
                                                  │  direct pg (least-priv role)
                                                  │
                  ┌──────────────────────────────────────────┐
   Railway ───▶  │ /worker (Node/TS)                        │
                  │  - poller loop (SKIP LOCKED)            │
                  │  - rep_answers_generate handler         │
                  │  - perplexity + AI gateway clients      │
                  │  - per-provider token bucket + budgets  │
                  │  - retry / backoff / dead-letter        │
                  └──────────────────────────────────────────┘
```

Key shifts vs today:
- **Durable queue in Postgres** (`FOR UPDATE SKIP LOCKED`) instead of `EdgeRuntime.waitUntil()`.
- **Direct pg connection** from the worker (per your choice) — no PostgREST round-trips for bulk writes.
- **Edge stays thin**: the only new edge function is `enqueue-answer-job`, which validates the admin caller and inserts rows into `job_queue`. All heavy lifting moves to Railway.
- **Existing `get-candidate-answers` is kept** for one release as a synchronous fallback path, then deprecated.

## 3. Schema additions (no code yet — described for review)

`job_queue` — claimable work items:
- `id`, `job_type` (`rep_answers_generate`), `payload jsonb` (candidate_id, question_ids[], force_regenerate), `priority`, `available_at`, `locked_at`, `locked_by`, `attempts`, `max_attempts`, `status` (`pending|running|done|failed|dead`), `idempotency_key unique`.

`job_runs` — observability per attempt:
- `id`, `queue_id`, `job_type`, `status`, `started_at`, `finished_at`, `attempt`, `error`, `checkpoint jsonb`, `metadata jsonb` (tokens used, provider, cost).

`job_dead_letters` — terminal failures with full payload + last error, for manual replay.

RLS: admin-only read; only service-role/worker writes. The worker authenticates via its own least-privileged Postgres role (separate from `service_role`), with grants scoped to these three tables plus `candidate_answers`, `candidates`, `questions`, `topics`.

## 4. Worker layout (`/worker` in this repo)

```text
worker/
  package.json          # Node 20, tsx, pg, zod, p-queue, pino
  Dockerfile            # for Railway
  railway.json          # service config
  src/
    index.ts            # boots poller + health endpoint
    db.ts               # pg Pool with WORKER_DB_URL
    queue.ts            # claimJob / completeJob / failJob (SKIP LOCKED)
    handlers/
      repAnswersGenerate.ts   # ported logic from get-candidate-answers
    providers/
      perplexity.ts     # with circuit breaker on 401/quota
      aiGateway.ts      # with token-bucket + daily budget
    safety/
      budget.ts         # daily token + $ caps, auto-pause flag in DB
      concurrency.ts    # p-queue with per-provider limits
    config.ts           # zod-validated env
  README.md
```

Shared types: the worker imports nothing from `src/` to keep the bundle small; instead, a tiny `worker/src/types/db.ts` mirrors only the row shapes it needs. Frontend keeps using generated `src/integrations/supabase/types.ts` unchanged.

## 5. What changes in the existing app

Minimal, intentionally:
- **New edge function** `enqueue-answer-job` (admin-gated, ~80 LOC): validates input, inserts into `job_queue`, returns `{ jobId, queued: N }`.
- **`usePopulateCandidateAnswers`**: gains an `enqueue` mode that calls the new edge function and then polls `job_runs` for progress. The existing synchronous `get-candidate-answers` path stays available behind a feature flag for one release.
- **Admin background-job monitor**: extend the existing v4 monitor (per memory) to also read `job_runs` rows, so admins see Railway jobs in the same UI.
- **`get-candidate-answers`**: no changes during cutover; deleted in cleanup step.

Nothing in the user-facing frontend changes.

## 6. Rollout (answer-generation pipeline only)

1. **Day 1 — Schema.** Migration for `job_queue`, `job_runs`, `job_dead_letters` + RLS + least-priv pg role `worker_answers`. Review-only — you approve before it runs.
2. **Day 2 — Worker scaffold.** `/worker` directory, Dockerfile, Railway project `data-workers`, service `answers-worker` deployed to staging with a no-op handler. Health check green.
3. **Day 3–4 — Port logic.** Move the research/Perplexity/Gemini logic from `get-candidate-answers/index.ts` (1481 LOC) into `handlers/repAnswersGenerate.ts`. Keep the same JSON schema and 50–80 word evidence-prefixed explanations (per memory). Provenance written to `candidate_answers` unchanged.
4. **Day 4 — Edge enqueue.** New `enqueue-answer-job` edge function. Admin auth check identical to `batch-populate-answers`.
5. **Day 5 — Safeguards.** Daily token budget, per-provider concurrency caps, circuit breaker on Perplexity 401, auto-pause flag in DB the worker checks each loop.
6. **Day 6 — Canary.** Run worker against one state's candidates in production; compare answer quality/coverage with current edge output.
7. **Day 7 — Cutover.** Flip the hook's default mode to `enqueue`. Keep `get-candidate-answers` deployed but unused for one release.
8. **Day 8 — Cleanup.** Delete `get-candidate-answers`, `populate-candidate-answers`, `batch-populate-answers` once metrics confirm parity.

FEC finance and voting-records pipelines come **after** this one is stable — they reuse the same `job_queue`/worker scaffolding, only adding new handlers.

## 7. Risks & open questions

- **Quality parity** with current Perplexity output must be verified on the canary — the validation memories (`answer-quality-validation-logic`, `evidence-first-explanation-format`) are non-negotiable.
- **Pg connection limits**: worker uses a small pool (≤5) and PgBouncer transaction mode via the Supabase pooler URL.
- **Cost**: Railway Hobby ≈ $5/mo + usage; worker idles at <128MB. AI provider costs are unchanged but become predictable due to the budget cap.
- **Secrets**: Perplexity + Lovable AI Gateway keys move from Supabase Edge secrets to Railway env. We'll keep both in sync during cutover.
- **Open question for you**: do you want the worker to also handle the per-question regenerate path (`questionIds: [id]`), or should that stay synchronous on edge for snappier admin UX? My recommendation: enqueue everything, poll for completion — simpler mental model and removes the 429/401 class of bugs entirely.

Reply with go/no-go and I'll start at Day 1 (schema migration).
