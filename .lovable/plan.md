# Fix: Donors page "statement timeout"

## What's happening

The Donors page calls the `get_donors_paginated` RPC. On the default load (all cycles, no filters), it scans `private.donor_consolidated_all_mv` (~600k rows) and:

1. Builds a `filtered` CTE that applies a per-row **regex** (`upper(display_name) !~ v_refund_rx`) against a 16-pattern alternation built from `vendor_refund_organizations`.
2. Builds a `counted` CTE doing `count(*)` over `filtered`.
3. CROSS JOINs them and sorts by `total_amount` with LIMIT/OFFSET.

Because `filtered` is referenced by both `counted` and the final SELECT, Postgres materializes it — so the existing `total_amount DESC` index can't be used for an index-only LIMIT scan. Combined with the per-row regex, the query exceeds the 2-minute statement timeout. Same shape for the by-cycle branch.

## Fix

Two changes, both targeted at the RPC / underlying MVs — no UI changes.

### 1. Precompute a `is_refund` boolean on both MVs

Refund matching is the slowest part and rarely changes. Add it as a column on:

- `private.donor_consolidated_all_mv`
- `private.donor_consolidated_mv`

…computed at refresh time as `upper(display_name) ~ <combined regex>` (or, equivalently, `EXISTS (... ILIKE)`). Add a partial index `WHERE NOT is_refund` ordered by `total_amount DESC` so the default sort can be served from an index.

This requires updating whatever function/refresh routine builds the MVs to include the new column. (I'll inspect the existing refresh function during build to keep the logic identical.)

### 2. Rewrite `get_donors_paginated` without CTEs

Replace the `filtered` + `counted` CTE pattern with a single SELECT using `count(*) OVER ()` as `total_count`. Filter with `NOT is_refund` instead of the regex. This lets the planner:

- Use the partial `(NOT is_refund, total_amount DESC)` index for the default unfiltered "all cycles" / by-cycle reads.
- Still fall back to a seq scan only when filters (search/type/min_amount) actually narrow the set.

Behavior is preserved: same columns, same ordering rules, same parameter contract.

### Technical details

```sql
-- New column + index (per MV)
ALTER MATERIALIZED VIEW private.donor_consolidated_all_mv
  ADD COLUMN is_refund boolean;  -- populated by refresh routine

CREATE INDEX donor_consolidated_all_mv_amount_active_idx
  ON private.donor_consolidated_all_mv (total_amount DESC)
  WHERE NOT is_refund;

-- Same pattern for donor_consolidated_mv, plus (cycle, total_amount DESC) WHERE NOT is_refund.
```

```sql
-- RPC body (sketch)
SELECT
  primary_id, display_name, cycle, type::text, types::text[], total_amount,
  total_transactions, recipient_count, is_consolidated, name_variations,
  count(*) OVER ()::bigint AS total_count
FROM private.donor_consolidated_all_mv
WHERE NOT is_refund
  AND (p_type IS NULL OR p_type IN ('', 'all') OR p_type = ANY(types::text[]))
  AND (v_search IS NULL OR search_text ILIKE '%' || v_search || '%')
  AND (p_min_amount IS NULL OR total_amount >= p_min_amount)
ORDER BY <existing sort logic>
LIMIT v_limit OFFSET v_offset;
```

### Steps

1. Inspect MV refresh function to find the right place to compute `is_refund`.
2. Migration: add `is_refund` column + partial indexes on both MVs, populate it, update the refresh function.
3. Migration: replace `get_donors_paginated` with the CTE-free version.
4. Verify on preview: Donors page loads, search/type/cycle filters still work, pagination total matches.

No frontend changes required.
