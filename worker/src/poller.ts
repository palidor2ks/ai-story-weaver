import { config } from "./config.js";
import { logger } from "./logger.js";
import { claimJobs, startRun, finishRun, completeJob, failJob, type QueueJob } from "./queue.js";
import { handlers } from "./handlers/index.js";

let running = true;
let inflight = 0;

export function stopPoller(): void {
  running = false;
}

async function processJob(job: QueueJob): Promise<void> {
  const handler = handlers[job.job_type];
  if (!handler) {
    const msg = `no handler registered for job_type=${job.job_type}`;
    logger.error({ job_id: job.id, job_type: job.job_type }, msg);
    await failJob(job.id, msg, 600);
    return;
  }

  const runId = await startRun(job);
  const log = logger.child({ job_id: job.id, run_id: runId, job_type: job.job_type, attempt: job.attempts });
  log.info("job started");

  try {
    const result = await handler(job);
    await finishRun(runId, "done", { metadata: result.metadata, checkpoint: result.checkpoint });
    await completeJob(job.id);
    log.info({ metadata: result.metadata }, "job done");
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    log.error({ err: message }, "job failed");
    await finishRun(runId, "failed", { error: message });
    // Exponential backoff: 60s * 2^(attempts-1), capped at 1h
    const delay = Math.min(60 * 2 ** Math.max(0, job.attempts - 1), 3600);
    await failJob(job.id, message, delay);
  }
}

export async function runPoller(): Promise<void> {
  logger.info(
    { job_types: config.jobTypes, poll_ms: config.POLL_INTERVAL_MS, batch: config.CLAIM_BATCH_SIZE },
    "poller started",
  );

  while (running) {
    try {
      if (inflight >= config.MAX_CONCURRENT_JOBS) {
        await sleep(config.POLL_INTERVAL_MS);
        continue;
      }

      let claimedAny = false;
      for (const jobType of config.jobTypes) {
        if (inflight >= config.MAX_CONCURRENT_JOBS) break;
        const remaining = config.MAX_CONCURRENT_JOBS - inflight;
        const batch = Math.min(config.CLAIM_BATCH_SIZE, remaining);
        const jobs = await claimJobs(jobType, batch);
        if (jobs.length === 0) continue;

        claimedAny = true;
        for (const job of jobs) {
          inflight += 1;
          void processJob(job).finally(() => {
            inflight -= 1;
          });
        }
      }

      if (!claimedAny) {
        await sleep(config.POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error({ err }, "poller loop error");
      await sleep(Math.min(config.POLL_INTERVAL_MS * 5, 30_000));
    }
  }

  // Drain in-flight on shutdown
  const drainStart = Date.now();
  while (inflight > 0 && Date.now() - drainStart < 30_000) {
    await sleep(250);
  }
  logger.info("poller stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
