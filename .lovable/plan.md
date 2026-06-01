## Goal

Continuously run `fetch-fec-donors` for every congressional candidate in a **visible** state (US House + US Senate, excluding states in `hidden_states`) until donor data is complete, then keep it fresh with a daily check. Same pipeline closes the "never-synced" gap whenever new candidates appear.

## Re-analysis (live DB, just verified)

Scope = candidates whose `office` matches Senate/House and whose `state` is NOT in `hidden_states`:

| Metric | Count |
|---|---|
| Total visible-congress candidates | 121 |
| Missing `fec_candidate_id` | **0** ✅ |
| Have FEC ID, never donor-synced | **34** |
| Have FEC ID, donor-synced >24h ago | 80 |
| Have FEC ID, fresh (<24h) | 7 |

Every visible-congress candidate already has an FEC ID, so the "never-synced FEC ID" gap today reduces to the 34 candidates whose FEC ID is known but `last_donor_sync IS NULL`. The plan still includes a defensive FEC-ID lookup step because new candidates get added over time and the daily check should catch them automatically.

## Approach

Two scheduled pg_cron jobs that drive a slightly extended `sync-all-donors` → `fetch-fec-donors` pipeline, fronted by a thin scheduler edge function that also fills missing FEC IDs before each run.

### 1. Extend `sync-all-donors` with `scope` + `mode`

Add `scope: 'congress_visible'` → restricts candidate selection to:

- `office ILIKE '%senate%' OR office ILIKE '%house%' OR office IN ('Senator','Representative')`
- `state NOT IN (SELECT state_code FROM hidden_states)`
- `fec_candidate_id IS NOT NULL`

Add `mode`:
- `'backfill'` → only `last_donor_sync IS NULL` (drains naturally)
- `'refresh'` → `last_donor_sync IS NULL OR last_donor_sync < now() - interval '24 hours'`

Return shape adds `remaining: number` so the scheduler / UI can show progress and the cron run becomes a no-op once the queue is empty. Existing ordering (`last_donor_sync ASC NULLS FIRST`) is preserved — never-synced run first.

### 2. New scheduler edge function `schedule-congress-donor-sync`

Each invocation:
1. Selects up to N visible-congress candidates with `fec_candidate_id IS NULL` → calls `fetch-fec-candidate-id` per row (today: 0 rows; future-proofing)
2. Calls `sync-all-donors` with `{ scope: 'congress_visible', mode, limit }`
3. Writes one row to `donor_sync_runs` with `mode`, `processed`, `success`, `failed`, `remaining`, `errors[]`, `started_at`, `finished_at`
4. Uses a pg advisory lock so overlapping cron ticks no-op instead of stacking

### 3. Backfill cron — every 10 min until done

```text
schedule: */10 * * * *
calls:    schedule-congress-donor-sync { mode: 'backfill', limit: 10 }
```

10 candidates × ~1.5s each → well under the 150s edge timeout. 34 in queue today → drained in ~4 ticks (~40 min), then auto-quiesces.

### 4. Daily refresh cron — 07:00 UTC

```text
schedule: 0 7 * * *
calls:    schedule-congress-donor-sync { mode: 'refresh', limit: 25 }
```

Re-syncs anything ≥24h old plus any newly added candidate. Whatever it can't finish in one tick gets mopped up by the 10-min backfill cron the same day.

### 5. Observability + UI (new "Automated Jobs" card on `/admin`)

- New table `donor_sync_runs` (admin-read RLS) feeds a panel showing:
  - Queue depth (`remaining`) for backfill + refresh
  - Last run timestamp + mode + processed/success/failed
  - Next scheduled run (static text from cron schedule)
  - "Run now" button → invokes `schedule-congress-donor-sync` with `mode: 'backfill'`
- `BulkDonorSyncCard` gets a small "Auto-backfill: ON" badge next to the `neverSynced` counter so the existing manual flow stays discoverable

## Files to touch

- `supabase/functions/sync-all-donors/index.ts` — add `scope`, `mode`, return `remaining`
- `supabase/functions/schedule-congress-donor-sync/index.ts` — new wrapper + advisory lock + run logging
- Migration — create `donor_sync_runs` (with GRANTs + RLS); enable `pg_cron` + `pg_net`; schedule the two cron jobs
- `src/components/admin/AutomatedJobsCard.tsx` — new monitoring card on `/admin`
- `src/components/admin/BulkDonorSyncCard.tsx` — add auto-backfill badge

## Worth flagging

1. **pg_cron + pg_net** must be enabled on the Supabase project (one-time, done by the migration).
2. **FEC rate limit** is 1000/hr per key — current pacing is comfortably under.
3. **"Complete" is a moving target.** New candidates can appear via `fetch-fec-candidate-id`; states can flip in `hidden_states`. Daily refresh + missing-FEC-ID pre-step covers both.
4. **Cycle is currently hard-coded to `'2024'`.** Pass it as a parameter from the cron call so we can flip to `'2026'` without a redeploy.
5. **Generalization.** Same `scope`+`mode`+`schedule-…` pattern will fit voting records, bill sponsors, civic officials, external committees. Worth a tiny `data_sync_jobs` config table later — out of scope for this first iteration.

## Out of scope

- Non-congressional candidates (president, governor, state-level)
- External committee donor backfill (`fetch-committee-donors`)
- UI to edit cron schedules from the admin panel
- Consolidating the other admin monitoring surfaces into a single Operations tab
