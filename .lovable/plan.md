# Add Election Cycle Filter

The "2024 Cycle" label on the candidate profile is hardcoded and there's no way to view 2026, 2022, or other cycles. Several hooks default to `'2024'` even though donor + committee data already exist for multiple cycles. This plan adds a cycle picker everywhere it matters and threads the selection through the data layer.

## Where the picker should appear

1. **Candidate profile → Campaign Contributions card** (replaces the static "2024 Cycle" label, `src/pages/CandidateProfile.tsx:443`). Picker also drives:
   - Donor list (`useCandidateDonors`)
   - Finance summary card (`FinanceSummaryCard` / `useFinanceReconciliation`)
   - Committee rollups (`useCommitteeRollups`)
   - Refresh Donors button (currently fixed to 2024 in `useFECIntegration.fetchFECDonorsComplete`)
2. **Committee profile** (`src/pages/CommitteeProfile.tsx:42`, `:100`) — picker next to "Refresh Donors", defaulting to most recent cycle the committee participated in.
3. Pages that already have one (`Donors`, `Committees`, `DonorProfile`) — leave behavior, but make sure the default cycle list comes from the same shared helper so the most recent cycle (2026) is selected by default instead of 2024.

## Cycle source of truth

Add a small helper hook `useAvailableCycles(candidateId)` that returns the union of:
- distinct `cycle` values in `donors` for the candidate
- entries in `candidate_committees.cycles[]`
- a baseline of the current + previous federal cycle (2026, 2024) so the picker is never empty for new candidates

Sorted desc, plus an `"all"` entry. Default selection = highest available cycle (so a 2026 House candidate like the one in the screenshot lands on 2026, not 2024).

For the global pages, reuse the existing `filterOptions.cycles` from `useDonorsPaginated` but apply the same "default to newest" rule.

## Data-layer changes

- `useCandidateDonors(candidateId, cycle?)` — accept optional cycle, filter `donors.cycle` server-side; `'all'` means no filter. Update query key.
- `useFinanceReconciliation`, `useCommitteeRollups`, `useAllFinanceReconciliations`, `useCandidatesWithSyncStatus` — keep signatures but stop hardcoding 2024 defaults; require caller to pass cycle (default to newest helper) and include cycle in query key.
- `useFECIntegration` — `fetchFECDonorsComplete`, `triggerReconciliation`, `forceResyncFECDonors`, `runBatchReconciliation` already accept `cycle`; just plumb the picker value from the UI instead of relying on the `'2024'` fallback.
- `CommitteeProfile` `handleFetchDonors` — pass selected cycle.

## UI shape

Reuse the existing `Select` pattern from `src/pages/Committees.tsx:111`:

```text
[ Refresh Donors ]  [ Cycle: 2026 ▾ ]
                       2026
                       2024
                       2022
                       All cycles
```

On the candidate profile, place the Select where the static "2024 Cycle" label is. State lives in `CandidateProfile` and is passed to the donors tab plus `FinanceSummaryCard` so a single change updates both totals and the donor list.

## Out of scope

- No edge-function changes; existing FEC sync functions already accept `cycle`.
- No DB migration; `donors.cycle` and `candidate_committees.cycles` already store this.
- No changes to score logic, voting record, or legislation tabs.

## Files touched

- `src/pages/CandidateProfile.tsx` (cycle state + picker + prop wiring)
- `src/pages/CommitteeProfile.tsx` (cycle picker for refresh)
- `src/hooks/useCandidates.ts` (`useCandidateDonors` accepts cycle)
- `src/hooks/useFinanceReconciliation.ts` (newest-cycle default)
- `src/hooks/useFECIntegration.ts` (no behavioral change, just verify cycle pass-through)
- New `src/hooks/useAvailableCycles.ts`
