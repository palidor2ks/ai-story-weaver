## Why the $ columns went to 0

The previous change hardcoded the finance cycle to **2026**. Only Ashley Moody has 2026 finance data imported; every other candidate's 2024 numbers were hidden, not deleted.

## Plan: Dynamic Cycle selector

### 1. Source the cycle list from the database
The DB already has `public.get_committee_cycles()` (returns `text[]` of every cycle present in `candidate_committees.cycles` ∪ `committee_finance_rollups.cycle`, sorted desc). We'll use it — no hardcoded years, automatically picks up new imports (2022, 2028, etc.).

Add a tiny hook `useFinanceCycles()`:
- React Query, calls `supabase.rpc('get_committee_cycles')`.
- Returns `string[]` sorted desc (e.g. `['2026','2024','2022',...]`).
- Stale time 5 min.
- Fallback to `['2026','2024']` only if the RPC returns empty.

### 2. Cycle state + selector in `AnswerCoveragePanel.tsx`
- `const [financeCycle, setFinanceCycle] = useState<string>(() => localStorage.getItem('admin.financeCycle') ?? '2026')`.
- Persist on change to `localStorage`.
- If the persisted cycle isn't in the fetched list, fall back to the newest available.
- Render a `Cycle:` `<Select>` in the filter toolbar (next to `Finance:` / `Delta:` / `FEC ID:`) populated from `useFinanceCycles()`.

### 3. Hook accepts the cycle
- `useCandidatesAnswerCoverage(financeCycle: string)` — replace hardcoded `const FINANCE_CYCLE = '2026'` with the arg, add `financeCycle` to the queryKey so the data refetches when switched.

### 4. Replace every hardcoded `'2026'` in the panel with `financeCycle`
All 13 occurrences in `AnswerCoveragePanel.tsx`:
- Header label "Cycle 2026 (…)" → `Cycle {financeCycle} ({getCycleDateRange(financeCycle)})`.
- Bulk actions: `batchFetchDonors`, `resumeAllPartialSyncs`, `batchRefreshFECTotals`, `syncAllCandidatesComplete`, `runBatchReconciliation`.
- Per-row action menu (5 callsites: donor fetch, sync, FEC refresh, reconciliation).

### 5. Leave non-finance logic alone
Answers/votes/coverage tier are unaffected — the cycle only drives the `$`, `FEC`, `Local`, `Delta` columns and the finance action buttons.

## Technical details

Files touched:
- `src/hooks/useFinanceCycles.ts` (new) — wraps `get_committee_cycles` RPC.
- `src/hooks/useCandidatesAnswerCoverage.ts` — accept `financeCycle` param; use it in the `finance_reconciliation` query + queryKey.
- `src/components/admin/AnswerCoveragePanel.tsx` — add state + dropdown, replace literal `'2026'` strings.

No DB / edge-function changes. Default remains the newest cycle so Moody's 2026 import stays visible; switching back surfaces 2024 data; future cycles (2028, 2030, …) show up automatically when committees or rollups appear for them.
