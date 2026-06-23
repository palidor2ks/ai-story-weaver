import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Links FEC committee IDs and syncs donors for candidates that were discovered
// but never fully synced. Cursor-based and resumable across runs. Mirrors the
// pg_cron schedule (*/3 min).
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("fec_candidate_drain: starting");

  // fec-candidate-drain legitimately runs ~140s server-side (committee linking + donor sync),
  // which exceeds call-edge's 120s default. Without a higher ceiling the worker aborts a
  // successful run and retries it forever, re-doing the work each time. Give it headroom.
  const result = await callEdge("fec-candidate-drain", {
    batch: 6,
    cycle: "2026",
  }, { timeoutMs: 240_000 });

  helpers.logger.info("fec_candidate_drain: complete", { result });
};

export default task;
