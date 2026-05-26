## Admin OAuth Connect for X

Let admins link an X account so the existing `x-post-tweet` function has a token to post with. Uses X's OAuth 2.0 Authorization Code flow with PKCE (user-context tokens, `tweet.read tweet.write users.read offline.access`).

### Flow

```
Admin clicks "Connect X account"
  → frontend calls x-oauth-start (admin-only)
       returns { authorize_url } and stores state+code_verifier server-side
  → browser navigates to authorize_url on x.com
  → X redirects to /admin/x-connect/callback?code=...&state=...
  → frontend posts code+state to x-oauth-callback (admin-only)
       exchanges code → tokens, fetches handle via /2/users/me,
       upserts into x_account_tokens
  → redirects back to /admin/x-composer with success toast
```

### Backend

New table `x_oauth_pending` (short-lived PKCE state):
- `state` text PK, `code_verifier` text, `user_id` uuid, `created_at` timestamptz default now()
- RLS enabled, no public policies (edge functions use service role)
- Rows older than 15 min are ignored/cleaned on insert

New edge function `x-oauth-start`:
- Verifies caller is admin (same pattern as `x-post-tweet`)
- Generates `state` and PKCE `code_verifier` / `code_challenge` (S256)
- Inserts into `x_oauth_pending`
- Returns authorize URL:
  `https://x.com/i/oauth2/authorize?response_type=code&client_id=$X_CLIENT_ID&redirect_uri=$X_REDIRECT_URI&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=...&code_challenge=...&code_challenge_method=S256`

New edge function `x-oauth-callback`:
- Verifies caller is admin
- Looks up `x_oauth_pending` by state (and matching user_id), deletes it
- POSTs to `https://api.x.com/2/oauth2/token` with `grant_type=authorization_code`, code, redirect_uri, code_verifier, client_id (HTTP Basic with client_id:client_secret)
- Calls `GET https://api.x.com/2/users/me` with the new access token to get `username`
- Upserts into `x_account_tokens` (unique on `account_handle`): access_token, refresh_token, expires_at, scope
- Returns `{ account_handle }`

New secret `X_REDIRECT_URI` — must match the value registered in the X Developer Portal. Suggested: `https://polipulseapp.com/admin/x-connect/callback` (and the preview URL for dev).

### Frontend

- New page `src/pages/admin/XConnectCallback.tsx` at route `/admin/x-connect/callback`:
  reads `code` + `state` from URL, calls `x-oauth-callback`, shows status, then redirects to `/admin/x-composer`.
- Update `src/pages/admin/XComposer.tsx`:
  - Show list of currently connected handles (query `x_account_tokens` directly — admin RLS already allows it).
  - "Connect X account" button → invokes `x-oauth-start` → `window.location.assign(authorize_url)`.
  - Optional "Disconnect" button per handle (DELETE on `x_account_tokens`, admin RLS allows).

### Things the user has to do once

1. Add the redirect URI in the X Developer Portal app → User authentication settings → Callback URLs.
2. Confirm the redirect URI to store as `X_REDIRECT_URI` secret. Will request via `add_secret` after approval.
3. Ensure the X app has "Read and write" permissions (required for posting).

### Out of scope

- Switching between multiple connected accounts in the composer beyond the existing optional handle input.
- A dedicated CSRF cookie — admin auth + short-lived `x_oauth_pending` row keyed by user_id is sufficient.
