## Goal
Make the identity header (icon + label + name + ID) sticky on mobile so the user always sees who they're looking at while scrolling. Apply the same pattern to similar profile pages.

## Approach

### CommitteeProfile (`src/pages/CommitteeProfile.tsx`)
Wrap the identity block (lines ~153–172: avatar tile + "Committee" / name / FEC ID) in a mobile-sticky container:
- Classes: `md:static sticky top-[6.5rem] z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border md:border-0 md:bg-transparent md:backdrop-blur-none md:py-0 md:mx-0`
- `top-[6.5rem]` (104px) = Header (64px) + mobile back sub-bar (40px), so it locks just under them.
- Compact spacing on mobile: shrink the avatar to `w-10 h-10` and the H1 to `text-xl` only at `<md`. Hide the linked-candidate subtitle on mobile (keep on `md:block`) to keep the bar thin.
- Keep the badges / AI Analysis / Sync Donors row OUTSIDE the sticky wrapper so it scrolls normally.
- Desktop is unchanged (the wrapper becomes a no-op via `md:static md:bg-transparent ...`).

### Apply the same pattern to peer pages
Same sticky identity treatment, identical classes, scoped to mobile, no desktop change:
- `src/pages/CandidateProfile.tsx` — sticky on the candidate avatar + name + party/office line.
- `src/pages/DonorProfile.tsx` — sticky on donor name + employer/occupation.
- `src/pages/PartyProfile.tsx` — sticky on party logo + name.
- `src/pages/PoliticianDashboard.tsx` — sticky on the politician identity header (if present).

For each, pick the smallest identity row already in the JSX and wrap it with the same sticky classes. Where a back sub-bar isn't present on that page, use `top-16` instead of `top-[6.5rem]`.

## Technical notes
- The Header is `sticky top-0 z-50`; the mobile back sub-bar (added previously, CommitteeProfile only) is `sticky top-16 z-40`. The identity bar uses `z-30` so it stacks below both.
- Use `-mx-4 px-4` to break out of the `container` padding so the sticky bar visually spans full width and the border-bottom reaches edge-to-edge on mobile.
- Use `supports-[backdrop-filter]:bg-background/60` mirror of the Header for visual continuity.

## Out of scope
- No layout changes on desktop.
- No changes to the back-bar, badges, KPIs, or page content.
- No changes to Header.tsx.
