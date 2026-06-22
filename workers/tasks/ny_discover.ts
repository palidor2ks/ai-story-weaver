import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const NY_SYNC_SECRET = process.env.NY_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("ny_discover: starting");
  const result = await callEdge("fetch-ny-finance", { mode: "discover" }, {
    timeoutMs: 180_000,
    extraHeaders: { "x-sync-secret": NY_SYNC_SECRET },
  });
  helpers.logger.info("ny_discover: complete", { result });
};

export default task;
