# Fix Campaign Donors page timeout

## Problem

`/donors` shows "Error loading donors: canceling statement due to statement timeout".

Root cause: `get_donors_paginated` runs a correlated `NOT EXISTS` subquery against `vendor_refund_organizations` for **every** row of the consolidated MV using `upper(display_name) LIKE '%'||upper(v.name)||'%'`. With ~600K rows in `donor_consolidated_all_mv` and 16 active refund patterns, that's ~9.6M ILIKE evaluations per request — and it runs before pagination because the function also computes `count(*)` over the full filtered set. The default Donors page (no filters) hits this on every load.

## Fix

Rewrite `get_donors_paginated` so the vendor-refund exclusion is evaluated once per query, not per row:

1. Build the refund pattern list into a single CTE: `SELECT upper(name) AS pat FROM vendor_refund_organizations WHERE is_active`.
2. Replace the correlated `NOT EXISTS … LIKE '%'||v.name||'%'` with a single `NOT (upper(display_name) ~* <combined_regex>)` where the regex is built from the active vendor names (anchored with `.*` alternation), OR keep the array form but pre-uppercase the display_name once via a lateral.
3. Apply the same change to both branches (cycle-specific and `all` cycles).
4. Keep the `count(*)` over filtered — it's fine once the per-row predicate is cheap. If still slow, switch the count to use `count(*) OVER ()` window inside the paginated select to avoid double-scanning.

No schema or MV changes. No frontend changes. Just a `CREATE OR REPLACE FUNCTION` migration for `get_donors_paginated`.

## Out of scope

- Refreshing/reshaping the MVs
- Adding a precomputed `is_refund_vendor` column (could be a follow-up if regex is still slow)
- Any UI changes on `/donors`

## Technical detail

New predicate sketch:

```sql
WITH refund_pat AS (
  SELECT string_agg(upper(name), '|') AS rx
  FROM public.vendor_refund_organizations WHERE is_active
)
... WHERE (rp.rx IS NULL OR upper(m.display_name) !~ rp.rx) ...
```

This collapses 16 LIKEs per row into one regex test per row, and removes the correlated-subquery planner cost that's currently causing the timeout.
