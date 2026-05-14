## Problem
`/donors` with "All Cycles" returns `canceling statement due to statement timeout`. The `get_donors_paginated` RPC's all-cycles branch scans the 582k-row `private.donor_consolidated_mv` and runs three correlated subqueries (name_variations, types, primary_id) per `(display_name, type)` group, blowing past Postgres' statement timeout.

## Fix — precompute an all-cycles materialized view

### 1. Migration
- Create `private.donor_consolidated_all_mv` keyed by `(display_name, type)` with columns: `primary_id`, `display_name`, `type`, `types text[]`, `total_amount`, `total_transactions`, `recipient_count`, `is_consolidated`, `name_variations text[]`, `search_text`.
  - `primary_id` = the `primary_id` of the row with max `total_amount` for that `(display_name, type)` (using `distinct on` ordered by `total_amount desc`).
  - Aggregates summed across cycles; `name_variations` / `types` flattened with `array_agg distinct unnest(...)` in CTEs (single pass, no correlated subqueries).
  - `is_consolidated` = `bool_or(is_consolidated) OR count(*) > 1`.
- Add unique index on `(display_name, type)` (so future `refresh ... concurrently` works) plus btree indexes on `total_amount`, `display_name`, and a trigram/GIN on `search_text` for the search ILIKE.
- Update `private.refresh_donor_consolidated_mv()` to also refresh `donor_consolidated_all_mv` after the per-cycle MV.
- Rewrite `public.get_donors_paginated`'s `v_all_cycles` branch to read directly from `donor_consolidated_all_mv` with simple WHERE / ORDER BY / LIMIT — no aggregation at query time. The per-cycle branch is unchanged.
- Run an initial `REFRESH MATERIALIZED VIEW private.donor_consolidated_all_mv` so the page works immediately.

### 2. Code
- No frontend changes required. The hook signature and column names are preserved (RPC still returns the same `TABLE(...)` shape, with `cycle = 'all'`).

## Out of scope
- Per-cycle behavior, search RPC, filter options.
- Recipient-count over-count caveat is preserved (sum across cycles, same as today).

## Acceptance
- `/donors` with "All Cycles" loads under ~2s and shows donor cards (no timeout error).
- Switching to a specific cycle continues to work as before.
- `Showing 1-N of M donors` reflects the deduplicated all-cycles count.
