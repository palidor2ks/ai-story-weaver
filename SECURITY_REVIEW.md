# Security Review (May 19, 2026)

## Scope
- Frontend React/Vite app (`src/`)
- Supabase Edge Functions (`supabase/functions/`)
- Supabase configuration and SQL migrations (`supabase/config.toml`, `supabase/migrations/`)
- Environment and repo hygiene (`.env`, `.gitignore`)

## Executive Summary
The platform is using several good controls already (JWT verification on user-facing AI functions, admin role checks inside many privileged functions, and RLS enabled on newer datasets). The biggest risks are around **overly broad unauthenticated function exposure**, **cross-origin function invocation with permissive CORS**, and **operational secret hygiene**.

## Findings & Recommendations

### 1) Many privileged/data-mutating Edge Functions are configured with `verify_jwt = false` (High)
**Why it matters**
- Disabling JWT verification at gateway level increases attack surface: every function invocation path becomes responsible for its own auth checks.
- Any missed check in one function can become a direct privilege-escalation or data-manipulation path.

**Evidence observed**
- Numerous functions are explicitly set to `verify_jwt = false`, including ingest/backfill/sync/update/import jobs.

**Recommendations**
1. Default all functions to `verify_jwt = true`; only exempt true webhooks and scheduled jobs.
2. For exempt functions, require one of:
   - Signed HMAC headers with timestamp + nonce replay protection, or
   - IP allowlisting + shared secret, or
   - Supabase cron-only internal invocations via dedicated secret.
3. Separate internal/admin functions into a private Supabase project or isolate behind a gateway.

---

### 2) CORS is broadly permissive (`Access-Control-Allow-Origin: *`) on sensitive endpoints (High)
**Why it matters**
- `*` allows any origin to invoke endpoints from a browser context.
- If a function has weak/missing auth checks, permissive CORS amplifies exploitability.

**Evidence observed**
- Function responses frequently include wildcard CORS origins.

**Recommendations**
1. Replace `*` with an explicit allowlist of trusted frontend origins (prod + staging).
2. For internal/admin functions, disable browser CORS entirely unless required.
3. Add a shared CORS utility to enforce consistent safe defaults.

---

### 3) Service-role key used in many functions; standardize defense-in-depth (Medium)
**Why it matters**
- Service role bypasses RLS, so any auth bypass in function code can lead to full table access.

**Evidence observed**
- Multiple functions instantiate service-role clients and then perform admin checks in code.

**Recommendations**
1. Standardize an audited `requireAdmin()` helper used by every privileged function.
2. Use least-privilege: prefer anon-authenticated client where possible; only elevate specific operations.
3. Add structured security logging for denied admin checks and privileged writes.

---

### 4) Potential secret hygiene issue: tracked `.env` file present in repo root (Medium)
**Why it matters**
- `.env` currently contains Supabase project URL/publishable key; while anon keys are not secret, keeping `.env` tracked often leads to accidental future secret commits.

**Recommendations**
1. Add `.env` to `.gitignore` and commit a `.env.example` template instead.
2. Rotate any non-public keys ever committed historically.
3. Add secret scanning in CI (e.g., gitleaks/trufflehog + GitHub secret scanning).

---

### 5) Auth model inconsistency across functions increases audit complexity (Medium)
**Why it matters**
- Security correctness becomes non-uniform, harder to reason about, and easier to regress.

**Recommendations**
1. Classify functions into 4 classes: public-read, authenticated-user, admin-only, internal-webhook.
2. Enforce policy matrix in CI (lint `config.toml` + function metadata).
3. Block deploy if function class and `verify_jwt`/auth guard combination is invalid.

---

### 6) RLS policy style should be periodically revalidated (Low/Medium)
**Why it matters**
- `using (true)` for `authenticated` is acceptable for intentionally public-ish data, but can drift toward overexposure when table purpose changes.

**Recommendations**
1. Maintain a data classification register per table (public/authenticated/private).
2. Run quarterly RLS audits and automated policy diff checks.
3. Add tests that assert unauthorized users cannot mutate protected tables.

## 30-Day Remediation Plan
1. **Week 1:** Inventory all functions and assign security class.
2. **Week 1–2:** Flip `verify_jwt=true` everywhere possible; add explicit exceptions list.
3. **Week 2:** Implement shared `authz` helper (`requireUser`, `requireAdmin`, `requireWebhookSignature`).
4. **Week 3:** Lock CORS to allowlist origins.
5. **Week 3–4:** Add CI checks (secret scanning, function security linter, basic DAST against function endpoints).
6. **Week 4:** Rotate credentials, remove tracked `.env`, publish incident-free hardening report.

## Quick Wins (same day)
- Restrict CORS origin list immediately for admin/internal functions.
- Set `verify_jwt=true` on low-risk candidates first (pure user-facing functions already checking auth).
- Add a deployment gate that fails on new `verify_jwt=false` entries unless approved.

