-- Remove public read access on poll_social_posts (contains internal API errors / OAuth fragments)
DROP POLICY IF EXISTS "Public can view posts for published polls" ON public.poll_social_posts;

-- Allow users to delete their own poll responses
CREATE POLICY "Users can delete their own poll responses"
  ON public.poll_responses FOR DELETE
  USING (user_id = auth.uid() AND user_id IS NOT NULL);