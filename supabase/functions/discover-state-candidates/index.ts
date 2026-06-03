// Phase 4 — pluggable state/local candidate discovery (VISIBLE states only).
// Increment 1: framework + a New Jersey adapter in SAFE PROBE mode.
//
// Route A (statewide NJ voter portal, voter.svrs.nj.gov) turned out to be a session-gated
// SPA — not a clean machine target. So the statewide source here is the NJ Division of
// Elections candidate-information / election pages, which link the official candidate-list
// documents.
//
// This dev sandbox can't reach nj.gov (403), so the adapter defaults to dryRun=true: it
// fetches with a browser User-Agent (like scrape-piscataway-officials), reports what it
// found (HTTP status, links, content samples) and WRITES NOTHING. Once we confirm the real
// structure from the deployed environment, we implement parsing and flip dryRun off — the
// onboarding path already routes through the shared dedup funnel + visible-states gate.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type CandidateInput,
  type ElectionInput,
  loadHiddenStates,
  resolveAndUpsertCandidate,
  upsertElection,
  linkElectionCandidate,
  kickResearch,
} from '../_shared/onboard-candidate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const MAX_RESEARCH_PER_RUN = 5;

interface ProbedSource {
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  bytes: number;
  pdfLinks: string[];
  candidateListLinks: Array<{ url: string; text: string }>;
  textSample: string;
}

interface AdapterResult {
  state: string;
  dryRun: boolean;
  probe?: ProbedSource[];
  onboarded?: { elections: number; candidates: number; newCandidates: number };
  note?: string;
}

interface AdapterCtx {
  supabase: any;
  hiddenSet: Set<string>;
  dryRun: boolean;
}

// ---- small HTML helpers (same spirit as scrape-piscataway-officials) -------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAnchors(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1];
    const text = stripHtml(m[2]).slice(0, 120);
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ url: href, text });
  }
  return out;
}

async function fetchWithUA(url: string): Promise<{ status: number; contentType: string; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*' }, signal: ctrl.signal });
    const contentType = r.headers.get('content-type') ?? '';
    // For PDFs we don't decode the binary here (probe only reports the link + headers).
    const body = contentType.includes('pdf') ? '' : await r.text();
    return { status: r.status, contentType, body };
  } catch (e) {
    console.warn('[discover-state] fetch failed', url, String(e));
    return { status: 0, contentType: '', body: '' };
  } finally {
    clearTimeout(t);
  }
}

async function probeSource(url: string): Promise<ProbedSource> {
  const { status, contentType, body } = await fetchWithUA(url);
  const anchors = extractAnchors(body, url);
  const pdfLinks = anchors.filter((a) => /\.pdf(\?|$)/i.test(a.url)).map((a) => a.url);
  const candidateListLinks = anchors.filter(
    (a) => /candidate|sample\s*ballot|\blist\b|nominee|petition/i.test(a.text) || /candidate|ballot/i.test(a.url),
  );
  return {
    url,
    status,
    ok: status >= 200 && status < 300,
    contentType,
    bytes: body.length,
    pdfLinks: Array.from(new Set(pdfLinks)).slice(0, 25),
    candidateListLinks: candidateListLinks.slice(0, 25),
    textSample: stripHtml(body).slice(0, 800),
  };
}

// ---- onboarding scaffold (used once parsing is implemented; dryRun-gated) --

/** Persist parsed contests for a state through the shared dedup funnel (visible-only). */
async function onboardParsed(
  ctx: AdapterCtx,
  elections: Array<{ election: ElectionInput; candidates: CandidateInput[] }>,
): Promise<{ elections: number; candidates: number; newCandidates: number }> {
  let electionCount = 0;
  let candidateCount = 0;
  const newItems: Array<{ id: string; meta: CandidateInput }> = [];
  const inStateCache = new Map<string, Array<{ id: string; name: string; office: string; district: string | null }>>();

  for (const { election, candidates } of elections) {
    const electionId = await upsertElection(ctx.supabase, election);
    if (!electionId) continue;
    electionCount++;
    for (const c of candidates) {
      const { candidateId, isNew } = await resolveAndUpsertCandidate(ctx.supabase, c, {
        hiddenSet: ctx.hiddenSet,
        restrictToVisible: true,
        inStateCache,
      });
      if (!candidateId) continue;
      candidateCount++;
      if (isNew && newItems.length < MAX_RESEARCH_PER_RUN) newItems.push({ id: candidateId, meta: c });
      await linkElectionCandidate(ctx.supabase, electionId, candidateId, c);
    }
  }
  if (newItems.length > 0) await kickResearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, newItems);
  return { elections: electionCount, candidates: candidateCount, newCandidates: newItems.length };
}

// ---- New Jersey adapter ---------------------------------------------------

const NJ_SOURCES = [
  'https://nj.gov/state/elections/candidate-information.shtml',
  'https://www.nj.gov/state/elections/election-information-2026.shtml',
];

async function njAdapter(ctx: AdapterCtx): Promise<AdapterResult> {
  const probe: ProbedSource[] = [];
  for (const url of NJ_SOURCES) probe.push(await probeSource(url));

  if (ctx.dryRun) {
    return {
      state: 'NJ',
      dryRun: true,
      probe,
      note:
        'PROBE ONLY — nothing written. Inspect probe[].candidateListLinks / pdfLinks / status ' +
        'to confirm the document format, then implement parseNjDocuments() and call with dryRun=false.',
    };
  }

  // TODO(next increment): fetch each discovered candidate-list document, parse it into
  // { election, candidates[] }, and onboard. Until parsing is implemented this returns
  // nothing rather than writing garbage candidates.
  const parsed = await parseNjDocuments(probe);
  const onboarded = await onboardParsed(ctx, parsed);
  return { state: 'NJ', dryRun: false, probe, onboarded };
}

// Placeholder — implemented after the probe confirms NJ's document structure.
async function parseNjDocuments(_probe: ProbedSource[]): Promise<Array<{ election: ElectionInput; candidates: CandidateInput[] }>> {
  return [];
}

// ---- dispatcher -----------------------------------------------------------

const ADAPTERS: Record<string, (ctx: AdapterCtx) => Promise<AdapterResult>> = {
  NJ: njAdapter,
};

async function writeStatus(supabase: any, state: string, result: AdapterResult, startedAt: string): Promise<void> {
  const probeOk = (result.probe ?? []).some((p) => p.ok);
  const { error } = await supabase.from('candidate_ingest_status').upsert(
    {
      source: `ballot:${state}`,
      cursor: { dryRun: result.dryRun, sources: (result.probe ?? []).map((p) => ({ url: p.url, status: p.status, pdfLinks: p.pdfLinks.length, candidateListLinks: p.candidateListLinks.length })) },
      status: probeOk ? 'idle' : 'error',
      last_started_at: startedAt,
      last_completed_at: new Date().toISOString(),
      last_total_fetched: (result.probe ?? []).length,
      last_total_new: result.onboarded?.newCandidates ?? 0,
      error_message: probeOk ? null : 'no source reachable (check UA / network)',
    },
    { onConflict: 'source' },
  );
  if (error) console.warn('[discover-state] status write failed', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const requestedState: string | undefined = body.state ? String(body.state).toUpperCase() : undefined;
  const dryRun: boolean = body.dryRun !== false; // SAFE DEFAULT: probe only

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hiddenSet = await loadHiddenStates(supabase);

  const states = (requestedState ? [requestedState] : Object.keys(ADAPTERS)).filter((s) => ADAPTERS[s]);
  const results: AdapterResult[] = [];
  const skipped: Array<{ state: string; reason: string }> = [];

  for (const state of states) {
    if (hiddenSet.has(state)) {
      skipped.push({ state, reason: 'hidden_state' });
      continue;
    }
    const startedAt = new Date().toISOString();
    try {
      const result = await ADAPTERS[state]({ supabase, hiddenSet, dryRun });
      await writeStatus(supabase, state, result, startedAt);
      results.push(result);
    } catch (e) {
      console.error('[discover-state] adapter error', state, e);
      results.push({ state, dryRun, note: `error: ${String(e)}` });
    }
  }

  return new Response(JSON.stringify({ dryRun, results, skipped, availableAdapters: Object.keys(ADAPTERS) }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
