## Goal

Add You.com as a second live-web-search provider in the AI analysis chain so that when Perplexity is out of quota / failing, the dialogs still get real citations instead of falling back to citation-less Gemini. Order becomes:

```
Perplexity (sonar-pro)  →  You.com (Smart / Research API)  →  Gemini (Lovable AI Gateway, no citations)
```

## Background

Logs show Perplexity returning `401 insufficient_quota`, so both `ai-recipient-analysis` and `ai-donor-analysis` fall through to Gemini. Gemini has no web search, so `citations = []`, but the model still emits `[1]…[n]` markers in the body — which is exactly the empty-Sources mismatch you're seeing on `/candidate/M001199`.

You.com's API returns both an LLM answer and a `search_results` / `hits` array of `{title, url, snippet}`, which slots cleanly into the existing `sources` rendering.

## Changes

### 1. New shared helper: `supabase/functions/_shared/you-search.ts`
- `callYouSmart({ query, apiKey, systemPrompt })` — POSTs to You.com's Smart endpoint (`https://chat-api.you.com/smart` or `/research`, configurable via constant).
- Returns `{ content: string, citations: { title: string; url: string }[] }`.
- Maps non-2xx into a typed error with `status` + `code` ("YOU_AUTH" | "YOU_RATE_LIMIT" | "YOU_ERROR") so the calling function can compose the same `lastError` chain it already uses for Perplexity.

### 2. `supabase/functions/ai-recipient-analysis/index.ts`
- Read `const youKey = Deno.env.get("YOU_API_KEY")`.
- After the existing Perplexity branch and **before** the Gemini fallback, add:
  ```ts
  if (!provider && youKey) {
    try {
      const { content: yc, citations: yCites } = await callYouSmart({...});
      content = yc;
      citations = yCites.map(c => c.url); // keep citations:string[] shape
      youSources = yCites; // preserve titles for richer Sources UI
      provider = "you";
    } catch (e) { lastError = e; }
  }
  ```
- When building `sources`, prefer `youSources` (with real titles) over the URL-only mapping if `provider === "you"`.
- Treat `provider === "you"` exactly like `"perplexity"` for the "zero sources → mark insufficient" guard (it has live search, so missing citations is meaningful).
- Keep the existing Perplexity system prompt (works for any grounded-search provider). No change to JSON schema requested from the model.

### 3. `supabase/functions/ai-donor-analysis/index.ts`
- Mirror the same insertion of the You.com branch between Perplexity and Gemini, with the same source-merging and confidence rules.

### 4. UI — no functional changes required
- `RecipientAIAnalysisDialog.tsx` and `DonorAIAnalysisDialog.tsx` already render `analysis.sources` generically, so they will start showing You.com-grounded sources automatically.
- (Optional polish, can skip): show a subtle provider tag like `Sourced via Perplexity / You.com / Gemini` under the confidence row. Flag this and I'll only add it if you say yes.

### 5. Secrets
- Add `YOU_API_KEY` to Supabase secrets via the secrets tool. (Will prompt you to paste the key from https://api.you.com/ — Lovable never sees it.)
- No frontend env var needed (server-only).

## Validation

- Temporarily simulate Perplexity failure (already happening in prod logs). Open `/candidate/M001199` → analysis should now come back with `provider: "you"` and a populated `Sources & citations` list.
- Restore Perplexity quota later → first branch wins, You.com only runs when Perplexity errors.
- Confirm Gemini still serves as last-resort when both upstream providers fail (e.g. both keys missing/invalid).

## Out of scope

- Streaming responses (we keep the existing single-shot `invoke` pattern).
- Switching the default primary provider away from Perplexity.
- Migration / DB / RLS changes (none needed).