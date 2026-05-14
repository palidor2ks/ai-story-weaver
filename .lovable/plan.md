# Fix: "Top Contributors to this PAC" returns 0 for Organizations/PACs

## Root cause

On the donor profile (e.g. COINBASE), the `pacContributors` query in `src/pages/DonorProfile.tsx` (lines ~295-349) builds a filter from:

- `committeeIds` = recipient committee IDs taken from this donor's **outgoing** records (i.e., committees this donor *gave to*, not the donor's own committee), and
- `committeeNames` = exact-equal match on `donor.name` / `display_name` / alias variations.

For COINBASE, neither hits the actual receiving committee, which is stored as `"COINBASE, INC. INNOVATION PAC (COINBASE INNOVATION PAC)"` (FEC ID `C00804179`). Result: 0 contributors, even though 30 contributions / $184K exist.

The same bug affects any donor whose canonical name doesn't exactly equal the FEC committee name string.

## Fix

In `src/pages/DonorProfile.tsx`, change the `pacContributors` query to:

1. **Resolve the donor's own FEC committee IDs first** by looking up `public.committees` where the committee name starts with the donor's canonical name (or one of its alias variations). Use those IDs as the primary join key.
   - `supabase.from('committees').select('committee_id, name').ilike('name', `${displayName}%`)` (and per alias variation).
2. **Fall back to fuzzy name match** with `ilike` against `recipient_committee_name` (e.g. `recipient_committee_name.ilike.${displayName}%`) when no committee IDs resolve.
3. Keep the existing aggregation/grouping logic; only the filter clause changes.
4. Hide the entire "Top Contributors to this PAC" section when both lookups produce zero candidate committees AND zero rows (so we don't show a misleading empty card for pure corporations like Coinbase that have no receiving committee at all).

## Out of scope

- No DB schema changes.
- No changes to donor consolidation MV.
- No changes to "Top Recipients" logic.

## Verification

- COINBASE profile shows contributors from `COINBASE, INC. INNOVATION PAC` (~$184K, 30 records).
- AIPAC, FAIRSHAKE, and other true PACs continue to render correctly.
- A donor with no receiving committee (pure corporation with no PAC) hides the section instead of showing "0 total".
