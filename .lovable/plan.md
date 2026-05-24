## Plan

The latest change reduced some overhead, but the default Donors load can still timeout because it still evaluates refund matching across ~600k consolidated rows and uses `count(*) OVER ()`, which forces Postgres to process every matching row before returning the first 24 donors.

### 1. Move refund detection into the materialized views
- Recreate `private.donor_consolidated_mv` and `private.donor_consolidated_all_mv` with an `is_refund` boolean.
- Compute it once during MV refresh from `vendor_refund_organizations`, instead of checking every row during every page load.
- Add partial indexes for non-refund donor browsing:
  - all cycles: `total_amount DESC WHERE NOT is_refund`
  - by cycle: `(cycle, total_amount DESC) WHERE NOT is_refund`

### 2. Add fast precomputed donor counts
- Create a small counts materialized view for default totals:
  - all-cycle non-refund donor count
  - per-cycle non-refund donor count
- Refresh it alongside the donor MVs.

### 3. Rewrite `get_donors_paginated` with a true fast path
- For the default Donors page (`all cycles`, no search/type/min filter, amount-desc sort):
  - fetch the page using the partial index and `LIMIT`
  - return `total_count` from the precomputed counts MV
  - avoid `count(*) OVER ()`
- For filtered/search/name-sort requests:
  - keep functional behavior the same, but filter with `NOT is_refund` instead of `ILIKE ANY`.

### 4. Verify database performance
- Run read-only `EXPLAIN` checks for the default all-cycle query and by-cycle query.
- Confirm the default path uses the new partial indexes and no longer scans/counts all rows before returning page 1.

No frontend changes are needed.