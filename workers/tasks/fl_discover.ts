import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const FL_SYNC_SECRET = process.env.FL_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("fl_discover: starting");
  const result = await callEdge("fetch-fl-finance", { mode: "discover" }, {
    timeoutMs: 180_000,
    extraHeaders: { "x-sync-secret": FL_SYNC_SECRET },
  });
  helpers.logger.info("fl_discover: complete", { result });
};

export default task;
