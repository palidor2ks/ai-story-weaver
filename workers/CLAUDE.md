# workers/CLAUDE.md

Railway worker process — replaces Supabase pg_cron jobs with graphile-worker.

## Architecture

```
Railway (this directory)         Supabase
────────────────────────         ──────────────────────────
worker.ts (graphile-worker) ───► edge functions (via HTTP)
crontab (schedules)              Postgres (graphile_worker schema)
tasks/ (job handlers)
```

**Phase 1 (current):** Tasks are thin wrappers that call the existing Supabase edge
functions via HTTP with the service-role key. The edge function logic is unchanged.

**Phase 2 (future):** Move the actual ETL logic directly into tasks/, removing the
round-trip through Supabase edge functions. Tasks will connect to Postgres directly via
`DATABASE_URL` and call external APIs themselves.

## Adding a new task

1. Create `tasks/<task_name>.ts` exporting a default `Task` function.
2. Add a crontab line to `crontab`.

Task naming: use underscores (`drain_fec_finance`), not hyphens. The filename is the
task identifier used in the crontab and graphile_worker job table.

> ⚠️ **`?jobKey` does NOT work in the crontab.** It's an `add_job` option, not a crontab
> option — graphile-worker silently ignores it on crontab lines, so scheduled jobs get a
> null `key` and there is **no singleton guard**. Existing entries still carry the param;
> it's a harmless no-op. Tasks must therefore be idempotent (they already are — each just
> re-fires an idempotent edge function). Real singleton/overlap control on the crontab is
> via `?fill=` / `?max=` if ever needed.

## Stuck-job self-heal (`reset_stuck_cron_jobs`)

Because the crontab has no singleton guard and a job that exhausts its 25 retries is never
run again, a *transient* outage can **permanently** jam a scheduled task: the cron keeps
firing but produces no runnable work, and the stall is silent. This is what froze
`drain_research_queue` for ~5 days after the 2026-06-22 cutover (a 401 during credential
setup maxed it out; rep-answer generation stopped entirely).

`tasks/reset_stuck_cron_jobs.ts` runs every 15 min, collapses duplicate maxed-out rows per
scheduled task, and grants the survivor **one** fresh attempt — enough for a transient
failure to recover, without hammering a genuinely-broken endpoint. Tune the "how long
maxed before healing" window with `STUCK_HEAL_MIN_AGE` (default `50 minutes`).

## Commands

```bash
bun install          # install deps
bun run start        # run worker (production)
bun run dev          # run with --watch (dev)
```

## Environment variables

See `.env.example`. Critical:
- `WORKER_DB_URL` (or `DATABASE_URL`) — must support **session**-level features: graphile-worker
  uses LISTEN/NOTIFY and advisory locks. Use the **direct** connection (`db.<ref>.supabase.co:5432`)
  or the **session pooler** (`...pooler.supabase.com:5432`). Do **NOT** use the **transaction
  pooler** (`:6543`) — it breaks graphile-worker (symptom: repeated `Failed to reset locked`). Also
  **avoid special characters (`@`, `$`) in the DB password** (or percent-encode them): an unescaped
  `@` mangles the URL and Supavisor then rejects the login with `ECIRCUITBREAKER` (auth lockout).
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used by `lib/call-edge.ts`.
- `CRON_SECRET` — the vault `cron_secret`, sent as `x-cron-secret` to authorize edge functions
  gated by `_shared/cron-auth.ts`. Required: under the project's new API-key system the service-role
  bearer no longer matches the functions' injected key, so this is the working cron credential.

## Removing the pg_cron jobs

Once Railway is confirmed working for all 4 initial tasks, create a migration to remove
the old pg_cron schedules. Use `cron.unschedule('job-name')` for each. Do NOT remove them
until Railway has been running cleanly for at least 24h (the drain jobs are idempotent so
double-firing during transition is harmless).

## Concurrency

Set `WORKER_CONCURRENCY` to match your Railway plan. Each slot runs one task at a time.
Note the crontab has no singleton guard (see "Adding a new task"), so overlapping runs of a
slow task are possible — tasks are idempotent so this is safe, but the main risk is the
drains all firing simultaneously and saturating the edge function concurrency. Default of 5
is conservative.

## graphile-worker schema

On first startup, graphile-worker auto-creates the `graphile_worker` schema in your
Postgres database. No manual migration needed. It creates:
- `graphile_worker.jobs` — the job queue
- `graphile_worker.known_crontabs` — registered crontab entries
- Helper functions and triggers

The schema is owned by the `postgres` role and is safe alongside Supabase's schema.
