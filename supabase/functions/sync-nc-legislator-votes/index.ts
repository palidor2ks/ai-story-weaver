// Syncs NC General Assembly roll-call votes from OpenStates v3.
//
// Raw data lands in nc_leg_* tables (idempotent upsert keyed on OpenStates ids).
// Final-passage votes are bridged into the shared candidate_votes + bills tables
// (jurisdiction='nc_state') so NC state legislators flow into existing scoring + UI.
//
// Source: GET https://v3.openstates.org/bills?jurisdiction=North Carolina&session=2025&include=votes
// Rate limit: OpenStates free tier = 10 req/min → 7 s sleep between pages.
//
// Modes (query param `mode`, default = 'drain'):
//   discover — fetch page 1 to read pagination totals only; no upserts.
//   drain    — paginate + upsert everything; resume from last completed page.
//              Note: sort=latest_action_desc means newly-active bills float to earlier
//              pages between runs. Drain mode may miss late-updated bills; use full mode
//              periodically for guaranteed completeness.
//   full     — drain from page 1 (ignores resume cursor; guarantees complete coverage).
//
// Member linkage: OpenStates VoteEvent votes carry voter_name (surname or "G. Pierce")
// but no voter_id. Name-matcher: normalize → surname → scope by chamber → unique match;
// on collision use prefix(es) before '. '; emit unmatched-voter log every run.
//
// Determinative-vote rule: only motion_text containing 'Third Reading' or 'Concur'
// is marked is_final_passage=true and bridged into shared tables. Procedural readings
// (First Reading, Second Reading, committee) are stored in nc_leg_* but not bridged.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cron-auth.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPEN_STATES_API_KEY = Deno.env.get('OPEN_STATES_API_KEY') ?? '';
const OPEN_STATES_BASE = 'https://v3.openstates.org';
const SESSION = '2025';
const RATE_LIMIT_MS = 7_000; // 10 req/min free tier
const BUDGET_MS = 110_000; // stop starting new pages before edge function wall-clock limit; resume next run

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const unauth = await requireCronAuth(req);
  if (unauth) return unauth;

  if (!OPEN_STATES_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPEN_STATES_API_KEY not set' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'drain';

  if (!['discover', 'drain', 'full'].includes(mode)) {
    return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  EdgeRuntime.waitUntil(
    runSync(supabase, mode).catch((e) =>
      console.error('[sync-nc-legislator-votes] fatal', String(e)),
    ),
  );

  return new Response(JSON.stringify({ status: 'started', mode, session: SESSION }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});

// ---------------------------------------------------------------------------
// Name index
// ---------------------------------------------------------------------------

interface RosterEntry {
  id: string;
  fullName: string;
  normalizedSurname: string;
  namePrefix: string; // first name / prefix for collision resolution
}

type ChamberIndex = Map<string, RosterEntry[]>; // normalized surname → candidates
type NameIndex = { upper: ChamberIndex; lower: ChamberIndex };

async function buildNameIndex(supabase: ReturnType<typeof createClient>): Promise<NameIndex> {
  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, office')
    .eq('state', 'NC')
    .in('office', ['State Senator', 'State Representative']);

  if (error) throw new Error(`Roster load failed: ${error.message}`);

  const index: NameIndex = { upper: new Map(), lower: new Map() };

  for (const c of data ?? []) {
    const chamber: 'upper' | 'lower' = c.office === 'State Senator' ? 'upper' : 'lower';
    const entry: RosterEntry = {
      id: c.id,
      fullName: c.name,
      normalizedSurname: normalizeSurname(c.name),
      namePrefix: extractNamePrefix(c.name),
    };
    const list = index[chamber].get(entry.normalizedSurname) ?? [];
    list.push(entry);
    index[chamber].set(entry.normalizedSurname, list);
  }

  const total = [...index.upper.values(), ...index.lower.values()].flat().length;
  console.log(`[sync-nc-legislator-votes] roster loaded: ${total} members`);
  return index;
}

// Extract the normalized surname from a full name like "Jeff Jackson Jr."
function normalizeSurname(fullName: string): string {
  const stripped = fullName.trim().replace(/\b(jr|sr|ii|iii|iv|esq)\.?$/i, '').trim();
  const parts = stripped.split(/\s+/);
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
}

// Extract the first name (or prefix) for collision resolution: "Carson Smith" → "carson"
function extractNamePrefix(fullName: string): string {
  return fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
}

// Match a voter_name_raw to a roster entry.
// voter_name_raw formats: "Jackson" | "G. Pierce" | "Car. Smith"
function matchVoter(
  voterNameRaw: string,
  organizationClassification: string,
  nameIndex: NameIndex,
): { candidateId: string | null; method: string } {
  const chamber = organizationClassification.toLowerCase().includes('upper') ||
    organizationClassification.toLowerCase().includes('senate')
    ? 'upper'
    : 'lower';

  const chamberIndex = nameIndex[chamber];

  // Parse voter_name_raw into optional prefix + surname
  const dotSpace = voterNameRaw.indexOf('. ');
  let voterPrefix: string | null = null;
  let voterSurname: string;

  if (dotSpace > 0) {
    voterPrefix = voterNameRaw.slice(0, dotSpace).toLowerCase().replace(/[^a-z]/g, '');
    voterSurname = voterNameRaw.slice(dotSpace + 2).toLowerCase().replace(/[^a-z]/g, '');
  } else {
    voterSurname = voterNameRaw.toLowerCase().replace(/[^a-z]/g, '');
  }

  const candidates = chamberIndex.get(voterSurname) ?? [];

  if (candidates.length === 0) {
    return { candidateId: null, method: 'unmatched' };
  }
  if (candidates.length === 1) {
    return { candidateId: candidates[0].id, method: 'surname' };
  }

  // Collision — try prefix disambiguation
  if (voterPrefix) {
    const byPrefix = candidates.filter((c) => c.namePrefix.startsWith(voterPrefix!));
    if (byPrefix.length === 1) {
      return { candidateId: byPrefix[0].id, method: 'surname+initial' };
    }
  }

  return { candidateId: null, method: 'unmatched' };
}

// ---------------------------------------------------------------------------
// OpenStates API
// ---------------------------------------------------------------------------

async function fetchBillsPage(page: number): Promise<any> {
  const url =
    `${OPEN_STATES_BASE}/bills?jurisdiction=${encodeURIComponent('North Carolina')}` +
    `&session=${SESSION}&sort=latest_action_desc&per_page=20&page=${page}&include=votes`;

  const res = await fetch(url, {
    headers: { 'X-API-KEY': OPEN_STATES_API_KEY, Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenStates bills page ${page} → ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// Determinative-vote rule for NC: Third Reading or Motion to Concur.
function isFinalPassage(motionText: string): boolean {
  const m = (motionText ?? '').toLowerCase();
  return m.includes('third reading') || m.includes('concur');
}

// Map OpenStates option → candidate_votes.position
function toPosition(option: string): string {
  const o = (option ?? '').toLowerCase();
  if (o === 'yes') return 'Yea';
  if (o === 'no') return 'Nay';
  return 'Not Voting'; // absent | abstain | not voting | excused
}

// Derive a stable bill_id from session + identifier: 'nc-2025-SB889'
function makeBillId(identifier: string): string {
  return `nc-${SESSION}-${identifier.replace(/\s+/g, '')}`;
}

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

async function runSync(supabase: ReturnType<typeof createClient>, mode: string): Promise<void> {
  const { data: runRow, error: runErr } = await supabase
    .from('nc_leg_sync_runs')
    .insert({ mode, session: SESSION, status: 'running' })
    .select('id')
    .single();

  if (runErr) {
    console.error('[sync-nc-legislator-votes] failed to create sync run', runErr.message);
    return;
  }
  const runId: number = runRow.id;

  const stats: SyncStats = {
    pagesFetched: 0,
    billsUpserted: 0,
    voteEventsUpserted: 0,
    voteRecordsUpserted: 0,
    unmatchedCount: 0,
    bridgeBillsFailed: 0, // bills bridge failures; non-zero = candidate_votes skipped for those events
  };
  const unmatchedNames: string[] = [];

  try {
    if (mode === 'discover') {
      await runDiscover(supabase, runId, stats);
    } else {
      const nameIndex = await buildNameIndex(supabase);
      const fromStart = mode === 'full';
      await runDrain(supabase, runId, nameIndex, stats, unmatchedNames, fromStart);
    }

    if (unmatchedNames.length > 0) {
      console.warn(
        `[sync-nc-legislator-votes] unmatched voters (${unmatchedNames.length}):`,
        [...new Set(unmatchedNames)].slice(0, 50).join(', '),
      );
    }

    const finalStatus = stats.bridgeBillsFailed > 0 ? 'partial' : 'success';
    if (stats.bridgeBillsFailed > 0) {
      console.warn(
        `[sync-nc-legislator-votes] bridge_bills_failed=${stats.bridgeBillsFailed} — ` +
        'candidate_votes skipped for affected vote events; rerun with mode=full to retry.',
      );
    }
    await supabase.from('nc_leg_sync_runs').update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      pages_fetched: stats.pagesFetched,
      bills_upserted: stats.billsUpserted,
      vote_events_upserted: stats.voteEventsUpserted,
      vote_records_upserted: stats.voteRecordsUpserted,
      unmatched_count: stats.unmatchedCount,
      error: stats.bridgeBillsFailed > 0 ? `bridge_bills_failed: ${stats.bridgeBillsFailed}` : null,
    }).eq('id', runId);

    console.log('[sync-nc-legislator-votes] done', stats);
  } catch (e) {
    const msg = String(e);
    console.error('[sync-nc-legislator-votes] error', msg);
    await supabase.from('nc_leg_sync_runs').update({
      status: 'error',
      finished_at: new Date().toISOString(),
      pages_fetched: stats.pagesFetched,
      bills_upserted: stats.billsUpserted,
      error: msg,
    }).eq('id', runId);
  }
}

async function runDiscover(
  supabase: ReturnType<typeof createClient>,
  runId: number,
  stats: SyncStats,
): Promise<void> {
  const data = await fetchBillsPage(1);
  stats.pagesFetched = 1;
  const total: number = data?.pagination?.total_items ?? 0;
  const maxPage: number = data?.pagination?.max_page ?? 1;
  stats.billsUpserted = total;
  console.log(
    `[sync-nc-legislator-votes] discover: session=${SESSION} total_bills=${total} max_page=${maxPage}`,
  );
  await supabase.from('nc_leg_sync_runs').update({
    pages_fetched: 1,
    bills_upserted: total,
  }).eq('id', runId);
}

async function runDrain(
  supabase: ReturnType<typeof createClient>,
  runId: number,
  nameIndex: NameIndex,
  stats: SyncStats,
  unmatchedNames: string[],
  fromStart: boolean,
): Promise<void> {
  const drainStart = Date.now();
  let startPage = 1;

  if (!fromStart) {
    // Resume: find the highest completed page from the last successful run
    const { data: lastRun } = await supabase
      .from('nc_leg_sync_runs')
      .select('pages_fetched')
      .eq('session', SESSION)
      .eq('status', 'success')
      .in('mode', ['drain', 'full'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun?.pages_fetched) {
      startPage = (lastRun.pages_fetched as number) + 1;
      console.log(`[sync-nc-legislator-votes] resuming from page ${startPage}`);
    }
  }

  let page = startPage;

  while (true) {
    console.log(`[sync-nc-legislator-votes] fetching page ${page}`);
    const data = await fetchBillsPage(page);
    const bills: any[] = data?.results ?? [];
    if (bills.length === 0) break;

    let budgetReached = false;
    for (const bill of bills) {
      await processBill(supabase, bill, nameIndex, stats, unmatchedNames);
      // Per-bill budget check: a single page can contain bills with hundreds of vote
      // records each; checking only between pages risks exceeding the wall-clock limit.
      if (Date.now() - drainStart > BUDGET_MS) {
        budgetReached = true;
        break;
      }
    }

    stats.pagesFetched = page;

    // Checkpoint stats after every page (resume cursor)
    await supabase.from('nc_leg_sync_runs').update({
      pages_fetched: stats.pagesFetched,
      bills_upserted: stats.billsUpserted,
      vote_events_upserted: stats.voteEventsUpserted,
      vote_records_upserted: stats.voteRecordsUpserted,
      unmatched_count: stats.unmatchedCount,
      error: stats.bridgeBillsFailed > 0 ? `bridge_bills_failed: ${stats.bridgeBillsFailed}` : null,
    }).eq('id', runId);

    const maxPage: number = data?.pagination?.max_page ?? 1;
    if (page >= maxPage || budgetReached) {
      if (budgetReached) {
        console.log(`[sync-nc-legislator-votes] budget reached mid-page ${page}; will resume next run`);
      }
      break;
    }

    // Time-budget guard between pages (catches the case where budget expired after the last bill)
    if (Date.now() - drainStart > BUDGET_MS) {
      console.log(`[sync-nc-legislator-votes] budget reached at page ${page}; will resume next run`);
      break;
    }

    page++;
    await sleep(RATE_LIMIT_MS);
  }
}

interface SyncStats {
  pagesFetched: number;
  billsUpserted: number;
  voteEventsUpserted: number;
  voteRecordsUpserted: number;
  unmatchedCount: number;
  bridgeBillsFailed: number;
}

async function processBill(
  supabase: ReturnType<typeof createClient>,
  bill: any,
  nameIndex: NameIndex,
  stats: SyncStats,
  unmatchedNames: string[],
): Promise<void> {
  const billId = makeBillId(bill.identifier ?? '');
  const osBillId: string = bill.id ?? '';
  const identifier: string = bill.identifier ?? '';
  const title: string = bill.title ?? identifier;
  const chamberOrigin: string = bill.from_organization?.classification ?? null;
  const latestActionAt: string | null = bill.latest_action_date ?? null;
  const classification: string[] = bill.classification ?? [];

  // 1. Upsert into nc_leg_bills
  const { error: billErr } = await supabase.from('nc_leg_bills').upsert(
    {
      bill_id: billId,
      os_bill_id: osBillId,
      session: SESSION,
      identifier,
      chamber_origin: chamberOrigin,
      title,
      classification,
      latest_action_at: latestActionAt,
      raw: bill,
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'bill_id' },
  );
  if (billErr) {
    console.warn(`[sync-nc-legislator-votes] nc_leg_bills upsert failed for ${billId}`, billErr.message);
    return;
  }
  stats.billsUpserted++;

  // 2. Process vote events
  const voteEvents: any[] = bill.votes ?? [];
  if (voteEvents.length === 0) return;

  for (const ve of voteEvents) {
    await processVoteEvent(supabase, billId, title, ve, nameIndex, stats, unmatchedNames);
  }
}

async function processVoteEvent(
  supabase: ReturnType<typeof createClient>,
  billId: string,
  billTitle: string,
  ve: any,
  nameIndex: NameIndex,
  stats: SyncStats,
  unmatchedNames: string[],
): Promise<void> {
  const voteEventId: string = ve.id ?? '';
  if (!voteEventId) return;

  // Organization classification: ve.organization may be an object {classification, name} or a string.
  // Fall back to checking the name for 'senate' if classification is missing.
  let orgClassification: string = 'lower';
  if (ve.organization) {
    if (typeof ve.organization === 'object') {
      orgClassification = ve.organization.classification ??
        (String(ve.organization.name ?? '').toLowerCase().includes('senate') ? 'upper' : 'lower');
    } else {
      orgClassification = String(ve.organization);
    }
  }

  const motionText: string = ve.motion_text ?? '';
  const finalPassage = isFinalPassage(motionText);
  const result: string = ve.result ?? '';
  const startDate: string | null = ve.start_date ?? null;

  // 1. Upsert into nc_leg_vote_events
  const { error: veErr } = await supabase.from('nc_leg_vote_events').upsert(
    {
      vote_event_id: voteEventId,
      bill_id: billId,
      chamber: orgClassification,
      motion_text: motionText,
      result,
      is_final_passage: finalPassage,
      start_date: startDate,
      counts: ve.counts ?? [],
      raw: ve,
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'vote_event_id' },
  );
  if (veErr) {
    console.warn(`[sync-nc-legislator-votes] nc_leg_vote_events upsert failed for ${voteEventId}`, veErr.message);
    return;
  }
  stats.voteEventsUpserted++;

  // 2. Bridge into shared bills table if final passage.
  // MUST succeed before candidate_votes are written — if it fails, skip the bridge
  // for all per-person votes in this event to prevent orphaned candidate_votes rows.
  let billsBridgeOk = !finalPassage; // non-final-passage events don't need the bridge
  if (finalPassage) {
    const { error: bridgeBillErr } = await supabase.from('bills').upsert(
      {
        id: billId,
        name: billTitle,
        topic: 'Government & Democracy', // placeholder; replaced when nc_leg_bills.topic is curated
        jurisdiction: 'nc_state',
        // Federal-specific columns (congress, bill_type, bill_number, etc.) left NULL.
        // clear-congress-bills scopes by congress IS NOT NULL, so NC rows are safe.
      },
      { onConflict: 'id', ignoreDuplicates: false },
    );
    if (bridgeBillErr) {
      console.warn(`[sync-nc-legislator-votes] bills bridge upsert failed for ${billId}`, bridgeBillErr.message);
      stats.bridgeBillsFailed++;
      // billsBridgeOk stays false → candidate_votes skipped for this event
    } else {
      billsBridgeOk = true;
    }
  }

  // 3. Batch upsert per-legislator vote records (one array call vs. N individual calls)
  const perPersonVotes: any[] = ve.votes ?? [];
  if (perPersonVotes.length === 0) return;

  const actionDate = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
  const voteRecordRows: object[] = [];
  const candidateVoteRows: object[] = [];

  for (const pv of perPersonVotes) {
    const voterNameRaw: string = pv.voter_name ?? '';
    if (!voterNameRaw) continue;

    const { candidateId, method } = matchVoter(voterNameRaw, orgClassification, nameIndex);

    voteRecordRows.push({
      vote_event_id: voteEventId,
      voter_name_raw: voterNameRaw,
      candidate_id: candidateId,
      match_method: method,
      option: pv.option ?? null,
    });

    if (method === 'unmatched') {
      stats.unmatchedCount++;
      unmatchedNames.push(`${voterNameRaw} (${orgClassification})`);
    }

    // 4. Collect matched final-passage bridge rows (only if bills bridge succeeded)
    if (billsBridgeOk && candidateId && method !== 'unmatched') {
      candidateVoteRows.push({
        bill_id: billId,
        candidate_id: candidateId,
        action_type: 'floor_vote',
        position: toPosition(pv.option ?? ''),
        vote_number: 0, // one final-passage vote per member per bill
        action_date: actionDate,
        jurisdiction: 'nc_state',
      });
    }
  }

  if (voteRecordRows.length > 0) {
    const { error: vrErr } = await supabase.from('nc_leg_vote_records').upsert(
      voteRecordRows,
      { onConflict: 'vote_event_id,voter_name_raw' },
    );
    if (vrErr) {
      console.warn(`[sync-nc-legislator-votes] nc_leg_vote_records batch upsert failed for ${voteEventId}`, vrErr.message);
    } else {
      stats.voteRecordsUpserted += voteRecordRows.length;
    }
  }

  if (candidateVoteRows.length > 0) {
    const { error: cvErr } = await supabase.from('candidate_votes').upsert(
      candidateVoteRows,
      { onConflict: 'bill_id,candidate_id,action_type,vote_number' },
    );
    if (cvErr) {
      console.warn(
        `[sync-nc-legislator-votes] candidate_votes batch bridge failed for ${billId}`,
        cvErr.message,
      );
    }
  }
}
