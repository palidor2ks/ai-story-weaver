## Goal
Use the empty space to the right of the avatar (currently below the name on mobile) by relocating the action icon row (Edit, Claim, AI Analysis, Share) to sit at the top-right of the hero card, aligned with the avatar.

## Change
In `src/pages/CandidateProfile.tsx` hero section (lines ~278-396):

- Restructure the hero so the avatar and action icon row are siblings in a top row: avatar on the left, action icons on the right (top-aligned, `ml-auto`, `flex-wrap justify-end`).
- Move the icon button group (`canEdit` Edit, `isPoliticianOwner` Answer Questions, `ClaimProfileDialog`, `RecipientAIAnalysisDialog`, `ShareProfileButton`) out from below the name and into this top-right slot.
- Keep name, office/state, party badge, verified/overridden badges where they are (below avatar on mobile, beside on desktop).
- Remove the now-empty action-row container below the badges.
- Ensure on mobile the icons still wrap nicely (sit next to avatar at the top — avatar is fixed width so there is room for 4 small icons at 430px viewport).

Apply the same pattern to the equivalent header in `src/pages/CommitteeProfile.tsx` if it has the same empty-space layout (will confirm during build).

## Out of scope
No changes to icons themselves, score card, or other sections.
