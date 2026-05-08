## Problem

The admin candidate grid shows two Trumps and two Vances. The "yellow" duplicates (Donald Trump · R6.09 · 23/240, and J.D. Vance · 0/240) are placeholder rows from the `static_officials` table:

- `static_officials.federal_president` → "Donald Trump"
- `static_officials.federal_vice_president` → "J.D. Vance"

Meanwhile the real, fully-tracked records live in the `candidates` table:

- `candidates.P80001571` → "Donald J. Trump" (220/240, FEC linked, T1)
- `candidates.V000137` → "JD Vance"

The admin grid merges both sources, so the static placeholders show up as duplicates with no FEC link and stale answer counts.

## Fix

Delete the two duplicate placeholder rows from `static_officials` so only the canonical `candidates` records remain:

- Remove `static_officials` row where `id = 'federal_president'`
- Remove `static_officials` row where `id = 'federal_vice_president'`

After deletion, the admin grid will show exactly one Trump (Donald J. Trump, P80001571) and one Vance (JD Vance, V000137).

## Why not a UI filter

The `static_officials` table is meant for officials that aren't in `candidates` (e.g., state/local officials). For the federal President and Vice President we already have proper candidate records, so the static rows are stale duplicates that should be removed at the data layer rather than hidden in the UI.

## Out of scope

- No code changes. No edits to the candidate merge logic, scoring, or photo URLs.
- The remaining Trump (`Donald J. Trump`) and Vance (`JD Vance`) rows stay exactly as they are.
