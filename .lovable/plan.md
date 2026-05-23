## Plan: Batch-classify all unassigned committees

There are 1,727 committees and only 80 have causes assigned — ~1,647 to go. The `classify-committee-topic` edge function already does the work (gathers committee info, calls Lovable AI, upserts to `committee_topics`, can also suggest new causes). I'll drive it from a script with no UI changes.

### Script behavior (`/tmp/classify_all_committees.ts`, run via bun)

Loop until done:
1. Query `committee_pool_mv` for count of unassigned committees (committees without a `committee_topics` row).
2. If 0 → stop and print summary.
3. POST to `classify-committee-topic` with `{ limit: 50 }`. The function picks the next batch of unassigned IDs from `list_committee_pool` and processes them in the background via `EdgeRuntime.waitUntil`.
4. Wait ~60s for the background batch to finish, then re-check the unassigned count.
5. If the count didn't decrease for 2 consecutive iterations, log the stuck IDs (likely no name/IE data available) and skip them by recording a sentinel — actually simpler: just break and report.

### Output
At the end, print:
- starting unassigned count
- ending unassigned count
- total processed
- any committees that couldn't be classified (no info)
- any new `pending` causes the AI suggested (queryable from `committee_causes` where `status='pending'`)

### No code changes to the app
- No UI, no migrations, no edge function changes.
- Just the throwaway script in `/tmp/` and the AI classifications it writes via the existing edge function.

Estimated runtime: ~17 batches × ~60s = ~17 min. I'll report back with the final tallies when it finishes.