// Texas Ethics Commission (TEC) state campaign-finance ingestion.
//
// TEC publishes ONE ~1 GB bulk ZIP (TEC_CF_CSV.zip) of all e-filed reports since
// 2000-07-01. Too big to download whole in an edge function — but the CDN supports
// HTTP Range, so we read the ZIP by random access:
//   discover: Range-read End-of-Central-Directory + central directory, enumerate the
//             member files we care about (filers.csv, contribs_##.csv, cont_ss/cont_t),
//             and seed tx_cf_shard_progress. Resets progress when a new dump is published
//             (ZIP Last-Modified changed).
//   drain:    pick the next pending shard, Range-GET just its compressed bytes, inflate
//             (raw DEFLATE via DecompressionStream), parse CSV, batch-upsert, mark done.
//
// Isolated from the FEC pipeline (tx_cf_* tables only). Mirrors the NJ/FL playbook,
// adapted to the bulk-ZIP model. Source layout:
//   https://www.ethics.state.tx.us/data/search/cf/CFS-ReadMe.txt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ZIP_URL = "https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip";
const UA = "Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)";
const TIME_BUDGET_MS = 110_000;
const UPSERT_BATCH = 1000;
// Cap data rows processed per shard per invocation — a single shard inflates to
// 20-120 MB / hundreds of thousands of rows, which exceeds the worker's
// memory/CPU in one pass. rows_done in tx_cf_shard_progress resumes mid-shard.
const ROW_CAP = 10_000;

// Member files worth ingesting. filers.csv = the "who"; contribs/cont_ss/cont_t = the "what".
const WANT = (name: string) =>
  name === "filers.csv" ||
  /^contribs_\d+\.csv$/i.test(name) ||
  name === "cont_ss.csv" ||
  name === "cont_t.csv";

// ---------------------------------------------------------------------------
// HTTP Range helpers
// ---------------------------------------------------------------------------
async function headZip(): Promise<{ size: number; lastModified: string }> {
  const r = await fetch(ZIP_URL, { method: "HEAD", headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HEAD ${ZIP_URL} -> ${r.status}`);
  await r.body?.cancel();
  const size = Number(r.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) throw new Error("missing content-length");
  return { size, lastModified: r.headers.get("last-modified") ?? "" };
}

async function getRange(start: number, end: number): Promise<Uint8Array> {
  // inclusive byte range
  const r = await fetch(ZIP_URL, { headers: { "User-Agent": UA, Range: `bytes=${start}-${end}` } });
  if (r.status !== 206) throw new Error(`Range ${start}-${end} -> ${r.status} (expected 206)`);
  return new Uint8Array(await r.arrayBuffer());
}

async function getRangeStream(start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  const r = await fetch(ZIP_URL, { headers: { "User-Agent": UA, Range: `bytes=${start}-${end}` } });
  if (r.status !== 206 || !r.body) throw new Error(`Range stream ${start}-${end} -> ${r.status}`);
  return r.body;
}

// ---------------------------------------------------------------------------
// Minimal ZIP central-directory reader (no ZIP64 — file is ~1 GB, < 4 GB and
// < 65535 entries, so the classic EOCD/CD records apply).
// ---------------------------------------------------------------------------
interface ZipEntry {
  name: string;
  method: number;       // 0 = stored, 8 = deflate
  compSize: number;
  uncompSize: number;
  localOffset: number;  // offset of the local file header
}

function dv(b: Uint8Array) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

async function readEOCD(size: number): Promise<{ cdOffset: number; cdSize: number; count: number }> {
  // EOCD is in the last 22 bytes (+ up to 65535 comment). Scan the tail for the signature.
  const tailLen = Math.min(size, 65_557);
  const tail = await getRange(size - tailLen, size - 1);
  const sig = 0x06054b50;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv(tail).getUint32(i, true) === sig) {
      const d = dv(tail.subarray(i));
      return {
        count: d.getUint16(10, true),
        cdSize: d.getUint32(12, true),
        cdOffset: d.getUint32(16, true),
      };
    }
  }
  throw new Error("EOCD signature not found");
}

async function readCentralDirectory(): Promise<{ entries: ZipEntry[]; lastModified: string; size: number }> {
  const { size, lastModified } = await headZip();
  const { cdOffset, cdSize } = await readEOCD(size);
  const cd = await getRange(cdOffset, cdOffset + cdSize - 1);
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
  return { entries, lastModified, size };
}

// Resolve a member's compressed data byte-range by reading its local header (the
// local header's name/extra lengths can differ from the central directory's).
async function memberDataRange(e: ZipEntry): Promise<{ start: number; end: number }> {
  const hdr = await getRange(e.localOffset, e.localOffset + 29);
  const d = dv(hdr);
  if (d.getUint32(0, true) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
  const nameLen = d.getUint16(26, true);
  const extraLen = d.getUint16(28, true);
  const start = e.localOffset + 30 + nameLen + extraLen;
  return { start, end: start + e.compSize - 1 };
}

// ---------------------------------------------------------------------------
// Streaming inflate + CSV parse for one member, flushing upserts in batches.
// ---------------------------------------------------------------------------
async function* csvRecords(textStream: ReadableStream<string>, skipDataRows = 0): AsyncGenerator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const reader = textStream.getReader();
  let headerDone = false;
  let dataRowsSeen = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = value;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      const skipping = headerDone && dataRowsSeen < skipDataRows;
      if (inQuotes) {
        if (c === '"') {
          if (chunk[i + 1] === '"') { if (!skipping) field += '"'; i++; }
          else inQuotes = false;
        } else { if (!skipping) field += c; }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        if (!skipping) { row.push(field); field = ""; }
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && chunk[i + 1] === "\n") i++;
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

function inflateToText(bytes: ReadableStream<Uint8Array>, method: number): ReadableStream<string> {
  const decompressed = method === 8
    ? bytes.pipeThrough(new DecompressionStream("deflate-raw"))
    : bytes; // method 0 = stored
  return decompressed.pipeThrough(new TextDecoderStream());
}

// Map a CSV header + row into an object keyed by TEC field name.
function rowMapper(header: string[]) {
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  return (row: string[]) => (key: string) => {
    const i = idx.get(key);
    return i === undefined ? null : (row[i] ?? null) || null;
  };
}

function toDate(yyyymmdd: string | null): string | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ---------------------------------------------------------------------------
// Supabase (service role — bypasses RLS)
// ---------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// discover: enumerate members, seed shard progress, reset on new dump
// ---------------------------------------------------------------------------
async function discover() {
  // Run-log row so a failed discover (TEC down, Range/EOCD error, Vault miss) is
  // visible in tx_cf_sync_runs — not silently swallowed (pg_cron sees the http_post
  // as "succeeded" even when the function returns 500).
  const run = await supabase.from("tx_cf_sync_runs")
    .insert({ status: "running", mode: "discover" }).select("id").single();
  const runId = run.data?.id;
  try {
    const { entries, lastModified } = await readCentralDirectory();
    const wanted = entries.filter((e) => WANT(e.name));

    // New dump? wipe progress so every shard re-drains against the fresh file.
    const { data: existing } = await supabase
      .from("tx_cf_shard_progress").select("zip_last_modified").limit(1).maybeSingle();
    if (existing && existing.zip_last_modified !== lastModified) {
      await supabase.from("tx_cf_shard_progress").delete().neq("source_file", "");
    }

    for (const e of wanted) {
      await supabase.from("tx_cf_shard_progress").upsert({
        source_file: e.name,
        zip_last_modified: lastModified,
        status: "pending",
      }, { onConflict: "source_file", ignoreDuplicates: true });
    }
    await supabase.from("tx_cf_sync_runs").update({
      status: "success", finished_at: new Date().toISOString(), zip_last_modified: lastModified,
      notes: { members_total: entries.length, shards_seeded: wanted.length },
    }).eq("id", runId);
    return {
      lastModified,
      members_total: entries.length,
      wanted: wanted.map((e) => ({ name: e.name, compSize: e.compSize, uncompSize: e.uncompSize, method: e.method })),
    };
  } catch (err) {
    await supabase.from("tx_cf_sync_runs").update({
      status: "error", finished_at: new Date().toISOString(), error: String(err),
    }).eq("id", runId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// drain: process one pending shard (or the one passed in)
// ---------------------------------------------------------------------------
async function drainShard(sourceFile: string, lastModified: string, entries: ZipEntry[]): Promise<{ rows: number; finished: boolean }> {
  const e = entries.find((x) => x.name === sourceFile);
  if (!e) throw new Error(`shard ${sourceFile} not in ZIP`);
  const { data: prog } = await supabase.from("tx_cf_shard_progress")
    .select("rows_done").eq("source_file", sourceFile).maybeSingle();
  const skip = prog?.rows_done ?? 0;
  const { start, end } = await memberDataRange(e);
  const text = inflateToText(await getRangeStream(start, end), e.method);

  const isFilers = sourceFile === "filers.csv";
  let header: string[] | null = null;
  let map: ((row: string[]) => (k: string) => string | null) | null = null;
  let batch: Record<string, unknown>[] = [];
  let processed = 0;      // rows processed this invocation
  let finished = true;    // false if we hit ROW_CAP before EOF

  const flush = async () => {
    if (!batch.length) return;
    const table = isFilers ? "tx_cf_filers" : "tx_cf_contributions";
    const conflict = isFilers ? "filer_ident" : "contribution_info_id";
    // Dedupe within the batch by the conflict key: filers.csv repeats filer_ident
    // across reporting periods, and Postgres upsert rejects the same conflict key
    // twice in one statement ("cannot affect row a second time"). Keep the last seen.
    const deduped = [...new Map(batch.map((r) => [String(r[conflict]), r])).values()];
    const { error } = await supabase.from(table).upsert(deduped, { onConflict: conflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
    batch = [];
  };

  for await (const row of csvRecords(text, skip)) {
    if (!header) { header = row; map = rowMapper(header); continue; }
    processed++;
    const g = map!(row);
    if (isFilers) {
      const id = g("filerIdent");
      if (!id) continue;
      batch.push({
        filer_ident: id,
        filer_name: g("filerName") ?? "",
        filer_type_cd: g("filerTypeCd"),
        filer_persent_type_cd: g("filerPersentTypeCd"),
        office_cd: g("ctaSeekOfficeCd"),
        office_district: g("ctaSeekOfficeDistrict"),
        office_place: g("ctaSeekOfficePlace"),
        office_descr: g("ctaSeekOfficeDescr"),
        last_synced_at: new Date().toISOString(),
      });
    } else {
      const id = g("contributionInfoId");
      if (!id) continue;
      batch.push({
        contribution_info_id: Number(id),
        report_info_ident: g("reportInfoIdent") ? Number(g("reportInfoIdent")) : null,
        filer_ident: g("filerIdent") ?? "",
        filer_name: g("filerName"),
        contribution_dt: toDate(g("contributionDt")),
        contribution_amount: g("contributionAmount") ? Number(g("contributionAmount")) : null,
        contribution_descr: g("contributionDescr"),
        itemize_flag: (g("itemizeFlag") ?? "").toUpperCase() === "Y",
        contributor_persent_type_cd: g("contributorPersentTypeCd"),
        contributor_name_organization: g("contributorNameOrganization"),
        contributor_name_last: g("contributorNameLast"),
        source_file: sourceFile,
        synced_at: new Date().toISOString(),
      });
    }
    if (batch.length >= UPSERT_BATCH) await flush();
    if (processed >= ROW_CAP) { finished = false; break; }
  }
  await flush();
  const rowsDone = skip + processed;
  await supabase.from("tx_cf_shard_progress").update({
    status: finished ? "done" : "pending",
    rows_done: rowsDone,
    rows_upserted: rowsDone,
    last_run_at: new Date().toISOString(),
    error: null,
    zip_last_modified: lastModified,
  }).eq("source_file", sourceFile);
  return { rows: processed, finished };
}

async function drain(maxShards: number) {
  const { lastModified, entries } = await readCentralDirectory();
  const run = await supabase.from("tx_cf_sync_runs")
    .insert({ status: "running", mode: "drain", zip_last_modified: lastModified }).select("id").single();
  const runId = run.data?.id;
  const processed: string[] = [];
  let contribUpserts = 0;
  const startedAt = Date.now();
  try {
    for (let n = 0; n < maxShards; n++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      // Drain priority: filers.csv (the index legislator matching joins through),
      // then the regular contribs_* shards the finance RPC actually sums, then
      // everything else (cont_ss/cont_t special-session, excluded by the RPC, drained
      // last). Keeps the user-facing data loading first regardless of alphabetical order.
      let { data: next } = await supabase.from("tx_cf_shard_progress")
        .select("source_file").eq("status", "pending").eq("source_file", "filers.csv").maybeSingle();
      if (!next) {
        ({ data: next } = await supabase.from("tx_cf_shard_progress")
          .select("source_file").eq("status", "pending").like("source_file", "contribs_%").order("source_file").limit(1).maybeSingle());
      }
      if (!next) {
        ({ data: next } = await supabase.from("tx_cf_shard_progress")
          .select("source_file").eq("status", "pending").order("source_file").limit(1).maybeSingle());
      }
      if (!next) break;
      try {
        const r = await drainShard(next.source_file, lastModified, entries);
        contribUpserts += r.rows;
        if (!processed.includes(next.source_file)) processed.push(next.source_file);
        if (r.rows === 0) break;  // shard exhausted this pass; avoid re-pick spin
      } catch (err) {
        await supabase.from("tx_cf_shard_progress").update({
          status: "error", error: String(err), last_run_at: new Date().toISOString(),
        }).eq("source_file", next.source_file);
        throw err;
      }
    }
    await supabase.from("tx_cf_sync_runs").update({
      status: "success", finished_at: new Date().toISOString(),
      shards_processed: processed, contributions_upserted: contribUpserts,
    }).eq("id", runId);
    return { processed, contributions_upserted: contribUpserts };
  } catch (err) {
    await supabase.from("tx_cf_sync_runs").update({
      status: "error", finished_at: new Date().toISOString(), error: String(err),
      shards_processed: processed, contributions_upserted: contribUpserts,
    }).eq("id", runId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HTTP entry. Auth gate: the x-sync-secret header, validated against Vault via
// check_tx_sync_secret (service_role-only RPC) — so only cron, which reads the secret from
// Vault, can run it. verify_jwt=false in config.toml (matching the sibling state-finance
// functions); the gateway only required the public publishable key, so x-sync-secret is the
// real protection.
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    const secret = req.headers.get("x-sync-secret") ?? "";
    const { data: secretOk } = await supabase.rpc("check_tx_sync_secret", { p_token: secret });
    if (secretOk !== true) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode ?? new URL(req.url).searchParams.get("mode") ?? "drain";
    if (mode === "discover") {
      return Response.json({ ok: true, mode, ...(await discover()) });
    }
    if (mode === "full") {
      const disc = await discover();
      const dr = await drain(body.maxShards ?? 50);
      return Response.json({ ok: true, mode, discover: disc, drain: dr });
    }
    const dr = await drain(body.maxShards ?? 1);
    return Response.json({ ok: true, mode: "drain", ...dr });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
