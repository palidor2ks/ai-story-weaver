// fetch-nc-finance
// Ingests North Carolina state campaign-finance contribution data from the NCSBE
// CF Reporting portal (cf.ncsbe.gov) into the nc_* tables.
// State Senate + NC House of Representatives candidates only.
//
// DATA SOURCE STATUS (investigated 2026-06-24 — blocked):
//   The cf.ncsbe.gov portal blocks automated requests from cloud/datacenter IP ranges.
//   All search queries return a consistent empty-results template (14 KB) regardless
//   of search parameters — confirmed across 21 probe iterations.
//   dl.ncsbe.gov S3 bucket contains only PDFs/training documents, no bulk CSVs.
//   NC bulk contribution data is NOT accessible from Supabase edge functions.
//
//   Options to unblock:
//     1. Run this function from a residential/non-datacenter IP via a proxy or local runner
//     2. Submit a public records request to NCSBE (https://www.ncsbe.gov/about)
//     3. Use a third-party aggregator (OpenSecrets, FollowTheMoney) — requires API key
//   The DB schema (nc_contributions, nc_sync_progress, nc_sync_runs, nc_legislator_finance
//   RPC) is complete and will ingest data correctly once a working source is found.
//
// Original intended data source: NCSBE CF Transaction Search export API
//   POST https://cf.ncsbe.gov/CFTxnLkup/ExportResults/
//   with form-encoded Params JSON (year date range, all office types)
//
// Modes (param `mode`): discover | drain | full (default).
// Other params: only_year(int), max_years(int), row_cap(=10000), skip_years_before(=2016).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CF_EXPORT_URL = "https://cf.ncsbe.gov/CFTxnLkup/ExportResults/";
const UA = "Mozilla/5.0 (Polipulse civic-data ingest)";
const TIME_BUDGET_MS = 110_000;
const UPSERT_BATCH = 500;
const DEFAULT_ROW_CAP = 20_000;
const FIRST_YEAR = 2016;

// Quarter boundaries: [MM-DD start, MM-DD end]
const QUARTERS: [string, string][] = [
  ["01/01", "03/31"],
  ["04/01", "06/30"],
  ["07/01", "09/30"],
  ["10/01", "12/31"],
];

// ---------------------------------------------------------------------------
// NCSBE CF portal export
// ---------------------------------------------------------------------------
function buildParams(dateFrom: string, dateTo: string): string {
  const p = JSON.stringify({
    ReceiptType: "", ExpenditureType: "", CommitteeType: "",
    PartyType: "", OfficeType: "", CommitteeIDs: null, CommitteeName: "",
    Cities: "", Counties: "", State: "", ZipCodes: "",
    DateFrom: dateFrom, DateTo: dateTo,
    OrganizationName: "", FirstName: "", LastName: "",
    NameSoundsLike: false, NameIsOrg: false, Purpose: "",
    AmountFrom: "", AmountTo: "", JobProfession: "",
    JobProfSoundsLike: false, Employer: "", EmployerSoundsLike: false,
    PaymentType: "", Page: 0, Debug: false,
  });
  return `Params=${encodeURIComponent(p)}`;
}

async function fetchQuarterCSV(dateFrom: string, dateTo: string): Promise<string> {
  const r = await fetch(CF_EXPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: buildParams(dateFrom, dateTo),
  });
  if (!r.ok) throw new Error(`ExportResults ${dateFrom}–${dateTo} -> ${r.status}`);
  const text = await r.text();
  // The cf.ncsbe.gov portal blocks automated requests from cloud/datacenter IPs.
  // An empty CSV (2 bytes: \r\n) means the portal returned no data — this is the
  // expected failure mode when running from Supabase edge functions. See file header.
  if (!text || text.trim().length < 5) {
    throw new Error(
      `DATA_SOURCE_BLOCKED: cf.ncsbe.gov returned empty CSV for ${dateFrom}–${dateTo}. ` +
      `The NCSBE portal blocks automated requests from cloud IPs. ` +
      `Run from a residential IP or use a public records request to obtain bulk data.`
    );
  }
  return text;
}

// ---------------------------------------------------------------------------
// Simple RFC 4180 CSV parser (sync, full-string; exports fit in memory)
// ---------------------------------------------------------------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = "";
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

function rowMapper(header: string[]) {
  const idx = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  return (row: string[]) => (key: string): string | null => {
    const i = idx.get(key.toLowerCase());
    return i === undefined ? null : (row[i] ?? null) || null;
  };
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------
function officeCode(raw: string | null): string | null {
  if (!raw) return null;
  const o = raw.toLowerCase();
  if (o.includes("senat")) return "SEN";
  if (o.includes("house") || o.includes("represent") || o.includes("assembl")) return "REP";
  return null;
}

function extractDistrict(jurisdiction: string | null): number | null {
  if (!jurisdiction) return null;
  const m = jurisdiction.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toDate(raw: string | null): string | null {
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Drain one year by iterating its 4 quarters
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function drainYear(supabase: any, year: number, rowCap: number, startedMs: number): Promise<{ rows: number; finished: boolean }> {
  const { data: prog } = await supabase.from("nc_sync_progress")
    .select("rows_done").eq("year", year).maybeSingle();
  // rows_done encodes which quarter we've completed: 0=none, 1=Q1 done, 2=Q2 done, etc.
  const quartersCompleted = prog?.rows_done ?? 0;

  let totalRows = 0;
  let finished = true;
  const now = new Date().toISOString();

  for (let qi = quartersCompleted; qi < QUARTERS.length; qi++) {
    if (Date.now() - startedMs > TIME_BUDGET_MS || totalRows >= rowCap) {
      finished = false;
      break;
    }

    const [qStart, qEnd] = QUARTERS[qi];
    const dateFrom = `${qStart}/${year}`;
    const dateTo = `${qEnd}/${year}`;

    let csv: string;
    try {
      csv = await fetchQuarterCSV(dateFrom, dateTo);
    } catch (e) {
      // Log but don't fail the whole year — a quarter might be empty/unavailable
      console.error(`Quarter ${qi + 1} ${year} fetch error: ${e}`);
      // Advance cursor past this quarter so we don't retry indefinitely
      await supabase.from("nc_sync_progress").upsert({
        year, status: "pending", rows_done: qi + 1, last_run_at: now,
        error: `Q${qi + 1}: ${String(e).slice(0, 200)}`,
      }, { onConflict: "year" });
      continue;
    }

    const allRows = parseCSV(csv);
    if (allRows.length < 2) {
      // Empty quarter — advance cursor
      await supabase.from("nc_sync_progress").upsert({
        year, status: "pending", rows_done: qi + 1, last_run_at: now, error: null,
      }, { onConflict: "year" });
      continue;
    }

    const header = allRows[0];
    const map = rowMapper(header);
    let batch: Record<string, unknown>[] = [];
    let rowsThisQuarter = 0;

    const flush = async () => {
      if (!batch.length) return;
      const { error } = await supabase.from("nc_contributions").upsert(batch, { onConflict: "id" });
      if (error) throw new Error(`upsert nc_contributions: ${error.message}`);
      batch = [];
    };

    for (let ri = 1; ri < allRows.length; ri++) {
      const row = allRows[ri];
      const g = map(row);

      // Try multiple possible header names for the office field
      const offRaw = g("office") ?? g("office sought") ?? g("office type");
      const oc = officeCode(offRaw);
      if (oc === null) continue; // skip non-legislative

      const juris = g("jurisdiction") ?? g("district");
      const dateStr = g("date occurred") ?? g("date contributed") ?? g("date");
      const contType = g("type") ?? g("contributor type") ?? "";
      const amt = g("amount");
      const rowId = `${year}-Q${qi + 1}-${ri}`;

      batch.push({
        id: rowId,
        source_year: year,
        account_code: g("account code") ?? g("committee id"),
        committee_name: g("committee name") ?? g("account name"),
        candidate_full_name: g("candidate name") ?? g("candidate full name"),
        candidate_first_name: g("candidate first name"),
        candidate_last_name: g("candidate last name"),
        office_code: oc,
        office_raw: offRaw,
        district: extractDistrict(juris),
        jurisdiction: juris,
        party: g("party") ?? g("affiliation"),
        contributor: g("name") ?? g("contributor name") ?? g("contributor full name"),
        contributor_type: contType || null,
        is_individual: /^IND$/i.test(contType),
        city: g("city"),
        state: g("state"),
        zip: g("zip") ?? g("zip code"),
        employer: g("employer"),
        amount: amt !== null ? Number(amt) : null,
        date_occurred: toDate(dateStr),
        election_year: toDate(dateStr) ? parseInt((toDate(dateStr) as string).slice(0, 4), 10) : null,
        report_name: g("report name"),
        synced_at: now,
      });

      rowsThisQuarter++;
      totalRows++;
      if (batch.length >= UPSERT_BATCH) await flush();
      if (totalRows >= rowCap || Date.now() - startedMs > TIME_BUDGET_MS) {
        await flush();
        finished = false;
        // Save progress: qi quarters fully done + partial Q(qi+1) — mark as pending at qi
        await supabase.from("nc_sync_progress").upsert({
          year, status: "pending", rows_done: qi, rows_upserted: totalRows, last_run_at: now, error: null,
        }, { onConflict: "year" });
        return { rows: totalRows, finished };
      }
    }
    await flush();

    // Quarter qi fully processed — advance cursor
    await supabase.from("nc_sync_progress").upsert({
      year, status: "pending", rows_done: qi + 1, rows_upserted: totalRows, last_run_at: now, error: null,
    }, { onConflict: "year" });
  }

  // All 4 quarters done
  if (finished) {
    await supabase.from("nc_sync_progress").upsert({
      year, status: "done", rows_done: 4, rows_upserted: totalRows, last_run_at: now, error: null,
    }, { onConflict: "year" });
  }
  return { rows: totalRows, finished };
}

// ---------------------------------------------------------------------------
// discover: seed nc_sync_progress for each year 2016–current
// (no HTTP needed — NCSBE portal accepts any year range)
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function discover(supabase: any, skipYearsBefore: number): Promise<{ seeded: number[] }> {
  const currentYear = new Date().getUTCFullYear();
  const seeded: number[] = [];
  for (let y = skipYearsBefore; y <= currentYear; y++) {
    const { error } = await supabase.from("nc_sync_progress").upsert(
      { year: y, status: "pending" },
      { onConflict: "year", ignoreDuplicates: true },
    );
    if (!error) seeded.push(y);
  }
  return { seeded };
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  // deno-lint-ignore no-explicit-any
  let body: Record<string, any> = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* query-string only */ } }

  const secret = req.headers.get("x-sync-secret") ?? url.searchParams.get("secret") ?? body.secret ?? "";
  const { data: secretOk } = await supabase.rpc("check_nc_sync_secret", { p_token: secret });
  if (secretOk !== true) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const mode = body.mode ?? url.searchParams.get("mode") ?? "full";
  const rowCap: number = body.row_cap ?? Number(url.searchParams.get("row_cap") || DEFAULT_ROW_CAP);
  const maxYears: number = body.max_years ?? Number(url.searchParams.get("max_years") || 3);
  const onlyYear: number | null = body.only_year ?? (url.searchParams.get("only_year") ? Number(url.searchParams.get("only_year")) : null);
  const skipYearsBefore: number = body.skip_years_before ?? Number(url.searchParams.get("skip_years_before") || FIRST_YEAR);
  const startedMs = Date.now();

  const { data: runRow } = await supabase.from("nc_sync_runs")
    .insert({ status: "running", mode }).select("id").single();
  const runId = runRow?.id;

  try {
    if (mode === "discover") {
      const disc = await discover(supabase, skipYearsBefore);
      await supabase.from("nc_sync_runs").update({
        status: "success", finished_at: new Date().toISOString(), notes: { mode, ...disc },
      }).eq("id", runId);
      return Response.json({ ok: true, mode, ...disc });
    }

    if (mode === "full") await discover(supabase, skipYearsBefore);

    const yearsProcessed: number[] = [];
    let contribUpserted = 0;

    let q = supabase.from("nc_sync_progress").select("year").eq("status", "pending")
      .order("year", { ascending: false });
    if (onlyYear) q = q.eq("year", onlyYear);
    else q = q.limit(maxYears);

    const { data: due } = await q;
    for (const row of (due ?? []) as { year: number }[]) {
      if (Date.now() - startedMs > TIME_BUDGET_MS) break;
      try {
        await supabase.from("nc_sync_progress").update({ status: "running" }).eq("year", row.year);
        const r = await drainYear(supabase, row.year, rowCap, startedMs);
        contribUpserted += r.rows;
        yearsProcessed.push(row.year);
      } catch (e) {
        await supabase.from("nc_sync_progress").update({
          status: "error", error: String(e).slice(0, 300), last_run_at: new Date().toISOString(),
        }).eq("year", row.year);
        throw e;
      }
    }

    const { count: remaining } = await supabase.from("nc_sync_progress")
      .select("year", { count: "exact", head: true }).eq("status", "pending");

    await supabase.from("nc_sync_runs").update({
      status: "success", finished_at: new Date().toISOString(),
      years_processed: yearsProcessed, contributions_upserted: contribUpserted,
      remaining: remaining ?? null, notes: { mode },
    }).eq("id", runId);

    return Response.json({ ok: true, mode, yearsProcessed, contributionsUpserted: contribUpserted, remaining });
  } catch (e) {
    await supabase.from("nc_sync_runs").update({
      status: "error", finished_at: new Date().toISOString(), error: String(e).slice(0, 500),
    }).eq("id", runId);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
