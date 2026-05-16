## Goal

Mirror PR #56 (`ai-story-weaver`) in this project: align the bill "Dig Deeper" edge function's provider fallback chain and confidence scoring with the donor/recipient analysis functions.

## Context

`ai-donor-analysis` and `ai-recipient-analysis` here already use the shared You.com helper (`_shared/you-search.ts`) and the deterministic confidence helper (`_shared/confidence.ts`). The newer `ai-bill-analysis` function (Perplexity → Gemini only) is the odd one out. `YOU_API_KEY` is already configured.

## Changes — single file

### `supabase/functions/ai-bill-analysis/index.ts`

1. **Imports** (top): add
   ```ts
   import { callYouSmart, YouError, type YouCitation } from "../_shared/you-search.ts";
   import { computeDeterministicConfidence } from "../_shared/confidence.ts";
   ```

2. **Env + provider guard**: read `YOU_API_KEY`; update the "no provider configured" check + error message to include it.

3. **Provider state**: widen `provider` union to `"perplexity" | "you" | "gemini"` and add `let youCitations: YouCitation[] = []`.

4. **Insert You.com fallback** between the Perplexity and Gemini branches: only runs if no provider succeeded yet and `youKey` exists. Calls `callYouSmart({ query: searchPrompt, apiKey: youKey, systemPrompt })`, sets `content`, populates `youCitations` and `citations` (mapped to URLs), sets `provider = "you"`. On error: push to `providerErrors`, record `lastError` from `YouError` (status/code/message fallbacks).

5. **Grounded sources mapping**: when `provider === "you"`, build `grounded` from `youCitations` preserving `title`, `url`, and `citation_index`. Otherwise keep the current URL-derived host title (drop the `[n]` suffix; move index into `citation_index` field).

6. **Confidence + rationale**: replace the manual confidence math with
   ```ts
   let confidence = computeDeterministicConfidence(grounded);
   let insufficient = Boolean(parsed.insufficient_information);
   if (grounded.length === 0) insufficient = true;
   if (insufficient) confidence = Math.min(confidence, 20);
   const groundedFailed = providerErrors.length > 0 && grounded.length === 0;
   const confidence_rationale = groundedFailed
     ? `Grounded search providers unavailable (${providerErrors.map(p => `${p.provider}:${p.status}`).join(", ")}). Fallback model (Gemini) cannot return external citations — treat as tentative.`
     : `Deterministic score from ${grounded.length} verified provider citation(s); weighted 55% source count (saturating at 6) + 45% domain reliability.`;
   ```
   Return `confidence_rationale` (the computed string) instead of `parsed.confidence_rationale`.

## Out of scope

- No frontend changes (`BillAIAnalysisDialog` already reads `sources` / `confidence` / `confidence_rationale` generically).
- No schema/config changes; `YOU_API_KEY` and the shared helpers already exist.
- No changes to donor/recipient functions or other edge functions.
