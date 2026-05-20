## PR #79 Review — Compare Side-by-Side Finance Panel

The PR adds a `Done` gate and a per-candidate finance snapshot (raised, donor count, small-dollar, top donors) into `ComparePanel`. The UI/gating direction is fine, but the data layer has several correctness and project-convention issues that must be fixed before merging.

### Issues found

1. **Donor count clobbered.** The query first sums `donor_count` from `committee_finance_rollups`, then later overwrites it with `individualDonorSet.get(candidateId).size`. The second number is derived from only the top 1200 contributions (and only Individuals), so it almost always understates the real donor count. The rollup value must win.
2. **Top contributions limited globally, not per candidate.** `.limit(1200)` across all selected candidates means a high-raising candidate can crowd out donor rows for the others, producing empty/biased "Major donors" lists. Needs per-candidate fetch or a window function.
3. **JU/BD committees are not excluded.** Project rule (memory: *External Committee Finance*): JU/BD committees are excluded from main candidate totals. The PR pulls every `candidate_committees` row without filtering by `designation`/`role`, so totals can be inflated.
4. **Conduit/pass-through contributions not excluded.** Project rule (memory: *Automated Exclusion Logic*, *Conduit Reference Data*): ActBlue-style conduits and memo-code `X` rows must be excluded from net totals. PR sums raw `amount`.
5. **Reconciliation formula not used.** Memory: *Reconciliation Calculation Formula* — totals should be `max(local, FEC)` per cycle, not `local_itemized ?? fec_total_receipts`. Mixing the two across cycles double-counts or under-counts.
6. **No cycle scope.** Query sums across all cycles in `committee_finance_rollups`, so a long-serving incumbent's lifetime totals are compared with a newcomer's single cycle. Default to the latest cycle (or expose via `useFinanceCycles`).
7. **Candidate attribution risk.** The contributions query keys off `row.candidate_id`, which is null for many JU/BD/orphan rows. Should map via `committeeByCandidate` so a contribution to a known committee is attributed to that candidate.
8. **`compareReady` reset on every toggle.** Adding or removing a single candidate forces the user to click *Done* again. Reset only on `clear`/`close`/mode-toggle; on add/remove just refetch.
9. **RLS / public access.** `/candidates` is public. Confirm `committee_finance_rollups` and `contributions` are readable by `anon`; if not, the panel will silently render zeros for logged-out users. Either gate the panel to authenticated users or relax RLS for these read-only aggregates.
10. **Minor:** "small donor" threshold of `$200` should be a named constant; `topDonors` aggregation uses raw `contributor_name` without alias resolution (memory: *Donor Alias Resolution Priority* — should prefer `display_name`).

### Plan

1. **Refactor finance fetch in `ComparePanel`**
   - Filter `candidate_committees` to exclude `designation IN ('J','U','B','D')` (keep authorized/principal only).
   - Compute `totalRaised` per candidate as `sum over committees of max(local_itemized, fec_total_receipts)` within the selected cycle, matching the reconciliation rule.
   - Keep `donorCount` from rollups only (no overwrite).
   - Replace single `.limit(1200)` contributions query with per-candidate queries (Promise.all): for each candidate, fetch its committees' top contributions ordered by amount, limit 50. Aggregate top 3 donors with alias resolution (`donor_aliases.display_name` if available, else `contributor_name`).
   - Exclude conduits and memo-code `X` rows (use existing exclusion list pattern; see `useCommittees.ts` and the conduit memory).
   - Add `cycle` parameter (default to latest from `useFinanceCycles`).

2. **Fix UX gating in `Candidates.tsx`**
   - Do NOT reset `compareReady` in `handleToggleSelect` / `handleRemoveFromCompare`. Only reset on `handleClearCompare`, `handleCloseCompare`, and when entering compare mode.
   - Keep `Done` button disabled until ≥2 candidates selected.

3. **RLS verification**
   - Run a quick `supabase--read_query` against `committee_finance_rollups` and `contributions` as `anon` to confirm public read; if blocked, either add a public read policy for aggregate columns only, or hide the finance section for anonymous viewers.

4. **Polish**
   - Extract `SMALL_DONATION_THRESHOLD = 200` constant.
   - Add a tiny loading skeleton inside each compare card while the finance query is pending.
   - Add `aria-label`s on Remove/Done buttons.

### Technical details

- Files touched: `src/components/ComparePanel.tsx`, `src/pages/Candidates.tsx`.
- New helpers may go inline in `ComparePanel` (or extracted to `src/hooks/useCompareFinance.ts` if it grows).
- Reuse existing conventions in `useCommittees.ts` (rollup selection, designation filter) and `useFinanceReconciliation.ts` (max(local, FEC) formula).
- Use `donor_aliases` lookup table for top-donor display names (see *Donor Alias Resolution Priority* memory).
- No schema changes required; no new edge functions.
