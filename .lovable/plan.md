## X (Twitter) API integration

**Before anything: rotate the credentials you pasted in chat.** They are now in conversation history and must be considered compromised. Generate fresh Client ID / Client Secret in the X Developer Portal, then we store them via Lovable's secure secret form (I will never paste secret values into code).

### Scope (you answered "All")

Three capabilities, layered:

1. **Sign in with X** (OAuth login on the auth page)
2. **Post tweets from the backend** (edge function, admin-triggered)
3. **Fetch candidate / official tweets as evidence** (edge function feeding the social-media evidence system)

### 1. Secrets to store

Via the `add_secret` tool (secure form — you'll paste the rotated values):

- `X_CLIENT_ID` — OAuth 2.0 Client ID
- `X_CLIENT_SECRET` — OAuth 2.0 Client Secret
- `X_BEARER_TOKEN` — App-only Bearer Token (needed to read public tweets for evidence fetching; generate in Developer Portal → Keys and tokens)

Note: For posting tweets on behalf of *the app's own X account* (capability 2) we also need user-context tokens. Cleanest path: do that via OAuth 2.0 user-context flow and store the resulting refresh token in a dedicated `x_account_tokens` table (admin-only, RLS locked). Confirm whether the app should post as a single official PoliPulse account, or only as individual users who sign in.

### 2. Sign in with X (OAuth)

X OAuth is configured in the **Supabase dashboard**, not in code:

1. Supabase Dashboard → Authentication → Providers → Twitter → enable
2. Paste `X_CLIENT_ID` + `X_CLIENT_SECRET` there
3. Copy the Supabase callback URL it shows (looks like `https://ornnzinjrcyigazecctf.supabase.co/auth/v1/callback`) and add it as a **Callback URI** in the X Developer Portal app settings
4. In the X app, set **App permissions = Read** (or Read+Write if you also want posting)

Code changes:
- `src/pages/Auth.tsx` — add a "Continue with X" button that calls `supabase.auth.signInWithOAuth({ provider: 'twitter', options: { redirectTo: \`${window.location.origin}/\` } })`
- No changes to `AuthContext` required — the existing `onAuthStateChange` handles the post-redirect session

### 3. Post tweets — edge function

New function: `supabase/functions/x-post-tweet/index.ts`
- Verifies caller is admin (`has_role(auth.uid(),'admin')`)
- Uses stored user-context access token (refreshed via OAuth 2.0 refresh flow)
- Calls `POST https://api.x.com/2/tweets` with `{ text }`
- Returns tweet ID + URL
- Admin UI: small composer card in `src/pages/Admin.tsx` (behind a new "X Posting" tab) that calls the function

Adds one table:
```
x_account_tokens (
  id uuid pk, account_handle text, access_token text, refresh_token text,
  expires_at timestamptz, scope text, created_at, updated_at
)
```
RLS: admin-only select/insert/update, no public access.

### 4. Fetch tweets as evidence — edge function

New function: `supabase/functions/x-fetch-user-tweets/index.ts`
- Input: `{ handle: string, since?: string, max?: number }`
- Auth: app-only Bearer token (`X_BEARER_TOKEN`)
- Calls `GET https://api.x.com/2/users/by/username/{handle}` → user id, then `GET /2/users/{id}/tweets?max_results=...&tweet.fields=created_at,public_metrics,entities`
- Returns normalized list `[{ id, text, url, created_at, metrics }]`
- Consumed by the existing evidence pipeline (matches `mem://features/social-media-evidence-handling`): the URL field is the archived `https://x.com/{handle}/status/{id}` source

Rate-limit handling: respect `x-rate-limit-remaining` / `x-rate-limit-reset` headers, return 429 to caller with reset timestamp; caller backs off.

### Tech notes

- Endpoint base is `api.x.com/2` (not `api.twitter.com`)
- Use `npm:@supabase/supabase-js@2/cors` for CORS headers in both new functions
- Validate all inputs with Zod, return 400 on parse failure
- Never log token values
- Existing `src/integrations/supabase/types.ts` regenerates automatically after the migration adds `x_account_tokens`

### Order of operations after you approve

1. You rotate keys in X Developer Portal
2. I call `add_secret` for `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_BEARER_TOKEN` — you paste the rotated values
3. I create the migration for `x_account_tokens` + RLS
4. I add the two edge functions and the "Continue with X" button
5. You configure the Twitter provider in Supabase dashboard (I'll give exact steps and the callback URL)
6. We test each capability end-to-end

### Open question

Capability 2 (posting): post as one official PoliPulse account, or only let users who sign in post as themselves? That changes whether we need the `x_account_tokens` table at all.
