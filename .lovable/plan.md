## Problem
On the EditorialCard, when there's no candidate portrait the left band falls back to the first letter of the user's name (`userName.charAt(0)`). For a user named "Rachel" with a Left-Leaning score, this renders a giant **R** next to "L4.21 — Left-Leaning", which reads as if R = Right. Misleading and unrelated to the political score.

## Fix
Replace the name initial with the actual score glyph for non-candidate cards.

### `src/components/share/templates/EditorialCard.tsx`
- Compute a `leftDisplay` based on `data.kind`:
  - `candidate-alignment` with portrait → portrait (unchanged).
  - `candidate-alignment` without portrait → keep the candidate's initial (it's a candidate identifier, less ambiguous in that context).
  - `user-profile` → render the formatted user score, e.g. `L4.21`, using `formatScoreSafe(data.userScore)`.
  - `invite` → render the Pulse wordmark/logo (no score available).
- Tune typography so the score fits the 420px band:
  - Font-size ~140 (down from 280 for a single letter), `lineHeight: 1`, `letterSpacing: -4`, font-weight 800.
  - Add a small uppercase eyebrow above (`MY PULSE`) and a one-line label below (`Left-Leaning`) so the band tells a self-contained story.
- Keep the existing left→right gradient and the brand badge already in the top-left.

## Out of scope
- Other templates (Bold/Minimal/Data already show the score correctly).
- Candidate-alignment cards with portraits — unchanged.

## Files touched
- edit `src/components/share/templates/EditorialCard.tsx`
