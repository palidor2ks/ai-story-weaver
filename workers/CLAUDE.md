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
2. Add a crontab line to `crontab` with `?jobKey=<task_name>&jobKeyMode=preserve_run_at`.
3. The `?jobKey` option ensures only one instance queues at a time (singleton behavior).

Task naming: use underscores (`drain_fec_finance`), not hyphens. The filename is the
task identifier used in the crontab and graphile_worker job table.

## Commands

```bash
bun install          # install deps
bun run start        # run worker (production)
bun run dev          # run with --watch (dev)
```

## Environment variables

See `.env.example`. Critical:
- `DATABASE_URL` — must be the **direct** Supabase connection (port 5432, not the pooler).
  graphile-worker uses LISTEN/NOTIFY and advisory locks; the transaction pooler breaks these.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used by `lib/call-edge.ts`.

## Removing the pg_cron jobs

Once Railway is confirmed working for all 4 initial tasks, create a migration to remove
the old pg_cron schedules. Use `cron.unschedule('job-name')` for each. Do NOT remove them
until Railway has been running cleanly for at least 24h (the drain jobs are idempotent so
double-firing during transition is harmless).

## Concurrency

Set `WORKER_CONCURRENCY` to match your Railway plan. Each slot runs one task at a time.
The `?jobKey` crontab option already prevents more than one queued instance of each
scheduled task, so the main risk is the 4 drains all firing simultaneously and saturating
the edge function concurrency. Default of 5 is conservative.

## graphile-worker schema

On first startup, graphile-worker auto-creates the `graphile_worker` schema in your
Postgres database. No manual migration needed. It creates:
- `graphile_worker.jobs` — the job queue
- `graphile_worker.known_crontabs` — registered crontab entries
- Helper functions and triggers

The schema is owned by the `postgres` role and is safe alongside Supabase's schema.
