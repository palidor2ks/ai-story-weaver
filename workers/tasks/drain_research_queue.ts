import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Drains the pending_research queue: claims candidates with answers_source='pending_research'
// and fires get-candidate-answers for each. Idempotent with a cooldown lease so in-flight
// candidates aren't double-kicked. Mirrors the pg_cron schedule (*/30 min).
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("drain_research_queue: starting");

  const result = await callEdge("drain-research-queue", {
    batchSize: 5,
  });

  helpers.logger.info("drain_research_queue: complete", { result });
};

export default task;
