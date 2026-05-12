# Fix: Admin access denied (has_role permission)

## Root cause
`public.has_role(uuid, app_role)` currently has EXECUTE granted only to `postgres` and `service_role`. RLS policies across the project (including `user_roles`, candidates-related tables, etc.) call `public.has_role(auth.uid(), 'admin')`. When a logged-in user runs any query whose RLS calls this function, Postgres throws `permission denied for function has_role`, so:

- `useAdminRole` returns `{ isAdmin: false }` → `/admin` blocked
- `usePoliticianRole` fails the same way
- Many other authenticated reads will silently fail RLS too

## Fix
One small migration to grant EXECUTE back to the standard Supabase roles. The function is already `SECURITY DEFINER STABLE` and only reads `user_roles`, so it's safe to expose.

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO authenticated, anon;
```

(Optionally also `TO public` to match Postgres defaults, but `authenticated, anon` is sufficient for our app.)

## Verification
1. Reload `/admin` while signed in as `reltemawi@gmail.com` — page should load.
2. Console: no more `permission denied for function has_role` errors.
3. `useAdminRole` query returns `{ isAdmin: true }` for that user (confirmed they have `admin` row in `user_roles`).

## Out of scope
- No changes to RLS policies, the function body, or any other security artifacts. The earlier security migrations (share_cards / candidates column REVOKEs) stay as-is.
