## Diagnosis

The 2026 donations for Ashley Moody (`M001244`, committee `C00895763` MOODY FOR FLORIDA) **did import successfully**:

- `contributions`: 12,075 rows for cycle 2026, totaling **~$13,487,348**.
- `candidate_committees`: the 2026 principal committee is linked (`Linked` badge in the screenshot is correct).

What's missing is the **reconciliation/rollup step**. The admin row reads from `finance_reconciliation`, and there is only a row for cycle **2024** (all zeros) — no row for cycle **2026**. Also `candidate_committees.local_itemized_total` is still `0`.

The CSV import function (`import-fec-receipts-csv`) writes raw `contributions` but does not recompute totals. Totals are only refreshed by the `nightly-finance-reconciliation` edge function, which hasn't been run for this candidate/cycle since the import.

## Fix

Trigger reconciliation for just this candidate + cycle (cheap, ~seconds):

```
POST /functions/v1/nightly-finance-reconciliation
{ "candidateId": "M001244", "cycle": "2026" }
```

This will:
1. Aggregate the 12,075 imported contributions into `finance_reconciliation` (cycle 2026) — populating `local_itemized`, `local_individual_itemized`, `local_pac_contributions`, etc.
2. Update `candidate_committees.local_itemized_total` for the MOODY FOR FLORIDA committee.
3. Fetch FEC API totals for cycle 2026 and compute the delta.
4. The admin "Finance" / Local / Delta columns will then show the real numbers (and `$` status badge will flip from Balanced/0 to the actual reconciliation state).

## Verification

After the function returns I'll re-query:
- `SELECT local_itemized, fec_total_receipts, status FROM finance_reconciliation WHERE candidate_id='M001244' AND cycle='2026'`
- `SELECT local_itemized_total FROM candidate_committees WHERE candidate_id='M001244'`

and confirm both reflect the ~$13.5M.

## Optional follow-up (ask before doing)

Right now any CSV import leaves totals stale until the nightly job runs. I can wire `import-fec-receipts-csv` to automatically enqueue a per-candidate reconciliation at the end of a successful import (using `EdgeRuntime.waitUntil`) so this never happens again. Want me to add that?
