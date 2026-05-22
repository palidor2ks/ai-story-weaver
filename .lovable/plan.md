## Problem

The Committees page is paginated by **alphabetical name** in the database query (see the screenshot: Adam Gray → Adam Smith → Aaron Bean). The client then re-sorts each loaded page by `totalRaised`, but that only sorts within the 50 already-loaded rows — the actual top receipts in the database may live on page 20+ and never appear at the top.

## Fix

Sort the DB query in `src/hooks/useCommittees.ts` by receipts so pagination reflects the true ranking.

### Changes

**`src/hooks/useCommittees.ts` — `fetchCommitteePage` (and `fetchCommittees` for consistency)**

Replace:
```ts
.order('name', { ascending: true })
```
with receipts-first ordering on `candidate_committees`:
```ts
.order('local_itemized_total', { ascending: false, nullsFirst: false })
.order('fec_itemized_total',   { ascending: false, nullsFirst: false })
.order('name', { ascending: true })
```

`local_itemized_total` / `fec_itemized_total` are the cycle-aggregate receipt totals already stored on the committee row and are what `buildCommitteeSummaries` falls back to when no rollup matches, so server order will match the displayed "Total Raised" for the default "All cycles" view.

**`src/pages/Committees.tsx`**

Drop the client-side `.sort((a, b) => b.totalRaised - a.totalRaised)` re-sort (lines ~88–90) so the page preserves server order across pages instead of shuffling each page in isolation.

### Notes / caveats

- When a specific cycle is selected, the rollup for that cycle can override `totalRaised` per row, so within a page some rows may not be in strict cycle-specific order. Fixing that perfectly would require a server-side join/RPC against `committee_finance_rollups`; out of scope for this change unless you want it.
- "Hide unsynced" still filters client-side after sort, which is fine.

No backend/schema changes.