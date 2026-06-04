
CREATE POLICY "Only admins can update claims"
  ON public.profile_claims
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Dedupe existing poll_responses, keeping the earliest submission per (poll_id, user_id)
DELETE FROM public.poll_responses pr
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY poll_id, user_id ORDER BY submitted_at NULLS LAST, id) AS rn
    FROM public.poll_responses
    WHERE user_id IS NOT NULL
  ) t WHERE t.rn > 1
) d
WHERE pr.id = d.id;

DELETE FROM public.poll_responses pr
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY poll_id, anon_session_id ORDER BY submitted_at NULLS LAST, id) AS rn
    FROM public.poll_responses
    WHERE user_id IS NULL AND anon_session_id IS NOT NULL
  ) t WHERE t.rn > 1
) d
WHERE pr.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS poll_responses_unique_user
  ON public.poll_responses (poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS poll_responses_unique_anon
  ON public.poll_responses (poll_id, anon_session_id)
  WHERE user_id IS NULL AND anon_session_id IS NOT NULL;
