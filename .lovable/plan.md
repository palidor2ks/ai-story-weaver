# Show real committee names (e.g., "House Majority PAC" for HMP)

## Why "HMP" shows up

The Top Spenders list renders `spending_committee_name` straight from `independent_expenditures`. For C00495028, FEC's IE filings record the committee name as the filer-supplied short name **"HMP"** — that's literally what's in the IE file. The full registered name "HOUSE MAJORITY PAC" only lives on FEC's `/committees/` endpoint, which we mirror into `external_pacs.name`.

We currently have no record for C00495028 in `external_pacs` and no resolver in TopSpenders, so the abbreviation wins.

## Fix

Resolve every spender's display name from `external_pacs` first, falling back to the IE filer name, then the FEC ID.

### Step 1 — Backfill external_pacs for all IE spenders

Trigger `sync-fec-committees` so every active committee (including C00495028 / House Majority PAC) is mirrored with its real registered name. Already implemented; just needs to be run / re-run. As a one-shot supplement, ensure the sync also covers committee_types `Y/W/O/U/N/Q/V/X/Z` for cycles back to 2018 so historical IE filers are covered.

### Step 2 — Join display names into the TopSpenders query

In `src/pages/TopSpenders.tsx` / `useTopSpenders`:

1. After fetching the top 100–200 spender rows, collect the `fec_committee_id`s.
2. Fetch matching `external_pacs` rows: `select fec_committee_id, name`.
3. Build a `Map<fec_id, displayName>` and overwrite `spending_committee_name` with `external_pacs.name` when present (preferring the longer, registered name).

This adds one bounded query per page render, gated by the existing react-query cache.

### Step 3 — Reuse on the committee profile header

`/committee/:fecId` (CommitteeProfile) should apply the same resolver so the header reads "House Majority PAC" instead of "HMP". One-line fix: prefer `external_pacs.name` over the IE-derived name.

## Optional: manual alias override

For cases where FEC's registered name is still cryptic, add a tiny `committee_display_overrides` table (`fec_committee_id` PK, `display_name`, admin-managed). The resolver checks override → external_pacs → IE name. Out of scope unless the user wants it now.

## Files touched

- `src/pages/TopSpenders.tsx` (resolver + join)
- `src/pages/CommitteeProfile.tsx` (header fallback)
- Run `sync-fec-committees` once (no code change beyond a button click in admin, or invoke via UI)

## Out of scope

- Touching how IE rows are stored (don't rewrite `independent_expenditures.spending_committee_name`).
- Search-by-alias on TopSpenders (separate request).
