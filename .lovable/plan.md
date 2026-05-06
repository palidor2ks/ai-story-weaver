## Problem

The state filter dropdown shows states/territories that don't appear in the Visible States panel: **AS** (American Samoa), **GU** (Guam), **MP** (Northern Mariana Islands), **PR** (Puerto Rico), **US** (national-level), and **VI** (U.S. Virgin Islands).

These exist in the `candidates` table but are missing from the `STATES` constant in `HiddenStatesPanel.tsx`. Since they can't be toggled hidden, they always pass through the filter.

## Fix

**File: `src/components/admin/HiddenStatesPanel.tsx`**

Add the missing territories to the `STATES` array:
- `{ code: "AS", name: "American Samoa" }`
- `{ code: "GU", name: "Guam" }`
- `{ code: "MP", name: "N. Mariana Islands" }`
- `{ code: "PR", name: "Puerto Rico" }`
- `{ code: "US", name: "National" }`
- `{ code: "VI", name: "U.S. Virgin Islands" }`

This lets you toggle visibility for all entries that actually have candidates, including territories.
