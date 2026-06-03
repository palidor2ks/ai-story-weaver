// Phase 4 — state/local candidate discovery (VISIBLE states only).
// Increment 2: New Jersey = Middlesex County sample-ballot adapter (PDF + AI parsing).
//
// The statewide NJ DoE site only publishes petition forms + results PDFs (mostly federal,
// already covered by FEC Phase 1), so the UNIQUE local candidates (council, school board,
// county) come from county sample ballots. This adapter discovers Middlesex sample-ballot
// PDFs, extracts their text (unpdf), structures contests via Lovable AI, and onboards
// through the shared dedup funnel (visible states only). The function's own egress (browser
// User-Agent) can reach county/nj.gov sites our dev sandbox cannot.
//
// SAFETY: dryRun defaults ON (previews, writes nothing). Investigation actions let us learn
// the real format from the deployed environment before enabling writes:
//   { action:'run',  state:'NJ', dryRun:true, maxDocs:3 }   run adapters (default)
//   { action:'probe', url:'…' }                             HTML link probe
//   { action:'probe-pdf', url:'…', parse:true }             unpdf text (+ optional AI parse)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf';
import {
  type CandidateInput,
  type ElectionInput,
  type Level,
  mapParty,
  officeClass,
  sha1,
  firstTuesdayAfterFirstMonday,
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
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 25000;
const MAX_RESEARCH_PER_RUN = 5;
const DEFAULT_MAX_DOCS = 3;

const MIDDLESEX_BALLOT_INDEX =
  'https://www.middlesexcountynj.gov/government/departments/department-of-community-services/board-of-elections/vote/sample-ballot';

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

interface BallotContest {
  office: string;
  district?: string | null;
  candidates: Array<{ name: string; party?: string }>;
}
interface BallotDoc {
  jurisdiction?: string;
  election_date?: string | null;
  election_type?: string;
  contests?: BallotContest[];
}

interface AdapterResult {
  state: string;
  dryRun: boolean;
  index?: ProbedSource;
  parsedPreview?: Array<{ url: string; textChars: number; structured: BallotDoc | { raw: string } | null }>;
  onboarded?: { elections: number; candidates: number; newCandidates: number };
  note?: string;
}

interface AdapterCtx {
  supabase: any;
  hiddenSet: Set<string>;
  dryRun: boolean;
  maxDocs: number;
}

// ---- HTML helpers ---------------------------------------------------------

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
    const text = stripHtml(m[2]).slice(0, 140);
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ url: href, text });
  }
  return out;
}

async function fetchText(url: string): Promise<{ status: number; contentType: string; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctrl.signal });
    const contentType = r.headers.get('content-type') ?? '';
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
  const { status, contentType, body } = await fetchText(url);
  const anchors = extractAnchors(body, url);
  const pdfLinks = anchors.filter((a) => /\.pdf(\?|$)/i.test(a.url)).map((a) => a.url);
  const candidateListLinks = anchors.filter(
    (a) => /candidate|sample\s*ballot|\bballot\b|nominee/i.test(a.text) || /ballot|candidate/i.test(a.url),
  );
  return {
    url,
    status,
    ok: status >= 200 && status < 300,
    contentType,
    bytes: body.length,
    pdfLinks: Array.from(new Set(pdfLinks)).slice(0, 60),
    candidateListLinks: candidateListLinks.slice(0, 40),
    textSample: stripHtml(body).slice(0, 800),
  };
}

// ---- PDF text extraction --------------------------------------------------

async function fetchPdfText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!r.ok) {
      console.warn('[discover-state] pdf fetch non-OK', url, r.status);
      return '';
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text ?? '');
  } catch (e) {
    console.warn('[discover-state] pdf extract failed', url, String(e));
    return '';
  } finally {
    clearTimeout(t);
  }
}

// ---- AI structuring -------------------------------------------------------

async function aiParseBallot(text: string, hintUrl: string): Promise<BallotDoc | { raw: string } | null> {
  if (!LOVABLE_API_KEY) {
    console.warn('[discover-state] LOVABLE_API_KEY missing — cannot parse ballot');
    return null;
  }
  if (!text || text.length < 40) return null;

  const instructions =
    'Extract every CANDIDATE CONTEST from this official U.S. sample ballot text. ' +
    'Return ONLY valid JSON (no markdown) shaped exactly as: ' +
    '{"jurisdiction":string,"election_date":"YYYY-MM-DD"|null,"election_type":"primary"|"general"|"municipal"|"special"|"runoff","contests":[{"office":string,"district":string|null,"candidates":[{"name":string,"party":string|null}]}]}. ' +
    'Include federal, state, county and municipal offices. EXCLUDE public/ballot questions and instructions (they have no candidates). ' +
    'Use the candidate names exactly as printed. Source URL: ' +
    hintUrl;

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        messages: [
          { role: 'system', content: 'You convert U.S. sample-ballot text into structured JSON. Output JSON only.' },
          { role: 'user', content: `${instructions}\n\nBALLOT TEXT:\n${text.slice(0, 14000)}` },
        ],
      }),
    });
    if (!r.ok) {
      console.warn('[discover-state] AI parse non-OK', r.status);
      return null;
    }
    const data = await r.json();
    let content: string = data.choices?.[0]?.message?.content ?? '';
    content = content.replace(/```json\s*|\s*```/g, '').trim();
    try {
      return JSON.parse(content) as BallotDoc;
    } catch {
      return { raw: content.slice(0, 600) };
    }
  } catch (e) {
    console.warn('[discover-state] AI parse error', String(e));
    return null;
  }
}

function contestLevel(office: string): Level {
  const c = officeClass(office);
  if (c === 'president' || c === 'senate' || c === 'house') return 'federal';
  if (c === 'governor' || c === 'state-senate' || c === 'state-house') return 'state';
  return 'local';
}

function fallbackElectionDate(): string {
  // Next U.S. general election (Tue after first Mon of November) this year or next even year.
  const y = new Date().getFullYear();
  return firstTuesdayAfterFirstMonday(y % 2 === 0 ? y : y + 1, 11);
}

// ---- Middlesex (NJ) adapter ----------------------------------------------

async function middlesexAdapter(ctx: AdapterCtx): Promise<AdapterResult> {
  const index = await probeSource(MIDDLESEX_BALLOT_INDEX);

  // Prefer PDFs that look like sample ballots; fall back to all PDFs so the probe still
  // teaches us the structure even if the naming differs.
  const ballotPdfs = index.pdfLinks.filter((u) => /ballot|sample/i.test(u));
  const targets = (ballotPdfs.length ? ballotPdfs : index.pdfLinks).slice(0, ctx.dryRun ? 1 : ctx.maxDocs);

  const parsed: Array<{ url: string; text: string; structured: BallotDoc | { raw: string } | null }> = [];
  for (const url of targets) {
    const text = await fetchPdfText(url);
    const structured = text ? await aiParseBallot(text, url) : null;
    parsed.push({ url, text, structured });
  }

  if (ctx.dryRun) {
    return {
      state: 'NJ',
      dryRun: true,
      index,
      parsedPreview: parsed.map((p) => ({ url: p.url, textChars: p.text.length, structured: p.structured })),
      note:
        ballotPdfs.length === 0
          ? 'No PDF link matched /ballot|sample/ — inspect index.pdfLinks to confirm where Middlesex posts sample ballots (may be seasonal / nested).'
          : 'PREVIEW ONLY — verify parsedPreview[].structured looks right, then call with dryRun=false.',
    };
  }

  // Onboard (visible states only) through the shared funnel.
  let elections = 0;
  let candidates = 0;
  const newItems: Array<{ id: string; meta: CandidateInput }> = [];
  const inStateCache = new Map<string, Array<{ id: string; name: string; office: string; district: string | null }>>();

  for (const doc of parsed) {
    const d = doc.structured && 'contests' in doc.structured ? doc.structured : null;
    if (!d?.contests?.length) continue;
    const electionDate = d.election_date || fallbackElectionDate();
    const electionType = d.election_type || 'general';
    const jurisdiction = d.jurisdiction || 'Middlesex County';

    for (const contest of d.contests) {
      if (!contest.candidates?.length) continue;
      const level = contestLevel(contest.office);
      const election: ElectionInput = {
        election_date: electionDate,
        election_type: electionType,
        level,
        state: 'NJ',
        jurisdiction: contest.district || jurisdiction,
        name: `${jurisdiction} Sample Ballot`,
        source: 'ballot:NJ:middlesex',
        source_ref: `${doc.url}#${officeClass(contest.office)}-${contest.district ?? ''}`,
      };
      const electionId = await upsertElection(ctx.supabase, election);
      if (!electionId) continue;
      elections++;

      for (const cand of contest.candidates) {
        if (!cand?.name) continue;
        const id = `mxnj_${await sha1(`${cand.name}|${officeClass(contest.office)}|NJ|${contest.district ?? ''}`)}`;
        const ci: CandidateInput = {
          id,
          name: cand.name,
          party: mapParty(cand.party),
          office: contest.office,
          state: 'NJ',
          district: contest.district ?? null,
          is_incumbent: false,
          source: 'ballot:NJ:middlesex',
          source_ref: doc.url,
        };
        const { candidateId, isNew } = await resolveAndUpsertCandidate(ctx.supabase, ci, {
          hiddenSet: ctx.hiddenSet,
          restrictToVisible: true,
          inStateCache,
        });
        if (!candidateId) continue;
        candidates++;
        if (isNew && newItems.length < MAX_RESEARCH_PER_RUN) newItems.push({ id: candidateId, meta: ci });
        await linkElectionCandidate(ctx.supabase, electionId, candidateId, ci);
      }
    }
  }
  if (newItems.length > 0) await kickResearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, newItems);

  return { state: 'NJ', dryRun: false, index, onboarded: { elections, candidates, newCandidates: newItems.length } };
}

// ---- dispatcher -----------------------------------------------------------

const ADAPTERS: Record<string, (ctx: AdapterCtx) => Promise<AdapterResult>> = {
  NJ: middlesexAdapter,
};

async function writeStatus(supabase: any, state: string, result: AdapterResult, startedAt: string): Promise<void> {
  const { error } = await supabase.from('candidate_ingest_status').upsert(
    {
      source: `ballot:${state}`,
      cursor: {
        dryRun: result.dryRun,
        indexStatus: result.index?.status ?? null,
        pdfLinks: result.index?.pdfLinks?.length ?? 0,
        onboarded: result.onboarded ?? null,
      },
      status: result.index?.ok ? 'idle' : 'error',
      last_started_at: startedAt,
      last_completed_at: new Date().toISOString(),
      last_total_fetched: result.index?.pdfLinks?.length ?? 0,
      last_total_new: result.onboarded?.newCandidates ?? 0,
      error_message: result.index?.ok ? null : 'index page not reachable',
    },
    { onConflict: 'source' },
  );
  if (error) console.warn('[discover-state] status write failed', error.message);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const action: string = body.action || 'run';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --- investigation actions (no writes) ---
  if (action === 'probe') {
    if (!body.url) return json({ error: 'url required' }, 400);
    return json({ action, probe: await probeSource(String(body.url)) });
  }
  if (action === 'probe-pdf') {
    if (!body.url) return json({ error: 'url required' }, 400);
    const text = await fetchPdfText(String(body.url));
    const out: Record<string, unknown> = { action, url: body.url, textChars: text.length, textSample: text.slice(0, 2500) };
    if (body.parse) out.structured = await aiParseBallot(text, String(body.url));
    return json(out);
  }

  // --- run adapters (visible states only) ---
  const dryRun: boolean = body.dryRun !== false; // SAFE DEFAULT
  const maxDocs = Math.max(1, Math.min(10, Number(body.maxDocs) || DEFAULT_MAX_DOCS));
  const hiddenSet = await loadHiddenStates(supabase);
  const states = (body.state ? [String(body.state).toUpperCase()] : Object.keys(ADAPTERS)).filter((s) => ADAPTERS[s]);

  const results: AdapterResult[] = [];
  const skipped: Array<{ state: string; reason: string }> = [];
  for (const state of states) {
    if (hiddenSet.has(state)) {
      skipped.push({ state, reason: 'hidden_state' });
      continue;
    }
    const startedAt = new Date().toISOString();
    try {
      const result = await ADAPTERS[state]({ supabase, hiddenSet, dryRun, maxDocs });
      await writeStatus(supabase, state, result, startedAt);
      results.push(result);
    } catch (e) {
      console.error('[discover-state] adapter error', state, e);
      results.push({ state, dryRun, note: `error: ${String(e)}` });
    }
  }

  return json({ dryRun, results, skipped, availableAdapters: Object.keys(ADAPTERS) });
});
