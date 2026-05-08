## Problem

Two issues blocking local officials for Piscataway, NJ:

1. **Mayor fetch failing** — `fetch-mayor` logs show `Perplexity 401: insufficient_quota`. Quota is exhausted, so no mayor ever gets cached.
2. **No council members** (e.g. Dennis Espinosa) — the function only researches the **Mayor**. There's no logic anywhere to discover council/aldermen/local officials.

## Plan

### 1. Add Lovable AI fallback to `fetch-mayor` (keep Perplexity as primary)

- Try Perplexity `sonar` first (current behavior — returns citations natively).
- If Perplexity fails with **401 (quota), 402 (payment), 429 (rate limit), or 5xx**, automatically fall back to **Lovable AI Gateway** (`google/gemini-2.5-pro`) with the same prompt and JSON-tool-call schema.
- If Lovable AI also returns 402/429, mark the queue row `failed` with the reason so it retries later instead of poisoning the cache with `no_data`.
- Log which provider succeeded so we can monitor Perplexity health.

### 2. Expand scope: full local roster, not just Mayor

- Update the prompt to request **Mayor + sitting City/Town Council members** for `{city, state}`, returning an array.
- Insert one `static_officials` row per official:
  - `office`: `"Mayor of Piscataway"` / `"City Council Member, Piscataway"` (+ ward if known)
  - `level: 'local'`, `city`, `state` populated
- Add a `kind` column to `mayor_fetch_queue` (default `'roster'`) so one queue entry covers the whole city.
- Rename the function internally to handle a roster, but keep the `/fetch-mayor` endpoint name for compatibility.

### 3. Display path (no changes needed)

- `fetch-civic-officials` already filters local officials by `(state AND (city = userCity OR city IS NULL))` — confirmed in logs. Once rows land, they appear automatically in the user's reps page and the Local filter on Candidates.

### 4. Admin tools

- Add a "Refresh local officials" button per city in Admin → Static Officials so you can re-trigger AI research when a council changes.

## Technical notes

- **Provider order**: Perplexity → Lovable AI fallback (no swap, both stay wired).
- **Lovable AI uses tool-calling** for structured output (per gateway docs), not `response_format: json_schema`.
- **Council scoring is optional** — listing-only is essentially free; running each member through `populate-civic-answers` costs ~$0.30/city.

## Files to change

- `supabase/functions/fetch-mayor/index.ts` — add Lovable AI fallback + expand to roster
- `supabase/migrations/...` — add `kind` column to `mayor_fetch_queue`
- `src/pages/Admin.tsx` — add "Refresh local officials" button

## Open question

**Should council members be scored** (run through `populate-civic-answers` like the mayor) or just **listed as contacts**? Listing is free; scoring ~9 council members per city adds ~$0.30/city and ~30s of background work.