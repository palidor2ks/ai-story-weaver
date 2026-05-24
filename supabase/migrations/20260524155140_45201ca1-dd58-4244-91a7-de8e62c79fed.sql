CREATE POLICY "Users can delete their own share cards"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'share-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can delete any share card"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'share-cards' AND public.has_role(auth.uid(), 'admin'::public.app_role));