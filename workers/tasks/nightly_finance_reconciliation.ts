import type { Task } from "graphile-worker";
import { callEdge } from "../lib/call-edge.ts";

// Nightly FEC reconciliation sweep. The 10-min drain (drain_fec_finance) keeps totals fresh
// incrementally via refresh-fec-totals; this nightly pass re-checks the stalest candidates in
// one go so the finance_reconciliation status board doesn't drift for anyone the drain's small
// keep-fresh batch hasn't reached. All three recon writers now share one status rule
// (_shared/finance-recon-status.ts), so this agrees with the drain rather than fighting it.
//
// Auth: callEdge sends the service-role bearer, accepted by the edge function's isCronAuthorized
// escape hatch — no admin JWT needed. The function processes in the background (returns
// immediately with queued:true) for bulk runs, so the short HTTP timeout here is fine.
const task: Task = async (_payload, helpers) => {
  helpers.logger.info("nightly_finance_reconciliation: starting");

  const result = await callEdge(
    "nightly-finance-reconciliation",
    { onlyStale: true, limit: 50 },
    { timeoutMs: 120_000 },
  );

  helpers.logger.info("nightly_finance_reconciliation: complete", { result });
};

export default task;
