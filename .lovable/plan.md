## Plan

Fix the committee profile summary cards so they use the same selected cycle as the donor list.

### What I’ll change
- Update `src/pages/CommitteeProfile.tsx` so `useCommittee(id, effectiveCycle)` is called with the active cycle instead of always loading all-cycle totals.
- Keep the donor query on the same `effectiveCycle`, so `Total Raised`, `Unique Donors`, `Contributions`, and contributor data all match.
- Adjust the helper state order only as needed to avoid hook/order issues.

### Technical details
- `useCommittee` already supports a `cycle` argument and computes totals from `committee_finance_rollups` for that cycle.
- The current page still calls `useCommittee(id)` without a cycle, so `committee.totalRaised` remains all-cycle even after the filter changes.
- No database or backend changes are needed.