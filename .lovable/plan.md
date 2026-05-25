## Goal

On every party and representative alignment card, show two scores side-by-side:

1. **Match score** — averaged only over the questions you've answered (today's behavior, weighted by your topic priorities). This is the apples-to-apples comparison number.
2. **Full score** — the entity's overall position across **all** questions they've answered, unweighted. This is the same number shown on the entity's own profile page.

This lets users see "how aligned we are on what I care about" vs. "where this party/rep actually sits overall."

## UI

In `PartyComparisonCard` and `RepresentativeComparisonCard`, replace the single big score with a small two-column block:

```text
Match (your answers)     Overall (all questions)
   L6.91                     L4.20
```

- The Match value is the primary/large one (current styling preserved).
- The Overall value is smaller, muted, with a short label and an info tooltip explaining the difference.
- If only one number is available (e.g. user hasn't taken the quiz yet, or the entity has no answers), show the available one and hide the other with a dash.
- Tooltip wording: "Match = average on questions you've answered, weighted by your topic priorities. Overall = average across every question this {party|representative} has answered."

No layout changes to the AI summary block below.

## Data wiring

### Parties (`PartyComparisonCard`)
- Already receives `score` (match, from `usePartyMatchScores`). Keep as Match.
- Add a new hook `usePartyOverallScores()` that fetches all `party_answers` and returns `{ democrat, republican, green, libertarian }` using `calculateEntityScore` (simple average across the party's full answer set). Cache 10 min.
- Pass `overallScore` into `PartyComparisonCard` from `UserProfile.tsx` (and any other caller) alongside the existing `score`.

### Representatives (`RepresentativeComparisonCard`)
- Already receives `resolvedScore` from `usePersonalizedScoreMap` (match) — keep as Match.
- Use the existing `official.overall_score` (already on the official record, computed from all candidate answers) as Overall. No new hook required.
- Add an `overallScore` prop to `RepresentativeComparisonCard`; pass `official.overall_score` / `rep.overall_score` from `UserProfile.tsx` at every call site (5 places).

## Files

- `src/hooks/usePartyOverallScores.ts` (new) — mirrors `usePartyMatchScores` shape but no user filter, no weighting.
- `src/components/PartyComparisonCard.tsx` — add `overallScore` prop, render dual-score block, update tooltip.
- `src/components/RepresentativeComparisonCard.tsx` — add `overallScore` prop, render dual-score block.
- `src/pages/UserProfile.tsx` — call `usePartyOverallScores`, pass `overallScore` to all four `PartyComparisonCard`s and all five `RepresentativeComparisonCard`s.

## Out of scope

- The user's own overall score, quiz results page, candidate profile pages, and admin views — only the party/rep alignment cards on UserProfile change.
- Scoring math itself is unchanged; we just expose the existing "entity average across all answers" alongside the existing match number.
