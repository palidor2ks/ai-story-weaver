## Goal
Clean up the spectrum bar markers on `CandidateScoreCard`.

## Changes to `src/components/CandidateScoreCard.tsx`

1. **Remove the bottom legend** (the "Rep / You" row under the L10–C–R10 axis).
2. **Position both marker dots directly on the gradient bar** — vertically centered on the bar (current top math should be `top-1/2 -translate-y-1/2` relative to the bar element, not offset above/below). Verify both Rep and You dots sit on the bar line.
3. **Label placement**:
   - "YOU" label always **above** the user's dot.
   - "Rep" label always **below** the rep's dot.
   - Drop the close-marker swap logic (no longer needed since they're on opposite sides vertically).
4. **Cleaner styling**:
   - Smaller dots (h-4 w-4) for less visual weight.
   - Labels: `text-[10px] font-semibold uppercase tracking-wider`, muted color for "Rep", primary color for "You".
   - Ensure axis labels (L10/C/R10) have enough top margin to clear the "Rep" label below the bar.

## Out of scope
- No changes to score math, props, or `CandidateProfile.tsx`.
- No color palette changes beyond what's needed for label contrast.

## Verification
On `/candidate/B001288`: both dots sit centered on the gradient bar, "YOU" sits above the user dot, "Rep" sits below the rep dot, no legend at the bottom, and L10/C/R10 axis remains readable.
