## Goal

Re-apply PR #60 in Lovable: add You.com RAG as a secondary research provider in `populate-party-answers`, sitting between Perplexity (primary) and Gemini (fallback).

## Changes

### 1. `supabase/functions/populate-party-answers/index.ts`

- Add `const YOU_API_KEY = Deno.env.get('YOU_API_KEY');` next to the other API key constants (already configured in Supabase secrets — no new secret needed).
- Add a `YouResult` interface mirroring `PerplexityResult` shape (`found`, `researchText`, `citations`, `citationTitles`).
- Add `researchPartyWithYou(partyName, questionText, topicName, partyId)`:
  - Skips silently if `YOU_API_KEY` missing.
  - Builds a query that biases toward official party domains (`democrats.org`, `gop.com`, `gp.org`, `lp.org`, etc.).
  - POSTs to `https://api.ydc-index.io/rag` with `{ query, num_web_results: 8 }`, `X-API-Key` header.
  - Handles 429/non-OK by returning `found: false` (lets Gemini take over).
  - Marks `found: true` only when answer length > 100 chars AND doesn't contain "no documented position" / "no evidence found".
  - Returns up to 5 citations + titles, falling back to `extractDomainName(url)` when titles missing.
  - Truncates evidence with existing `smartTruncate(answer, 2000)`.
- Update `hybridPartyResearch` to insert a Step 2 You.com attempt between the existing Perplexity step and the Gemini fallback. Log line updated to `Perplexity/You.com found nothing, trying Gemini…`.

### 2. Migration idempotency fix (`supabase/migrations/20251230170055_*.sql`)

Wrap the existing `candidate_committees_candidate_id_fkey` ADD CONSTRAINT in a `DO $$ … pg_constraint guard … $$` block so re-runs don't error. No schema change beyond the guard.

## Out of scope

- No frontend changes.
- No changes to candidate-answer research path — party flow only, matching the PR.
- No new secret prompts (`YOU_API_KEY` already present).

## Verification

1. Deploy edge function automatically.
2. From Admin → Populate party answers, trigger a small batch where Perplexity is known to return empty (e.g. an obscure local-scope question).
3. Tail logs at Edge Function → populate-party-answers — expect `[You.com] Party research … FOUND` or graceful `NOT FOUND` then Gemini fallback.
4. Confirm migration replays cleanly (no error if the FK already exists).
