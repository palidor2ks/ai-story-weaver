import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const FL_SYNC_SECRET = process.env.FL_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("fl_drain: starting");
  const result = await callEdge("fetch-fl-finance", { mode: "drain", batch: 10 }, {
    extraHeaders: { "x-sync-secret": FL_SYNC_SECRET },
  });
  helpers.logger.info("fl_drain: complete", { result });
};

export default task;
