## Goal

Port the fixes from `palidor2ks/ai-story-weaver#116` ("Fix X OAuth connect flow") into PoliPulse. The PR addresses two real issues that also exist here:

1. The token exchange uses a static `X_REDIRECT_URI` env var. If the start phase ever uses a different effective callback URL than the callback phase, X rejects the exchange with a `redirect_uri` mismatch.
2. Token exchange/refresh hard-requires `X_CLIENT_SECRET`. Public OAuth clients (no secret) cannot connect or refresh.
3. The admin UI silently swallows failures when loading connected accounts.

## Changes

### 1. DB migration — store redirect URI on PKCE row
- New migration adds `redirect_uri text` (nullable) to `public.x_oauth_pending`. No grants/policies change (table already configured).

### 2. `supabase/functions/x-oauth-start/index.ts`
- Accept optional `{ redirect_to }` in the JSON body.
- Resolve the effective redirect URI in this order: request body `redirect_to` → `X_REDIRECT_URI` env → error.
- Validate it's a well-formed `https://` (or `http://localhost`) URL.
- Persist `redirect_uri` on the inserted `x_oauth_pending` row.
- Use the resolved URI in the `authorize_url` params instead of the env var.

### 3. `supabase/functions/x-oauth-callback/index.ts`
- Read `pending.redirect_uri` (fallback to `X_REDIRECT_URI`) and use it for the token exchange `redirect_uri` field.
- Make `X_CLIENT_SECRET` optional:
  - If present → keep `Authorization: Basic base64(client_id:client_secret)` header.
  - If absent → drop the Basic header and rely on `client_id` already in the form body (public client auth).
- Remove the hard `oauth_not_configured` check on `CLIENT_SECRET`; only require `CLIENT_ID` and a resolvable redirect URI.

### 4. `supabase/functions/x-post-tweet/index.ts`
- In `refreshIfNeeded`, build `tokenHeaders` conditionally — include Basic auth only when `CLIENT_SECRET` is set; otherwise send `client_id` in the body alone.
- Keep all existing refresh + update behavior.

### 5. `src/pages/admin/XComposer.tsx`
- In `handleConnect`, pass `{ redirect_to: \`${window.location.origin}/admin/x/callback\` }` (the existing callback route) to the start function so start and callback agree on the URI.
- In `loadAccounts`, surface the error via `toast.error("Failed to load X accounts", { description: error.message })` instead of silently ignoring it.

### 6. `supabase/config.toml`
- Add explicit `[functions.x-oauth-start]`, `[functions.x-oauth-callback]`, `[functions.x-post-tweet]` entries with `verify_jwt = true` (already enforced in code; this aligns config with the in-code requirement).

## Out of scope
- No changes to `x_account_tokens` schema, RLS, or storage policies.
- No changes to `discover-representative-x-handles`, `sync-representative-x-posts`, or `x-fetch-user-tweets`.
- `src/integrations/supabase/types.ts` is regenerated automatically after the migration — not hand-edited.

## Risk / verification
- After deploy: click "Connect X" in `/admin/x-composer`, complete OAuth, confirm account appears and a test tweet posts. If `X_CLIENT_SECRET` is unset, the same flow should still succeed (public client path).
