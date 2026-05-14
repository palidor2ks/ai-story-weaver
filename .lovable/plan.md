## Goal

When Perplexity returns an auth/quota/rate-limit/server error (the "AI analysis temporarily unavailable" toast you saw on the Preserve America PAC card), automatically fall back to Lovable AI Gateway (`google/gemini-2.5-pro`) so users still get an analysis instead of an error message.

## Scope

Two edge functions, same change in each:
- `supabase/functions/ai-donor-analysis/index.ts`
- `supabase/functions/ai-recipient-analysis/index.ts`

No frontend, DB, or RPC changes. Response shape stays identical so existing UI just renders.

## Implementation

1. **Extract a `callPerplexity()` helper** in each file that performs the existing Perplexity call and returns `{ ok, content, citations, status }`.

2. **Add `callGeminiFallback()` helper** that hits the Lovable AI Gateway:
   - URL: `https://ai.gateway.lovable.dev/v1/chat/completions`
   - Auth: `Bearer ${LOVABLE_API_KEY}` (already provisioned in edge functions)
   - Model: `google/gemini-2.5-pro`
   - Same `messages` array as Perplexity (system + user search prompt)
   - Adjusted system prompt note: "You do not have live web search. Ground claims in the FEC/finance context provided in the user prompt and well-known public knowledge. If you cannot identify the entity confidently, set insufficient_information=true and cap confidence at 30. Output strict JSON only."
   - Returns `{ ok, content, citations: [] }` (Gemini has no citations)

3. **Replace the current `if (!ppxResp.ok)` early-return** with fallback logic:
   - On Perplexity failure (any non-2xx, including 401/402/403/429/5xx) → call Gemini fallback
   - If Gemini also fails → return the existing Perplexity error message + `code` (preserves current UX)
   - If Gemini succeeds → continue through the existing parse/source/return path with `citations = []`
   - Add a `provider: "perplexity" | "gemini"` field to the response so the UI can optionally show a "Generated without live web search" note (UI change out of scope; field is additive)

4. **Source-count guard already handles Gemini's empty citations**: existing code sets `insufficient_information=true` and caps `confidence` at 20 when `sources.length === 0`. We loosen this slightly when `provider === "gemini"`: skip the auto-insufficient flag (keep the confidence cap) so the analysis renders as best-effort instead of a hard "unidentified" banner.

5. **Handle Lovable AI's own 402/429** — surface the same friendly toast keyed to `LOVABLE_AI_RATE_LIMIT` / `LOVABLE_AI_PAYMENT` so credits-exhausted is distinguishable from Perplexity quota.

## Out of scope

- No changes to other Perplexity-using functions (`fetch-mayor`, `populate-*`, `enrich-*`, etc.) — those are research/ingestion jobs, not user-facing analysis cards. We can repeat the pattern later if you want.
- No UI changes. The `provider` field is added but not displayed yet.
- No retry logic on transient Perplexity 5xx (fallback fires immediately on any failure).

## Acceptance

- Trigger the Preserve America PAC card with Perplexity broken → analysis renders from Gemini instead of the red error box.
- Perplexity working → behavior unchanged (still uses Perplexity, sources populated).
- Both Perplexity and Lovable AI broken → existing error toast shown.
