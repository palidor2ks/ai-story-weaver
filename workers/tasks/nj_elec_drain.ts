import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const NJ_SYNC_SECRET = process.env.NJ_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("nj_elec_drain: starting");
  const result = await callEdge("fetch-nj-elec-finance", { mode: "drain", batch: 20 }, {
    extraHeaders: { "x-sync-secret": NJ_SYNC_SECRET },
  });
  helpers.logger.info("nj_elec_drain: complete", { result });
};

export default task;
