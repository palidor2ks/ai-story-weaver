## Plan

Fix the committee list so the visible order matches the displayed **Total Raised** amount.

### What I’ll change
- Update `src/hooks/useCommittees.ts` in the paginated committee fetch path.
- After committee rollups are loaded and `totalRaised` is calculated, sort the built committee summaries by:
  1. `totalRaised` descending
  2. committee name ascending as the tie-breaker
- Keep the existing filters, cycle selection, search, and compact dollar formatting unchanged.

### Why this fixes it
Right now the database query sorts by `candidate_committees.local_itemized_total` / `fec_itemized_total`, but the cards display `totalRaised` computed from `committee_finance_rollups`. Those can differ, so the card order can look wrong, like `$5.9M` appearing before `$7.1M`.

### Technical note
This will make the loaded results display in the correct order immediately. If we later need perfect global sorting across all pages before pagination, the stronger follow-up would be a database RPC/view that ranks committees by the same rollup-derived total before applying `range()`.