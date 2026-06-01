## Goal

Replace PR #145 entirely. Land the equivalent hardening directly on `main` with no merge risk to fresh/branch environments.

## Steps

### 1. Idempotent FK migration (✅ already applied)

A migration was applied that wraps the `candidate_committees_candidate_id_fkey` foreign key in a `DO $$ IF NOT EXISTS ... $$` block, so it skips creation when the constraint already exists. Verified: prod already has the FK; the migration was a no-op there and is safe for fresh DBs / preview branches.

### 2. Harden `supabase/functions/verify-identity-idme/index.ts`

Three changes:

- **Env-driven base URL + scope.** `IDME_BASE_URL` and `IDME_SCOPE` become env-overridable (sandbox vs. prod, scope tuning) with sensible defaults (`https://api.id.me`, `openid`).
- **Env-extensible redirect allowlist.** Keep the hardcoded `DEFAULT_ALLOWED_REDIRECT_URIS` (current 6 entries: polipulse.lovable.app, polipulseapp.com, www variant, id-preview, two localhost ports). Merge in any additional URIs from `IDME_ALLOWED_REDIRECT_URIS` (comma-separated). Validation logic unchanged — strict `Set.has()` match.
- **Validate `uuid`/`sub` from ID.me userinfo.** Before writing to `profiles.identity_verification_id`, require at least one of `userInfo.uuid` or `userInfo.sub`. If neither is present, return 502 with a clear message instead of writing `null` and silently "succeeding".

No client-side changes needed — the `FunctionsHttpError` `error.context` parsing already on `main` (in `IdMeCallback.tsx` and `VerificationBadges.tsx`) will surface the new error messages cleanly.

### 3. After you close PR #145 on GitHub

Nothing further required on my side. The hardening is on `main`.

## Technical notes

- Files touched in build mode: `supabase/functions/verify-identity-idme/index.ts` only.
- New optional secrets (purely additive; defaults work without them): `IDME_BASE_URL`, `IDME_SCOPE`, `IDME_ALLOWED_REDIRECT_URIS`. The function still requires `IDME_CLIENT_ID` and `IDME_CLIENT_SECRET` to actually issue tokens — neither is currently set, so ID.me verification will return a 503 "not configured" until you add them.
- No DB type regen needed (no schema-shape change).

## Verification

- Confirm the function deploys without errors.
- Hit `get_auth_url` from the app and confirm a 503 with the "not configured" message (expected until `IDME_CLIENT_ID`/`SECRET` are set).
- If/when you add the ID.me secrets, run the full flow end-to-end from `/profile` → callback.
