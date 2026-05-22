## Problem

The Top Outside Spenders page's cycle dropdown only shows 2024, even though 2026 data exists (6,783 rows confirmed in `independent_expenditures`).

**Root cause:** `useIECycles` in `src/pages/TopSpenders.tsx` calls:
```ts
supabase.from('independent_expenditures').select('cycle').not('cycle', 'is', null).limit(5000)
```
It then builds a `Set` from the result. Because PostgREST has no DISTINCT and the first 5,000 rows returned all happen to be cycle `2024`, `2026` never appears in the set.

## Fix

1. **Migration** — add a tiny view that returns distinct cycles:
   ```sql
   CREATE OR REPLACE VIEW public.independent_expenditure_cycles
   WITH (security_invoker = true) AS
   SELECT DISTINCT cycle
   FROM public.independent_expenditures
   WHERE cycle IS NOT NULL;
   GRANT SELECT ON public.independent_expenditure_cycles TO anon, authenticated;
   ```

2. **`src/pages/TopSpenders.tsx`** — change `useIECycles` to query the new view (no `.limit`), keeping the descending sort. Result: dropdown will list every cycle present (currently `2026`, `2024`), and selecting `2026` filters correctly since the underlying query already uses `.eq('cycle', cycle)`.

No other files affected.