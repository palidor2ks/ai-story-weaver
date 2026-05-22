## Problem

The identity bar (Committee / FF PAC / FEC ID) was already wrapped in a `sticky top-[6.5rem]` container on mobile, but it scrolls away anyway. Reason: a `position: sticky` element only stays pinned inside its parent's box. Its current parent is a short `<div className="flex flex-col gap-3">` that only holds the identity + the badges row (~150px tall on mobile), so once you scroll past those ~150px the sticky element leaves with them.

## Fix

Lift the sticky identity bar so its containing block is the full page-content column (the `<div className="space-y-8">`), which is thousands of pixels tall and covers the entire profile. The bar then stays pinned for the whole scroll of the profile.

### `src/pages/CommitteeProfile.tsx`
- Move the sticky identity `<div>` (current lines 154–174) OUT of the `flex flex-col gap-3` wrapper and make it the first direct child of the existing `<div className="space-y-8">` block.
- Keep the badges/AI Analysis/Sync Donors row inside its own non-sticky `flex flex-col gap-3` wrapper right below it (unchanged classes).
- Keep all sticky classes the same: `md:static sticky top-[6.5rem] z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border md:border-0 md:bg-transparent md:backdrop-blur-none md:py-0 md:mx-0 md:px-0`.
- Desktop layout stays identical because the wrapper collapses to `md:static` with no chrome.

### Peer pages — same root-cause fix
Apply the same lift on the mobile-only mini identity bars added previously, so each one's parent is the page's tall main column (not a short sibling group):
- `src/pages/CandidateProfile.tsx`
- `src/pages/DonorProfile.tsx`
- `src/pages/PartyProfile.tsx`

For each: ensure the `md:hidden sticky top-16 z-30 …` mini bar is a direct child of the main page wrapper that contains all the scrolling content below it. If it currently sits inside a small header card or short flex group, move it up one level so its containing block spans the rest of the page.

## Technical notes
- `position: sticky` is bounded by the nearest scroll ancestor AND by its own parent's box. The parent box is the real issue here, not the scroll ancestor.
- Offsets (`top-[6.5rem]` on CommitteeProfile, `top-16` elsewhere) and z-index (`z-30`, below Header `z-50` and the back sub-bar `z-40`) are correct and unchanged.
- No changes to Header, back sub-bar, badges, KPIs, or any desktop styles.

## Out of scope
- No new components, no design changes, no business logic.
