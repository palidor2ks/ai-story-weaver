## Speed up admin "Search Donors by Canonical Name"

The current flow on every keystroke (after 2 chars):
1. Hits `donor_consolidated` — a regular **view** that aggregates the entire ~1M-row `donors` table on demand (groups, builds `name_variations` arrays, sums totals).
2. Filters with `ilike '%term%'` on the computed `search_text` field — a substring match on a view column has **no usable index**, so Postgres materializes the whole view, then filters and sorts.
3. Sorts by `total_amount desc` and returns 50.

Each query takes seconds and runs on every character typed.

### Fix (three layers)

**1. Client — debounce + raise minimum length** (`src/components/admin/DonorAliasesPanel.tsx`)
- Debounce `donorSearch` by 300ms before passing it to `useSearchDonors`.
- Raise minimum search length from 2 to 3 chars (`enabled` and the early-return in `useSearchDonors`).

**2. Database — trigram index + dedicated RPC** (migration)

```sql
create extension if not exists pg_trgm;

create index if not exists idx_donors_display_name_trgm
  on public.donors using gin (display_name gin_trgm_ops);

create index if not exists idx_donors_name_trgm
  on public.donors using gin (name gin_trgm_ops);

create or replace function public.search_donors_by_name(
  p_search text,
  p_type   text default null,
  p_limit  int  default 50
)
returns table (
  display_name      text,
  type              text,
  total_amount      bigint,
  name_variations   text[],
  is_consolidated   boolean
)
language sql stable security definer set search_path = public as $$
  with matches as (
    select d.display_name, d.type::text as type, d.amount, d.name
    from public.donors d
    where (d.display_name ilike '%' || p_search || '%'
           or d.name ilike '%' || p_search || '%')
      and (p_type is null or p_type = 'all' or d.type::text = p_type)
    limit 5000  -- cap raw rows before aggregation
  )
  select
    coalesce(display_name, name)        as display_name,
    type,
    sum(amount)::bigint                 as total_amount,
    array_agg(distinct name)            as name_variations,
    (count(distinct name) > 1)          as is_consolidated
  from matches
  group by 1, 2
  order by total_amount desc
  limit p_limit;
$$;

grant execute on function public.search_donors_by_name(text, text, int)
  to anon, authenticated;
```

The trigram GIN index turns `ILIKE '%foo%'` into an indexed lookup. Capping the raw match set at 5,000 rows guarantees aggregation is cheap even for very generic queries like "american".

**3. Hook — use the RPC** (`src/hooks/useDonorsPaginated.ts` → `useSearchDonors`)
- Replace the `donor_consolidated` query with `supabase.rpc('search_donors_by_name', { p_search, p_type, p_limit: 50 })`.
- Map the returned rows into the same shape the panel already expects (`name`, `type`, `totalAmount`, `count`, `isConsolidated`, `nameVariations`).

### Expected outcome
- "american" goes from multi-second view scans to <200ms indexed trigram lookups.
- Typing fires at most one query per pause instead of one per keystroke.
- No UI/visual changes; pure performance.