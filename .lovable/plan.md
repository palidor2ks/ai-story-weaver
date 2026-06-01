## Why you are not seeing results

The current **Run now** button now returns immediately with a queued/background response to avoid the 150s timeout. That part is working: the database has new `donor_sync_runs` rows marked `running…`.

The results are not appearing because the background run calls `sync-all-donors`, which then processes candidates one-by-one through `fetch-fec-donors`. The logs show `fetch-fec-donors` repeatedly hitting its internal runtime guard (`Runtime limit reached mid-pagination`). When that happens it can return partial candidate progress, but `sync-all-donors` only treats `data.success` as useful and does not explicitly track `hasMore` / `stoppedDueToTimeout`. Also, `schedule-congress-donor-sync` only updates the run row after the entire `sync-all-donors` call returns, so the UI sits at `processed: 0` and `running…` while the nested work is still going.

There are also two currently in-flight run rows that have not finished yet, which makes the UI look like it produced no result even though nested donor work is happening in logs.

## Plan

1. Update `sync-all-donors` result handling
   - Treat `fetch-fec-donors` responses with `success: true` as successful even when `hasMore: true`.
   - Include partial/resumable status per candidate: `hasMore`, `stoppedDueToTimeout`, `committeesRemaining`.
   - Count these as processed successes, but add a note/error-style message that the candidate needs another pass.
   - Calculate `remaining` based on candidates that still need more work, not only hard failures.

2. Reduce each manual batch size to avoid nested edge timeout pressure
   - Change manual backfill from 10 candidates to a smaller batch, likely 1-2 candidates per run.
   - Keep the cron/backfill pattern resumable so repeated runs complete the queue safely.

3. Improve the `donor_sync_runs` row updates
   - Make `schedule-congress-donor-sync` mark the run as queued/running immediately, then finish with a clear `notes` value like `completed`, `partial — rerun needed`, or the exact error.
   - Preserve backend error details in `errors` so the on-screen panel/history can show what happened.

4. Improve the admin UI messaging for queued jobs
   - When `Run now` returns `202 queued`, show a clear “Background run started” panel instead of a zero-result diagnostics panel.
   - Show in-progress rows as `Running` rather than appearing like an empty/no-result run.
   - Continue relying on the 15s polling of `donor_sync_runs` for final results.

## Technical notes

- No schema change is required for the first pass; existing `donor_sync_runs.notes` and `errors` can hold the relevant status.
- The key files to edit are:
  - `supabase/functions/sync-all-donors/index.ts`
  - `supabase/functions/schedule-congress-donor-sync/index.ts`
  - `src/components/admin/AutomatedJobsCard.tsx`
- After implementation, test by calling `schedule-congress-donor-sync` and confirming a new run row transitions from `running…` to a completed/partial/error state with nonzero processed counts.