## Goal

Fix the $0 / "0 donors" cards in the Committee Directory for joint-fundraising committees, leadership PACs, and other committees that were never synced — while keeping the existing JU/BD exclusion rule intact for candidate-level totals.

## Scope

Audit shows ~620 committees with no rollup row today:
- 590 joint_fundraising
- 17 leadership_pac
- 17 unlinked principals
- ~handful of authorized / external / delegate

All currently render as `$0` / `0`, which looks like a bug.

## Implementation

### 1. New edge function: `sync-committee-totals`

Lightweight, FEC-only, no donor itemization.

- Admin auth + service-role gate (mirrors `sync-all-donors`)
- Input: `{ committeeIds?: string[], roles?: string[], cycle?: string, limit?: number, onlyMissing?: boolean }`
- For each committee:
  - Call `https://api.open.fec.gov/v1/committee/{id}/totals/?cycle={cycle}&per_page=1` (uses existing `FEC_API_KEY`)
  - Upsert one row into `committee_finance_rollups` keyed on `(committee_id, cycle, candidate_id=NULL)` with:
    - `fec_total_receipts = receipts`
    - `fec_itemized = individual_itemized_contributions + other_political_committee_contributions`
    - `contribution_count = contributions` (when present)
    - `donor_count = NULL` (we don't itemize JFCs)
  - Update `candidate_committees.last_sync_date = now()`, `fec_itemized_total`
- Background work via `EdgeRuntime.waitUntil()`, 200 ms delay between calls, batch size 50 per invocation
- Per [Finance Sync Dependencies] and [JU BD exclusion], these rows are read by the directory only — `get_contribution_totals` already filters `designation IN ('P','A')`, so candidate aggregates remain unaffected.

### 2. Migration: unique index for the new rollup shape

```sql
CREATE UNIQUE INDEX IF NOT EXISTS committee_finance_rollups_committee_cycle_nullcand_uniq
  ON public.committee_finance_rollups (committee_id, cycle)
  WHERE candidate_id IS NULL;
```

Enables idempotent upsert from the edge function without touching existing candidate-linked rollups.

### 3. Admin UI: "Sync committee totals" card

Extend `src/components/admin/BulkDonorSyncCard.tsx` (or add a sibling card on the same panel):
- Button: **Sync committee totals** with a role selector (all unsynced / joint_fundraising / leadership_pac / external)
- Cycle selector reuses `useFinanceCycles`
- Progress + last-run summary, same pattern as the existing donor sync card
- Calls `sync-committee-totals` via `supabase.functions.invoke`

### 4. Frontend polish — `src/pages/Committees.tsx`

Honest empty state for unsynced committees:
- When `lastSyncDate == null` AND `totalRaised === 0` → render `—` in both tiles plus a small muted "Not yet synced" caption under the card
- When `lastSyncDate` exists but `totalRaised === 0` → keep `$0` (real reported zero)
- Add a filter chip **"Hide unsynced"**, default **on**, so the directory leads with real numbers; toggling off shows everything (current behavior)
- Update `formatCurrency`/donor tile to accept `null` and render `—`

No change to `useCommittees` mapping logic — `buildCommitteeSummaries` already falls back through `local_itemized → fec_total_receipts → fec_itemized → aggregated`.

## Files touched

```text
supabase/functions/sync-committee-totals/index.ts   (new)
supabase/migrations/<ts>_committee_rollups_nullcand_uniq.sql   (new)
src/components/admin/BulkDonorSyncCard.tsx          (extend or split)
src/pages/Committees.tsx                            (empty-state + filter)
src/hooks/useCommittees.ts                          (allow null totalRaised)
```

## Out of scope

- Re-allocating JFC dollars into candidate roll-ups (intentionally excluded per existing memory)
- Itemized JFC donor import
- Backfilling historical cycles beyond what the admin selects

## Verification

1. Run migration, deploy function
2. From admin panel, trigger sync for `joint_fundraising` cycle `2024`
3. Reload `/committees` filtered to JFCs — totals should now reflect FEC reported receipts; remaining unsynced ones show `—`
4. Spot-check `C00523985` (FRESHMAN HOLD'EM JFC) and one leadership PAC against fec.gov
5. Confirm a known principal candidate's total disbursements/receipts on their profile is unchanged (regression check on candidate aggregation)
