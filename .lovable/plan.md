# Clarify Committees vs Top Spenders (keep separate, link them)

## Why not merge

The two pages share rows (committees) but measure opposite flows:

- **Committees** ranks by **receipts** (money raised into the committee) from `committee_finance_rollups` + `contributions`. Universe = every tracked committee (candidate principal/authorized committees, PACs, party, super PACs).
- **Top Spenders** ranks by **independent expenditures** (money spent supporting/opposing federal candidates, Schedule E) from `independent_expenditures` / `committee_independent_expenditure_totals`. Universe = outside spenders only.

A merged view would either:
- Pick one metric and bury the other (loses the IE story or the fundraising story), or
- Show both side-by-side with a single sort, which makes ranking meaningless and forces a wide table that's hard to scan on mobile.

Both pages already link into the same `/committee/{fec_id}` profile, which is the right place for the full picture.

## Changes

Make the relationship obvious so users stop perceiving them as duplicates.

### 1. Rename and reframe headers / SEO

- **Committees** page header subtitle: "All federal committees ranked by money raised (receipts)."
- **Top Spenders** page header (already says "Super PACs and outside groups ranked by independent expenditures…") — keep, but add a small link: *"Looking for fundraising totals? See [Committees]."*
- Mirror link on Committees: *"Looking for outside spending (Super PAC IEs)? See [Top Spenders]."*
- Update `<Seo>` titles/descriptions on both pages to reflect the metric ("Top Federal Committees by Receipts" vs "Top Outside Spenders by Independent Expenditures").

### 2. Add a cross-metric column to each list (lightweight)

For each row, surface the other side as a small secondary number with a link, so users can see context without leaving:

- **Committees row**: append a small "IE: $X" badge for committees that appear in `committee_independent_expenditure_totals` (single batched lookup keyed by `fec_committee_id` for the visible page). Empty/omitted when zero.
- **Top Spenders row**: append a small "Raised: $X" line under the committee name, sourced from `committee_finance_rollups` aggregated by `committee_id` for the visible page. Empty/omitted when no rollup exists.

Both are presentation-only: one extra batched `select … in (…)` per page, mapped client-side. No new endpoints, no schema changes.

### 3. Navigation

- Add a small segmented control (or just two tabs) at the top of each page: **By receipts (Committees)** | **By outside spending (Top Spenders)**. Same visual, two routes. Reuses existing pages, just makes the switch one click instead of menu hunting.

## Out of scope

- Merging the two queries into one table.
- Changing the underlying tables/views.
- Editing `/committee/{fec_id}` profile (already shows both sides via `CommitteeIESection` + the totals cards).

## Verification

- Committees still loads with current filters and counts; new "IE" badges only appear for committees present in IE totals.
- Top Spenders still loads with current filters; new "Raised" line only appears for committees that have rollups.
- Cross-links between the two pages render and route correctly.
