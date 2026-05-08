-- Create public bucket for hosting official portrait photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('official-photos', 'official-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read
CREATE POLICY "Public read official-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'official-photos');

-- Authenticated write (edge functions use service role which bypasses RLS anyway)
CREATE POLICY "Authenticated write official-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'official-photos');

CREATE POLICY "Authenticated update official-photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'official-photos');