# PoliPulse Worker (Railway)

Long-running worker plane for jobs that don't fit Supabase Edge runtime constraints
(WORKER_LIMIT, 60s wall clock, no durable queue).

## Architecture

```
Admin UI ──▶ edge fn: enqueue-answer-job ──▶ public.job_queue (Postgres)
                                                    ▲
                                                    │  claim_jobs (SKIP LOCKED)
                                                    │
                                              this worker (Railway)
                                                    │
                                                    ▼
                                              candidate_answers
                                              job_runs / job_dead_letters
```

## Local dev

```bash
cd worker
cp .env.example .env
# Fill WORKER_DB_URL with the Supabase pooler URL (port 6543, sslmode=require)
npm install
npm run dev
```

Health check: <http://localhost:8080/healthz>

## Deploying to Railway

1. Create a new Railway project, "Deploy from GitHub repo", root directory `/worker`.
2. Railway auto-detects `railway.json` and uses the `Dockerfile`.
3. Add environment variables from `.env.example` in the Railway dashboard:
   - `WORKER_DB_URL` — Supabase pooler URL with the **service-role-equivalent** Postgres password
   - `PERPLEXITY_API_KEY`, `LOVABLE_API_KEY` — for the answer-generation handler (Day 3+)
4. Set the public domain to expose `/healthz`. Railway will use it for the healthcheck.

## Handlers

| job_type              | Handler                              | Status      |
|-----------------------|--------------------------------------|-------------|
| `rep_answers_generate`| `src/handlers/repAnswersGenerate.ts` | no-op (Day 2 scaffold — real logic ported in Day 3–4) |

Add new handlers by:
1. Creating `src/handlers/<name>.ts` exporting a `JobHandler`.
2. Registering it in `src/handlers/index.ts`.
3. Adding the `job_type` to `WORKER_JOB_TYPES`.

## Database contract

The worker only uses these RPCs and tables (see migration `Job queue infrastructure for Railway workers`):

- `claim_jobs(job_type, worker_id, batch_size, lock_seconds)` — atomic SKIP LOCKED claim
- `complete_job(id)` — mark done
- `fail_job(id, error, retry_delay_seconds)` — retry with backoff or dead-letter
- Tables: `job_queue`, `job_runs`, `job_dead_letters`

All three RPCs are `SECURITY DEFINER` and reject non-service-role callers, so the
worker must connect with the service-role Postgres password.
