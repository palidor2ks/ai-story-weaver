-- Explicit service-role-only INSERT policies. Service role bypasses RLS,
-- so these policies primarily document intent and block any future code path
-- that attempts to insert from an authenticated (non-service) context.

CREATE POLICY "service role inserts badge notifications"
  ON public.pending_badge_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service role inserts activity events"
  ON public.user_activity_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service role awards badges"
  ON public.user_badges
  FOR INSERT
  TO service_role
  WITH CHECK (true);
