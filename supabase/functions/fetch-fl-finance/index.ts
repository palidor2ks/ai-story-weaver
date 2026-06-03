// fetch-fl-finance
// Automated ingestion of Florida state campaign-finance data into the isolated
// fl_* tables. Source: dos.elections.myflorida.com /cgi-bin/contrib.exe — the
// public "Contributions" query, tab-delimited export (queryformat=2).
//
// FEC covers only federal races, so FL State Representatives (STR) and State
// Senators (STS) are pulled here. Runs server-side on a schedule — no manual
// downloads. FL data is kept separate from the federal FEC and NJ ELEC pipelines.
//
// The CGI has no pagination (only `rowlimit`) and its output omits district, so
// the ingestion unit is (election, office, district): one bounded POST per unit,
// the district attributed from the query context.
//
// Confirmed request recipe (reverse-engineered): POST form-encoded with the FULL
// field set (absent fields 502 the legacy CGI), search_on=2 ("Detail of
// Candidates"), party=All (empty over-filters to zero rows), csort1/csort2 set
// (empty sort => SQL error at origin), queryformat=2 (tab-delimited).
//
// Modes (param `mode`, query string or JSON body):
//   "discover" — (re)enumerate work units for ELECTIONS x OFFICES x districts.
//                New units land with contrib_synced_at = NULL so "drain" picks
//                them up. Fast; fetches no contributions.
//   "drain"    — process the next `batch` units whose contributions are unsynced
//                or stale (older than `stale_days`); resumable. Cron calls this.
//   "full"     — (default) discover then drain up to `max_units` (manual/testing).
//
// Other params: batch(=10), stale_days(=30), max_units, only_unit.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://dos.elections.myflorida.com";
const ENDPOINT = "/cgi-bin/contrib.exe";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BUDGET_MS = 110_000;
const ROW_LIMIT = 50_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Recent generals covering current / most-recent campaigns of sitting FL
// legislators (House: 2-yr terms; Senate: 4-yr). Extend as cycles roll forward.
const ELECTIONS = [
  { id: "20261103-GEN", year: 2026, label: "2026 General Election" },
  { id: "20241105-GEN", year: 2024, label: "2024 General Election" },
  { id: "20221108-GEN", year: 2022, label: "2022 General Election" },
];
const OFFICES = [
  { code: "STR", name: "State Representative", districts: 120 },
  { code: "STS", name: "State Senator", districts: 40 },
];

interface UnitMeta {
  id: string;
  election: string;
  election_year: number;
  election_label: string;
  office_code: string;
  office: string;
  district: number;
}

function allUnits(): UnitMeta[] {
  const out: UnitMeta[] = [];
  for (const e of ELECTIONS) {
    for (const o of OFFICES) {
      for (let d = 1; d <= o.districts; d++) {
        out.push({
          id: `${e.id}|${o.code}|${d}`,
          election: e.id, election_year: e.year, election_label: e.label,
          office_code: o.code, office: o.name, district: d,
        });
      }
    }
  }
  return out;
}

function flBody(election: string, officeCode: string, district: number): string {
  const p = new URLSearchParams();
  p.set("election", election);
  p.set("search_on", "2");          // Detail of Candidates
  p.set("CanFName", ""); p.set("CanLName", ""); p.set("CanNameSrch", "2");
  p.set("office", officeCode);
  p.set("cdistrict", String(district));
  p.set("cgroup", ""); p.set("party", "All");
  p.set("ComName", ""); p.set("ComNameSrch", "2");
  p.set("cfname", ""); p.set("clname", ""); p.set("namesearch", "2");
  p.set("ccity", ""); p.set("cstate", ""); p.set("czipcode", ""); p.set("coccupation", "");
  p.set("cdollar_minimum", ""); p.set("cdollar_maximum", "");
  p.set("rowlimit", String(ROW_LIMIT));
  p.set("cdatefrom", ""); p.set("cdateto", "");
  p.set("csort1", "DAT"); p.set("csort2", "NAM");
  p.set("queryformat", "2");        // tab-delimited text file
  p.set("Submit", "Submit");
  return p.toString();
}

async function fetchDistrictTsv(election: string, officeCode: string, district: number): Promise<string> {
  const res = await fetch(BASE + ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "Accept": "text/plain, */*",
    },
    body: flBody(election, officeCode, district),
  });
  if (!res.ok) throw new Error(`POST ${officeCode} d${district} -> ${res.status}`);
  return res.text();
}

// "Smith, David  (REP)(STR)" -> { name: "Smith, David", party: "REP" }
function parseCandidate(raw: string): { name: string; party: string | null } {
  const m = raw.match(/\(([A-Za-z]{2,5})\)\([A-Za-z]{2,5}\)\s*$/);
  const party = m ? m[1] : null;
  const name = raw.replace(/\s*\([A-Za-z]{2,5}\)\([A-Za-z]{2,5}\)\s*$/, "").replace(/\s+/g, " ").trim();
  return { name, party };
}

function toISO(d: string | undefined): string | null {
  const m = (d ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const ORG_RE = /( INC\b|\bINC\.| LLC\b| L\.L\.C| CORP| CO\.| COMPANY| ASSOCIATION| ASSN\b| PAC\b|COMMITTEE| UNION\b| PARTY\b| FUND\b| LLP\b| L\.P\b| FOUNDATION| ENTERPRISES| HOLDINGS| PARTNERS| SYSTEMS| BANK\b)/;
function isIndividual(contributor: string, occupation: string): boolean {
  const o = (occupation ?? "").toUpperCase();
  if (o.includes("COMMITTEE") || o.includes("POLITICAL")) return false;
  if (ORG_RE.test(" " + (contributor ?? "").toUpperCase() + " ")) return false;
  return true;
}

// cyrb53: fast, low-collision 53-bit string hash -> deterministic, idempotent
// row ids (FL gives no contribution id). Scoped by unit so collisions are local.
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function parseTsv(tsv: string, u: UnitMeta): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const line of tsv.split(/\r?\n/)) {
    if (!line || !line.includes("\t")) continue;
    const f = line.split("\t");
    const candRaw = (f[0] ?? "").trim();
    if (candRaw === "Candidate/Committee") continue;       // header
    if (!/\((?:STR|STS)\)\s*$/.test(candRaw)) continue;    // candidate rows only
    const { name, party } = parseCandidate(candRaw);
    const id = `${u.id}-${cyrb53(line).toString(36)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const amtRaw = (f[2] ?? "").replace(/[^0-9.\-]/g, "");
    const contributor = (f[4] ?? "").trim() || null;
    const occupation = (f[7] ?? "").trim() || null;
    rows.push({
      id,
      unit_id: u.id,
      election: u.election,
      election_year: u.election_year,
      office_code: u.office_code,
      district: u.district,
      candidate_raw: candRaw,
      candidate_name: name,
      candidate_party: party,
      cont_date: toISO(f[1]),
      amount: amtRaw === "" ? null : Number(amtRaw),
      typ: (f[3] ?? "").trim() || null,
      contributor,
      address: (f[5] ?? "").trim() || null,
      city_state_zip: (f[6] ?? "").trim() || null,
      occupation,
      inkind_desc: (f[8] ?? "").trim() || null,
      is_individual: contributor ? isIndividual(contributor, occupation ?? "") : null,
      raw: line,
    });
  }
  return rows;
}

// deno-lint-ignore no-explicit-any
async function discover(supabase: any): Promise<number> {
  const rows = allUnits().map((u) => ({
    id: u.id, election: u.election, election_year: u.election_year, election_label: u.election_label,
    office_code: u.office_code, office: u.office, district: u.district,
  }));
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    // contrib_synced_at intentionally omitted so re-discovery preserves the cursor.
    const { error } = await supabase.from("fl_finance_units").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (!error) upserted += Math.min(500, rows.length - i);
  }
  return upserted;
}

// deno-lint-ignore no-explicit-any
async function syncUnit(supabase: any, u: UnitMeta, errors: string[]): Promise<number> {
  const tsv = await fetchDistrictTsv(u.election, u.office_code, u.district);
  const rows = parseTsv(tsv, u);
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await supabase.from("fl_contributions").upsert(rows.slice(i, i + 1000), { onConflict: "id" });
    if (error) errors.push(`contrib ${u.id}: ${error.message}`);
  }
  const now = new Date().toISOString();
  await supabase.from("fl_finance_units")
    .update({ contrib_synced_at: now, last_synced_at: now, last_row_count: rows.length })
    .eq("id", u.id);
  return rows.length;
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

  // Secret gate (Vault-backed via SECURITY DEFINER RPC) — only cron / authorized
  // callers proceed. The secret never lives in a function env var.
  const provided = req.headers.get("x-sync-secret") ?? qp.get("secret") ?? "";
  const { data: secretOk, error: secErr } = await supabase.rpc("check_fl_sync_secret", { p_token: provided });
  if (secErr || secretOk !== true) return new Response("Unauthorized", { status: 401, headers: cors });

  const mode = p.mode ?? qp.get("mode") ?? "full";
  const batch = p.batch ?? num(qp.get("batch")) ?? 10;
  const staleDays = p.stale_days ?? num(qp.get("stale_days")) ?? 30;
  const maxUnits = p.max_units ?? num(qp.get("max_units"));
  const onlyUnit = p.only_unit ?? qp.get("only_unit");
  const startedMs = Date.now();

  const { data: runRow } = await supabase.from("fl_sync_runs").insert({ status: "running", mode }).select("id").single();
  const runId = runRow?.id;

  let unitsUpserted = 0, contribUpserted = 0, unitsProcessed = 0;
  let remaining: number | null = null;
  const errors: string[] = [];

  try {
    if (mode === "discover") {
      unitsUpserted = await discover(supabase);
    } else {
      if (mode === "full") unitsUpserted = await discover(supabase);
      const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
      let q = supabase.from("fl_finance_units")
        .select("id, election, election_year, election_label, office_code, office, district");
      if (onlyUnit) {
        q = q.eq("id", onlyUnit);
      } else {
        q = q.or(`contrib_synced_at.is.null,contrib_synced_at.lt.${cutoff}`)
          .order("contrib_synced_at", { ascending: true, nullsFirst: true })
          .limit(maxUnits ?? batch);
      }
      const { data: due } = await q;
      for (const row of due ?? []) {
        if (Date.now() - startedMs > BUDGET_MS) break;
        try {
          contribUpserted += await syncUnit(supabase, row as UnitMeta, errors);
          unitsProcessed++;
        } catch (e) {
          errors.push(`unit ${row.id}: ${String(e).slice(0, 150)}`);
        }
        await sleep(200);
      }
      const { count } = await supabase.from("fl_finance_units")
        .select("id", { count: "exact", head: true })
        .or(`contrib_synced_at.is.null,contrib_synced_at.lt.${cutoff}`);
      remaining = count ?? null;
    }

    await supabase.from("fl_sync_runs").update({
      finished_at: new Date().toISOString(),
      status: errors.length ? "success_with_errors" : "success",
      units_upserted: unitsUpserted, units_processed: unitsProcessed,
      contributions_upserted: contribUpserted, remaining,
      error: errors.length ? errors.slice(0, 20).join(" | ") : null,
      notes: { mode },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, runId, mode, unitsUpserted, contributionsUpserted: contribUpserted,
      unitsProcessed, remaining, errors: errors.slice(0, 20),
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("fl_sync_runs").update({
      finished_at: new Date().toISOString(), status: "error", error: String(e).slice(0, 500),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
