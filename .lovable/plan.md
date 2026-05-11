## Goal
On the candidate profile spectrum bar (CandidateScoreCard), show two markers — the candidate (rep) and the logged-in user — and label which is which.

## Changes

**`src/components/CandidateScoreCard.tsx`**
- Add optional prop `userScore?: number | null`.
- Compute a second marker position using the same `(score + 10) / 20 * 100` formula.
- Render two distinct markers above the gradient bar:
  - **Rep marker**: filled circle in candidate's score color (existing dark dot style), labeled with the candidate's first name or "Rep" pill above/below it.
  - **You marker**: outlined circle (e.g. accent/primary ring with white fill, slightly smaller or diamond-shaped) labeled "You".
- If both markers are within ~6% of each other, stack the labels vertically so they don't overlap.
- Add a small legend row under the L10 / C / R10 axis: a colored dot + "Rep" and an outlined dot + "You", only shown when `userScore` is provided.
- If `userScore` is null/undefined (logged-out or no quiz taken), behave exactly like today (single marker, no legend).

**`src/pages/CandidateProfile.tsx`**
- Pass `userScore={profile?.overall_score ?? null}` (only when the user actually has a score; otherwise undefined) into `<CandidateScoreCard ... />` at line 345.

## Out of scope
- No changes to score math, match calculation, data fetching, or other cards.
- No changes for non-logged-in users beyond hiding the user marker.

## Verification
- Logged-in user with a quiz score on `/candidate/B001288`: spectrum shows two distinct markers with "Rep" and "You" labels and a legend.
- Logged-out user or user without a quiz score: spectrum looks identical to current (single rep marker).
- When the two scores are close, labels remain readable (no overlap).
