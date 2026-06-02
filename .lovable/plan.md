# Fix AI Analysis Voice

The "AI Political Analysis" on the profile reads in third-person ("This voter..."), making it feel like a report *about* the user. It should read like an analyst speaking *to* the user ("You generally align with...").

## Scope

Two edge functions generate this content:
1. `supabase/functions/user-profile-analysis/index.ts` — the active one (called from `UserProfile.tsx` and `QuizResults.tsx`).
2. `supabase/functions/ai-profile-summary/index.ts` — legacy/duplicate, also generates same shape. Update for consistency.

## Changes

Rewrite the system + user prompts in both functions to:
- Address the user directly in second person ("you", "your")
- Forbid third-person references ("this voter", "the voter", "they", "their")
- Apply to `summary`, `keyInsights`, `partyComparison`, and `strongestPositions`

Example shift:
- Before: *"This voter generally aligns with Left-leaning policies... their views on environmental matters are more Centrist."*
- After: *"You generally align with Left-leaning policies... your views on environmental matters are more Centrist."*

Keep the analyst tone (non-partisan, factual, L/R score format). No UI changes; copy in `UserProfile.tsx` ("AI Political Analysis", "Key Insights") stays as-is since those are labels, not voice.

## Cache note

Results are regenerated on demand via the "Refresh" button and aren't persisted as cached strings in a DB column (only invoked live). Existing rendered text on screen will update next time the user loads or refreshes.
