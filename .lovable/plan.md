## Problem

`sync-all-donors` calls `fetch-fec-donors` 50 times and every call returns **401 Unauthorized**, even though we added `headers: { Authorization: authHeader }` to the invoke last round.

Root cause: the `sync-all-donors` Supabase client is created with the **service-role key**, so `supabase.functions.invoke()` sends the service-role JWT in the `Authorization` header. The per-invoke `headers` option is *merged* with the client's defaults, but the client's default `Authorization` header wins — the user's admin JWT never reaches `fetch-fec-donors`. When `fetch-fec-donors` runs `auth.getUser()` against the service-role JWT, it returns no user → 401.

## Fix

Two coordinated changes:

### 1. `fetch-fec-donors/index.ts` — allow service-role bypass
At the admin auth block (~line 396), before calling `auth.getUser()`, check if the bearer token equals `SUPABASE_SERVICE_ROLE_KEY`. If yes, treat as trusted internal caller and skip the user/role check. Otherwise run the existing admin check unchanged.

```ts
const token = authHeader.replace('Bearer ', '');
const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!isServiceRole) {
  // existing getUser + user_roles admin check
}
```

This is safe: the service-role key is server-only and only reachable from other edge functions.

### 2. `sync-all-donors/index.ts` — call fetch-fec-donors with the service-role key explicitly
Replace the `supabase.functions.invoke('fetch-fec-donors', { headers: { Authorization: authHeader }, body })` with a direct `fetch()` to the function URL passing `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` and `apikey: SUPABASE_ANON_KEY`. This guarantees the header isn't overridden by supabase-js defaults.

Keep the existing per-request admin gate at the top of `sync-all-donors` so only admins can trigger the batch.

## Result

- Admin clicks "Sync donors" → `sync-all-donors` verifies admin → calls `fetch-fec-donors` with service-role token → fetch-fec-donors recognizes service-role and processes the candidate.
- Direct admin-from-browser calls to `fetch-fec-donors` (per-committee/per-candidate UI buttons) continue to work because the service-role branch is skipped for non-matching tokens.

No DB or UI changes required.