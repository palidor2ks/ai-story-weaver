## Root cause

The Koch Industries alias is wired up correctly:

- 54 members in `donor_alias_members`
- All matching `donors` rows have `display_name = 'Koch Industries'`
- The per‑cycle MV `private.donor_consolidated_mv` correctly shows one aggregated `Koch Industries` row per cycle (2024: $45.5M, 2026: $10.99M)

But the **all‑cycles** MV `private.donor_consolidated_all_mv` (which builds on top of the per‑cycle MV) is **stale**:

- It still shows `KOCH INDUSTRIES INC.`, `KOCHPAC`, `KOCH INC.`, etc. as separate rows
- There is no `Koch Industries` row at all
- `get_donors_paginated` reads from `donor_consolidated_all_mv` when `cycle = 'all'`, so the public Donors page (default view) keeps showing the un‑merged Koch rows

The reason is that the DB function `refresh_donor_consolidated_mv()` only refreshes the per‑cycle MV. Every alias create / attach / detach / delete path the app uses calls that function and assumes both MVs get updated. They don't, so any alias change is invisible on the default "All cycles" view of /donors.

## Fix

1. **DB migration** — update `public.refresh_donor_consolidated_mv()` to refresh both MVs in order:
   ```
   REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
   REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;
   ```
   Keep the existing `SECURITY DEFINER`, `search_path`, and `statement_timeout = 300000` (bump to ~600000 if needed since we now do two refreshes).

2. **One‑time refresh now** — run `REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv` so the Koch alias (and any other previously attached aliases) immediately appear merged on /donors.

3. **No client / edge‑function changes required.** All existing call sites (`attach-donors-to-alias`, `useDeleteDonorAlias`, `useDetachDonors`, `apply-donor-alias`) already invoke `refresh_donor_consolidated_mv` and will automatically pick up the fix.

## Verification after apply

- `SELECT display_name, total_amount FROM private.donor_consolidated_all_mv WHERE display_name = 'Koch Industries'` returns one row (~$56.5M).
- /donors with cycle = All shows a single "Koch Industries" entry.
- Old rows (`KOCH INDUSTRIES INC.`, `KOCHPAC`, etc.) no longer appear as top donors.

## Notes

- Both MVs have unique indexes (required for `REFRESH CONCURRENTLY`), so this stays non‑blocking.
- Two sequential concurrent refreshes typically run in well under 60s on the current data volume; the 300s timeout is plenty.
