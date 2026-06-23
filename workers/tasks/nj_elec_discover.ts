import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const NJ_SYNC_SECRET = process.env.NJ_SYNC_SECRET ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("nj_elec_discover: starting");
  const result = await callEdge(
    "fetch-nj-elec-finance",
    { mode: "discover", office_codes: ["1", "2"], election_years: [2025, 2023, 2021] },
    { timeoutMs: 180_000, extraHeaders: { "x-sync-secret": NJ_SYNC_SECRET } },
  );
  helpers.logger.info("nj_elec_discover: complete", { result });
};

export default task;
