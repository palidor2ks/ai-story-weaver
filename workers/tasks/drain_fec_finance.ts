import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Orchestrates FEC finance reconciliation: resumes partial receipt syncs (Phase A)
// and refreshes stale FEC totals (Phase B). Mirrors the pg_cron schedule (*/10 min).
// The edge function is time-budgeted (100s) and idempotent; calling it from Railway
// removes this from Supabase DB compute while keeping the logic in the edge function.
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("drain_fec_finance: starting");

  const result = await callEdge("drain-fec-finance", {
    resumeBatch: 3,
    totalsBatch: 12,
    stalenessDays: 7,
  });

  helpers.logger.info("drain_fec_finance: complete", { result });
};

export default task;
