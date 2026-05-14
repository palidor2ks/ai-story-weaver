## Goal

When the donor list is filtered to "All Cycles", show **one card per donor** (e.g. one "MUSK, ELON") instead of one card per donor-per-cycle. When a specific cycle is selected, behavior stays exactly the same.

## Approach

Modify the `get_donors_paginated` RPC so that when `p_cycle` is null/empty/"all", it aggregates the existing `private.donor_consolidated_mv` rows by `display_name + type` instead of returning each cycle row separately. No schema change, no MV change — pure SQL function rewrite.

## Changes

### 1. `get_donors_paginated` RPC (migration)

Add a branch for the "all cycles" case that wraps the existing filtered CTE in a `GROUP BY display_name, type`:

- `total_amount` → `SUM(total_amount)`
- `total_transactions` → `SUM(total_transactions)`
- `recipient_count` → `SUM(recipient_count)` (acceptable approximation — true distinct count would require re-querying base data)
- `name_variations` → unioned & deduped via `array_agg(distinct unnest(...))`
- `types` → unioned & deduped across cycles
- `is_consolidated` → true if any underlying row was consolidated OR multiple cycles aggregated
- `cycle` → literal `'all'`
- `primary_id` → the `primary_id` of the cycle row with the largest `total_amount` (used for routing to the donor profile page)
- Sorting (`amount`/`name`, asc/desc) and `total_count` work on the aggregated set

When `p_cycle` is a real cycle, keep the current code paths untouched.

### 2. Frontend

No changes required. `useDonorsPaginated` already passes `p_cycle: cycle || null` and the card renders fine with `cycle: 'all'` and a merged `name_variations` array (the "N merged" badge will simply reflect the union across cycles).

### 3. Donor profile routing

`DonorCard` links to `/donors/:primary_id`. Since we return the largest-cycle's `primary_id`, clicking the aggregated card lands on the donor's biggest-cycle profile — same behavior as today when a user picks the top result. Acceptable; no profile-page changes.

## Out of scope

- Changes to `donor_consolidated_mv` itself
- Changes to `search_donors_by_name` (separate RPC, used by autocomplete only)
- Cross-cycle profile page (would be a larger follow-up)

## Risk

Low. Specific-cycle queries are untouched. Recipient counts across cycles will be slightly inflated when the same recipient appears in multiple cycles — call out in a code comment; can be made exact later with a second aggregation against `donors` if needed.
