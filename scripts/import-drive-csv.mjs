#!/usr/bin/env node
// Headless driver for the project's CSV/Excel import edge functions.
//
// This is a command-line stand-in for the browser admin UIs:
//   - src/components/admin/DonorImportPanel.tsx              (receipts)
//   - src/components/admin/IndependentExpenditureImportCard.tsx (sched-e)
//   - src/components/admin/BillSummaryDashboard.tsx          (bills)
// It parses a local file the same way, batches it identically, and POSTs each
// batch to the SAME deployed edge function the UI calls — so all dedup,
// aggregation, mapping, and session tracking run unchanged server-side.
//
// It does NOT touch the database directly. Writes go through:
//   - import-fec-receipts-csv     (receipts -> contributions + donors)        500/batch
//   - import-fec-schedule-e-csv   (Schedule E -> independent_expenditures)    500/batch
//   - import-bills-excel          (bills CSV/Excel -> bills)                   100/batch
//
// NOTE: this covers FILE-based imports only. Bill sponsors (bill_sponsors) and
// legislator voting records (candidate_votes) are populated from the
// Congress.gov API via separate edge functions (fetch-bill-sponsors,
// fetch-floor-votes, fetch-member-votes) — not from a file — so they are out of
// scope for this script.
//
// Auth: the functions are admin-gated. Supply a short-lived admin access token
// (the JWT from a logged-in admin session) via SUPABASE_ADMIN_TOKEN. It is sent
// as `Authorization: Bearer <token>`; the anon/publishable key is sent as
// `apikey`, mirroring supabase-js `functions.invoke`.
//
// Usage:
//   SUPABASE_ADMIN_TOKEN=<jwt> node scripts/import-drive-csv.mjs \
//     --type=receipts --file=tmp/import/receipts.csv \
//     --cycle=2024 [--candidate-id=… | --committee-id=… | --multi-committee] [--force]
//
//   SUPABASE_ADMIN_TOKEN=<jwt> node scripts/import-drive-csv.mjs \
//     --type=sched-e --file=tmp/import/schedule_e.csv \
//     --cycle=2024 [--min-amount=200] [--force]
//
//   SUPABASE_ADMIN_TOKEN=<jwt> node scripts/import-drive-csv.mjs \
//     --type=bills --file=tmp/import/bills.xlsx --congress=119
//
// SUPABASE_URL and the anon key are read from the environment or .env
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) unless passed as flags.

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import Papa from 'papaparse';

// ---------- per-type config ----------
const CONFIG = {
  receipts: { slug: 'import-fec-receipts-csv', batch: 500 },
  'sched-e': { slug: 'import-fec-schedule-e-csv', batch: 500 },
  bills: { slug: 'import-bills-excel', batch: 100 },
};
const DELAY_MS = 150;
const MAX_RETRIES = 5;

// ---------- arg / env parsing ----------
function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function loadDotEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — rely on real env vars */
  }
  return env;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
const dotenv = loadDotEnv();

const TYPE = args.type;
if (!CONFIG[TYPE]) {
  die(`--type must be one of: ${Object.keys(CONFIG).join(', ')}`);
}
const { slug: FN_SLUG, batch: BATCH_SIZE } = CONFIG[TYPE];

const FILE = args.file;
if (!FILE) die('--file=<path to local CSV/Excel> is required');

const SUPABASE_URL = (
  args['supabase-url'] || process.env.SUPABASE_URL || dotenv.VITE_SUPABASE_URL || ''
).replace(/\/+$/, '');
if (!SUPABASE_URL) die('SUPABASE_URL not set (flag --supabase-url, env, or .env VITE_SUPABASE_URL)');

const ANON_KEY =
  args['anon-key'] ||
  process.env.SUPABASE_ANON_KEY ||
  dotenv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';
if (!ANON_KEY) die('anon key not set (env SUPABASE_ANON_KEY or .env VITE_SUPABASE_PUBLISHABLE_KEY)');

// Auth: either a short-lived admin JWT (SUPABASE_ADMIN_TOKEN) or the durable
// Vault-backed import secret (SUPABASE_SYNC_SECRET, sent as x-sync-secret).
const ADMIN_TOKEN = process.env.SUPABASE_ADMIN_TOKEN || args['admin-token'] || '';
const SYNC_SECRET = process.env.SUPABASE_SYNC_SECRET || args['sync-secret'] || '';
if (!ADMIN_TOKEN && !SYNC_SECRET) {
  die('provide SUPABASE_SYNC_SECRET (preferred) or SUPABASE_ADMIN_TOKEN');
}

const CYCLE = args.cycle ? String(args.cycle) : null;
const FORCE = !!args.force;
const FN_URL = `${SUPABASE_URL}/functions/v1/${FN_SLUG}`;

// ---------- helpers ----------
function lower(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k.toLowerCase()] = v;
  return o;
}

// Parse the file into an array of row objects.
// CSV -> PapaParse (header rows). .xlsx/.xls -> the `xlsx` dep (matches the
// BillSummaryDashboard "Import from Excel" flow), loaded lazily so the FEC
// paths don't need it.
async function parseFile(path) {
  if (/\.xlsx?$/i.test(path)) {
    const XLSX = await import('xlsx').then((m) => m.default ?? m);
    const wb = XLSX.read(readFileSync(path), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  const text = readFileSync(path, 'utf8');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

// Mirror the UI's first-rows committee + cycle detection (receipts).
function detectReceipts(rows) {
  const first = rows[0] || {};
  const committeeId = first.committee_id || first.COMMITTEE_ID || null;
  const committeeName = first.committee_name || first.COMMITTEE_NAME || null;
  const cycleCounts = {};
  for (const row of rows) {
    const rc = String(row.two_year_transaction_period || row.TWO_YEAR_TRANSACTION_PERIOD || '').trim();
    if (rc) cycleCounts[rc] = (cycleCounts[rc] || 0) + 1;
  }
  const dominantCycle = Object.entries(cycleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { committeeId, committeeName, dominantCycle };
}

function detectSchedECycle(rows) {
  const counts = {};
  for (const r of rows) {
    const l = lower(r);
    const yr = String(l.fec_election_yr ?? l.two_year_transaction_period ?? l.cycle ?? '').trim();
    if (yr) counts[yr] = (counts[yr] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function invoke(body) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
  };
  if (ADMIN_TOKEN) headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
  if (SYNC_SECRET) headers['x-sync-secret'] = SYNC_SECRET;
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}

const isRetryableStatus = (s) => s === 503 || s === 504;
const isRetryableMsg = (m = '') =>
  /WORKER_LIMIT|546|statement timeout|connection closed|upstream request timeout|timeout/i.test(m);

// ---------- main ----------
async function main() {
  let allRows = await parseFile(FILE);

  if (!Array.isArray(allRows) || allRows.length === 0) {
    die('no rows parsed from file');
  }

  // Min-amount client filter (Schedule E only), mirroring the UI.
  let skippedBelowMin = 0;
  const minAmount = TYPE === 'sched-e' && args['min-amount'] ? Number(args['min-amount']) : 0;
  if (minAmount > 0) {
    const before = allRows.length;
    allRows = allRows.filter((r) => {
      const l = lower(r);
      const amt = Number(String(l.exp_amo ?? l.expenditure_amount ?? l.amount ?? '').replace(/[$,\s]/g, ''));
      return Number.isFinite(amt) && amt >= minAmount;
    });
    skippedBelowMin = before - allRows.length;
  }

  const totalRows = allRows.length;
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

  console.log(`File:        ${FILE}`);
  console.log(`Function:    ${FN_SLUG}`);
  console.log(`Target URL:  ${FN_URL}`);
  console.log(`Rows:        ${totalRows} (${totalBatches} batches of ${BATCH_SIZE})`);
  if (skippedBelowMin) console.log(`Below min:   ${skippedBelowMin} rows filtered (min=${minAmount})`);

  // ----- per-type validation / detection -----
  let committeeId = args['committee-id'] || null;
  const candidateId = args['candidate-id'] || null;
  const multiCommittee = !!args['multi-committee'];
  const congress = args.congress ? parseInt(String(args.congress), 10) : null;

  if (TYPE === 'receipts') {
    const det = detectReceipts(allRows.slice(0, 2000));
    console.log(`Detected:    committee=${det.committeeId ?? '—'} (${det.committeeName ?? '—'}), cycle=${det.dominantCycle ?? '—'}`);
    if (!multiCommittee && !committeeId) committeeId = det.committeeId;
    if (!CYCLE) die('--cycle is required');
    if (!multiCommittee && !candidateId && !committeeId) {
      die('receipts: provide --candidate-id and/or --committee-id, or use --multi-committee');
    }
    if (det.dominantCycle && det.dominantCycle !== CYCLE && !FORCE) {
      die(`cycle mismatch: file looks like ${det.dominantCycle} but --cycle=${CYCLE}. Re-run with the right cycle or add --force.`);
    }
  } else if (TYPE === 'sched-e') {
    const dom = detectSchedECycle(allRows.slice(0, 2000));
    console.log(`Detected:    cycle=${dom ?? '—'}`);
    if (!CYCLE) die('--cycle is required (tag rows as)');
    if (dom && dom !== CYCLE && !FORCE) {
      die(`cycle mismatch: file looks like ${dom} but --cycle=${CYCLE}. Re-run with the right cycle or add --force.`);
    }
  } else if (TYPE === 'bills') {
    if (!congress || congress < 111 || congress > 119) {
      die('--congress is required and must be 111–119 (e.g. --congress=119)');
    }
    console.log(`Congress:    ${congress}`);
    const sample = allRows[0] || {};
    if (!('Legislation Number' in sample)) {
      console.warn('warning: first row has no "Legislation Number" column — check the file has the expected bill export headers.');
    }
  }

  const sessionId =
    TYPE === 'receipts'
      ? `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : (globalThis.crypto?.randomUUID?.() ?? `ie-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const filename = FILE.split('/').pop();

  const totals = {
    inserted: 0,
    updated: 0,
    skippedDuplicates: 0,
    insertedDonors: 0,
    skippedInvalid: 0,
    errors: [],
  };
  const unmappedCommittees = new Set();
  const unmappedCandidates = new Set();
  let force = FORCE;

  for (let i = 0; i < totalRows; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const isFirstBatch = i === 0;
    const isLastBatch = i + BATCH_SIZE >= totalRows;

    let body;
    if (TYPE === 'receipts') {
      body = {
        rows: batch,
        cycle: CYCLE,
        candidateId: multiCommittee ? null : candidateId || null,
        committeeId: multiCommittee ? null : committeeId || null,
        multiCommittee,
        sessionId,
        filename,
        isFirstBatch,
        force,
      };
    } else if (TYPE === 'sched-e') {
      body = {
        rows: batch,
        cycle: CYCLE,
        isFirstBatch,
        isLastBatch,
        sessionId,
        filename,
        totalRowCount: totalRows,
        force,
      };
    } else {
      // bills
      body = { rows: batch, congress };
    }

    let retry = 0;
    while (retry < MAX_RETRIES) {
      const { status, data } = await invoke(body);

      // Cycle-mismatch guardrail (FEC functions return it as 200 JSON).
      if (data?.error === 'cycle_mismatch') {
        if (!force) {
          die(
            `cycle mismatch from server: file=${data.detected_cycle}, selected=${data.selected_cycle ?? CYCLE}. ` +
              `Re-run with --cycle=${data.detected_cycle} or add --force to tag as ${CYCLE}.`,
          );
        }
        force = true;
        continue;
      }

      if (status >= 400 || data?.error) {
        const msg = data?.error || `HTTP ${status}`;
        if ((isRetryableStatus(status) || isRetryableMsg(msg)) && retry < MAX_RETRIES - 1) {
          retry++;
          await sleep(Math.pow(2, retry) * 1000 + Math.random() * 500);
          continue;
        }
        totals.errors.push(`Batch ${batchNum}: ${msg}`);
        break;
      }

      // Success — accumulate per-function fields.
      if (TYPE === 'receipts') {
        totals.inserted += data.insertedContributions || 0;
        totals.skippedDuplicates += data.skippedDuplicates || 0;
        totals.insertedDonors += data.insertedDonors || 0;
        totals.skippedInvalid += data.skippedRows || 0;
        for (const c of data.unmappedCommittees || []) unmappedCommittees.add(c);
      } else if (TYPE === 'sched-e') {
        totals.inserted += data.newRows ?? data.inserted ?? 0;
        totals.updated += data.updatedRows || 0;
        totals.skippedInvalid += data.skippedInvalid || 0;
        for (const c of data.unmappedCommittees || []) unmappedCommittees.add(c);
        for (const c of data.unmappedCandidates || []) unmappedCandidates.add(c);
      } else {
        // bills: { inserted, errorCount, errors }
        totals.inserted += data.inserted || 0;
      }
      if (Array.isArray(data.errors)) {
        for (const e of data.errors.slice(0, 3)) totals.errors.push(`Batch ${batchNum}: ${e}`);
      }
      break;
    }

    const done = Math.min(i + BATCH_SIZE, totalRows);
    const tail =
      TYPE === 'sched-e'
        ? ` · ${totals.updated} updated`
        : TYPE === 'receipts'
          ? ` · ${totals.skippedDuplicates} dup`
          : '';
    process.stdout.write(
      `\rBatch ${batchNum}/${totalBatches} · ${done}/${totalRows} rows · ${totals.inserted} new${tail}   `,
    );

    if (i + BATCH_SIZE < totalRows) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');

  console.log('\n=== Import complete ===');
  if (TYPE !== 'bills') console.log(`session:           ${sessionId}`);
  console.log(`new rows:          ${totals.inserted}`);
  if (TYPE === 'receipts') {
    console.log(`already existed:   ${totals.skippedDuplicates}`);
    console.log(`donors upserted:   ${totals.insertedDonors}`);
  } else if (TYPE === 'sched-e') {
    console.log(`updated rows:      ${totals.updated}`);
  }
  if (TYPE !== 'bills') console.log(`invalid/skipped:   ${totals.skippedInvalid}`);
  if (unmappedCommittees.size) console.log(`unmapped cmtes:    ${unmappedCommittees.size}`);
  if (unmappedCandidates.size) console.log(`unmapped cands:    ${unmappedCandidates.size}`);
  if (totals.errors.length) {
    console.log(`errors (${totals.errors.length}):`);
    for (const e of totals.errors.slice(0, 10)) console.log(`  - ${e}`);
  }
  process.exit(totals.errors.length ? 1 : 0);
}

main().catch((e) => die(e?.stack || String(e)));
