## Fix Committees directory showing only 2024

Two issues combine to lock the page to 2024:

1. **Cycle dropdown is missing older cycles.** `fetchCommitteeFilterOptions` in `src/hooks/useCommittees.ts` builds the cycle list from `supabase.from('committee_finance_rollups').select('cycle').limit(100)`. Postgres returns the first 100 rows in physical order, which are all 2024, so the resulting `Set` only contains `2024` (same root cause we just fixed for donors).
2. **Default cycle is hardcoded to `'2024'`** in `src/pages/Committees.tsx` (`useState<string>('2024')`) and again as the fallback in `useCommittees`/`useCommitteesPaginated`.

### Fix

**Database migration** — add an RPC mirroring `get_donor_cycles`:
```sql
create or replace function public.get_committee_cycles()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct cycle order by cycle desc), '{}')
  from public.committee_finance_rollups
  where cycle is not null;
$$;
grant execute on function public.get_committee_cycles() to anon, authenticated;
```

**`src/hooks/useCommittees.ts`**
- In `fetchCommitteeFilterOptions`, replace the capped select with `supabase.rpc('get_committee_cycles')` and use the returned array directly.
- Change the default `cycle` parameter on `fetchCommittees`, `useCommittees`, `useCommittee`, `useCommitteeDonors`, and `useCommitteesPaginated` from `'2024'` to `'all'` so unfiltered queries return every cycle.

**`src/pages/Committees.tsx`**
- Initialize `useState<string>('all')` instead of `'2024'`.
- Update the `availableCycles` fallback from `['2024']` to `[]` (the `'all'` entry is already prepended).

No UI/visual changes; the existing "All cycles" option in the dropdown becomes the new default.