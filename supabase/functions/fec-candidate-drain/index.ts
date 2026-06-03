// fec-candidate-drain
// Fills the gap after `discover-fec-candidates`: that job creates candidate rows
// with an FEC *candidate* ID but never links their principal committee or syncs
// their finance, and no other job covers challenger candidates promptly (the
// congress-donor jobs are sitting-member-only; sync-all-donors is monthly).
//
// This drains candidates that have a FEC candidate ID but have never been synced
// (last_donor_sync IS NULL) — for each it links the committee (fetch-fec-committees)
// and syncs donors (fetch-fec-donors), then stamps last_donor_sync so it leaves the
// queue. Resumable across runs (time-budgeted) and idempotent. Scheduled via cron
// to catch future discoveries; also runnable on demand to clear the backlog.
//
// It calls the existing functions with the service-role key (which fetch-fec-donors
// honors), so no admin JWT is required.
//
// Params: batch (default 6), cycle (default "2026"), link (default true), sync (default true)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUDGET_MS = 110_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let p: Record<string, unknown> = {};
  if (req.method === "POST") { try { p = await req.json(); } catch { /* defaults */ } }
  const qp = new URL(req.url).searchParams;
  const num = (v: unknown, d: number) => (v == null || v === "" ? d : Number(v));

  const batch = num(p.batch ?? qp.get("batch"), 6);
  const cycle = String(p.cycle ?? qp.get("cycle") ?? "2026");
  const doLink = (p.link ?? qp.get("link")) !== false && qp.get("link") !== "false";
  const doSync = (p.sync ?? qp.get("sync")) !== false && qp.get("sync") !== "false";
  // Re-sync candidates whose donors are stale (older than stale_days), in addition to
  // never-synced ones — this supersedes the broken (anon-auth) monthly-donor-sync cron.
  const staleDays = num(p.stale_days ?? qp.get("stale_days"), 14);
  const staleCutoff = new Date(Date.now() - staleDays * 86400000).toISOString();

  const startedMs = Date.now();
  const callHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": ANON_KEY,
  };

  // Candidates with a FEC candidate ID that are never-synced OR stale (oldest first).
  const { data: due, error: dueErr } = await supabase
    .from("candidates")
    .select("id, name, fec_candidate_id, fec_committee_id, last_donor_sync")
    .not("fec_candidate_id", "is", null)
    .or(`last_donor_sync.is.null,last_donor_sync.lt.${staleCutoff}`)
    .order("last_donor_sync", { ascending: true, nullsFirst: true })
    .limit(batch);

  if (dueErr) {
    return new Response(JSON.stringify({ ok: false, error: dueErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let linked = 0;
  let synced = 0;
  let processed = 0;
  const errors: string[] = [];

  for (const c of due ?? []) {
    if (Date.now() - startedMs > BUDGET_MS) break;
    processed++;

    // 1) Link the principal committee (sets candidates.fec_committee_id).
    if (doLink && !c.fec_committee_id) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fec-committees`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ candidateId: c.id, fecCandidateId: c.fec_candidate_id }),
        });
        if (r.ok) linked++;
        else errors.push(`link ${c.name}: HTTP ${r.status}`);
      } catch (e) {
        errors.push(`link ${c.name}: ${String(e).slice(0, 120)}`);
      }
    }

    // 2) Sync donors for the cycle (fetch-fec-donors honors the service-role key).
    let syncOk = false;
    if (doSync) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fec-donors`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ candidateId: c.id, fecCandidateId: c.fec_candidate_id, cycle }),
        });
        if (r.ok) { synced++; syncOk = true; }
        else errors.push(`sync ${c.name}: HTTP ${r.status}`);
      } catch (e) {
        errors.push(`sync ${c.name}: ${String(e).slice(0, 120)}`);
      }
    }

    // Stamp last_donor_sync so the candidate leaves the queue (only on a successful
    // sync; failures stay null and get retried next run). If we didn't sync, mark it
    // anyway so link-only runs don't loop.
    if (syncOk || !doSync) {
      await supabase.from("candidates").update({ last_donor_sync: new Date().toISOString() }).eq("id", c.id);
    }

    await sleep(500);
  }

  const { count: remaining } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .not("fec_candidate_id", "is", null)
    .or(`last_donor_sync.is.null,last_donor_sync.lt.${staleCutoff}`);

  return new Response(JSON.stringify({
    ok: true, cycle, processed, linked, synced, remaining: remaining ?? null, errors: errors.slice(0, 20),
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
