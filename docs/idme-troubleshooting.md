# ID.me verification review

This review covers the current PoliPulse ID.me verification flow. It is based on the app implementation plus ID.me's current OIDC guidance for authorization, token exchange, user-info retrieval, redirect URI matching, and sandbox/production environments.

Reference docs:

- ID.me OIDC overview: https://docs.id.me/guides/oidc/overview
- ID.me OIDC integration: https://docs.id.me/guides/open-id-connect/integration
- ID.me OIDC PKCE: https://docs.id.me/guides/oidc/pkce


1. The profile UI calls the `verify-identity-idme` Supabase Edge Function with `action: "get_auth_url"`.
2. The function generates an ID.me OAuth/OIDC authorization URL and returns `state`.
3. The browser stores `state` in `sessionStorage`, redirects to ID.me, and returns to `/auth/idme-callback`.
4. The callback validates `state` and calls the same Edge Function with `action: "verify"`.
5. The function exchanges the authorization code, fetches ID.me user info, and updates `profiles.identity_verified`.

## Likely failure points

### 1. Wrong ID.me environment

The function previously always called `https://api.id.me`. Sandbox credentials must call `https://api.idmelabs.com`; production credentials must call `https://api.id.me`. If the credentials and host do not match, the authorization or token exchange can fail even when the client ID and secret look correct.

**Solution:** set `IDME_BASE_URL` in Supabase secrets. Use `https://api.idmelabs.com` for sandbox testing and `https://api.id.me` for production.

### 2. Missing partner policy scope

The old implementation requested only `openid`. ID.me OIDC flows require `openid` plus the policy scope that your ID.me application is configured to release. With only `openid`, the user may authenticate but the app may not receive the verification claims/status needed to mark the profile verified.

**Solution:** set `IDME_SCOPE` in Supabase secrets. Keep `openid` included, then append the ID.me-provided policy scope, for example `openid <policy-scope>`.

### 3. Redirect URI mismatch

ID.me requires the callback URL in the authorize request to exactly match a redirect URI configured in the ID.me developer dashboard. The app also enforces its own redirect allowlist before it sends users to ID.me. Preview domains, `www` vs apex domains, and localhost ports are common causes of failure.

**Solution:** add every deployed callback URL to both the ID.me dashboard and `IDME_ALLOWED_REDIRECT_URIS` in Supabase secrets. The value is a comma-separated list of exact callback URLs, such as `https://preview.example.com/auth/idme-callback,https://www.polipulseapp.com/auth/idme-callback`.

### 4. Brittle user-info parsing

Different ID.me/OIDC configurations may return JSON claims, an attributes array, or a JWT string. The old function assumed JSON claims and could fail or save a verified profile without a stable ID.me identifier.

**Solution:** the function now accepts JSON claims, attributes arrays, and JWT-string payloads. It refuses to mark a profile as verified unless the response includes a stable `uuid` or `sub` identifier.

### 5. Error messages hidden from the user

The client previously threw the Supabase function error before checking the JSON response body, so operators and users often saw only a generic failure message.

**Solution:** the UI now prefers the function-provided message and the function adds a `request_id` to responses and logs. Use that `request_id` to correlate the browser error with Supabase Edge Function logs.

## Operational checklist

Before retesting ID.me, confirm these Supabase secrets:

```text
IDME_CLIENT_ID=<ID.me client id>
IDME_CLIENT_SECRET=<ID.me client secret>
IDME_BASE_URL=https://api.idmelabs.com   # sandbox, or https://api.id.me for production
IDME_SCOPE=openid <policy-scope-from-ID.me>
IDME_ALLOWED_REDIRECT_URIS=https://www.polipulseapp.com/auth/idme-callback,https://polipulseapp.com/auth/idme-callback
```

Then confirm the same callback URLs are configured in the ID.me application dashboard. The OAuth `redirect_uri` must match exactly, including scheme, host, path, and any `www` prefix.

## Longer-term recommendations

- Add server-side storage for OAuth state and PKCE verifier values so the Edge Function can validate the callback transaction, not just the browser.
- Validate ID.me `id_token` signatures against the ID.me JWKS endpoint before relying on ID-token claims as a fallback.
- Store a minimal audit record for each verification attempt with `request_id`, Supabase user ID, ID.me environment, redirect URI, outcome, and non-sensitive error category.
- Add an admin-facing diagnostic panel that shows configuration health without exposing secrets.
