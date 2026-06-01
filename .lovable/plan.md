## Problem
The live logs still show `fetch-fec-donors` running for 128s after `Runtime limit reached mid-pagination`, then doing expensive donor/rollup work. That means the active backfill path is still timing out instead of returning a clean partial result for the next cron run.

## Plan
1. **Confirm deployed/runtime mismatch**
   - Check whether the deployed `fetch-fec-donors` code is behind the local code changes, because the live log message does not match the current source message.
   - Redeploy only the affected edge functions if needed: `fetch-fec-donors`, `sync-all-donors`, and `fetch-fec-candidate-id`.

2. **Make timeout exits truly fast**
   - In `fetch-fec-donors`, when the 25s page budget is reached:
     - save only the current contribution chunk and cursor,
     - skip full donor re-flush,
     - skip rollup/reconciliation work,
     - immediately return a `success: true`, `hasMore: true`, `stoppedDueToTimeout: true` response.
   - This prevents the Josh Riley-style path from spending another 100s after deciding to stop.

3. **Prevent wrapper timeouts from becoming errors**
   - In `sync-all-donors`, keep classifying nested timeouts as `partial`, not `failed`.
   - Add a shorter nested-call timeout if needed so the wrapper responds before Supabase’s gateway limit.

4. **Verify with the real backfill path**
   - Run the deployed `sync-all-donors` function with `scope: congress_visible`, `mode: backfill`, `limit: 1`, `cycle: 2024`.
   - Check logs confirm the result is either fully complete or cleanly partial, with no 504/546 and no long post-timeout donor flush/rollup.

## Expected result
Large candidates will no longer repeatedly error. They will import a small chunk, save the cursor, return as partial, and continue on the next scheduled run until complete.