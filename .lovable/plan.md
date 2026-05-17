# Default Donor Profile to Top Contributors (PAC/Org)

## Goal

On PAC/Organization donor profile pages, surface **Top Contributors to this PAC** as the first content section after the header stats — instead of the current default view (Contribution History table that shows "0 of 0 records" until the user expands it). Keep **Top Recipients** unchanged. Restyle the contributors list to mimic the Top Recipients card grid (currently it's a plain table).

Individual donors (no PAC contributors) are unaffected.

## Changes (all in `src/pages/DonorProfile.tsx`)

1. **Reorder sections** for `donor.type === 'PAC' || 'Organization'`:
   - New order: Header → **Top Contributors to this PAC** → Top Recipients → Contribution History
   - For Individual donors: order stays the same (Top Recipients → Contribution History).

2. **Restyle Top Contributors** (currently lines 734–773, a `<table>`):
   - Replace the table with a responsive card grid: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` (matches Top Recipients at lines 653).
   - Each card mirrors the Top Recipients card structure:
     - Header row: contributor name (bold, truncate, hover:text-primary) + small badge with contribution count.
     - Footer row (border-t): amount in `text-agree` on the right + `DonorAIAnalysisDialog` "AI" button (same as recipients).
   - Show top 6 by default with a `View All Contributors (N)` toggle button — same pattern as `showAllRecipients` (lines 713–723). Add a new `showAllContributors` state.
   - Keep the section header (`Users` icon + "Top Contributors to this PAC" + total count).

3. **Linking**: contributor names are raw strings (no donor id in `pacContributors`), so the card wrapper stays a plain `div` (no `<Link>`), matching how the current table rows behave. The AI dialog provides the drill-down.

## Out of scope

- No data/query changes — `pacContributors` already powers the table.
- No changes to Top Recipients, Contribution History, filters, or Individual donor layout.
- No changes to mobile share card or stats grid.
