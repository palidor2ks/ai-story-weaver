// fetch-ny-finance
// Automated ingestion of New York state campaign-finance data into the isolated
// ny_* tables. Source: data.ny.gov (Socrata) NYSBOE disclosure datasets via the
// SODA JSON API. NY State Senate + State Assembly (FEC doesn't cover state).
// Kept separate from the federal FEC, NJ ELEC, and FL pipelines.
//
//   Filers:     7x2g-h32p  (registry; CANDIDATE records carry office_desc+district)
//   Disclosure: e9ss-239a  (itemized txns on COMMITTEE filers; monetary = sched A/B/C)
//
// NY quirk: contributions are filed by committees ("Friends Of <name>") that
// carry NO office/district, while office/district live on separate CANDIDATE
// records — linked only by name. So the ingestion unit is the candidate record;
// the drain matches that candidate's committees by `cand_comm_name` and
// attributes the contributions (with the candidate's office/district) to it.
//
// Modes (param `mode`): discover | drain | full (default). Other params:
//   batch(=15), stale_days(=30), max_filers, only_filer.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://data.ny.gov/resource";
const FILERS_DS = "7x2g-h32p";
const DISCLOSURE_DS = "e9ss-239a";
const UA = "Mozilla/5.0 (Polipulse civic-data ingest)";
const BUDGET_MS = 110_000;
const PAGE = 50_000;
const MIN_DATE = "2017-01-01";
const SCHEDULES = "'A','B','C'";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escSoql = (s: string) => s.replace(/'/g, "''");
const trimPunct = (s: string) => s.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");

// deno-lint-ignore no-explicit-any
async function sodaGet(url: string): Promise<any[]> {
  const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`SODA ${res.status} ${url.slice(60, 170)}`);
  return res.json();
}

interface Cand { filer_id: string; filer_name: string; office_code: string | null; district: number | null }

// "Andrea  Stewart-Cousins" -> { first: "Andrea", surname: "Stewart-Cousins" }
function parseName(filerName: string): { first: string | null; surname: string | null } {
  const toks = (filerName ?? "").split(/\s+/).map(trimPunct).filter((t) => t.length >= 1);
  if (!toks.length) return { first: null, surname: null };
  return { first: toks[0] || null, surname: toks[toks.length - 1] || null };
}

// deno-lint-ignore no-explicit-any
function mapContribution(r: any, cand: Cand): Record<string, unknown> {
  const org = (r.flng_ent_name ?? "").trim();
  const first = (r.flng_ent_first_name ?? "").trim();
  const last = (r.flng_ent_last_name ?? "").trim();
  const contributor = org || [first, last].filter(Boolean).join(" ") || null;
  const ctype = (r.cntrbr_type_desc ?? "").trim();
  const amt = r.org_amt != null && r.org_amt !== "" ? Number(r.org_amt) : null;
  return {
    legislator_filer_id: cand.filer_id,
    trans_number: String(r.trans_number),
    committee_filer_id: r.filer_id ?? null,
    cand_comm_name: r.cand_comm_name ?? null,
    office_code: cand.office_code,
    district: cand.district,
    contributor,
    contributor_type: ctype || null,
    is_individual: /individual/i.test(ctype) || (!org && !!last),
    city: r.flng_ent_city ?? null,
    state: r.flng_ent_state ?? null,
    zip: r.flng_ent_zip ?? null,
    amount: Number.isFinite(amt as number) ? amt : null,
    sched_date: r.sched_date ? String(r.sched_date).slice(0, 10) : null,
    election_year: /^\d{4}$/.test(String(r.election_year ?? "").trim()) ? parseInt(r.election_year, 10) : null,
    election_type: r.election_type ?? null,
    filing_sched_abbrev: r.filing_sched_abbrev ?? null,
    payment_type: r.payment_type_desc ?? null,
    raw: r,
  };
}

// deno-lint-ignore no-explicit-any
async function discover(supabase: any): Promise<number> {
  const select = encodeURIComponent(
    "filer_id,filer_name,office_desc,district,committee_type_desc,filer_type_desc,filer_status",
  );
  const where = encodeURIComponent("office_desc in('State Senator','Member of Assembly')");
  let offset = 0, upserted = 0;
  const seen = new Set<string>();
  while (true) {
    const url = `${BASE}/${FILERS_DS}.json?$select=${select}&$where=${where}&$order=filer_id&$limit=${PAGE}&$offset=${offset}`;
    const rows = await sodaGet(url);
    if (!rows.length) break;
    const mapped: Record<string, unknown>[] = [];
    for (const r of rows) {
      const id = r.filer_id ? String(r.filer_id) : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      mapped.push({
        filer_id: id,
        filer_name: r.filer_name ?? null,
        office_desc: r.office_desc ?? null,
        office_code: r.office_desc === "State Senator" ? "SEN" : r.office_desc === "Member of Assembly" ? "ASM" : null,
        district: /^\d+$/.test(String(r.district ?? "").trim()) ? parseInt(r.district, 10) : null,
        committee_type_desc: r.committee_type_desc ?? null,
        filer_type_desc: r.filer_type_desc ?? null,
        filer_status: r.filer_status ?? null,
      });
    }
    for (let i = 0; i < mapped.length; i += 500) {
      // contrib_synced_at omitted so re-discovery preserves the cursor.
      const { error } = await supabase.from("ny_filers").upsert(mapped.slice(i, i + 500), { onConflict: "filer_id" });
      if (!error) upserted += Math.min(500, mapped.length - i);
    }
    offset += PAGE;
    if (rows.length < PAGE) break;
    await sleep(200);
  }
  return upserted;
}

// Drain one candidate record: find its committees' monetary contributions by
// matching cand_comm_name to the candidate's name, attribute them to the record.
// deno-lint-ignore no-explicit-any
async function syncCandidate(supabase: any, cand: Cand, errors: string[]): Promise<number> {
  const { first, surname } = parseName(cand.filer_name);
  const now = new Date().toISOString();
  if (!surname || surname.length < 3) {
    await supabase.from("ny_filers").update({ contrib_synced_at: now, last_synced_at: now, last_contrib_count: 0 }).eq("filer_id", cand.filer_id);
    return 0;
  }
  const clauses = [`cand_comm_name like '%${escSoql(surname)}%'`];
  if (first && first.length >= 2) clauses.push(`cand_comm_name like '%${escSoql(first)}%'`);
  clauses.push(`filing_sched_abbrev in(${SCHEDULES})`);
  clauses.push(`sched_date>='${MIN_DATE}'`);
  const where = encodeURIComponent(clauses.join(" AND "));
  const select = encodeURIComponent(
    "trans_number,filer_id,cand_comm_name,flng_ent_name,flng_ent_first_name,flng_ent_last_name," +
    "cntrbr_type_desc,flng_ent_city,flng_ent_state,flng_ent_zip,org_amt,sched_date,election_year," +
    "election_type,filing_sched_abbrev,payment_type_desc",
  );
  let offset = 0, total = 0;
  const seen = new Set<string>();
  while (true) {
    const url = `${BASE}/${DISCLOSURE_DS}.json?$select=${select}&$where=${where}&$order=trans_number&$limit=${PAGE}&$offset=${offset}`;
    const rows = await sodaGet(url);
    if (!rows.length) break;
    const mapped: Record<string, unknown>[] = [];
    for (const r of rows) {
      const tn = r.trans_number ? String(r.trans_number) : null;
      if (!tn || seen.has(tn)) continue;
      seen.add(tn);
      mapped.push(mapContribution(r, cand));
    }
    for (let i = 0; i < mapped.length; i += 1000) {
      const { error } = await supabase.from("ny_contributions")
        .upsert(mapped.slice(i, i + 1000), { onConflict: "legislator_filer_id,trans_number" });
      if (error) errors.push(`contrib ${cand.filer_id}: ${error.message}`);
    }
    total += mapped.length;
    offset += PAGE;
    if (rows.length < PAGE) break;
    await sleep(150);
  }
  await supabase.from("ny_filers")
    .update({ contrib_synced_at: now, last_synced_at: now, last_contrib_count: total })
    .eq("filer_id", cand.filer_id);
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  // deno-lint-ignore no-explicit-any
  let p: Record<string, any> = {};
  if (req.method === "POST") { try { p = await req.json(); } catch { /* query-string only */ } }
  const qp = url.searchParams;
  const num = (v: string | null) => (v == null || v === "" ? null : Number(v));

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const provided = req.headers.get("x-sync-secret") ?? qp.get("secret") ?? "";
  const { data: secretOk, error: secErr } = await supabase.rpc("check_ny_sync_secret", { p_token: provided });
  if (secErr || secretOk !== true) return new Response("Unauthorized", { status: 401, headers: cors });

  const mode = p.mode ?? qp.get("mode") ?? "full";
  const batch = p.batch ?? num(qp.get("batch")) ?? 15;
  const staleDays = p.stale_days ?? num(qp.get("stale_days")) ?? 30;
  const maxFilers = p.max_filers ?? num(qp.get("max_filers"));
  const onlyFiler = p.only_filer ?? qp.get("only_filer");
  const startedMs = Date.now();

  const { data: runRow } = await supabase.from("ny_sync_runs").insert({ status: "running", mode }).select("id").single();
  const runId = runRow?.id;

  let filersUpserted = 0, contribUpserted = 0, filersProcessed = 0;
  let remaining: number | null = null;
  const errors: string[] = [];

  try {
    if (mode === "discover") {
      filersUpserted = await discover(supabase);
    } else {
      if (mode === "full") filersUpserted = await discover(supabase);
      const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
      let q = supabase.from("ny_filers").select("filer_id, filer_name, office_code, district");
      if (onlyFiler) {
        q = q.eq("filer_id", onlyFiler);
      } else {
        q = q.or(`contrib_synced_at.is.null,contrib_synced_at.lt.${cutoff}`)
          .order("contrib_synced_at", { ascending: true, nullsFirst: true })
          .limit(maxFilers ?? batch);
      }
      const { data: due } = await q;
      for (const row of (due ?? []) as Cand[]) {
        if (Date.now() - startedMs > BUDGET_MS) break;
        try {
          contribUpserted += await syncCandidate(supabase, row, errors);
          filersProcessed++;
        } catch (e) {
          errors.push(`filer ${row.filer_id}: ${String(e).slice(0, 150)}`);
        }
        await sleep(120);
      }
      const { count } = await supabase.from("ny_filers")
        .select("filer_id", { count: "exact", head: true })
        .or(`contrib_synced_at.is.null,contrib_synced_at.lt.${cutoff}`);
      remaining = count ?? null;
    }

    await supabase.from("ny_sync_runs").update({
      finished_at: new Date().toISOString(),
      status: errors.length ? "success_with_errors" : "success",
      filers_upserted: filersUpserted, filers_processed: filersProcessed,
      contributions_upserted: contribUpserted, remaining,
      error: errors.length ? errors.slice(0, 20).join(" | ") : null,
      notes: { mode },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, runId, mode, filersUpserted, contributionsUpserted: contribUpserted,
      filersProcessed, remaining, errors: errors.slice(0, 20),
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("ny_sync_runs").update({
      finished_at: new Date().toISOString(), status: "error", error: String(e).slice(0, 500),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
