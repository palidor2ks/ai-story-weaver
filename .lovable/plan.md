## Add Independent Expenditure surfacing in 4 places

Reuse the existing `candidate_independent_expenditure_totals` view via `useCandidateIE` and add one new bulk hook for lists.

### 1. New hook `useCandidatesIE(candidateIds: string[])`
In `src/hooks/useIndependentExpenditures.ts`, add a hook that does a single `from('candidate_independent_expenditure_totals').select(...).in('candidate_id', ids)` and returns a `Map<candidateId, IETotals>`. Used by list/cards/comparison views to avoid N queries.

### 2. Candidate list/cards — IE badge
- Edit `src/components/CandidateCard.tsx`: render a small "Outside money" line near the existing finance/score metrics. Format: `▲ $1.2M for · ▼ $340K against` (green up / red down arrows from lucide). Hide entire row if `total_amount === 0`.
- Edit `src/pages/Candidates.tsx`: collect the visible candidate IDs, call `useCandidatesIE`, pass the matching totals into each `CandidateCard` as an optional `ieTotals` prop.

### 3. Race / election pages
- Edit `src/components/profile/UpcomingElectionsCard.tsx` and `src/components/profile/ElectionDetailsDialog.tsx`: for each candidate listed in a race, fetch IE totals via `useCandidatesIE` and show the same support/oppose summary next to their name. In the dialog, also show a small "Total outside spending in this race" sum.

### 4. Top Spenders dashboard (new public page)
- New route `/top-spenders` → `src/pages/TopSpenders.tsx`.
- Add link in main nav (find existing nav component during implementation).
- Filters: cycle (default 2026), state (optional), support/oppose toggle (all/support/oppose).
- Query `committee_independent_expenditure_totals` (existing view) ordered by `total_amount desc`, limit 100. Each row links to `/committee/{fec_id}`.
- Columns: rank, committee name, total spent, support $, oppose $, # expenditures.
- Header KPI cards: total IE this cycle, # committees, top-1 spender.

### 5. Candidate comparison view
- Find the existing comparison component (likely under `src/components` or `src/pages` — locate during implementation by searching for "compare"). Add a new "Outside money" row that uses `useCandidatesIE` for both candidates and shows support / oppose side-by-side with the same arrow formatting.

### Technical notes
- All four use existing materialized/regular views — no migration needed.
- Use existing `formatCurrency` util (search during impl).
- Tailwind semantic tokens only (no raw colors); reuse `text-success` / `text-destructive` if present, else add tokens.
- Numbers compact: $1.2M, $340K, $1,250.

No database/schema changes.