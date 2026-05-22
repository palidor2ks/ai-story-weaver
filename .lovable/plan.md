## What I found

I queried the three highlighted committees. Each has a different underlying bug — they only *look* similar on the card.

### 1. MOODY FOR FLORIDA (`C00895763`) — shows $0 / 0 donors

- `candidate_committees.local_itemized_total` = **$13.5M** (committee-level total)
- `committee_finance_rollups` has two rows:
  - cycle 2024 → `local_itemized=0, donor_count=0, contribution_count=0`
  - cycle 2026 → `local_itemized=$3.57M, fec_total_receipts=$8.4M, donor_count=0, contribution_count=0`
- Actual `contributions` table: **348 rows, $5.89M**

**Bug in `buildCommitteeSummaries` (src/hooks/useCommittees.ts:90-118):** when cycle is `'all'`, it first picks the rollup whose `candidate_id` matches the committee — that happens to be the **2024 zero row** — and uses *its* totals instead of the aggregated totals. The aggregation across cycles only kicks in if no candidate-id match is found. So Moody renders $0 even though both the row and the 2026 rollup have money.

Also: `donor_count` / `contribution_count` are zero in both rollup rows even though 348 contributions exist — rollups are stale for this committee.

### 2. AMERICA PAC (`C00879510`) — $316M raised, 0 donors, 0 contributions

- `local_itemized_total` = **$316,109,603** on the committee row
- **No row in `committee_finance_rollups` at all**
- Actual `contributions` table: **86 rows, $395M** (mostly mega-donor receipts to Musk's super PAC)
- Separate `independent_expenditures`: **1,184 rows, $172.8M** (the IE badge)

**Bug:** when no rollup exists, `buildCommitteeSummaries` falls back to `local_itemized_total` for `totalRaised` but leaves `donorCount=0` and `contributionCount=0`. So the card shows real receipts but pretends there are no donors. (The IE figure is correct and separate.)

### 3. "Unknown Committee" (`C00607416`, Fitzpatrick) — null name

- `candidate_committees.name` is **NULL** (118 of 1,252 committee rows have null names)
- `contributions.recipient_committee_name` for this id = **"BRIAN FITZPATRICK FOR ALL OF US"**

The page already falls back to "Unknown Committee" — but we have a real name available from contributions and from the linked candidate.

---

## Fix

### A. `src/hooks/useCommittees.ts` — `buildCommitteeSummaries`

1. **Always aggregate across all rollup rows when cycle is `'all'`**, instead of picking the candidate-id-matching row. Use the per-cycle rollup only when a specific cycle is selected.
2. **When no rollup exists** but `local_itemized_total > 0`, render donor/contribution counts as `null` (so the UI can show `—` instead of a misleading `0`). Optionally trigger a one-shot contributions-table fallback like the single-committee `useCommittee` already does, but only for the visible page to keep it cheap.
3. **Name fallback:** prefer `committee.name ?? aliasName ?? candidate.name + ' Committee' ?? 'Unknown Committee'`.

### B. `src/pages/Committees.tsx` — card rendering

- Show `—` for Donors / Contributions when the value is `null` (rollup missing) instead of `0`/`1K`, so users can tell "we don't know" apart from "actually zero".
- Use the new name fallback chain.

### C. Data backfill (migration)

Two small backfills to make the cards self-healing going forward:

1. `UPDATE candidate_committees cc SET name = sub.n FROM (SELECT DISTINCT ON (recipient_committee_id) recipient_committee_id, recipient_committee_name AS n FROM contributions WHERE recipient_committee_name IS NOT NULL) sub WHERE cc.name IS NULL AND cc.fec_committee_id = sub.recipient_committee_id;`
2. Insert a single aggregate `committee_finance_rollups` row (cycle `'all'` or per-cycle) for committees that have contributions but no rollup, so AMERICA PAC and similar PACs stop showing 0 donors. Computed as `COUNT(DISTINCT contributor key)`, `COUNT(*)`, `SUM(amount)` grouped by `(recipient_committee_id, cycle)`.

(If you'd rather not touch the rollups table, we can do the same calculation client-side using the existing `useCommittee` fallback path, but that fires one extra query per visible card.)

### Out of scope
- Reconciling the $316M (`local_itemized_total`) vs $395M (raw contributions) vs $173M (IE) for AMERICA PAC — that's an importer-level reconciliation question, not a display bug. Happy to dig in next if you want.

Confirm you want me to (A) ship the code fixes only, (B) code fixes + the name backfill, or (C) all of the above including rebuilding missing rollup rows.