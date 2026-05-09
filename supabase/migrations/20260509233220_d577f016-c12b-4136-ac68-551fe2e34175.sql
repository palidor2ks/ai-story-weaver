CREATE POLICY "Users can read their own avatar object"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);