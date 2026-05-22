## Goal
On mobile, the "Back to Top Spenders" row takes a full line of vertical space below the header. Move it into the header strip area so it sits inline with the nav bar, while keeping desktop layout unchanged.

## Approach
Scoped to `src/pages/CommitteeProfile.tsx` only (no Header.tsx changes, no logic changes).

1. Remove the current back row (lines 99–106) from the main content area on mobile.
2. Render a compact back control as a sticky sub-bar **directly under `<Header />`** that is visible only on mobile (`md:hidden`):
   - Full-width thin strip, `sticky top-16 z-40`, same `bg-background/95 backdrop-blur` styling as Header for visual continuity.
   - Left-aligned: small `ArrowLeft` icon + `backLabel` text as a single `<Link>` (tap target ~40px tall).
   - Border-bottom to separate from page content.
3. Keep the existing back row visible on desktop (`hidden md:flex`) so nothing changes on larger screens.

This makes the back affordance feel like part of the navigation chrome on mobile (matching the user's highlighted area) and reclaims vertical space above the committee title.

## Files
- `src/pages/CommitteeProfile.tsx` — split the back control into a mobile sticky sub-bar + desktop inline row.

## Out of scope
- No changes to `Header.tsx`, routing, or back-target logic.
- Applies only to CommitteeProfile; other pages with similar back links can be migrated later if desired.
