// drain-fec-finance
// Scheduled backstop that keeps FEC finance data populated WITHOUT requiring a
// manual admin action.
//
// Why this exists: FEC *summary totals* (receipts, itemized, unitemized) are only
// fetched when a receipt sync runs to completion — fetch-fec-donors calls the
// /committee/{id}/totals endpoint only when `committeeHasMore` is false (see
// fetch-fec-donors comment "Only fetch FEC totals when sync completes"), and the
// client only triggers reconciliation on `hasMore === false`. Nothing else was
// scheduled to (a) resume interrupted syncs, (b) backfill missing totals, or
// (c) keep already-populated totals from going stale.
//
// Per run (time-budgeted, idempotent, resumable), for EACH active cycle:
//   Phase A — resume partial syncs: candidates whose active P/A committees still
//     have has_more=true are advanced by calling fetch-fec-donors. Completing a
//     sync makes fetch-fec-donors fetch that committee's FEC totals and reconcile
//     with an accurate status.
//   Phase B — refresh due totals: candidates with local data whose FEC total is
//     missing/0 (a gap) OR whose reconciliation was last checked more than
//     `stalenessDays` ago (keep-fresh) are refreshed via refresh-fec-totals
//     (batch). Oldest/never-checked first, so gaps are prioritized and populated
//     rows are re-pulled in small batches rather than all at once.
//
// Cycles: pass `cycle` (single) or `cycles` (array / comma-separated) to target
// specific cycles; otherwise the function auto-discovers every cycle that has
// finance data (via get_committee_cycles) so new cycles are picked up
// automatically. The time budget is shared across cycles.
//
// Both target functions honor the service-role key (no admin JWT needed). Scheduled
// via cron (see migration); also runnable on demand to clear the backlog.
//
// Params: cycle | cycles (default: auto-discover), resumeBatch (default 3),
//         totalsBatch (default 12), stalenessDays (default 7)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Supabase = ReturnType<typeof createClient>;
import { requireCronAuth } from "../_shared/cron-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const BUDGET_MS = 100_000;
const RESUME_PHASE_FRACTION = 0.55; // spend at most ~55% of the budget resuming syncs
const STALENESS_DAYS_DEFAULT = 7;
const DAY_MS = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolve the set of cycles to process. Explicit params win; otherwise discover
// every cycle that actually has finance data so future cycles are covered without
// a code change. Falls back to the current + prior cycle if discovery is empty.
async function resolveCycles(
  supabase: Supabase,
  cyclesParam: unknown,
  cycleParam: unknown,
): Promise<string[]> {
  const fromCsv = (v: unknown) =>
    String(v).split(",").map((s) => s.trim()).filter(Boolean);

  if (cyclesParam != null && cyclesParam !== "") {
    return [...new Set(Array.isArray(cyclesParam) ? cyclesParam.map(String) : fromCsv(cyclesParam))];
  }
  if (cycleParam != null && cycleParam !== "") {
    return [String(cycleParam)];
  }

  try {
    const { data, error } = await supabase.rpc("get_committee_cycles");
    if (!error && Array.isArray(data)) {
      const cycles = (data as unknown[]).map(String).filter(Boolean);
      if (cycles.length) return [...new Set(cycles)];
    }
  } catch {
    // fall through to default
  }
  return ["2026", "2024"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let p: Record<string, unknown> = {};
  if (req.method === "POST") { try { p = await req.json(); } catch { /* defaults */ } }
  const qp = new URL(req.url).searchParams;
  const num = (v: unknown, d: number) => (v == null || v === "" ? d : Number(v));

  const cycles = await resolveCycles(supabase, p.cycles ?? qp.get("cycles"), p.cycle ?? qp.get("cycle"));
  const resumeBatch = num(p.resumeBatch ?? qp.get("resumeBatch"), 3);
  const totalsBatch = num(p.totalsBatch ?? qp.get("totalsBatch"), 12);
  const stalenessDays = num(p.stalenessDays ?? qp.get("stalenessDays"), STALENESS_DAYS_DEFAULT);
  const staleCutoffIso = new Date(Date.now() - stalenessDays * DAY_MS).toISOString();
  // Rows are "due" for a totals refresh when local data exists AND either the FEC
  // total is missing/0 (a gap) or the row hasn't been checked since the cutoff.
  const dueOrFilter = `fec_total_receipts.is.null,fec_total_receipts.eq.0,checked_at.is.null,checked_at.lt.${staleCutoffIso}`;

  const startedMs = Date.now();
  const callHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": ANON_KEY,
  };

  type CycleResult = {
    cycle: string;
    resumed: number;
    totalsRefreshed: number;
    partialRemaining: number | null;
    totalsDueRemaining: number | null;
  };

  const result = {
    ok: true,
    cycles,
    stalenessDays,
    resumed: 0,
    totalsRefreshed: 0,
    byCycle: [] as CycleResult[],
    errors: [] as string[],
  };

  // ---- Phase A: resume interrupted (partial) receipt syncs ----------------
  // Across all cycles, bounded by a shared deadline so no single cycle starves
  // the others. Completing a sync triggers an accurate totals + reconcile.
  const resumeDeadline = startedMs + BUDGET_MS * RESUME_PHASE_FRACTION;
  const resumedByCycle = new Map<string, number>();

  for (const cycle of cycles) {
    if (Date.now() > resumeDeadline) break;

    const { data: partialRows, error: partialErr } = await supabase
      .from("candidate_committees")
      .select("candidate_id, last_sync_date")
      .eq("active", true)
      .in("designation", ["P", "A"])
      .eq("has_more", true)
      .eq("last_cycle", cycle)
      .order("last_sync_date", { ascending: true, nullsFirst: true })
      .limit(resumeBatch * 4);
    if (partialErr) { result.errors.push(`partial query [${cycle}]: ${partialErr.message}`); continue; }

    const partialCandidateIds: string[] = [];
    const seenPartial = new Set<string>();
    for (const row of partialRows ?? []) {
      if (row.candidate_id && !seenPartial.has(row.candidate_id)) {
        seenPartial.add(row.candidate_id);
        partialCandidateIds.push(row.candidate_id);
      }
      if (partialCandidateIds.length >= resumeBatch) break;
    }

    const fecIdByCandidate = new Map<string, string>();
    if (partialCandidateIds.length) {
      const { data: cands } = await supabase
        .from("candidates")
        .select("id, fec_candidate_id")
        .in("id", partialCandidateIds);
      for (const c of cands ?? []) if (c.fec_candidate_id) fecIdByCandidate.set(c.id, c.fec_candidate_id);
    }

    for (const cid of partialCandidateIds) {
      if (Date.now() > resumeDeadline) break;
      const fecId = fecIdByCandidate.get(cid);
      if (!fecId) continue;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fec-donors`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ candidateId: cid, fecCandidateId: fecId, cycle }),
        });
        if (r.ok) {
          result.resumed++;
          resumedByCycle.set(cycle, (resumedByCycle.get(cycle) ?? 0) + 1);
        } else {
          result.errors.push(`resume ${cid} [${cycle}]: HTTP ${r.status}`);
        }
      } catch (e) {
        result.errors.push(`resume ${cid} [${cycle}]: ${String(e).slice(0, 120)}`);
      }
      await sleep(500);
    }
  }

  // ---- Phase B: refresh due FEC summary totals ----------------------------
  // Gaps (missing/0 FEC total) and stale rows (checked_at older than the cutoff),
  // oldest/never-checked first. This populates the FEC column directly regardless
  // of partial-sync state and keeps populated totals current over time.
  const totalsByCycle = new Map<string, number>();
  for (const cycle of cycles) {
    if (Date.now() - startedMs >= BUDGET_MS) break;

    const { data: due, error: dueErr } = await supabase
      .from("finance_reconciliation")
      .select("candidate_id")
      .eq("cycle", cycle)
      .gt("local_itemized", 0)
      .or(dueOrFilter)
      .order("checked_at", { ascending: true, nullsFirst: true })
      .limit(totalsBatch);
    if (dueErr) { result.errors.push(`totals query [${cycle}]: ${dueErr.message}`); continue; }

    const totalsIds = (due ?? [])
      .map((m) => m.candidate_id)
      .filter((x): x is string => !!x);
    if (!totalsIds.length) continue;

    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/refresh-fec-totals`, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify({ batch: true, candidateIds: totalsIds, cycle, limit: totalsBatch }),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({} as Record<string, unknown>));
        const n = Number(j.processed ?? totalsIds.length) || 0;
        result.totalsRefreshed += n;
        totalsByCycle.set(cycle, n);
      } else {
        result.errors.push(`totals batch [${cycle}]: HTTP ${r.status}`);
      }
    } catch (e) {
      result.errors.push(`totals batch [${cycle}]: ${String(e).slice(0, 120)}`);
    }
  }

  // ---- Remaining counters (observability), per cycle ----------------------
  for (const cycle of cycles) {
    const { count: partialRemaining } = await supabase
      .from("candidate_committees")
      .select("candidate_id", { count: "exact", head: true })
      .eq("active", true)
      .in("designation", ["P", "A"])
      .eq("has_more", true)
      .eq("last_cycle", cycle);

    const { count: totalsDueRemaining } = await supabase
      .from("finance_reconciliation")
      .select("candidate_id", { count: "exact", head: true })
      .eq("cycle", cycle)
      .gt("local_itemized", 0)
      .or(dueOrFilter);

    result.byCycle.push({
      cycle,
      resumed: resumedByCycle.get(cycle) ?? 0,
      totalsRefreshed: totalsByCycle.get(cycle) ?? 0,
      partialRemaining: partialRemaining ?? null,
      totalsDueRemaining: totalsDueRemaining ?? null,
    });
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
