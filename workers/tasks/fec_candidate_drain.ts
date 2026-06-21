import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Links FEC committee IDs and syncs donors for candidates that were discovered
// but never fully synced. Cursor-based and resumable across runs. Mirrors the
// pg_cron schedule (*/3 min).
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("fec_candidate_drain: starting");

  const result = await callEdge("fec-candidate-drain", {
    batch: 6,
    cycle: "2026",
  });

  helpers.logger.info("fec_candidate_drain: complete", { result });
};

export default task;
