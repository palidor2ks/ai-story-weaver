# Add cycle filter to candidate Outside Spending

The `Outside Spending` card on candidate profiles currently shows all-time totals and aggregates top spenders across every cycle, with no way to scope to a specific election cycle (unlike the committee version which already has a cycle dropdown).

## Changes

**`src/hooks/useIndependentExpenditures.ts`** — extend `useCandidateIE`:
- Accept an optional `cycle: string | null` argument; include it in the query key.
- Fetch the candidate's available cycles in parallel (distinct `cycle` from `independent_expenditures` where `candidate_id = ...`).
- When `cycle && cycle !== 'all'`, filter the `independent_expenditures` query by `.eq('cycle', cycle)` AND compute totals from the filtered rows (sum amount / S vs O split / count) instead of reading the all-cycle `candidate_independent_expenditure_totals` view.
- When cycle is `'all'` (default), keep current behavior: totals from the view, rows aggregated for top spenders.
- Return `{ totals, rows, topSpenders, availableCycles }`.

**`src/components/IndependentExpenditureSections.tsx`** — update `CandidateIESection`:
- Add `useState<string>('all')` for cycle, pass it to `useCandidateIE`.
- Render a `Select` cycle dropdown in the `CardHeader` (right-aligned), mirroring the committee section's styling, populated from `availableCycles` with an `All cycles` option.
- Show "No expenditures for this cycle." when filtered totals are zero but other cycles exist.

No DB or schema changes.
