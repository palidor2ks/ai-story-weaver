
-- Allow admins to update job_queue (for cancel/retry)
CREATE POLICY "Admins update job_queue"
ON public.job_queue
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Cancel a pending or running job (mark as dead)
CREATE OR REPLACE FUNCTION public.cancel_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  UPDATE public.job_queue
     SET status = 'dead',
         finished_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         lock_expires_at = NULL,
         last_error = COALESCE(last_error || E'\n', '') || 'Cancelled by admin',
         updated_at = now()
   WHERE id = p_id
     AND status IN ('pending','running','failed');
END;
$$;

-- Retry a failed/dead/done job (reset to pending)
CREATE OR REPLACE FUNCTION public.retry_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  UPDATE public.job_queue
     SET status = 'pending',
         attempts = 0,
         locked_at = NULL,
         locked_by = NULL,
         lock_expires_at = NULL,
         finished_at = NULL,
         available_at = now(),
         last_error = NULL,
         updated_at = now()
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_job(uuid) TO authenticated;
