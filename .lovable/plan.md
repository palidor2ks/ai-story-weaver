## Why it happened

The DB has JD Vance correctly recorded:
- `candidates.office = "Vice President"`, `state = "US"`, `party = "Republican"`

The `ai-candidate-explanation` edge function injects this as an "EXACT CANDIDATE IDENTITY" block into the prompt, but the model still said he isn't VP. Two compounding causes:

1. **Stale model knowledge.** The function uses `google/gemini-2.5-flash`. Its training cutoff predates Vance's January 2025 inauguration as Vice President, so the model "knows" him only as the Ohio U.S. Senator and treats the identity block as wrong.
2. **Prompt lets the model override the identity block.** The system prompt heavily emphasizes "do NOT infer", "if not confident, say undocumented", and "never mention a different office than the ones listed above". Faced with a conflict between its own memory ("Senator from Ohio") and the identity block ("Vice President"), the model defaults to hedging — which reads to the user as "he's not the VP".

The same risk exists for any official whose role changed after the model's cutoff (newly seated members, recent appointees, etc.).

## Plan

### 1. Treat the database identity as ground truth in the prompt
In `supabase/functions/ai-candidate-explanation/index.ts`:
- Reword the identity block to make the office assignment authoritative and current, e.g. "The following identity is verified by the application's database as of today and overrides any prior knowledge you may have. If your training data shows a different office, defer to this block."
- Add an explicit "current office" line and an "as of {today}" timestamp so the model treats it as post-cutoff fact.
- Keep the disambiguation guard (don't talk about other people with the same name) but remove language that could be read as "if unsure, deny the office".

### 2. Upgrade the analysis model
Switch the model from `google/gemini-2.5-flash` to `google/gemini-3-flash-preview` (the project's default per the AI Gateway guidance). Newer training data dramatically reduces the "I don't know this person in that role" failure mode for recently-elected officials.

### 3. Apply the same fix to the sibling analysis functions
Audit and apply the same identity-block + model changes (only where the same pattern exists) to:
- `ai-donor-analysis`
- `ai-recipient-analysis`
- `user-profile-analysis`

Skip any function that doesn't render candidate identity.

### 4. Validate
- Re-run the JD Vance analysis from the candidate profile page and confirm the summary refers to him as Vice President.
- Spot-check one stable case (a long-tenured Senator) to make sure the wording change didn't introduce new hallucinations.
- Check edge function logs for any JSON parsing regressions after the model swap.

## Out of scope
- No DB schema changes (the candidate row is already correct).
- No changes to scoring, finance, or share-card code.
- No changes to the citation provider chain (Perplexity/You.com/Gemini fallback).

## Technical notes
- Files touched: `supabase/functions/ai-candidate-explanation/index.ts` (primary), and the three sibling analysis functions if they share the identity-block pattern.
- Model id change is a one-line edit per function.
- No client-side changes required; `AIExplanation.tsx` consumes the same response shape.
