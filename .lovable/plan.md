## PR #164 review — Fix congress donor sync timeouts

### What the PR does (good)
- Forces scheduled + manual congress donor sync to `limit: 1` per invocation (UI + edge function + cron).
- Adds `SYNC_RUNTIME_BUDGET_MS=120000` + `CANDIDATE_CALL_TIMEOUT_MS=110000` to `sync-all-donors`, with `AbortSignal.timeout` on the nested `fetch-fec-donors` call.
- Returns `processed` = actual handled count and adds `skipped` so the caller knows to retry.
- New migration reschedules the two cron jobs (`congress-donor-backfill-10m`, `congress-donor-refresh-daily`) with `limit: 1`.

### Issues found

1. **GitGuardian flag — hardcoded anon JWT in migration.** The anon key is publishable, but pasting it into a migration triggers secret scanners on every PR and makes future key rotations painful. Use `vault.read_secret` (we already use Vault elsewhere per `mem://technical/security/secret-management-and-rpc-auth`) or read it from a Postgres GUC / settings row instead of a string literal.
2. **`Math.max(1, Math.min(1, requestedLimit))` is dead arithmetic.** Always evaluates to 1. Either hardcode `const limit = 1` with a comment, or keep the cap configurable (e.g. `Math.min(2, ...)`) — pick one.
3. **`if (timedOut) break;` is too aggressive.** With `limit: 1` it's moot, but if anyone ever raises the limit, a single slow candidate kills the whole batch. Should `continue` instead and rely on the runtime-budget check at the top of the loop to stop.
4. **Unrelated preview-branch failure.** The Supabase bot's red check is from a pre-existing `get_contribution_totals` migration (return-type change requires `DROP FUNCTION` first), not from this PR. Out of scope to fix here — call it out and leave it.
5. **Throughput regression.** `limit: 1` every 10 min = max 144 candidates/day. If the visible-congress queue is bigger than that, backfill will never catch up. Worth flagging but acceptable as a stopgap until `fetch-fec-donors` itself is made resumable.

### Plan

**Step 1 — Apply the PR's edits locally**
- `src/components/admin/AutomatedJobsCard.tsx`: change `limit` to `1` for both backfill/refresh paths and update the helper text.
- `supabase/functions/sync-all-donors/index.ts`: add the runtime-budget constants, per-candidate `AbortSignal.timeout`, `skipped` counter, `processedCount`, and updated message — but replace `if (timedOut) break;` with `continue` (the loop-top budget check will stop the run if needed).
- `supabase/functions/schedule-congress-donor-sync/index.ts`: replace the dead `Math.max(1, Math.min(1, ...))` with `const limit = 1;` and the explanatory comment.

**Step 2 — Migration without the hardcoded JWT**
Create `supabase/migrations/20260601<ts>_reduce_congress_donor_sync_batch_size.sql` that:
- Unschedules `congress-donor-backfill-10m` and `congress-donor-refresh-daily` (guarded by `EXISTS` in `cron.job`).
- Reschedules both with the same SQL shape as the PR, but pulls the anon key from `vault.decrypted_secrets` (or `current_setting('app.settings.anon_key', true)` if Vault isn't wired for this) so the literal JWT never lands in git. Falls back to reading from `vault` like other recent finance migrations do.
- Body sets `limit: 1` for both jobs.

**Step 3 — Verify**
- Run `supabase--linter` and `supabase--edge_function_logs` for `sync-all-donors` + `schedule-congress-donor-sync` after deploy.
- Trigger one manual run from the Admin > Automated Jobs card and confirm the run row shows `processed: 1`, no 504, `donor_sync_runs` updated.
- Confirm `cron.job` rows show the new schedules with `limit: 1`.

### Out of scope
- Fixing the unrelated `get_contribution_totals` `42P13` migration error.
- Making `fetch-fec-donors` resumable / raising the per-run throughput.
