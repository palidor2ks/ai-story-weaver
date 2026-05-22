# Fix "Committee not found" for IE-only spenders

## Root cause

The Top Outside Spenders list is built from `independent_expenditures` and links to `/committee/{fec_committee_id}`. The committee profile page uses `useCommittee()`, which looks up the FEC ID in this order:

1. `candidate_committees` (via `fetchCommittees`)
2. Fallback: latest row in `contributions` + any `committee_finance_rollups`

`C00875427` (THE COURT OF DIVINE JUSTICE) only exists in `independent_expenditures` — it has no candidate link, no itemized contributions on file, and no finance rollups. All three lookups miss, so the hook returns `null` and the page renders the "Committee not found" empty state.

## Fix

Extend the `useCommittee` fallback in `src/hooks/useCommittees.ts` with a final lookup against `independent_expenditures` so any committee that appears as an outside spender resolves to a minimal synthesized profile.

### Change in `src/hooks/useCommittees.ts` (`useCommittee` queryFn)

After the existing `contributions` + `committee_finance_rollups` fallback, if both are still empty:

- Query `independent_expenditures` filtered by `committee_fec_id = committeeId`:
  - `select('committee_name, cycle, expenditure_date, support_oppose_indicator, expenditure_amount')`
  - `order('expenditure_date', { ascending: false })`
  - `limit(1000)` (enough to derive name, cycles, last activity)
- If no rows are returned either, keep returning `null` (real unknown committee).
- Otherwise synthesize a `CommitteeSummary`:
  - `name` = first non-null `committee_name`, fallback to `committeeId`
  - `fecCommitteeId` / `id` = `committeeId`
  - `cycles` = distinct non-null `cycle` values, sorted desc
  - `lastContributionDate` = max `expenditure_date`
  - `donorCount` = `0`, `contributionCount` = `0`, `totalRaised` = `0` (this is IE spending, not receipts — the IE section already renders the real numbers)
  - All other fields `null` as in the existing synthesis path
- Leave the existing two fallbacks above untouched; this is only a third tier.

## Result

- Visiting `/committee/C00875427` renders the committee header (name, cycles), the empty donors/contributors sections (correctly empty), and the existing `CommitteeIESection` which already aggregates the IE spending against each target.
- No DB changes, no edge function changes, no impact on committees that already resolve through the normal path.

## Out of scope

- Importing IE-only committees into `candidate_committees` (separate admin flow already exists).
- Changing the Top Outside Spenders link target.
- Any UI changes to `CommitteeProfile.tsx`.
