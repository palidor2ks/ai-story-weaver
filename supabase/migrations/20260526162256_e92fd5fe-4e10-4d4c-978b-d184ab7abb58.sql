-- =====================================================================
-- Job queue infrastructure for Railway workers
-- =====================================================================

CREATE TYPE public.job_status AS ENUM ('pending','running','done','failed','dead');

-- ---------------------------------------------------------------------
-- job_queue
-- ---------------------------------------------------------------------
CREATE TABLE public.job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority int NOT NULL DEFAULT 100,
  status public.job_status NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  lock_expires_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  idempotency_key text UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_job_queue_claim
  ON public.job_queue (job_type, status, priority, available_at)
  WHERE status = 'pending';

CREATE INDEX idx_job_queue_status ON public.job_queue (status);
CREATE INDEX idx_job_queue_created_at ON public.job_queue (created_at DESC);

GRANT SELECT ON public.job_queue TO authenticated;
GRANT ALL ON public.job_queue TO service_role;

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read job_queue"
  ON public.job_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_job_queue_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- job_runs
-- ---------------------------------------------------------------------
CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.job_queue(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status public.job_status NOT NULL DEFAULT 'running',
  attempt int NOT NULL DEFAULT 1,
  worker_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  checkpoint jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_runs_queue_id ON public.job_runs (queue_id);
CREATE INDEX idx_job_runs_type_started ON public.job_runs (job_type, started_at DESC);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read job_runs"
  ON public.job_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------
-- job_dead_letters
-- ---------------------------------------------------------------------
CREATE TABLE public.job_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id uuid,
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  attempts int NOT NULL,
  last_error text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_job_dead_letters_type ON public.job_dead_letters (job_type, failed_at DESC);

GRANT SELECT ON public.job_dead_letters TO authenticated;
GRANT ALL ON public.job_dead_letters TO service_role;

ALTER TABLE public.job_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read job_dead_letters"
  ON public.job_dead_letters FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------
-- claim_jobs: atomic SKIP LOCKED claim
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_jobs(
  p_job_type text,
  p_worker_id text,
  p_batch_size int DEFAULT 1,
  p_lock_seconds int DEFAULT 300
)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_jobs is only callable by the worker (service_role)';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.job_queue
    WHERE status = 'pending'
      AND job_type = p_job_type
      AND available_at <= now()
    ORDER BY priority ASC, available_at ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue q
     SET status = 'running',
         locked_at = now(),
         locked_by = p_worker_id,
         lock_expires_at = now() + make_interval(secs => p_lock_seconds),
         attempts = q.attempts + 1,
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(text, text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(text, text, int, int) TO service_role;

-- ---------------------------------------------------------------------
-- complete_job / fail_job helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'complete_job is only callable by the worker (service_role)';
  END IF;
  UPDATE public.job_queue
     SET status = 'done',
         finished_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         lock_expires_at = NULL,
         updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_job(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_job(
  p_id uuid,
  p_error text,
  p_retry_delay_seconds int DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.job_queue%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'fail_job is only callable by the worker (service_role)';
  END IF;

  SELECT * INTO v_job FROM public.job_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.job_queue
       SET status = 'dead',
           last_error = p_error,
           finished_at = now(),
           locked_at = NULL,
           locked_by = NULL,
           lock_expires_at = NULL,
           updated_at = now()
     WHERE id = p_id;

    INSERT INTO public.job_dead_letters
      (original_queue_id, job_type, payload, attempts, last_error)
    VALUES
      (v_job.id, v_job.job_type, v_job.payload, v_job.attempts, p_error);
  ELSE
    UPDATE public.job_queue
       SET status = 'pending',
           last_error = p_error,
           available_at = now() + make_interval(secs => p_retry_delay_seconds),
           locked_at = NULL,
           locked_by = NULL,
           lock_expires_at = NULL,
           updated_at = now()
     WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_job(uuid, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_job(uuid, text, int) TO service_role;