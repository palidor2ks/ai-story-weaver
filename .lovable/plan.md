## Use "B" for billions in compact currency

Currently `formatIECompact` in `src/components/IESummaryInline.tsx` tops out at "M", so $13.97B renders as `$13970M` (visible on Top Spenders header card).

### Change

Update the `compact()` function in `src/components/IESummaryInline.tsx` to add a billions branch above the millions branch:

- `n >= 1_000_000_000` → `$X.XXB` (2 decimals under 10B, 1 decimal at/above 10B)
- existing M / K / raw branches unchanged

This single function powers every use of `formatIECompact` — Top Spenders header ("Total IE Spending"), #1 spender card, per-row totals, Committees page IE badges, and `ElectionDetailsDialog`. All of them will switch from `$13970M` → `$13.97B` automatically once values cross 1B.

### Out of scope

- `formatCurrency` / `formatNumber` in `src/pages/Committees.tsx` (separate helpers — flag if you also want raised totals to use B).
- No data, schema, or query changes.
