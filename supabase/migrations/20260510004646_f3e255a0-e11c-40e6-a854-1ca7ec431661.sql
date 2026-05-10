DROP POLICY IF EXISTS "Mayor fetch queue is viewable by everyone" ON public.mayor_fetch_queue;
DROP POLICY IF EXISTS "Reconciliation data is viewable by everyone" ON public.finance_reconciliation;

CREATE POLICY "Admins can view mayor fetch queue"
  ON public.mayor_fetch_queue FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view finance reconciliation"
  ON public.finance_reconciliation FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));