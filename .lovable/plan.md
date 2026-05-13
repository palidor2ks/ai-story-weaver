## Goal
Let admins browse and filter every user profile from the Admin page.

## Plan

### 1. Database — allow admins to read profiles
Currently `profiles` only allows users to view their own row. Add a new RLS SELECT policy:

- Policy: `Admins can view all profiles` on `public.profiles`, `FOR SELECT TO authenticated`, `USING (has_role(auth.uid(), 'admin'))`.

This is additive — regular users still only see their own profile; admins can read all rows. (PII access by admins is logged via the existing `profile_access_log` table if we want to extend later — out of scope unless requested.)

### 2. New admin component — `AdminUsersPanel.tsx`
Location: `src/components/admin/AdminUsersPanel.tsx`.

Features:
- Fetches all profiles via `supabase.from('profiles').select(...)` (admin RLS allows it).
- Joins user_roles to show role badges (admin/user).
- Search input: filters by name / email / location (client-side, case-insensitive).
- Column filters via existing `ColumnHeaderFilter` for: party, state, role, verification status.
- Table columns: Name, Email, Location, State, Party, Age, Role, Verified (identity/voter badges), Joined date, Overall score.
- Pagination (50/page) using react-query.
- Loading + empty states.

### 3. Wire into Admin page
In `src/pages/Admin.tsx`:
- Add `<TabsTrigger value="users">Users</TabsTrigger>` to the tabs list (and the mobile `Select` mirror).
- Add `<TabsContent value="users"><AdminUsersPanel /></TabsContent>`.

### Technical notes
- Reuse existing `useAdminRole` gate that already protects the Admin page.
- Use `@tanstack/react-query` for caching, keyed by `['admin','profiles']`.
- Keep the panel read-only for now (no edit/delete) — can add later if desired.

## Out of scope
- Editing/deleting user profiles from admin
- Exporting CSV
- Audit logging of admin profile views