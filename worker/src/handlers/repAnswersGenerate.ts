import type { QueueJob } from "../queue.js";
import type { HandlerResult } from "./index.js";
import { logger } from "../logger.js";

/**
 * Placeholder handler — wired in Day 3-4 with the ported logic from
 * supabase/functions/get-candidate-answers (Perplexity sonar-deep-research +
 * Lovable AI Gateway fallback, JSON-schema enforced, 50-80 word evidence-first
 * explanations, discrete -10/-5/0/+5/+10 score snapping).
 *
 * For now it acknowledges the job so we can validate the end-to-end queue +
 * Railway deployment loop with a no-op.
 */
export async function repAnswersGenerate(job: QueueJob): Promise<HandlerResult> {
  logger.info({ job_id: job.id, payload: job.payload }, "rep_answers_generate (no-op)");
  // Intentionally no DB writes yet — Day 3-4 will port the real logic.
  return {
    metadata: { noop: true, received_at: new Date().toISOString() },
  };
}
