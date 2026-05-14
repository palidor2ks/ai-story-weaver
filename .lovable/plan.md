## Problem

The `/donors` page cycle dropdown only shows **2026** even though the database has **2024** (~1.09M rows) and **2026** (~8.5K rows).

## Root cause

In `src/hooks/useDonorsPaginated.ts` (`useAvailableDonorFilters`), distinct cycles are derived by:

```ts
.from('donors').select('cycle').order('cycle', { ascending: false }).limit(1000)
```

Because 2026 has thousands of rows, the first 1000 ordered rows are all 2026, so `new Set(...)` only contains `2026`. 2024 never appears.

## Fix

Replace the single capped scan with a tiny Postgres RPC that returns truly distinct cycles, so every cycle present in `donors` shows up regardless of row counts.

### Steps

1. **Migration**: add a SECURITY DEFINER function `public.get_donor_cycles()` returning `text[]` (or `setof text`) via `SELECT DISTINCT cycle FROM donors WHERE cycle IS NOT NULL ORDER BY cycle DESC`. Grant execute to `anon, authenticated`.
2. **Hook**: in `useAvailableDonorFilters`, replace the cycles query with `supabase.rpc('get_donor_cycles')` and map the result into the existing `cycles` array. Keep the states logic as-is.

No UI changes needed — the dropdown already renders whatever cycles the hook returns.
