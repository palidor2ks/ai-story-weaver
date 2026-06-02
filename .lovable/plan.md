## Add Last Login Column to Admin Users Panel

### Migration
Create SECURITY DEFINER RPC `public.get_admin_user_last_signins()`:
- Returns `user_id uuid, last_sign_in_at timestamptz` from `auth.users`
- Guarded by `has_role(auth.uid(), 'admin')` — raises exception otherwise
- `GRANT EXECUTE ... TO authenticated`

### Frontend — `src/components/admin/AdminUsersPanel.tsx`
- Add `useQuery` calling `supabase.rpc('get_admin_user_last_signins')`
- Build `Map<user_id, last_sign_in_at>`
- Add "Last login" column between "Joined" and "Actions"
- Render formatted date (locale date string) or `—` when null
