## Goal

Turn on ID.me verification now that you have an approved OAuth client.

## Steps

### 1. Confirm your ID.me app config matches the edge function

Before adding secrets, double-check in the ID.me developer dashboard:

- **Redirect URIs registered** must include every host the button can launch from:
  - `https://polipulseapp.com/auth/idme-callback`
  - `https://www.polipulseapp.com/auth/idme-callback`
  - `https://polipulse.lovable.app/auth/idme-callback`
  - `https://id-preview--b4a499eb-c11a-4320-8adc-dfe50259459a.lovable.app/auth/idme-callback`
  - (optional, for local dev) `http://localhost:5173/auth/idme-callback`, `http://localhost:8080/auth/idme-callback`
- **Scope** the app is approved for. Default in code is `openid`. If you were approved for `identity` (or any other policy), tell me and I'll set `IDME_SCOPE`.
- **Environment**. Default in code points to production (`https://api.id.me`). If you only have sandbox credentials, tell me and I'll set `IDME_BASE_URL` to the sandbox host.

If any redirect URI above is missing in ID.me's dashboard, add it there — the function rejects unregistered URIs and ID.me will reject mismatches.

### 2. Add secrets in Lovable

I'll request these via the secrets tool (you paste values into a secure form, never into chat):

- `IDME_CLIENT_ID` — required
- `IDME_CLIENT_SECRET` — required
- `IDME_SCOPE` — only if not `openid` (e.g. `identity`)
- `IDME_BASE_URL` — only if sandbox

### 3. Verify end-to-end

Once secrets land:

1. Hit `verify-identity-idme` with `action=get_auth_url` via the curl tool to confirm it returns an `auth_url` (no more 503 "not configured").
2. From `/profile` in the preview, click the ID.me verify button → complete ID.me's flow → land on `/auth/idme-callback`.
3. Watch the edge function logs for token exchange + userinfo success.
4. Confirm `profiles.identity_verified=true` and the badge appears in `VerificationBadges`.

If anything fails (scope rejected, redirect mismatch, missing `uuid`/`sub` in userinfo), I'll read the logs and fix the function — usually a one-line scope or claim change.

## Technical notes

- No code changes expected in step 2. The edge function already supports the env knobs (`IDME_BASE_URL`, `IDME_SCOPE`, `IDME_ALLOWED_REDIRECT_URIS`) and validates `uuid`/`sub` before writing to `profiles`.
- No DB migration. `profiles.identity_verified*` columns already exist.
- Frontend `IdMeCallback.tsx` and `VerificationBadges.tsx` already surface `FunctionsHttpError` context cleanly.
- Out of scope: Auth0, Stripe Identity, re-verification cadence, admin override.

## What I need from you to start

1. Confirm the redirect URI list above is complete (or list adds/removes).
2. Tell me the **scope** ID.me approved you for (default `openid`, common upgrade `identity`).
3. Confirm **production** vs **sandbox** credentials.

Once you answer, I'll request the secrets and run the verification.
