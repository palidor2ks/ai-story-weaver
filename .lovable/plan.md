## Plan: Compact dollar formatting site-wide

Show all dollar amounts as compact ($266.9M, $19M, $14.7M, $1.2B, $4.9K) everywhere, matching the format already used on the Committees list.

### 1. Add shared helpers in `src/lib/utils.ts`

```ts
export function formatCompactCurrency(value: number | null | undefined): string
export function formatFullCurrency(value: number | null | undefined): string  // for tooltips
```

Rules (same as current `Committees.tsx`):
- `>= 1B` → `$1.2B` (1 decimal, strip trailing `.0`)
- `>= 10M` → `$266M` (no decimals)
- `>= 1M` → `$4.9M` (1 decimal, strip `.0`)
- `>= 1K` → `$15K` (no decimals)
- `< 1K` → `$N` (integer)
- Negative values get a leading `-`
- `null`/`undefined`/`NaN` → `—`

### 2. Replace local formatters with the shared one

Files that currently define or use their own `formatCurrency` / `Intl.NumberFormat({ currency })`:
- `src/pages/Committees.tsx` — remove local copies, import shared.
- `src/pages/CommitteeProfile.tsx` — replace local `formatCurrency` (used on Total Raised, top contributors, donor table).
- `src/pages/CandidateProfile.tsx` — replace local formatter on finance/donor totals.
- `src/pages/DonorProfile.tsx` — replace local formatter on lifetime total, recipient totals, contribution rows.
- `src/components/FinanceSummaryCard.tsx`
- `src/components/FinanceReconciliationCard.tsx`
- `src/components/IndependentExpenditureSections.tsx`
- `src/components/admin/CommitteeBreakdown.tsx`
- `src/components/admin/FinanceCategoryBreakdown.tsx`
- `src/components/admin/FinanceStatusBadge.tsx`
- `src/components/admin/DeltaBadge.tsx`
- `src/components/admin/AnswerCoveragePanel.tsx`
- `src/components/admin/BulkDonorSyncCard.tsx` (the "Total raised: $..." line)

For each big number, wrap with a `title={formatFullCurrency(value)}` tooltip so the exact figure is still available on hover (consistent with the Committees list).

### 3. Out of scope

- Admin reconciliation **delta** cells where the exact dollar gap matters (Reconciliation Card line-item table). I'll keep full numbers there to preserve diff readability — open to flipping these to compact too if you'd prefer.
- Share card templates (`src/components/share/templates/*`) keep their existing formatting since they're designed-for-print and already chosen by the user.

### Technical notes
- One commit touches ~12 files; behavior change only — no schema or query changes.
- Removes 4+ duplicated `formatCurrency` implementations.
