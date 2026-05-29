
-- 1. Avatars: drop broad SELECT policy that enables LIST on public bucket.
--    Public bucket continues to serve files via public URLs without any RLS SELECT policy.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- 2. Share-cards: add explicit owner-scoped policies to make intent clear
--    (public OG-preview reads continue via the public bucket URL).
CREATE POLICY "Users can read their own share cards"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'share-cards' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own share cards"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'share-cards' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own share cards"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'share-cards' AND (auth.uid())::text = (storage.foldername(name))[1]);
