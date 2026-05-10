## Fix: Backfill 401 Unauthorized

**Where it's failing:** Every call from `batch-regenerate-answers` → `get-candidate-answers` returns 401. The batch sends `Authorization: Bearer <SERVICE_ROLE_KEY>`, but `get-candidate-answers` runs `supabase.auth.getUser(token)` / `getClaims(token)` against it. Service role JWTs aren't user session tokens, so auth rejects them and 0/98 candidates succeed.

## Change

**`supabase/functions/get-candidate-answers/index.ts`** — Add a service-role bypass at the top of the auth block:

1. Read the bearer token from `Authorization`.
2. If `token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`, skip the user auth check and treat the call as trusted server-to-server (set an internal `isServiceCall = true` flag).
3. Otherwise, run the existing user JWT validation unchanged.
4. Anywhere downstream that uses `userId` for RLS-scoped reads, fall back to the service-role client (already used for writes) when `isServiceCall` is true.

No changes to `batch-regenerate-answers` or the admin UI.

## Verification

1. Deploy `get-candidate-answers`.
2. Re-trigger the backfill from Admin → Answer Coverage with a small test (`maxCandidates: 2`) via curl_edge_functions.
3. Tail `get-candidate-answers` logs — confirm no `[Auth] User auth failed` errors.
4. Tail `batch-regenerate-answers` logs — confirm `✓ <name>: X → Y answers` lines instead of `✗ HTTP 401`.
5. Spot-check `candidate_answers` count for one processed candidate climbs.

## Out of scope

- No changes to scoring, prompts, or which questions are asked.
- No change to user-initiated calls from the frontend (still authenticated as user).
