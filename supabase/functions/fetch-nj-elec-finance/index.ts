// fetch-nj-elec-finance
// Automated ingestion of New Jersey state campaign-finance data (ELEC) into the
// isolated nj_elec_* tables. Source: njelecefilesearch.com JSON API.
//
// FEC only covers federal races, so NJ state legislators (State Senate / State
// Assembly) are pulled from ELEC instead. This runs server-side on a schedule —
// no manual downloads. NJ data is kept separate and is never reconciled against
// the federal FEC pipeline.
//
// Params (query string or JSON body):
//   office_codes      string[]  default ["1","2"]  (1=STATE SENATE, 2=STATE ASSEMBLY)
//   election_years    number[]  default [2025, 2023]
//   max_entities      number    optional cap (for testing / chunking)
//   entity_s          string    optional: sync contributions for one entity only
//   skip_contributions bool     optional: only refresh the entity list

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://www.njelecefilesearch.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ENTITY_COLS = ["ENTITYNAME", "LOCATION", "OFFICE", "PARTY", "ELECTIONTYPE", "ELECTIONYEAR", "ENTITY_S"];
const CONTRIB_COLS = ["CONTRIBUTOR", "CONT_AMT", "CONT_DATE", "ContributionType", "ContributorType", "EMP_NAME", "OccupationName", "ENTITY_S"];

const PARTY_CODE: Record<string, string> = { DEMOCRAT: "1", REPUBLICAN: "2", INDEPENDENT: "3", NONPARTISAN: "4" };
const ETYPE_CODE: Record<string, string> = { GENERAL: "G", PRIMARY: "P", RUNOFF: "R", SPECIAL: "S", INAUGURAL: "I" };

// Build a jQuery-DataTables style x-www-form-urlencoded body. The ELEC API binds
// [FromForm] and requires the `columns` array, so it must be sent this way.
function formBody(extra: Record<string, string>, columns: string[], start = 0, length = 500): string {
  const p = new URLSearchParams();
  p.set("draw", "1");
  p.set("start", String(start));
  p.set("length", String(length));
  p.set("search[value]", "");
  p.set("search[regex]", "false");
  p.set("order[0][column]", "0");
  p.set("order[0][dir]", "asc");
  columns.forEach((c, i) => {
    p.set(`columns[${i}][data]`, c);
    p.set(`columns[${i}][name]`, c);
    p.set(`columns[${i}][searchable]`, "true");
    p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, "");
    p.set(`columns[${i}][search][regex]`, "false");
  });
  for (const [k, v] of Object.entries(extra)) p.set(k, v ?? "");
  return p.toString();
}

async function apiPost(path: string, body: string, referer: string): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": BASE,
      "Referer": referer,
    },
    body,
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function digits(s: any): string | null {
  if (s == null) return null;
  const m = String(s).match(/\d+/);
  return m ? m[0] : null;
}
function toDate(s: any): string | null {
  return typeof s === "string" && s.length >= 10 ? s.slice(0, 10) : null;
}

async function fetchEntities(office: string, year: number): Promise<any[]> {
  const filters = {
    OfficeCodes: office, ElectionYears: String(year), NONPACOnly: "true",
    PartyCodes: "", LocationCodes: "", ElectionTypeCodes: "",
    FirstName: "", LastName: "", MI: "", Suffix: "", NonIndName: "", PACName: "", SortColumn: "", SortBy: "",
  };
  const out: any[] = [];
  let start = 0;
  const length = 500;
  while (true) {
    const j = await apiPost("/api/VWEntity/Entities20", formBody(filters, ENTITY_COLS, start, length), `${BASE}/SearchContributionByEntity`);
    const data: any[] = j?.data ?? [];
    out.push(...data);
    const total = j?.recordsFiltered ?? j?.recordsTotal ?? out.length;
    start += length;
    if (data.length === 0 || start >= total) break;
    await sleep(250);
  }
  return out;
}

async function fetchContributions(entity_s: string): Promise<any[]> {
  const out: any[] = [];
  let start = 0;
  const length = 1000;
  while (true) {
    const j = await apiPost(
      "/api/VWContributionDetail/GetContBitsDataByObject",
      formBody({ ENTITY_S: entity_s }, CONTRIB_COLS, start, length),
      `${BASE}/SearchContributionInteractive?eid=${entity_s}`,
    );
    const data: any[] = j?.data ?? [];
    out.push(...data);
    const total = j?.recordsFiltered ?? j?.recordsTotal ?? out.length;
    start += length;
    if (data.length === 0 || start >= total) break;
    await sleep(250);
  }
  return out;
}

function mapEntity(e: any, officeCode: string) {
  return {
    entity_s: String(e.ENTITY_S),
    entity_name: e.ENTITYNAME ?? null,
    office_code: officeCode,
    office: e.OFFICE ?? null,
    party: e.PARTY ?? null,
    party_code: e.PARTY ? (PARTY_CODE[String(e.PARTY).toUpperCase()] ?? null) : null,
    location: e.LOCATION ?? null,
    location_code: digits(e.LOCATION),
    election_year: e.ELECTIONYEAR ? parseInt(e.ELECTIONYEAR, 10) : null,
    election_type: e.ELECTIONTYPE ?? null,
    election_type_code: e.ELECTIONTYPE ? (ETYPE_CODE[String(e.ELECTIONTYPE).toUpperCase()] ?? null) : null,
    total_contributions: typeof e.TOT_CONT_AMT === "number" ? e.TOT_CONT_AMT : null,
    total_expenditures: typeof e.TOT_EXP_AMT === "number" ? e.TOT_EXP_AMT : null,
    raw: e,
    last_synced_at: new Date().toISOString(),
  };
}

function mapContribution(c: any) {
  return {
    contrib_s: Number(c.CONTRIB_S),
    entity_s: String(c.ENTITY_S),
    contributor: c.CONTRIBUTOR ?? null,
    is_individual: c.IsIndividual === "Y" ? true : c.IsIndividual === "N" ? false : null,
    first_name: c.FIRST_NAME ?? null,
    middle_init: c.MIDDLE_INIT ?? null,
    last_name: c.LAST_NAME ?? null,
    suffix: c.SUFFIX ?? null,
    non_ind_name: c.NON_IND_NAME ?? null,
    street1: c.STREET1 ?? null,
    street2: c.STREET2 ?? null,
    city: c.CITY ?? null,
    state: c.STATE ?? null,
    zip: c.ZIP ?? null,
    cont_type: c.CONT_TYPE ?? null,
    contributor_type: c.ContributorType ?? null,
    contribution_type: c.ContributionType ?? null,
    emp_name: c.EMP_NAME ?? null,
    emp_city: c.EMP_CITY ?? null,
    emp_state: c.EMP_STATE ?? null,
    occupation_code: c.OccupationCode ?? c.OCCUPATION ?? null,
    occupation_name: c.OccupationName ?? null,
    cont_date: toDate(c.CONT_DATE),
    cont_amt: typeof c.CONT_AMT === "number" ? c.CONT_AMT : (c.CONT_AMT ? Number(c.CONT_AMT) : null),
    cand_name: c.CAND_NAME ?? null,
    election_year: c.ELECTIONYEAR ?? null,
    office_code: c.OFFICECODE ?? null,
    party_code: c.PARTYCODE ?? null,
    election_type_code: c.ELECTIONTYPECODE ?? null,
    raw: c,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  let p: any = {};
  if (req.method === "POST") {
    try { p = await req.json(); } catch { /* query-string params only */ }
  }
  const qp = url.searchParams;

  // Optional shared-secret guard. Once NJ_SYNC_SECRET is configured, callers must
  // present it (header x-sync-secret or ?secret=). Until then the function is open
  // (it only writes public data into the isolated nj_elec_* tables).
  const secret = Deno.env.get("NJ_SYNC_SECRET");
  if (secret) {
    const provided = req.headers.get("x-sync-secret") || qp.get("secret");
    if (provided !== secret) return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const officeCodes: string[] = p.office_codes ?? qp.get("office_codes")?.split(",") ?? ["1", "2"];
  const years: number[] = p.election_years ?? qp.get("election_years")?.split(",").map(Number) ?? [2025, 2023];
  const maxEntities: number | null = p.max_entities ?? (qp.get("max_entities") ? Number(qp.get("max_entities")) : null);
  const onlyEntity: string | null = p.entity_s ?? qp.get("entity_s");
  const skipContrib = !!(p.skip_contributions ?? qp.get("skip_contributions"));

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: runRow } = await supabase
    .from("nj_elec_sync_runs")
    .insert({ office_codes: officeCodes, election_years: years, status: "running" })
    .select("id").single();
  const runId = runRow?.id;

  let entitiesUpserted = 0;
  let contribUpserted = 0;
  const errors: string[] = [];

  try {
    let entityList: string[] = [];

    if (onlyEntity) {
      entityList = [onlyEntity];
    } else {
      for (const office of officeCodes) {
        for (const year of years) {
          const ents = await fetchEntities(office, year);
          if (ents.length) {
            const rows = ents.map((e) => mapEntity(e, office));
            for (let i = 0; i < rows.length; i += 500) {
              const { error } = await supabase.from("nj_elec_entities").upsert(rows.slice(i, i + 500), { onConflict: "entity_s" });
              if (error) errors.push(`entities ${office}/${year}: ${error.message}`);
            }
            entitiesUpserted += rows.length;
            entityList.push(...rows.map((r) => r.entity_s));
          }
          await sleep(300);
        }
      }
    }

    if (maxEntities) entityList = entityList.slice(0, maxEntities);

    if (!skipContrib) {
      for (const entity_s of entityList) {
        try {
          const contribs = await fetchContributions(entity_s);
          const seen = new Set<number>();
          const rows = contribs
            .map(mapContribution)
            .filter((r) => Number.isFinite(r.contrib_s) && !seen.has(r.contrib_s) && seen.add(r.contrib_s));
          for (let i = 0; i < rows.length; i += 1000) {
            const { error } = await supabase.from("nj_elec_contributions").upsert(rows.slice(i, i + 1000), { onConflict: "contrib_s" });
            if (error) errors.push(`contrib ${entity_s}: ${error.message}`);
          }
          contribUpserted += rows.length;
        } catch (e) {
          errors.push(`contrib ${entity_s}: ${String(e).slice(0, 150)}`);
        }
        await sleep(300);
      }
    }

    await supabase.from("nj_elec_sync_runs").update({
      finished_at: new Date().toISOString(),
      status: errors.length ? "success_with_errors" : "success",
      entities_upserted: entitiesUpserted,
      contributions_upserted: contribUpserted,
      error: errors.length ? errors.slice(0, 20).join(" | ") : null,
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, runId, officeCodes, years,
      entitiesUpserted, contributionsUpserted: contribUpserted,
      entityCount: entityList.length, errors: errors.slice(0, 20),
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("nj_elec_sync_runs").update({
      finished_at: new Date().toISOString(), status: "error", error: String(e).slice(0, 500),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
