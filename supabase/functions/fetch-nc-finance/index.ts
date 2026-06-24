// fetch-nc-finance
// Automated ingestion of North Carolina NCSBE state campaign-finance data into
// the nc_* tables. Source: NCSBE S3 annual bulk ZIPs, one per calendar year.
// Each ZIP contains a single CSV of all county-level contributions for that year.
// State Senate + State House candidates only (FEC doesn't cover NC state races).
//
// URL pattern:
//   https://s3.amazonaws.com/dl.ncsbe.gov/campaign-finance/year/{year}/
//   NC-FullContributionsAllCounties-{year}.zip
//
// Because a full-year CSV can be 100–300 MB compressed, the ZIP is read via HTTP
// Range requests (no full download) — the same strategy as fetch-tx-finance.
// Per-year progress is tracked in nc_sync_progress for resumability.
//
// Modes (param `mode`): discover | drain | full (default).
// Other params: only_year(int), max_years(int), row_cap(=10000), skip_years_before(=2016).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const NCSBE_BASE = "https://s3.amazonaws.com/dl.ncsbe.gov/campaign-finance/year";
const UA = "Mozilla/5.0 (Polipulse civic-data ingest)";
const TIME_BUDGET_MS = 110_000;
const UPSERT_BATCH = 1_000;
const DEFAULT_ROW_CAP = 10_000;
const FIRST_YEAR = 2016;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function zipUrl(year: number): string {
  return `${NCSBE_BASE}/${year}/NC-FullContributionsAllCounties-${year}.zip`;
}

async function headFile(url: string): Promise<{ size: number; etag: string }> {
  const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HEAD ${url} -> ${r.status}`);
  await r.body?.cancel();
  const size = Number(r.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) throw new Error(`missing content-length for ${url}`);
  return { size, etag: r.headers.get("etag") ?? "" };
}

async function getRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Range: `bytes=${start}-${end}` } });
  if (r.status !== 206) throw new Error(`Range ${start}-${end} from ${url} -> ${r.status} (expected 206)`);
  return new Uint8Array(await r.arrayBuffer());
}

async function getRangeStream(url: string, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Range: `bytes=${start}-${end}` } });
  if (r.status !== 206 || !r.body) throw new Error(`Range stream ${start}-${end} -> ${r.status}`);
  return r.body;
}

// ---------------------------------------------------------------------------
// Minimal ZIP central-directory reader (classic EOCD, no ZIP64)
// ---------------------------------------------------------------------------
interface ZipEntry {
  name: string;
  method: number;    // 0 = stored, 8 = deflate
  compSize: number;
  uncompSize: number;
  localOffset: number;
}

function dv(b: Uint8Array) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

async function readEOCD(url: string, size: number): Promise<{ cdOffset: number; cdSize: number }> {
  const tailLen = Math.min(size, 65_557);
  const tail = await getRange(url, size - tailLen, size - 1);
  const sig = 0x06054b50;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv(tail).getUint32(i, true) === sig) {
      const d = dv(tail.subarray(i));
      return {
        cdSize: d.getUint32(12, true),
        cdOffset: d.getUint32(16, true),
      };
    }
  }
  throw new Error("EOCD signature not found");
}

async function readZipEntries(url: string, size: number): Promise<ZipEntry[]> {
  const { cdOffset, cdSize } = await readEOCD(url, size);
  const cd = await getRange(url, cdOffset, cdOffset + cdSize - 1);
  const d = dv(cd);
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && d.getUint32(p, true) === 0x02014b50) {
    const method = d.getUint16(p + 10, true);
    const compSize = d.getUint32(p + 20, true);
    const uncompSize = d.getUint32(p + 24, true);
    const nameLen = d.getUint16(p + 28, true);
    const extraLen = d.getUint16(p + 30, true);
    const commentLen = d.getUint16(p + 32, true);
    const localOffset = d.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function memberDataRange(url: string, e: ZipEntry): Promise<{ start: number; end: number }> {
  const hdr = await getRange(url, e.localOffset, e.localOffset + 29);
  const d = dv(hdr);
  if (d.getUint32(0, true) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
  const nameLen = d.getUint16(26, true);
  const extraLen = d.getUint16(28, true);
  const start = e.localOffset + 30 + nameLen + extraLen;
  return { start, end: start + e.compSize - 1 };
}

// ---------------------------------------------------------------------------
// Streaming inflate + RFC 4180 CSV parser
// ---------------------------------------------------------------------------
function inflateToText(bytes: ReadableStream<Uint8Array>, method: number): ReadableStream<string> {
  const decompressed = method === 8
    ? bytes.pipeThrough(new DecompressionStream("deflate-raw"))
    : bytes;
  return decompressed.pipeThrough(new TextDecoderStream());
}

async function* csvRecords(
  textStream: ReadableStream<string>,
  skipDataRows = 0,
): AsyncGenerator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let headerDone = false;
  let dataRowsSeen = 0;
  const reader = textStream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      const skipping = headerDone && dataRowsSeen < skipDataRows;
      if (inQuotes) {
        if (c === '"') {
          if (value[i + 1] === '"') { if (!skipping) field += '"'; i++; }
          else inQuotes = false;
        } else { if (!skipping) field += c; }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        if (!skipping) { row.push(field); field = ""; }
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && value[i + 1] === "\n") i++;
        if (!skipping) {
          row.push(field); field = "";
          if (row.length > 1 || row[0] !== "") {
            yield row;
            if (!headerDone) headerDone = true; else dataRowsSeen++;
          }
          row = []; field = "";
        } else {
          dataRowsSeen++;
          field = ""; row = [];
        }
      } else {
        if (!skipping) field += c;
      }
    }
  }
  if (!(headerDone && dataRowsSeen < skipDataRows) && (field !== "" || row.length)) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
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
  // Accepts "MM/DD/YYYY" (NCSBE standard) or ISO "YYYY-MM-DD"
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function electionYear(dateStr: string | null, cycleEnd: string | null): number | null {
  const d = toDate(dateStr) ?? toDate(cycleEnd);
  if (!d) return null;
  return parseInt(d.slice(0, 4), 10);
}

// ---------------------------------------------------------------------------
// Core drain: process one year's CSV from the ZIP
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function drainYear(supabase: any, year: number, rowCap: number, startedMs: number): Promise<{ rows: number; finished: boolean }> {
  const url = zipUrl(year);
  const { size } = await headFile(url);
  const entries = await readZipEntries(url, size);

  // Find the contributions CSV in the archive (name ends in .csv)
  const csvEntry = entries.find((e) => /\.csv$/i.test(e.name));
  if (!csvEntry) throw new Error(`No CSV entry found in ${url}`);

  const { data: prog } = await supabase.from("nc_sync_progress")
    .select("rows_done").eq("year", year).maybeSingle();
  const skip = prog?.rows_done ?? 0;

  const { start, end } = await memberDataRange(url, csvEntry);
  const rawStream = await getRangeStream(url, start, end);
  const textStream = inflateToText(rawStream, csvEntry.method);

  let header: string[] | null = null;
  let map: ((row: string[]) => (k: string) => string | null) | null = null;
  let batch: Record<string, unknown>[] = [];
  let processed = 0;
  let finished = true;
  const now = new Date().toISOString();

  const flush = async () => {
    if (!batch.length) return;
    const { error } = await supabase.from("nc_contributions")
      .upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`upsert nc_contributions: ${error.message}`);
    batch = [];
  };

  for await (const row of csvRecords(textStream, skip)) {
    if (!header) { header = row; map = rowMapper(header); continue; }
    processed++;
    const g = map!(row);

    const offRaw = g("office");
    const oc = officeCode(offRaw);
    // Skip non-legislative offices (governor, council of state, local, etc.)
    if (oc === null) continue;

    const juris = g("jurisdiction");
    const dateStr = g("date_occurred");
    const cycleEnd = g("election_cycle_end_date");
    const contType = g("contributor_type") ?? "";
    const contName = g("contributor_full_name");
    const amt = g("amount");
    const rowNum = skip + processed;

    batch.push({
      id: `${year}-${rowNum}`,
      source_year: year,
      account_code: g("account_code"),
      committee_name: g("committee_name"),
      candidate_full_name: g("candidate_full_name"),
      candidate_first_name: g("candidate_first_name"),
      candidate_last_name: g("candidate_last_name"),
      office_code: oc,
      office_raw: offRaw,
      district: extractDistrict(juris),
      jurisdiction: juris,
      party: g("party"),
      contributor: contName,
      contributor_type: contType || null,
      is_individual: /^IND$/i.test(contType),
      city: null,    // NCSBE full-county file omits street/city for individuals
      state: null,
      zip: null,
      employer: g("contributor_employer_name"),
      amount: amt !== null ? Number(amt) : null,
      date_occurred: toDate(dateStr),
      election_year: electionYear(dateStr, cycleEnd),
      report_name: g("report_name"),
      synced_at: now,
    });

    if (batch.length >= UPSERT_BATCH) await flush();
    if (processed >= rowCap || Date.now() - startedMs > TIME_BUDGET_MS) {
      finished = false; break;
    }
  }
  await flush();

  const rowsDone = skip + processed;
  await supabase.from("nc_sync_progress").upsert({
    year,
    status: finished ? "done" : "pending",
    rows_done: rowsDone,
    rows_upserted: rowsDone,
    last_run_at: now,
    error: null,
  }, { onConflict: "year" });
  return { rows: processed, finished };
}

// ---------------------------------------------------------------------------
// discover: verify which years are available on S3 and seed nc_sync_progress
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function discover(supabase: any, skipYearsBefore: number): Promise<{ seeded: number[]; unavailable: number[] }> {
  const currentYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = skipYearsBefore; y <= currentYear; y++) years.push(y);

  const seeded: number[] = [];
  const unavailable: number[] = [];

  for (const year of years) {
    try {
      await headFile(zipUrl(year));
      // Seed the progress row only if it doesn't already exist (ignoreDuplicates = true
      // so a re-discover doesn't reset a partially-done year's cursor).
      const { error } = await supabase.from("nc_sync_progress").upsert({
        year, status: "pending",
      }, { onConflict: "year", ignoreDuplicates: true });
      if (!error) seeded.push(year);
    } catch {
      unavailable.push(year);
    }
  }
  return { seeded, unavailable };
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

    // full mode: seed missing years first
    if (mode === "full") await discover(supabase, skipYearsBefore);

    // drain: pick pending years and process up to maxYears
    const yearsProcessed: number[] = [];
    let contribUpserted = 0;

    let q = supabase.from("nc_sync_progress").select("year").eq("status", "pending")
      .order("year", { ascending: false });  // most recent years first (more relevant data)
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

    return Response.json({
      ok: true, mode, yearsProcessed, contributionsUpserted: contribUpserted, remaining,
    });
  } catch (e) {
    await supabase.from("nc_sync_runs").update({
      status: "error", finished_at: new Date().toISOString(), error: String(e).slice(0, 500),
    }).eq("id", runId);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
