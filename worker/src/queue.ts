import { pool } from "./db.js";
import { config } from "./config.js";

export interface QueueJob {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  created_at: string;
}

export async function claimJobs(jobType: string, batchSize = config.CLAIM_BATCH_SIZE): Promise<QueueJob[]> {
  const { rows } = await pool.query<QueueJob>(
    `SELECT * FROM public.claim_jobs($1, $2, $3, $4)`,
    [jobType, config.WORKER_ID, batchSize, config.LOCK_SECONDS],
  );
  return rows;
}

export async function startRun(job: QueueJob): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO public.job_runs (queue_id, job_type, status, attempt, worker_id)
     VALUES ($1, $2, 'running', $3, $4)
     RETURNING id`,
    [job.id, job.job_type, job.attempts, config.WORKER_ID],
  );
  return rows[0].id;
}

export async function finishRun(
  runId: string,
  status: "done" | "failed",
  fields: { error?: string | null; checkpoint?: unknown; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await pool.query(
    `UPDATE public.job_runs
        SET status = $2,
            finished_at = now(),
            error = $3,
            checkpoint = COALESCE($4::jsonb, checkpoint),
            metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb)
      WHERE id = $1`,
    [
      runId,
      status,
      fields.error ?? null,
      fields.checkpoint != null ? JSON.stringify(fields.checkpoint) : null,
      fields.metadata != null ? JSON.stringify(fields.metadata) : null,
    ],
  );
}

export async function completeJob(jobId: string): Promise<void> {
  await pool.query(`SELECT public.complete_job($1)`, [jobId]);
}

export async function failJob(jobId: string, errorMessage: string, retryDelaySeconds = 60): Promise<void> {
  await pool.query(`SELECT public.fail_job($1, $2, $3)`, [jobId, errorMessage, retryDelaySeconds]);
}
