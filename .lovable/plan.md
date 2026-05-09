# Fix avatar upload RLS error

## Problem
Uploading a profile avatar fails with `new row violates row-level security policy` (403). The `avatars` bucket has INSERT/UPDATE/DELETE policies on `storage.objects`, but no SELECT policy. Because `AvatarUpload.tsx` uploads with `upsert: true`, Supabase Storage must read `storage.objects` to detect an existing file — that read is blocked by RLS, and the operation aborts with the misleading "new row violates RLS" error.

## Fix
Add a SELECT policy on `storage.objects` for the `avatars` bucket so authenticated users can read their own avatar rows (needed for upsert). Public CDN reads continue to work via the public bucket flag.

```sql
CREATE POLICY "Users can read their own avatar object"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
```

No frontend changes are required. After the migration, retry the avatar upload — it should succeed and the new image should appear immediately (cache-busted via the existing `?t=` query param).

## Verification
- Upload a new avatar from `/profile` → success toast, image updates.
- Re-upload (overwrite) → still succeeds (the upsert pre-read is now allowed).
