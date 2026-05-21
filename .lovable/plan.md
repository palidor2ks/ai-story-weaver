## Goal

On the committee profile's **Independent Expenditures** card (`CommitteeIESection`), replace the row-by-row filings table with a summary grouped by **target candidate** (totals supporting vs opposing), and add a **year/cycle filter**.

## Changes

### 1. `src/hooks/useIndependentExpenditures.ts` — extend `useCommitteeIE`

- Accept an optional `cycle` arg: `useCommitteeIE(committeeFecId, cycle?)`.
- Fetch all IE rows for the committee (not just 25), filtered by `cycle` when provided. Select the existing fields plus `target_fec_candidate_id` / `candidate_id` for grouping.
- Derive in JS:
  - `availableCycles: string[]` — distinct cycles found for this committee (always from an unfiltered call so the dropdown is stable).
  - `totals` — recomputed from filtered rows (so the headline numbers respect the filter).
  - `targets: Array<{ key, name, fecId, candidateId, support, oppose, total, count }>` grouped by `target_fec_candidate_id ?? target_candidate_name`, sorted by `total` desc.
- To keep the dropdown stable, do two queries: (a) lightweight `select('cycle')` distinct for cycle list, (b) the filtered rows query.

### 2. `src/components/IndependentExpenditureSections.tsx` — rewrite `CommitteeIESection`

- Add local `cycle` state (default `'all'`). Pass to hook.
- Header right side: `<Select>` with `All cycles` + each cycle from `availableCycles` (desc).
- Keep the 4 Stat cards (Total / Supporting / Opposing / Filings), now reflecting filtered totals.
- Replace the filings table with a **By target** table:
  `Target | Supporting | Opposing | Total | Filings`, with the same styling tokens (`text-agree`, `text-disagree`). Link target name to `/candidate/{candidateId}` when available.
- Empty state if no rows for the selected cycle.

### 3. No DB changes

All grouping done client-side from `independent_expenditures`. No migration, no edge function changes.

## Files touched

- `src/hooks/useIndependentExpenditures.ts`
- `src/components/IndependentExpenditureSections.tsx`

## Out of scope

- Candidate profile's `CandidateIESection` (already aggregates by top spender).
- Admin import UI.
