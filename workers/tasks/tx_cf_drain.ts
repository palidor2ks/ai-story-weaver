import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const TX_SYNC_SECRET = process.env.TX_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("tx_cf_drain: starting");
  const result = await callEdge("fetch-tx-finance", { mode: "drain", maxShards: 1 }, {
    extraHeaders: { "x-sync-secret": TX_SYNC_SECRET },
  });
  helpers.logger.info("tx_cf_drain: complete", { result });
};

export default task;
