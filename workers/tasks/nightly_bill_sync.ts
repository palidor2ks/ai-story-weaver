import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Primary Congress.gov bill sync — runs nightly at 03:10 UTC. Mirrors the pg_cron schedule.
// The edge function has no explicit timeout budget; running it from Railway avoids the
// Supabase 600s wall-time limit that can kill long sync runs.
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("nightly_bill_sync: starting");

  // Longer timeout: this sync can take several minutes on a full run.
  const result = await callEdge("nightly-bill-sync", {}, 300_000);

  helpers.logger.info("nightly_bill_sync: complete", { result });
};

export default task;
