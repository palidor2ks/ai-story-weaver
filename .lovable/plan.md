## Goal
Elevate the score area on the candidate/rep profile page (currently a plain `L6.44 / Left-Leaning` text snippet) into a prominent, visually appealing score card.

## Changes

### 1. New component: `src/components/CandidateScoreCard.tsx`
A presentational card built with semantic design tokens:
- Large display-weight score (e.g. `L6.44`) — `text-5xl font-extrabold tracking-tight`, color from existing left/center/right palette.
- Subtitle: leaning label (`Left-Leaning`, `Center`, `Right-Leaning`) in uppercase muted small caps.
- A horizontal **Left ↔ Right spectrum bar** with:
  - Gradient track (blue → muted → red) using HSL semantic tokens.
  - A pill marker positioned at `((score + 10) / 20) * 100%` showing the score value.
  - End labels `L10` and `R10`, plus a faint center tick `C`.
- Subtle bordered rounded-2xl card with a soft gradient background and shadow (`shadow-elegant` token if available, otherwise create one in `index.css`).
- Optional small comparison line: "Match with you: NN%" if `matchScore` is provided.
- Props: `score: number`, `matchScore?: number`, `className?: string`.
- Fully responsive: stacks nicely on mobile, sits inline on desktop.

### 2. Wire it into `src/pages/CandidateProfile.tsx`
Replace the current block (lines 343–346):
```
{/* Score Display */}
<div className="mb-3">
  <ScoreText score={resolvedScore} size="lg" showLabel />
</div>
```
with:
```
<CandidateScoreCard score={resolvedScore} matchScore={matchScore} className="mb-4" />
```
Position remains the same area in the header (right-of-avatar column on desktop, below name/badges on mobile).

### 3. Design tokens
- Reuse existing left/right colors. If a gradient token doesn't exist, add `--gradient-spectrum` to `src/index.css` and a `bg-gradient-spectrum` utility in `tailwind.config.ts`.
- No raw hex/`text-blue-600` style colors in the new component — use semantic tokens (`text-primary`, custom `--score-left`, `--score-right`, `--score-center` if needed; otherwise extend tokens).

## Out of scope
- No changes to scoring logic, data fetching, or `ScoreText` usages elsewhere.
- No backend/edge function changes.

## Verification
- Open a rep profile (e.g. Cory Booker). Score area shows the new prominent card with spectrum bar and marker at the correct position.
- Test with negative, zero, and positive scores; with `NA`/null score (renders muted "Not Available" state).
- Check mobile width — card wraps cleanly.
