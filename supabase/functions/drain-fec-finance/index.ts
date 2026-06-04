// drain-fec-finance
// Scheduled backstop that keeps FEC finance data populated WITHOUT requiring a
// manual admin action.
//
// Why this exists: FEC *summary totals* (receipts, itemized, unitemized) are only
// fetched when a receipt sync runs to completion — fetch-fec-donors calls the
// /committee/{id}/totals endpoint only when `committeeHasMore` is false (see
// fetch-fec-donors comment "Only fetch FEC totals when sync completes"), and the
// client only triggers reconciliation on `hasMore === false`. Nothing was
// scheduled to (a) resume interrupted syncs or (b) refresh totals on their own, so
// candidates whose receipt sync was interrupted sit with imported local data but
// `fec_total_receipts = 0` indefinitely.
//
// Per run (time-budgeted, idempotent, resumable):
//   Phase A — resume partial syncs: candidates whose active P/A committees still
//     have has_more=true are advanced by calling fetch-fec-donors. Completing a
//     sync makes fetch-fec-donors fetch that committee's FEC totals and reconcile
//     with an accurate status.
//   Phase B — refresh missing totals: candidates with local data but a 0/null FEC
//     total are refreshed via refresh-fec-totals (batch). This populates the FEC
//     column directly, independent of sync state.
//
// Both target functions honor the service-role key (no admin JWT needed). Scheduled
// via cron (see migration); also runnable on demand to clear the backlog.
//
// Params: cycle (default "2026"), resumeBatch (default 3), totalsBatch (default 12)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronAuth } from "../_shared/cron-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const BUDGET_MS = 100_000;
const RESUME_PHASE_FRACTION = 0.55; // spend at most ~55% of the budget resuming syncs
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const cycle = String(p.cycle ?? qp.get("cycle") ?? "2026");
  const resumeBatch = num(p.resumeBatch ?? qp.get("resumeBatch"), 3);
  const totalsBatch = num(p.totalsBatch ?? qp.get("totalsBatch"), 12);

  const startedMs = Date.now();
  const callHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": ANON_KEY,
  };

  const result = {
    ok: true,
    cycle,
    resumed: 0,
    totalsRefreshed: 0,
    partialRemaining: null as number | null,
    totalsMissingRemaining: null as number | null,
    errors: [] as string[],
  };

  // ---- Phase A: resume interrupted (partial) receipt syncs ----------------
  // Distinct candidates with an active P/A committee that still has pages to import,
  // oldest sync first. Completing the sync triggers an accurate totals + reconcile.
  const { data: partialRows, error: partialErr } = await supabase
    .from("candidate_committees")
    .select("candidate_id, last_sync_date")
    .eq("active", true)
    .in("designation", ["P", "A"])
    .eq("has_more", true)
    .eq("last_cycle", cycle)
    .order("last_sync_date", { ascending: true, nullsFirst: true })
    .limit(resumeBatch * 4);
  if (partialErr) result.errors.push(`partial query: ${partialErr.message}`);

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

  const resumeDeadline = startedMs + BUDGET_MS * RESUME_PHASE_FRACTION;
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
      if (r.ok) result.resumed++;
      else result.errors.push(`resume ${cid}: HTTP ${r.status}`);
    } catch (e) {
      result.errors.push(`resume ${cid}: ${String(e).slice(0, 120)}`);
    }
    await sleep(500);
  }

  // ---- Phase B: refresh missing FEC summary totals ------------------------
  // Rows with imported local data but no FEC total. This populates the FEC column
  // directly regardless of partial-sync state. (For a still-partial candidate the
  // delta may read high until Phase A finishes the local import; it self-corrects
  // once the sync completes.)
  if (Date.now() - startedMs < BUDGET_MS) {
    // Candidates with imported local data but no FEC summary total yet (the reported
    // bug). finance_reconciliation has one row per candidate+cycle, so there is no
    // committee-count skew and no dedupe needed. A committee that legitimately reports
    // $0 may be re-checked on later runs — cheap and harmless given the small batch.
    const { data: missing, error: missErr } = await supabase
      .from("finance_reconciliation")
      .select("candidate_id")
      .eq("cycle", cycle)
      .gt("local_itemized", 0)
      .or("fec_total_receipts.is.null,fec_total_receipts.eq.0")
      .order("checked_at", { ascending: true, nullsFirst: true })
      .limit(totalsBatch);
    if (missErr) result.errors.push(`totals query: ${missErr.message}`);

    const totalsIds = (missing ?? [])
      .map((m) => m.candidate_id)
      .filter((x): x is string => !!x);
    if (totalsIds.length) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/refresh-fec-totals`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ batch: true, candidateIds: totalsIds, cycle, limit: totalsBatch }),
        });
        if (r.ok) {
          const j = await r.json().catch(() => ({} as Record<string, unknown>));
          result.totalsRefreshed = Number(j.processed ?? totalsIds.length) || 0;
        } else {
          result.errors.push(`totals batch: HTTP ${r.status}`);
        }
      } catch (e) {
        result.errors.push(`totals batch: ${String(e).slice(0, 120)}`);
      }
    }
  }

  // ---- Remaining counters (observability) ---------------------------------
  const { count: partialRemaining } = await supabase
    .from("candidate_committees")
    .select("candidate_id", { count: "exact", head: true })
    .eq("active", true)
    .in("designation", ["P", "A"])
    .eq("has_more", true)
    .eq("last_cycle", cycle);
  result.partialRemaining = partialRemaining ?? null;

  const { count: totalsMissingRemaining } = await supabase
    .from("finance_reconciliation")
    .select("candidate_id", { count: "exact", head: true })
    .eq("cycle", cycle)
    .gt("local_itemized", 0)
    .or("fec_total_receipts.is.null,fec_total_receipts.eq.0");
  result.totalsMissingRemaining = totalsMissingRemaining ?? null;

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
