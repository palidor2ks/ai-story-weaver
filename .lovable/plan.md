## Plan

Update the committee profile so the highlighted cycle dropdown is the single source of truth for all cycle-specific data on the page.

### Changes

1. **Keep one page-level cycle state**
   - Continue using the existing header cycle dropdown.
   - Use its `effectiveCycle` everywhere cycle-scoped committee data is loaded or displayed.

2. **Fix summary cards for the selected cycle**
   - Ensure `Total Raised`, `Unique Donors`, and `Contributions` come from the selected cycle’s `committee_finance_rollups` row.
   - Keep base committee metadata like name, FEC ID, candidate, badges, and available cycles stable from the unfiltered committee lookup.
   - Avoid falling back to all-cycle totals when a selected cycle has no rollup row; show zero/empty cycle-scoped values instead.

3. **Fix cycle-sensitive dates**
   - Make `Last contribution` reflect the latest contribution in the selected cycle.
   - Keep `Last Sync` as the committee-level sync timestamp unless a reliable cycle-level sync field exists.

4. **Wire the same cycle into page sections**
   - Pass the selected cycle to the AI analysis trigger.
   - Pass the selected cycle into the Independent Expenditures section and remove/disable its separate internal cycle dropdown on the committee profile, so it matches the page filter.
   - Keep Top Contributors and Donor Details already using the selected cycle, but verify they no longer mismatch the summary cards.

5. **Validate against the shown committee**
   - Check `C00879510` data for 2026 vs 2024:
     - 2026 receipts: about `$80M`, 4 donors, 25 contributions.
     - 2024 receipts: about `$316M`, 29 donors, 61 contributions.
   - Confirm changing the page dropdown changes all cycle-scoped numbers/sections consistently.

### Files to update

- `src/pages/CommitteeProfile.tsx`
- `src/components/IndependentExpenditureSections.tsx`
- `src/hooks/useCommittees.ts` if needed to prevent all-cycle fallback for selected cycles and derive selected-cycle contribution dates.

No database schema change is needed.