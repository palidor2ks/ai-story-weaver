import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("congress_donor_refresh: starting");
  const result = await callEdge(
    "schedule-congress-donor-sync",
    { scope: "congress_visible", mode: "refresh", limit: 1, cycle: "2024" },
    { extraHeaders: { "apikey": ANON_KEY } },
  );
  helpers.logger.info("congress_donor_refresh: complete", { result });
};

export default task;
