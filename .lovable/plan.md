## Why it appears in 2026 but not All cycles

The “All cycles + All” view reads from `committee_independent_expenditure_totals`, a database view that already excludes rows in `ie_excluded_committees`.

But when you select `Cycle 2026` or Support/Oppose, `TopSpenders.tsx` switches to querying the raw `independent_expenditures` table and aggregates in the browser. That raw-table path does not currently apply `ie_excluded_committees`, so an excluded committee can reappear under cycle/stance filters.

The “Failed to exclude” error happens because the committee is already excluded in the database, so clicking remove again tries to insert a duplicate primary key.

## Plan to fix

1. Update the Top Spenders query to load the exclusion list and apply it to every data path:
   - All cycles / all stance
   - Specific cycle, including 2026
   - Support-only
   - Oppose-only
   - Search results and KPI cards

2. Add the exclusion IDs into the `top-spenders` query key so React Query refetches/recomputes immediately after an exclusion changes.

3. Filter excluded committee IDs before aggregation/sorting on the raw `independent_expenditures` branch, so excluded committees never affect:
   - table rows
   - “Total IE spending”
   - committee count
   - “#1 Spender”

4. Change `useExcludeCommittee` from `insert` to `upsert` on `fec_committee_id`:
   - if the committee is already excluded, update the reason/timestamp instead of throwing a duplicate-key error
   - keep the existing cache invalidation so the row disappears immediately

5. Keep database/RLS unchanged for now because the exclusion table and view policies are already working for the All cycles path. This is a frontend query consistency bug, not a permissions failure.

## Expected result

Once a committee is excluded, it will not appear anywhere on the Top Outside Spenders chart under any cycle or stance filter, including 2026, and clicking Exclude on an already-excluded committee will no longer produce a false failure.