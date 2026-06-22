import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const VOTE_SYNC_SECRET = process.env.VOTE_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("sync_legislator_votes: starting");
  const result = await callEdge("sync-legislator-votes", { batch: 20, scope: "both" }, {
    extraHeaders: { "x-sync-secret": VOTE_SYNC_SECRET },
  });
  helpers.logger.info("sync_legislator_votes: complete", { result });
};

export default task;
