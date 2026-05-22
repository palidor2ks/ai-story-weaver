# Fix $0 totals for committees with contributions but no rollups

## Root cause

`useCommittee` (in `src/hooks/useCommittees.ts`) has a fallback for committees not present in `candidate_committees`:

1. Read latest row from `contributions` (for name + last contribution date).
2. Read aggregated totals from `committee_finance_rollups`.
3. If both are empty → fall through to the IE-only synthesis (totals all 0).

Lincoln Project (`C00725820`) lives in the middle of that gap: it has **601 contributions ($12.2M)** in `contributions` and 82 rows in `independent_expenditures`, but **no `committee_finance_rollups` row** and no `candidate_committees` entry. So step 1 succeeds, step 2 returns nothing, and the synthesized summary uses `0` for `totalRaised`, `donorCount`, and `contributionCount`. Meanwhile `useCommitteeDonors` queries `contributions` directly, which is why "Top Contributors" shows real donors right below the $0 cards.

## Fix

In the contributions/rollups fallback branch of `useCommittee`, when `rollupRows` is empty but `contribRow` exists, derive totals directly from the `contributions` table for that committee (filtered by cycle when one is provided).

### Change in `src/hooks/useCommittees.ts` (`useCommittee` queryFn, the existing fallback block before the IE-only branch)

After fetching `contribRow` and `rollupRows`, before computing `totals`:

- If `rollupRows` is empty (or all-zero) AND `contribRow` exists, run two extra reads against `contributions` scoped to `recipient_committee_id = committeeId` (and `cycle = cycle` when `cycle && cycle !== 'all'`):
  - **Aggregate read** for `total_raised` and `contribution_count`:
    - Try `supabase.rpc('committee_contribution_totals', { committee_id, cycle })` if it exists, otherwise paginate `contributions` in chunks of 1000 (`range(0,999)`, `range(1000,1999)`, …) until fewer than 1000 rows return. Sum `amount`, count rows. Cap at e.g. 20k rows to bound work; if capped, mark a flag (not surfaced in UI for now).
    - Simpler initial implementation: a single `.select('amount, donor_id, contributor_name, cycle', { count: 'exact' })` with `.range(0, 9999)` (10k cap) is acceptable and matches how other hooks in this file fetch contribution-level data.
  - **Distinct donor count**: from the same fetched rows, build a `Set` keyed by `donor_id ?? contributor_name?.toLowerCase().trim()` and take its size.
- Use those derived values for `totals.total_raised`, `totals.contribution_count`, `totals.donor_count`.
- Derive `cycles` from the same fetched contribution rows (distinct non-null `cycle`), unioned with any rollup cycles (currently none in this case).
- Keep the existing IE-only branch as the last resort (only when `contribRow` is null AND rollups are empty AND no IE rows).

Everything else in the synthesized `CommitteeSummary` stays the same (name from `contribRow.recipient_committee_name`, `lastContributionDate` from `contribRow.receipt_date`, etc.).

### Optional small UX clarification (low priority, can skip)

The "Total Raised" card subtitle currently says *"Includes latest synced totals"*. When this fallback path is used, that's misleading. Out of scope for this fix unless the user requests it.

## Verification

- `/committee/C00725820` (Lincoln Project) should show ~$12.2M total raised, ~601 contributions, and the real distinct donor count — matching the Top Contributors section below.
- Committees that already resolve through `candidate_committees` + rollups are untouched (the new branch only runs when rollups are empty).
- IE-only committees (e.g. C00875427 Court of Divine Justice) still hit the IE fallback and render correctly.

## Out of scope

- Backfilling `committee_finance_rollups` for committees like Lincoln Project (separate admin task).
- Changing `CommitteeProfile.tsx` UI.
- Any edge function / DB migration changes.
