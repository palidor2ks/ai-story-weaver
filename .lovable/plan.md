# Fix: excluded committees still appearing in Top Spenders

## Root cause

The four rows in the screenshot (APPLE INC. DJIA, WARREN BUFFET APPLE INC., SHAWN BETTIS, THE COURT OF DIVINE JUSTICE) **are** correctly stored in `ie_excluded_committees` with reason "Junk". But they still render because:

- `useIEExclusions` reads from the safe public view `public.ie_excluded_committees_public` (which exposes `fec_committee_id`, `reason`, `excluded_at` — no `excluded_by`).
- That view currently has **no SELECT grants** for `anon` or `authenticated` (verified via `information_schema.role_table_grants`).
- So the request returns permission-denied / empty → `excludedIds` is `[]` → the client-side filter in `TopSpenders.useTopSpenders` (`!excludedSet.has(...)`) excludes nothing.

The base table `ie_excluded_committees` (with `excluded_by`) stays admin-only — only the column-safe view is exposed.

## Fix

Single migration:

```sql
GRANT SELECT ON public.ie_excluded_committees_public TO anon, authenticated;
```

## Verification

- After the migration, `useIEExclusions` returns the four `Cxxxxxxxx` IDs, `TopSpenders` filters them out of both the cached-totals path and the per-cycle aggregation path, and they disappear from the list.
- The admin "EyeOff" exclude button on remaining rows continues to work (it writes to the base table, which admins can already access).
- `excluded_by` remains hidden from non-admins because the view does not select that column. Matches the existing security-memory rule.

## Files

- New migration only. No app code or RLS-policy changes needed.
