## Plan: make donor backfill resilient by design

The current path is still too monolithic: even after timeout guards, `fetch-fec-donors` can spend 100+ seconds flushing donors/rollups/reconciliation after paging, and the scheduler can still receive auth/timeout failures. I’ll make the backfill more drastic and intentionally small per invocation.

### 1. Fix the immediate 401 regression
- Update `schedule-congress-donor-sync` and `sync-all-donors` calls so nested function calls use a deploy-safe internal token pattern.
- Ensure `sync-all-donors`, `fetch-fec-donors`, and `fetch-fec-candidate-id` all accept service-role calls consistently while preserving admin JWT checks for UI users.

### 2. Hard-limit each donor import to tiny chunks
- Change `sync-all-donors` to call `fetch-fec-donors` with conservative settings:
  - `limit = 1` candidate at a time
  - `highVolumeMode = true`
  - `maxPages` reduced to a tiny page count per invocation
- This makes every backfill tick intentionally partial instead of trying to finish a large candidate in one edge runtime.

### 3. Remove expensive work from partial runs
- In `fetch-fec-donors`, when a run is partial (`hasMore=true` or timeout/rate-limit):
  - save contributions and cursor only
  - skip donor aggregate flushing
  - skip committee rollups
  - skip finance reconciliation
  - return immediately with `success: true`, `hasMore: true`, `stoppedDueToTimeout: true`
- Only run donor aggregate flush, rollups, FEC totals, reconciliation, and `last_donor_sync` once the committee/candidate is complete.

### 4. Stop loading thousands of old donors on resume
- Remove the resume-time load of all existing donors into memory.
- For partial chunks, treat contributions as the durable source of truth.
- Rebuild/upsert donor aggregates only at completion, or with a small bounded batch if completion happens inside the current invocation.

### 5. Make failures non-blocking
- Treat nested fetch timeouts, 429s, 504s, and worker-limit style errors as partial progress, not failed candidates.
- Keep cursor state so the next scheduled run continues rather than retrying the same expensive page forever.

### 6. Deploy and verify
- Deploy the three affected edge functions.
- Run a one-candidate backfill test.
- Confirm the latest `donor_sync_runs` row shows `partial` or `completed`, not `HTTP 401`, `HTTP 504`, or failed timeout.
- Check edge logs for short execution times and no post-timeout donor flush/rollup.

### Expected behavior
Backfill will take more cron ticks for very large candidates, but it should stop throwing runtime errors. Each invocation should do a small durable slice, save its cursor, return cleanly, and resume on the next run.