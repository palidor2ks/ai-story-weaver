## Problem

The "Deep Analysis" panel on Brian Wahler's profile says he's mayor of St. Charles, Illinois. The database is correct (Piscataway, NJ) — the bug is that the `ai-candidate-explanation` edge function never tells the AI **who** the candidate is beyond their name. With only a name + abstract topic scores, Gemini picked the wrong "Brian Wahler" and invented a biography.

Any candidate with a common name (especially mayors and state-level officials) is at risk of the same hallucination.

## Fix

### 1. Pass real candidate context to the AI

In `supabase/functions/ai-candidate-explanation/index.ts`:

- After auth, look up the candidate from `candidates` (falling back to `candidate_overrides` for mayor/local rows whose canonical record lives only in the override table — like `mayor_nj_piscataway`).
- Read: `name`, `office`, `state`, `district`, `party`.
- Inject those into both the system prompt and user prompt, and add a hard "do not write about any other person with this name" guardrail.

New user-prompt header (example):
```
Candidate: Brian Wahler
Office: Mayor of Piscataway
State: NJ
District: (none)
Party: Democrat

CRITICAL DISAMBIGUATION: Only analyze THIS specific person — the {office} of {state}.
If you are not confident the documented record you are recalling belongs to this exact
person/office/state, say the position is undocumented instead of guessing. Do NOT
write about any other public figure who shares this name.
```

Also tighten the system prompt: "If you cannot verify the candidate's identity from office + state, refuse to invent biography. Never name a different city, state, or office than the one provided."

### 2. Bust the cached wrong analysis

The component caches the analysis in component state only (no DB cache), so once deployed the next open will regenerate. No migration needed.

### 3. (Optional, same edit) Frontend: pass office/state too

`src/components/AIExplanation.tsx` already has `candidateId`, so the edge function can fetch context server-side — no frontend change required. Keep frontend untouched.

## Files touched

- `supabase/functions/ai-candidate-explanation/index.ts` — add candidate lookup + disambiguation in prompts.

No DB migration. No frontend change.

## Verification

1. Re-open Brian Wahler → click Deep Analysis → confirm it now says Piscataway, NJ (or admits no documented record if the model can't verify).
2. Spot-check one common-name federal official (e.g. a Smith / Johnson) to confirm the disambiguation guard doesn't break the federal flow.
