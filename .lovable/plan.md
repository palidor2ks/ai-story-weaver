## What’s happening
- The donor analysis response is using `provider: "gemini"` and returning `sources: []`.
- Edge logs show why:
  - Perplexity is failing with quota/auth: `401 insufficient_quota`.
  - You.com is failing with `401 Unauthorized`.
  - The app then falls back to Gemini, which does not provide external citations.
- The current You.com helper is calling the old/non-current endpoint `https://chat-api.you.com/smart`; current You.com docs show the cited Research API is `POST https://api.you.com/v1/research` and returns `output.content` plus `output.sources`.

## Implementation plan
1. **Replace the You.com helper implementation**
   - Update `supabase/functions/_shared/you-search.ts` to call `https://api.you.com/v1/research`.
   - Send `{ input: composedPrompt, research_effort: "lite" }`.
   - Parse response from `data.output.content` and `data.output.sources`.
   - Keep defensive parsing for alternate shapes so existing code remains resilient.
   - Preserve the same exported `callYouSmart()` API so caller files need minimal changes.

2. **Make grounded-provider failures visible in AI analysis responses**
   - In both `ai-donor-analysis` and `ai-recipient-analysis`, return lightweight diagnostics such as:
     - `provider_errors: [{ provider: "perplexity", code, status }, { provider: "you", code, status }]`
   - Do not expose raw secrets or full provider responses.
   - This will make future “no citations” cases explainable from the UI/network response.

3. **Tighten Gemini fallback behavior**
   - When both grounded providers fail and Gemini is used, keep `sources: []`, set `insufficient_information: true`, and cap confidence to `20`.
   - Update `confidence_rationale` to explicitly say citations were unavailable because grounded search providers failed.
   - This avoids presenting citation-less public-context claims as normally sourced analysis.

4. **Adjust the dialog copy only where needed**
   - In `DonorAIAnalysisDialog` and `RecipientAIAnalysisDialog`, when `sources` is empty but provider diagnostics indicate grounded provider failures, show a clearer message like:
     - “External citation providers were unavailable; this response used fallback analysis and should be treated as tentative.”
   - Keep existing rendering for normal source lists.

5. **Deploy and validate**
   - Deploy `ai-donor-analysis` and `ai-recipient-analysis`.
   - Test the donor analysis edge function with the same Trump National Committee JFC payload.
   - Confirm one of two acceptable outcomes:
     - You.com succeeds and `sources` contains clickable citations, or
     - You.com still returns auth failure, but the UI clearly reports grounded providers are unavailable and Gemini fallback is tentative.

## Out of scope
- No database migrations.
- No changes to finance calculations.
- No changes to the visible donor profile layout beyond the empty-sources message.