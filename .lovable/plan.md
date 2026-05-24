## Problem

The Donors page is hiding ~13,400 donors for cycle 2024 (and similar across cycles) — including top donors like Elon Musk, Trump National Committee, Harris Victory Fund, Adelson, etc. That's why the list looks different/smaller after the last optimization.

## Root cause

The new `is_refund` column in `private.donor_consolidated_mv` / `donor_consolidated_all_mv` is computed as:

```
bool_or(
  is_vendor_refund                       -- per-row flag on donors
  OR EXISTS(donor name LIKE '%vendor%')  -- per-row name match
)
```

Two bugs:

1. **`bool_or` over-flags entire donor groups.** If even one contribution row in a donor group has `is_vendor_refund = true` (e.g. a single refund check), the whole donor is marked as a refund and excluded. That's why "Harris Victory Fund" (with 2 refund rows out of thousands) is hidden, dropping $214M from view.
2. **The MV is also stale for some groups.** Live recomputation for "Musk, Elon" returns `is_refund = false`, but the MV stores `true` — meaning the flag was wrong at refresh time and never recovered.

The `vendor_refund_organizations` table is meant to identify *vendors* (media-buying firms like GMMB, SKDK) whose donor-name entries are actually refund pass-throughs — not to flag any donor who has ever received a refund transaction.

## Fix

1. **Recreate both MVs** with corrected `is_refund` logic:
   - Compute `is_refund` against the **aggregated display_name** only (the group's own identity), not per-row `bool_or`.
   - Drop the per-row `is_vendor_refund` contribution to the group flag — refund rows naturally net out of `sum(amount)` already.
   - Result: only true vendor-name groups (GMMB, SKDK, Waterfront Strategies, etc.) get hidden; legitimate donors with occasional refund transactions stay visible.

2. **Refresh the MVs and the counts MV** so totals and pagination match.

3. **Verify**: Musk, Trump committees, Harris Victory Fund, Adelson, Coinbase, etc. reappear; total donor count for 2024 returns to roughly its previous value (~536k instead of 522k).

No frontend changes. No change to the fast-path RPC structure — only the underlying `is_refund` definition is corrected.
