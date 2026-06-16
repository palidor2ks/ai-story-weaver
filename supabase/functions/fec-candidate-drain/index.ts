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
import { ingestionHiddenList, loadHiddenStates } from "../_shared/onboard-candidate.ts";

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

  const hiddenSet = await loadHiddenStates(supabase);
  const hiddenList = ingestionHiddenList(hiddenSet);

  // Candidates with a FEC candidate ID that are never-synced OR stale (oldest first).
  // Hidden-state candidates are excluded at the query level so they can't occupy
  // every batch slot and starve visible-state candidates (visible-states gate).
  let dueQuery = supabase
    .from("candidates")
    .select("id, name, fec_candidate_id, fec_committee_id, last_donor_sync")
    .not("fec_candidate_id", "is", null)
    .or(`last_donor_sync.is.null,last_donor_sync.lt.${staleCutoff}`)
    .order("last_donor_sync", { ascending: true, nullsFirst: true })
    .limit(batch);
  if (hiddenList.length > 0) {
    dueQuery = dueQuery.or(`state.is.null,state.not.in.(${hiddenList.join(",")})`);
  }
  const { data: due, error: dueErr } = await dueQuery;

  if (dueErr) {
    return new Response(JSON.stringify({ ok: false, error: dueErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let linked = 0;
  let synced = 0;
  let processed = 0;
  let held = 0;
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
    // fetch-fec-donors only does ~25s of work per call: it syncs one committee page-window,
    // saves a resume cursor, and returns hasMore=true when the candidate isn't fully drained.
    let syncOk = false;
    let syncHasMore = false;
    if (doSync) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fec-donors`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ candidateId: c.id, fecCandidateId: c.fec_candidate_id, cycle }),
        });
        if (r.ok) {
          synced++; syncOk = true;
          // Read hasMore so we don't mark a huge candidate "done" after one slice.
          try {
            const sd = await r.json();
            syncHasMore = sd?.hasMore === true;
          } catch { /* unparseable body: treat as complete so a flaky response can't re-queue forever */ }
        }
        else errors.push(`sync ${c.name}: HTTP ${r.status}`);
      } catch (e) {
        errors.push(`sync ${c.name}: ${String(e).slice(0, 120)}`);
      }
    }

    // Stamp last_donor_sync so the candidate leaves the queue — but ONLY when the sync is
    // COMPLETE (hasMore=false). A partial sync must stay due so the next run resumes its
    // cursor; otherwise candidates with hundreds of pages (e.g. Schiff: ~$2.4M itemized
    // across many pages) get one 25s visit, are stamped "done", and drop to the back of the
    // queue for stale_days — never finishing. This mirrors fetch-fec-donors, which itself
    // only stamps last_donor_sync when !hasMore. Failed syncs (syncOk=false) also stay due.
    if ((syncOk && !syncHasMore) || !doSync) {
      // Guard: don't stamp a candidate "done for stale_days" when the sync imported ZERO donors
      // while FEC reports itemized contributions for this cycle. That's the trap that left e.g.
      // Roy Cooper at 0 donors despite $6.6M FEC itemized (synced before FEC posted his data /
      // wrong cycle), then sitting stale for 14 days. Instead, set last_donor_sync to ~1 day ago
      // so it re-tries tomorrow (not every 3 min — that would starve the batch) until the data
      // lands. We OVERWRITE rather than skip so fetch-fec-donors' own "now" stamp can't win.
      let stampValue = new Date().toISOString();
      if (doSync) {
        const { count: donorCount } = await supabase
          .from("donors").select("id", { count: "exact", head: true }).eq("candidate_id", c.id);
        if ((donorCount ?? 0) === 0) {
          const { data: recon } = await supabase
            .from("finance_reconciliation").select("fec_itemized")
            .eq("candidate_id", c.id).eq("cycle", cycle).maybeSingle();
          const fecItemized = Number(recon?.fec_itemized) || 0;
          if (fecItemized > 0) {
            stampValue = new Date(Date.now() - Math.max(staleDays - 1, 0) * 86400000).toISOString();
            held++;
            console.warn(`[fec-candidate-drain] hold ${c.name}: 0 donors imported but FEC reports $${Math.round(fecItemized).toLocaleString()} itemized (cycle ${cycle}) — re-due ~1 day`);
          }
        }
      }
      await supabase.from("candidates").update({ last_donor_sync: stampValue }).eq("id", c.id);
    }

    await sleep(500);
  }

  let remainingQuery = supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .not("fec_candidate_id", "is", null)
    .or(`last_donor_sync.is.null,last_donor_sync.lt.${staleCutoff}`);
  if (hiddenList.length > 0) {
    remainingQuery = remainingQuery.or(`state.is.null,state.not.in.(${hiddenList.join(",")})`);
  }
  const { count: remaining } = await remainingQuery;

  return new Response(JSON.stringify({
    ok: true, cycle, processed, linked, synced, held, remaining: remaining ?? null, errors: errors.slice(0, 20),
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
