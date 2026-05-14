## Problem

The `/donors` "All Cycles" view shows inflated totals (e.g., Musk $4.54B / 1,248 txns vs. true ~$447M / 112 txns — exactly ~10× off).

## Root cause

In `private.donor_consolidated_all_mv` (migration `20260514164838_…`), the aggregation does:

```sql
FROM base b
LEFT JOIN LATERAL unnest(b.name_variations) AS nv ON true
LEFT JOIN LATERAL unnest(b.types::text[])   AS t  ON true
GROUP BY b.display_name, b.type
```

The two `LEFT JOIN LATERAL unnest(...)` calls multiply each per-cycle row by `len(name_variations) × len(types)`, so `SUM(total_amount)`, `SUM(total_transactions)`, and `SUM(recipient_count)` are all inflated by that factor. Musk has 2 cycles × ~5 name variants × 1 type ≈ 10× — matches the observed inflation exactly.

## Fix

Rebuild `donor_consolidated_all_mv` so the numeric SUMs and the array aggregations don't share a FROM clause. Aggregate sums in one CTE (no unnests), and collect distinct `name_variations` / `types` in separate CTEs, then join on `(display_name, type)`.

```text
sums      = SUM over donor_consolidated_mv GROUP BY display_name, type
names     = DISTINCT unnest(name_variations) GROUP BY display_name, type
typesagg  = DISTINCT unnest(types) GROUP BY display_name, type
primary   = first primary_id ordered by total_amount desc
result    = sums JOIN names JOIN typesagg JOIN primary
```

Then refresh the MV. No other code/RPC/frontend changes needed — `get_donors_paginated` already reads from this MV correctly.

## Steps

1. Migration: `DROP` and recreate `private.donor_consolidated_all_mv` with the corrected CTE structure; recreate the unique index `(display_name, type)` and the `total_amount` index; re-grant `SELECT` to `anon, authenticated, service_role`.
2. `REFRESH MATERIALIZED VIEW private.donor_consolidated_all_mv`.
3. Verify Musk row is ~$447M / 112 txns / 40 recipients and spot-check 2–3 others.

## Out of scope

Per-cycle view (uses `donor_consolidated_mv` directly and is unaffected). Frontend formatting.