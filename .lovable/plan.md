## Problem

Two distinct errors in the backfill run:

1. **`fec_id: ... HTTP 401`** (Fahad Akhtar, Hillary Herzig)
2. **`donor_sync: Josh Riley: Signal timed out; nested donor import exceeded 110s budget`**

## Root causes

**1. HTTP 401 on FEC ID fill**

`schedule-congress-donor-sync/index.ts` (line ~121) calls `fetch-fec-candidate-id` with the **service-role key**:

```ts
headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': anonKey }
```

But `fetch-fec-candidate-id/index.ts` (lines 186–201) only accepts a **user JWT with admin role** — it calls `userClient.auth.getUser()` on the bearer token, which fails for the service-role JWT and returns 401. So **every** automated FEC ID fill from the scheduler fails. (The image shows "FEC IDS FILLED: 0".)

Fix: in `fetch-fec-candidate-id`, mirror the pattern already used in `sync-all-donors` — accept either the service-role key (cron/wrapper) **or** an admin user JWT.

**2. Josh Riley 110s timeout**

`fetch-fec-donors` has `MAX_RUNTIME_MS = 25_000` and is designed to return `hasMore: true` after ~25s. The fact that the nested call ran the full 110s `AbortSignal.timeout` means a single operation hung — most likely either a slow FEC API page request or one of the chunked upsert retry loops (3 attempts × no per-attempt timeout). There is no per-FEC-fetch `AbortSignal` and no per-upsert timeout, so one hung TCP can blow past the 25s wall check.

Fix:
- Add `AbortSignal.timeout(20_000)` to the FEC API `fetch()` call in `fetch-fec-donors`.
- Add a cheaper wall check inside the retry loops so retries can't burn the whole budget.
- When `sync-all-donors` sees the nested call time out for a candidate, classify as **partial/skipped** (not `failed`) and `continue` — cursor is already persisted in `fetch-fec-donors`, so the next backfill tick resumes that candidate instead of marking it permanently failed.

## Changes

### `supabase/functions/fetch-fec-candidate-id/index.ts`
Replace the user-JWT-only auth block (lines ~185–201) with the same dual auth that `sync-all-donors` uses:
- If `bearer === SUPABASE_SERVICE_ROLE_KEY` → allow (cron/wrapper path).
- Else → resolve user via anon client, then check `user_roles` for `admin`.

### `supabase/functions/fetch-fec-donors/index.ts`
- Add `signal: AbortSignal.timeout(20_000)` to the outbound FEC API `fetch()` (around line ~1120).
- In the page loop (line 1103) and inside the retry blocks (lines ~986, ~1054), check `Date.now() - startTime > MAX_RUNTIME_MS` before each retry attempt so a hung chunk can't burn 90+ seconds.
- On `AbortError`/`TimeoutError`, save cursor with `hasMore: true` and return cleanly with `stoppedDueToTimeout: true` instead of throwing.

### `supabase/functions/sync-all-donors/index.ts`
- In the `catch` block around line ~217, when `err.name === 'TimeoutError'`, push the candidate as **partial/skipped** rather than `failed` and `continue`. The cursor in `donor_sync_runs`/committee table will let the next 10-minute tick pick it up where it left off.
- Surface a clearer error label: `"Josh Riley: partial — nested import still running, will resume next tick"`.

### Migration
None needed — both fixes are pure edge-function changes.

## Verification

1. Trigger **Run now** from the Automated Jobs card.
2. Confirm:
   - `FEC IDS FILLED` > 0 (no more 401s for missing-ID candidates).
   - Josh Riley shows up in `partialCount`, not `failedCount`, and is retried automatically by the cron 10 minutes later.
3. Check `Edge Function logs` for `fetch-fec-donors` to confirm timed-out pages save cursor and exit cleanly.

## Out of scope

- Raising overall throughput (still `limit: 1` per tick per PR #164).
- Refactoring the donor upsert chunk sizes.