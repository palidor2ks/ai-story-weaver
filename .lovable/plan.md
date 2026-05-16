## Why attaches are slow now

Three changes compounded:

1. **Dual MV refresh per call.** I just changed `refresh_donor_consolidated_mv()` to refresh both `donor_consolidated_mv` (329 MB, 634k rows) **and** `donor_consolidated_all_mv` (171 MB, 596k rows) sequentially. Each call now does ~2× the work, and the "all" MV is built on top of the per‑cycle one so it can't be parallelized.

2. **Refresh fires per chunk.** `useAttachDonors` chunks donors into 100s and calls `attach-donors-to-alias` once per chunk. Every chunk triggers a refresh. `REFRESH MATERIALIZED VIEW CONCURRENTLY` on the same MV serializes — five chunks = five back‑to‑back full refreshes (~2–3 min total, not parallel).

3. **Small batches block the response.** The edge function `await`s the refresh for batches ≤50. Combined with the dual refresh, a tiny attach now makes the user wait 30–60s+ before the toast.

Delete/detach hit the same path.

## Fix (minimal, surgical)

### A. Coalesce: refresh once per operation, not once per chunk

**`src/hooks/useDonorAliases.ts`**
- `useAttachDonors`: stop telling the edge function to refresh per chunk. After the loop completes, call `supabase.rpc('refresh_donor_consolidated_mv')` once. Toast updates once that completes (or after a timeout fallback).
- `useDetachDonors`: same pattern (single refresh after the call).
- `useDeleteDonorAlias`: keep the single post‑delete refresh (it's already one call).

**`supabase/functions/attach-donors-to-alias/index.ts`**
- Add a request flag `skip_mv_refresh: boolean` (default `false` for backwards compat).
- When `skip_mv_refresh === true`, do not await or background a refresh. Return `mv_refreshed: false`.
- Hook passes `skip_mv_refresh: true` for every chunk and handles the single trailing refresh client‑side.

### B. Make the dual refresh smarter

**DB migration** — change `public.refresh_donor_consolidated_mv()` to:
- Refresh the per‑cycle MV always.
- Refresh the all‑cycles MV only if its row count or last refresh diverges from the per‑cycle one (cheap guard via `pg_stat_all_tables.n_live_tup` comparison) — OR simpler: always refresh both but log timing. Given the dependency, we likely keep both; the real win is from §A (one call instead of N).
- Optional: add an advisory lock (`pg_try_advisory_lock`) so concurrent refresh requests fast‑exit instead of queuing. If another refresh holds the lock, skip and return — the in‑flight one will already include our changes (since `attach` writes commit before we call refresh).

### C. UX while the single refresh runs

- Show toast: `Attached N donor(s) — refreshing list…`
- After RPC resolves: invalidate `donors-paginated` / `donors-consolidated` and update toast to `Donors list refreshed`.
- If RPC takes >45s, fall back to deferred invalidation (same as today).

## Expected impact

For a 500‑donor attach:
- Before: 5 chunks × ~30s dual refresh ≈ **2.5 min**, list still possibly stale due to queuing.
- After: 5 chunks (insert only, fast) + **1** dual refresh ≈ **30–40s** total, then list is consistent.

For a single‑member attach:
- Before: insert + dual refresh awaited ≈ **30–60s** to toast.
- After: insert returns immediately (~1s); refresh runs in the background; toast updates when done.

## Files touched

- `supabase/functions/attach-donors-to-alias/index.ts` — accept `skip_mv_refresh`.
- `supabase/functions/detach-donors-from-alias/index.ts` — same flag (verify it currently calls refresh).
- `src/hooks/useDonorAliases.ts` — collapse N refreshes into 1 per operation; move toast lifecycle.
- DB migration — optional advisory lock guard inside `refresh_donor_consolidated_mv()`.

No schema changes. No edits to `apply-donor-alias` (already coalesced — single refresh at end).
