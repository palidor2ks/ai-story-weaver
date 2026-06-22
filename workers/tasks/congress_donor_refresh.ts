import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Both apikey and Authorization must use the anon key — the gateway rejects mismatched
// apikey=anon + Authorization=service_role with UNAUTHORIZED_API_KEY_CONFLICTS.
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

const task: Task = async (_payload, helpers) => {
  helpers.logger.info("congress_donor_refresh: starting");
  const result = await callEdge(
    "schedule-congress-donor-sync",
    { scope: "congress_visible", mode: "refresh", limit: 1, cycle: "2024" },
    { extraHeaders: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` } },
  );
  helpers.logger.info("congress_donor_refresh: complete", { result });
};

export default task;
