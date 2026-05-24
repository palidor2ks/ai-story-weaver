# Show only latest-cycle outside spending on candidate cards

The candidate cards on the Politicians list currently show all-time independent expenditure totals (support/oppose), aggregated across every election cycle. Change this so each card shows only the most recent cycle's outside money, and label which cycle that is.

## Changes

**`src/hooks/useIndependentExpenditures.ts`** — rewrite `useCandidatesIE`:
- Query `independent_expenditures` directly for `candidate_id IN (...)` selecting `candidate_id, amount, support_oppose_indicator, cycle` (limit high, e.g. 50000).
- For each `candidate_id`, group rows by `cycle`, find the max cycle, and sum `support_amount`/`oppose_amount`/`expenditure_count`/`total_amount` from rows in that cycle only.
- Extend `IETotalsMap`'s value type to include `cycle: string | null`. Return one entry per candidate with the latest-cycle totals.

**`src/components/IESummaryInline.tsx`** — accept an optional `cycle?: string | null` prop and render a small muted `' 2024'` (or similar) suffix next to the support/oppose figures when present, e.g. `↑$4.0M ↓$10M · 2024`.

**`src/components/CandidateCard.tsx`** — pass `cycle={ieTotals?.cycle}` through to `IESummaryInline`.

No backend or schema changes.
