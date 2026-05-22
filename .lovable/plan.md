## Why you can't find it

`THE COURT OF DIVINE JUSTICE` (C00875427) is **not** a candidate committee — it has no row in `candidate_committees` and no `committee_finance_rollups` entry (Total Raised = $0, 0 contributions on the profile). It only exists in our system as an **outside spender** in `committee_independent_expenditure_totals` (~$9.98B in IEs).

The `/committees` page is sourced entirely from `candidate_committees` + finance rollups, so IE-only committees never appear there. They're listed on **`/top-spenders`** instead (the sibling tab in the CommitteesViewSwitcher). You most likely arrived at this profile from Top Spenders or an IE link elsewhere, but the back button hard-codes `/committees`.

## Plan

Make the back link context-aware in `src/pages/CommitteeProfile.tsx`:

1. **Determine the right destination**:
   - If `location.state?.from` is set by the linking page, use that.
   - Else, if the committee has no `candidate_committees` row (or no receipts) but has IE totals, default to `/top-spenders`.
   - Else default to `/committees`.
2. **Update the label** to match ("Back to Committees" vs "Back to Top Spenders").
3. **Pass `state={{ from: '/top-spenders' }}`** from Top Spenders rows that link into `/committee/:id`, and `state={{ from: '/committees' }}` from the Committees list, so the back button always returns to the originating list (covers the case where a committee appears on both).
4. **Apply the same logic** to the "Return to list" button in the not-found state.

No data model changes. Purely frontend/navigation.

### Files touched
- `src/pages/CommitteeProfile.tsx` — context-aware back link + label
- `src/pages/TopSpenders.tsx` — pass `state={{ from: '/top-spenders' }}` on committee links
- `src/pages/Committees.tsx` — pass `state={{ from: '/committees' }}` on committee links
