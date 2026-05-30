# Harden AI Donor Analysis Fallback Chain

## Problem

Cascade order is **Perplexity → You.com → Lovable AI Gemini**, but when Perplexity 401s (quota out), You.com returns markdown-fenced JSON that `extractJson()` can't parse. The function 500s with "Could not parse AI response" instead of falling through to Lovable AI.

## Changes

**File: `supabase/functions/ai-donor-analysis/index.ts`**

1. **Harden `extractJson()`** so You.com (and any provider) parses reliably:
   - Strip ```` ```json ```` and ```` ``` ```` code fences before parsing.
   - If direct `JSON.parse` fails, extract the first balanced `{...}` block via regex/brace-counting and retry.
   - Trim trailing commas and stray prose before/after the JSON block.
   - Return `null` on total failure (no throw).

2. **Cascade on parse failure, not just HTTP failure**:
   - Wrap each provider call (Perplexity, You.com) so that if HTTP succeeds but `extractJson()` returns `null`, log a warning and fall through to the next provider instead of throwing.
   - Lovable AI Gemini becomes the true last-resort fallback for both transport errors and parse errors.

3. **Graceful final failure**:
   - If all three providers fail (transport or parse), return a 200 with a structured `{ error: "analysis_unavailable", reason }` payload instead of 500, so the dialog can show "Analysis temporarily unavailable — try again later" rather than a red toast.

## Out of scope

- Topping up the Perplexity key (user action in their dashboard).
- Changing the prompt or analysis schema.
- Touching `ai-recipient-analysis` (mirror later if user wants).

## Verification

- Deploy the function, call it on a donor that previously 500'd, confirm logs show `[you.com] parse failed → falling through to lovable-ai` and the dialog renders a real analysis from Gemini.
- Check edge function logs for the new warning lines.
