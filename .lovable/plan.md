## Goal

Add a Share button on the Donor Profile page that opens the existing share modal, with a new card template that mirrors the four-stat tile layout from the attached screenshot (Total Given, Donations, Recipients, Cycles).

## Changes

### 1. Extend share types — `src/components/share/templates/types.ts`
- Add a new `kind: 'donor-stats'` to `CardData` plus optional fields:
  - `donorName`, `donorType` ('Individual' | 'PAC' | 'Organization' | 'Unknown'), `donorLocation?`
  - `totalGiven` (formatted string, e.g. "$232.7M"), `donationCount`, `recipientCount`, `cycleCount`

### 2. New template — `src/components/share/templates/DonorStatsCard.tsx`
- 1080×1080 card, same visual language as `BoldCard`/`DataCard`.
- Header: PulseMark + "Pulse" wordmark, type badge.
- Center: large donor name + location/type subtitle.
- Four stat tiles in a 2×2 (or 4-up) grid using the same icons as the profile (DollarSign, Hash, Users, Calendar) — matches user's screenshot exactly. Uses semantic tokens (no hard-coded colors).
- Footer: brand host URL.

### 3. Caption support — `src/lib/shareCaptions.ts`
- Add `DonorStatsCaptionInput { kind: 'donor-stats'; donorName; totalGiven; donationCount; recipientCount; cycleCount; url }`.
- Extend `generateLongCaption` / `generateShortCaption` / `getDefaultHashtags` with a donor-stats branch (e.g. "Miriam Adelson has given $232.7M across 22 donations to 8 recipients over 2 cycles. See the full breakdown on Pulse.").

### 4. Register template — `src/components/share/ShareCardModal.tsx`
- Add `{ id: 'donor', label: 'Donor', Component: DonorStatsCard }` to `TEMPLATES`.
- Update `refs` typing and OG title branch for `kind === 'donor-stats'` ("Donor profile: {name}").
- Default the selected template to `'donor'` when `data.kind === 'donor-stats'`; otherwise keep `'bold'`.

### 5. New trigger button — `src/components/ShareDonorButton.tsx`
- Mirrors `ShareProfileButton` API but for donors. Opens `ShareCardModal` with `kind: 'donor-stats'` `CardData` and matching caption.

### 6. Wire into profile — `src/pages/DonorProfile.tsx`
- Import the new button, render it in the header card next to the donor info (top-right of the header block on desktop, full-width on mobile).
- Pass `displayName`, `donor.type`, location, and the already-computed `stats` (formatted via existing `formatCompactAmount` / `formatCompactNumber`) plus `window.location.href` as the share URL.

## Out of scope
- No edge-function changes (existing `upload-share-card` already accepts arbitrary OG metadata).
- No changes to other share surfaces (candidate / quiz).
- No analytics schema changes — reuses existing `share_*` events with `kind: 'donor-stats'`.

## Acceptance
- Share button visible on `/donor/:id` header.
- Clicking opens the modal with the donor stats template selected by default; preview matches the four-tile layout from the user's screenshot.
- Download / Copy image / Twitter / Facebook / LinkedIn / native share all work, producing a 1080×1080 PNG with the donor's name + four stats.
