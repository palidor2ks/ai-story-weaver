// Public edge function — returns upcoming elections + candidates for the user's address.
// Auto-onboards any newly-discovered candidate into the `candidates` table and kicks off
// background research via `get-candidate-answers` so they become directly comparable.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEC_API_KEY = Deno.env.get('FEC_API_KEY') ?? '';
const OPEN_STATES_API_KEY = Deno.env.get('OPEN_STATES_API_KEY') ?? '';
const GOOGLE_CIVIC_API_KEY = Deno.env.get('GOOGLE_CIVIC_API_KEY') ?? '';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';
const YOU_API_KEY = Deno.env.get('YOU_API_KEY') ?? '';

const INTERNAL_CHAIN_HEADER = 'x-internal-chain-secret';
const MAX_RESEARCH_PER_RUN = 5;
const MAX_AI_ELECTIONS = 8;
const CACHE_TTL_HOURS = 24;

type Level = 'federal' | 'state' | 'local';
type Party = 'Democrat' | 'Republican' | 'Independent' | 'Other';

interface CandidatePayload {
  id: string;
  name: string;
  party: Party;
  office: string;
  state: string;
  district?: string | null;
  is_incumbent: boolean;
  image_url?: string | null;
  fec_candidate_id?: string | null;
  source: string;
  source_ref?: string | null;
  status?: string;
  confidence?: 'high' | 'medium' | 'low';
}

interface ElectionPayload {
  election_date: string; // YYYY-MM-DD
  election_type: string;
  level: Level;
  state: string | null;
  jurisdiction: string | null;
  name: string;
  source: string;
  source_ref?: string | null;
  source_url?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  candidates: CandidatePayload[];
}

interface ElectionResponseRow {
  id: string;
  election_date: string;
  election_type: string;
  level: Level;
  state: string | null;
  jurisdiction: string | null;
  name: string;
  source: string;
  candidates: Array<{
    candidate_id: string;
    name: string;
    party: string;
    office: string;
    state: string;
    district: string | null;
    image_url: string | null;
    is_incumbent: boolean;
    overall_score: number | null;
    coverage_tier: string;
    confidence: string | null;
    answers_source: string | null;
    is_pending_research: boolean;
  }>;
}

function mapParty(raw: string | undefined | null): Party {
  if (!raw) return 'Other';
  const s = raw.toLowerCase();
  if (s.includes('dem')) return 'Democrat';
  if (s.includes('rep')) return 'Republican';
  if (s.includes('ind') || s.includes('non')) return 'Independent';
  return 'Other';
}

async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeDistrict(district?: string | number | null): string | null {
  if (district === null || district === undefined) return null;
  const raw = String(district).trim();
  if (!raw) return null;
  const match = raw.match(/(\d+)$/);
  const normalized = (match ? match[1] : raw).replace(/^0+/, '');
  return normalized || '0';
}

function normalizeText(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCity(value?: string | null): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function districtJurisdiction(state: string, district?: string | number | null): string | null {
  const normalized = normalizeDistrict(district);
  return normalized ? `${state.toUpperCase()}-${normalized}` : null;
}

function jurisdictionMatchesCity(jurisdiction: string | null | undefined, city: string | null): boolean {
  if (!city) return false;
  const normalizedJurisdiction = normalizeText(jurisdiction);
  if (!normalizedJurisdiction) return false;
  return normalizedJurisdiction.includes(city) || city.includes(normalizedJurisdiction);
}

function electionMatchesUserContext(
  election: ElectionResponseRow,
  context: { state: string; district: string | null; city: string | null },
): boolean {
  const electionState = election.state?.toUpperCase() ?? null;
  const electionJurisdiction = election.jurisdiction ?? null;
  const normalizedJurisdiction = normalizeText(electionJurisdiction);
  const district = normalizeDistrict(context.district);
  const houseJurisdiction = districtJurisdiction(context.state, district);

  // National rows (President) apply to everyone.
  if (electionState === null || normalizedJurisdiction === 'us') return true;
  if (electionState !== context.state.toUpperCase()) return false;

  if (election.level === 'federal') {
    // Statewide federal races (Senate) apply to everyone in the state.
    if (!electionJurisdiction || normalizeText(electionJurisdiction) === normalizeText(context.state)) return true;

    // House races must match the user's congressional district. Prefer the
    // election jurisdiction, then candidate district as a fallback.
    if (houseJurisdiction && normalizeText(electionJurisdiction) === normalizeText(houseJurisdiction)) return true;
    return election.candidates.some((candidate) => normalizeDistrict(candidate.district) === district);
  }

  if (election.level === 'state') {
    // Keep statewide state races; require a district match for district-scoped races when a district is present.
    if (!electionJurisdiction || normalizeText(electionJurisdiction) === normalizeText(context.state)) return true;
    if (district && election.candidates.some((candidate) => normalizeDistrict(candidate.district) === district)) return true;
    return false;
  }

  if (election.level === 'local') {
    // Local rows must be scoped to the geocoded city whenever we know it.
    if (!context.city) return false;
    return jurisdictionMatchesCity(electionJurisdiction, context.city);
  }

  return false;
}

function nextCycles(): string[] {
  const y = new Date().getFullYear();
  const even = y % 2 === 0 ? y : y + 1;
  return [String(even), String(even + 2)];
}

// ----- FEC ----------------------------------------------------------------

async function fetchFEC(state: string, district: string | null): Promise<ElectionPayload[]> {
  if (!FEC_API_KEY) return [];
  const cycles = nextCycles();
  const results: ElectionPayload[] = [];
  const normalizedDistrict = normalizeDistrict(district);
  const houseJurisdiction = districtJurisdiction(state, normalizedDistrict);

  for (const cycle of cycles) {
    // House (only if we know district), Senate, President in parallel.
    const calls: Array<Promise<{ office: string; data: any }>> = [];
    const base = 'https://api.open.fec.gov/v1/candidates/search/';
    const common = `api_key=${FEC_API_KEY}&candidate_status=C&per_page=100&election_year=${cycle}`;

    const fecFetch = async (office: string, url: string) => {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          console.warn('[FEC] non-OK', { office, cycle, status: r.status, body: body.slice(0, 300) });
          return { office, data: { results: [] } };
        }
        const data = await r.json();
        return { office, data };
      } catch (e) {
        console.warn('[FEC] fetch error', { office, cycle, error: String(e) });
        return { office, data: { results: [] } };
      }
    };

    if (normalizedDistrict) {
      const dist = normalizedDistrict.padStart(2, '0');
      calls.push(fecFetch('H', `${base}?${common}&office=H&state=${state}&district=${dist}`));
    }
    calls.push(fecFetch('S', `${base}?${common}&office=S&state=${state}`));
    calls.push(fecFetch('P', `${base}?${common}&office=P`));

    const settled = await Promise.all(calls);

    // Group into a single "general" + "primary" placeholder; FEC doesn't give us exact dates.
    // Use Nov first Tuesday of cycle year for general.
    const generalDate = firstTuesdayAfterFirstMonday(parseInt(cycle), 11); // November

    for (const { office, data } of settled) {
      const officeLabel = office === 'H'
        ? `U.S. House ${houseJurisdiction ?? `${state}-`}`
        : office === 'S' ? `U.S. Senate (${state})` : 'President of the United States';
      const candidates: CandidatePayload[] = (data?.results ?? []).map((c: any) => ({
        id: c.candidate_id,
        name: c.name || 'Unknown',
        party: mapParty(c.party_full || c.party),
        office: officeLabel,
        state: office === 'P' ? 'US' : state,
        district: office === 'H' ? normalizedDistrict : null,
        is_incumbent: c.incumbent_challenge === 'I',
        image_url: null,
        fec_candidate_id: c.candidate_id,
        source: 'fec',
        source_ref: cycle,
      }));
      if (candidates.length === 0) continue;

      results.push({
        election_date: generalDate,
        election_type: 'general',
        level: 'federal',
        state: office === 'P' ? null : state,
        jurisdiction: office === 'H' ? (houseJurisdiction ?? `${state}-`) : (office === 'S' ? state : 'US'),
        name: `${cycle} ${office === 'P' ? 'U.S. Presidential' : 'Federal'} Election`,
        source: 'fec',
        source_ref: `${cycle}-${office}-${state}-${normalizedDistrict ?? ''}`,
        candidates,
      });
    }
  }
  return results;
}

function firstTuesdayAfterFirstMonday(year: number, month: number): string {
  // Standard U.S. general election: Tue after first Mon of November.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dow = first.getUTCDay(); // 0=Sun..6=Sat
  const firstMon = ((1 - dow + 7) % 7) + 1; // day of month
  const tueAfter = firstMon + 1;
  const date = new Date(Date.UTC(year, month - 1, tueAfter));
  return date.toISOString().slice(0, 10);
}

// ----- Google Civic --------------------------------------------------------

async function fetchGoogleCivic(address: string): Promise<ElectionPayload[]> {
  if (!GOOGLE_CIVIC_API_KEY || !address) return [];
  try {
    const elRes = await fetch(`https://www.googleapis.com/civicinfo/v2/elections?key=${GOOGLE_CIVIC_API_KEY}`);
    if (!elRes.ok) return [];
    const elData = await elRes.json();
    const upcoming: any[] = (elData.elections ?? []).filter((e: any) => e.electionDay && e.electionDay >= new Date().toISOString().slice(0, 10));
    if (upcoming.length === 0) return [];

    const results: ElectionPayload[] = [];
    for (const election of upcoming.slice(0, 5)) {
      const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${GOOGLE_CIVIC_API_KEY}&address=${encodeURIComponent(address)}&electionId=${election.id}&returnAllAvailableData=true`;
      const viRes = await fetch(url);
      if (!viRes.ok) continue;
      const vi = await viRes.json();
      const contests: any[] = vi.contests ?? [];

      for (const contest of contests) {
        const contestCandidates: any[] = contest.candidates ?? [];
        if (contestCandidates.length === 0) continue;

        const officeName: string = contest.office || contest.referendumTitle || 'Race';
        const district = contest.district?.name ?? null;
        const level = inferLevel(contest.level, contest.roles, officeName);
        const state = vi.normalizedInput?.state || election.ocdDivisionId?.match(/state:(\w\w)/)?.[1]?.toUpperCase() || null;

        const candidates: CandidatePayload[] = await Promise.all(contestCandidates.map(async (c: any) => {
          const id = `civic_${await sha1(`${c.name}|${officeName}|${state ?? ''}|${district ?? ''}`)}`;
          return {
            id,
            name: c.name,
            party: mapParty(c.party),
            office: officeName,
            state: state || '',
            district,
            is_incumbent: false, // Civic doesn't reliably flag this; enriched downstream.
            image_url: c.photoUrl ?? null,
            source: 'google_civic',
            source_ref: election.id,
          };
        }));

        results.push({
          election_date: election.electionDay,
          election_type: detectType(election.name),
          level,
          state,
          jurisdiction: district || vi.normalizedInput?.city || null,
          name: election.name,
          source: 'google_civic',
          source_ref: `${election.id}-${officeName}-${district ?? ''}`,
          candidates,
        });
      }
    }
    return results;
  } catch (e) {
    console.error('[GoogleCivic] error', e);
    return [];
  }
}

function inferLevel(levelArr: string[] | undefined, roles: string[] | undefined, office: string): Level {
  const hay = [...(levelArr ?? []), ...(roles ?? []), office.toLowerCase()].join(' ').toLowerCase();
  if (hay.includes('country') || hay.includes('federal') || hay.includes('president') || hay.includes('u.s. senate') || hay.includes('u.s. house')) return 'federal';
  if (hay.includes('administrativearea1') || hay.includes('state') || hay.includes('governor')) return 'state';
  return 'local';
}

function detectType(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('primary')) return 'primary';
  if (n.includes('runoff')) return 'runoff';
  if (n.includes('special')) return 'special';
  if (n.includes('municipal') || n.includes('city')) return 'municipal';
  return 'general';
}


// ----- AI election research -------------------------------------------------

interface AIElectionCandidate {
  name?: string;
  party?: string;
  office?: string;
  district?: string | null;
  is_incumbent?: boolean;
  source_url?: string | null;
  status?: string;
  confidence?: 'high' | 'medium' | 'low';
}

interface AIElectionRow {
  election_date?: string;
  election_type?: string;
  level?: Level;
  state?: string | null;
  jurisdiction?: string | null;
  name?: string;
  source_url?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  candidates?: AIElectionCandidate[];
}

function isIsoDate(value?: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function clampElectionType(value?: string | null): string {
  const raw = normalizeText(value);
  if (raw.includes('primary')) return 'primary';
  if (raw.includes('runoff')) return 'runoff';
  if (raw.includes('special')) return 'special';
  if (raw.includes('municipal') || raw.includes('local')) return 'municipal';
  if (raw.includes('general')) return 'general';
  return 'general';
}

function clampLevel(value?: string | null, office?: string | null): Level {
  const raw = normalizeText(`${value ?? ''} ${office ?? ''}`);
  if (raw.includes('federal') || raw.includes('president') || raw.includes('senate') || raw.includes('congress') || raw.includes('house')) return 'federal';
  if (raw.includes('state') || raw.includes('governor') || raw.includes('assembly') || raw.includes('delegate')) return 'state';
  return 'local';
}

async function fetchYouElectionResearch(opts: {
  state: string;
  district: string | null;
  city: string | null;
  address?: string;
}): Promise<string> {
  if (!YOU_API_KEY) return '';
  const districtText = opts.district ? ` congressional district ${opts.district}` : '';
  const cityText = opts.city ? `, city/municipality ${opts.city}` : '';
  const addressText = opts.address ? ` Address context: ${opts.address}.` : '';
  const query = `Find authoritative current sources for upcoming elections and candidate lists for voters in ${opts.state}${districtText}${cityText}.${addressText}
Return only elections with known candidate names. Prioritize official state/county/municipal election pages, official sample ballots, and filing/candidate lists. Include election dates, offices, parties when available, districts/jurisdictions, incumbency if stated, and source URLs.`;

  try {
    const response = await fetch('https://api.you.com/v1/research', {
      method: 'POST',
      headers: {
        'X-API-Key': YOU_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: query.slice(0, 39000), research_effort: 'standard' }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[AI elections] You.com research failed', response.status, text.slice(0, 300));
      return '';
    }
    const data = await response.json().catch(() => ({} as any));
    const output = data?.output ?? {};
    const rawContent = output?.content ?? data?.answer ?? data?.message ?? '';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const rawSources: any[] = Array.isArray(output?.sources) ? output.sources : (Array.isArray(data?.sources) ? data.sources : []);
    const sources = rawSources
      .map((source: any) => `${source?.title ?? source?.name ?? 'Source'}: ${source?.url ?? source?.link ?? source?.href ?? ''}`)
      .filter((line: string) => line.trim() && !line.endsWith(': '))
      .slice(0, 12)
      .join('\n');
    return [content, sources ? `Sources:\n${sources}` : ''].filter(Boolean).join('\n\n').slice(0, 30000);
  } catch (error) {
    console.warn('[AI elections] You.com research error', String(error));
    return '';
  }
}

async function fetchAIUpcomingElections(opts: {
  state: string;
  district: string | null;
  city: string | null;
  address?: string;
}): Promise<ElectionPayload[]> {
  if (!LOVABLE_API_KEY) return [];

  const todayIso = new Date().toISOString().slice(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 550);
  const maxDateIso = maxDate.toISOString().slice(0, 10);
  const researchContext = await fetchYouElectionResearch(opts);
  const location = [opts.city, opts.state, opts.district ? `district ${opts.district}` : null].filter(Boolean).join(', ');

  const prompt = `Refresh upcoming elections for this voter location: ${location || opts.state}.
${opts.address ? `Address context: ${opts.address}.` : ''}
Today is ${todayIso}. Include elections from ${todayIso} through ${maxDateIso} only.

Find ballot races and who is running. Focus on federal, state, county, municipal, school board, mayor/council, and special elections relevant to the location. Do not include past elections, speculative candidates, or races without named candidates.

Use this live research context when available:
${researchContext || '(No live research context was available; rely on conservative, well-known public election information only.)'}

Return structured data only via the tool. Requirements:
- Every election_date must be YYYY-MM-DD and not before ${todayIso}.
- source_url must be an authoritative URL supporting the election/candidate list when possible.
- Mark confidence low when the source is incomplete; low-confidence rows will be ignored.
- Jurisdiction should be the state code for statewide races, a district such as ${opts.state}-${opts.district ?? '##'} for district races, or the city/county name for local races.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a meticulous, non-partisan U.S. election data researcher. Extract only current, sourced, location-relevant ballot candidate data. Prefer official election sources and avoid hallucinating candidates.',
          },
          { role: 'user', content: prompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'report_upcoming_elections',
            description: 'Report sourced upcoming elections and candidates for a voter location',
            parameters: {
              type: 'object',
              properties: {
                elections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      election_date: { type: 'string', description: 'YYYY-MM-DD' },
                      election_type: { type: 'string', enum: ['general', 'primary', 'runoff', 'special', 'municipal'] },
                      level: { type: 'string', enum: ['federal', 'state', 'local'] },
                      state: { type: 'string', description: 'Two-letter state code, or null for national races' },
                      jurisdiction: { type: 'string', description: 'State, district, county, city, or local jurisdiction' },
                      name: { type: 'string' },
                      source_url: { type: 'string' },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                      candidates: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            party: { type: 'string' },
                            office: { type: 'string' },
                            district: { type: 'string' },
                            is_incumbent: { type: 'boolean' },
                            source_url: { type: 'string' },
                            status: { type: 'string', enum: ['declared', 'filed', 'qualified', 'primary_winner', 'withdrawn'] },
                            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                          },
                          required: ['name', 'office'],
                        },
                      },
                    },
                    required: ['election_date', 'election_type', 'level', 'name', 'confidence', 'candidates'],
                  },
                },
              },
              required: ['elections'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'report_upcoming_elections' } },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[AI elections] AI gateway failed', response.status, text.slice(0, 500));
      return [];
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return [];
    const parsed = JSON.parse(toolCall.function.arguments);
    const rows: AIElectionRow[] = Array.isArray(parsed?.elections) ? parsed.elections : [];
    const payloads: ElectionPayload[] = [];

    for (const row of rows.slice(0, MAX_AI_ELECTIONS)) {
      if (!isIsoDate(row.election_date) || row.election_date < todayIso || row.confidence === 'low') continue;
      const candidates = (row.candidates ?? [])
        .filter((candidate) => candidate.name && candidate.office && candidate.confidence !== 'low' && candidate.status !== 'withdrawn')
        .map(async (candidate): Promise<CandidatePayload> => {
          const office = candidate.office!.trim();
          const candidateState = (row.state || opts.state || '').toUpperCase();
          const district = candidate.district ? normalizeDistrict(candidate.district) ?? candidate.district : null;
          const id = `ai_${await sha1(`${candidate.name}|${office}|${candidateState}|${district ?? ''}`)}`;
          return {
            id,
            name: candidate.name!.trim(),
            party: mapParty(candidate.party),
            office,
            state: candidateState || 'US',
            district,
            is_incumbent: candidate.is_incumbent === true,
            image_url: null,
            source: 'ai_research',
            source_ref: candidate.source_url || row.source_url || null,
            status: candidate.status ?? 'declared',
            confidence: candidate.confidence ?? row.confidence ?? 'medium',
          };
        });
      const resolvedCandidates = await Promise.all(candidates);
      if (resolvedCandidates.length === 0) continue;

      const sourceRef = row.source_url || `${row.election_date}-${row.name}-${row.jurisdiction ?? opts.city ?? opts.state}`;
      payloads.push({
        election_date: row.election_date,
        election_type: clampElectionType(row.election_type),
        level: clampLevel(row.level, resolvedCandidates[0]?.office),
        state: row.state === null ? null : (row.state || opts.state).toUpperCase(),
        jurisdiction: row.jurisdiction || opts.city || opts.state,
        name: row.name || `${row.election_date} ${opts.state} Election`,
        source: 'ai_research',
        source_ref: `ai-${await sha1(sourceRef)}`,
        source_url: row.source_url ?? null,
        confidence: row.confidence ?? 'medium',
        candidates: resolvedCandidates,
      });
    }

    console.log('[AI elections] parsed rows', { raw: rows.length, accepted: payloads.length });
    return payloads;
  } catch (error) {
    console.warn('[AI elections] parse/fetch error', String(error));
    return [];
  }
}

// ----- Main handler --------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const address: string | undefined = body.address;
    const state: string | undefined = body.state;
    const district: string | null = normalizeDistrict(body.district ?? null);
    const city: string | null = normalizeCity(body.city ?? null);
    const lat: number | null = typeof body.lat === 'number' ? body.lat : null;
    const lng: number | null = typeof body.lng === 'number' ? body.lng : null;
    const force: boolean = body.force === true;

    if (!state) {
      return new Response(JSON.stringify({ error: 'state is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let shouldFetch = force;
    if (!force) {
      // Cache check: require fresh rows for this address context, not merely any
      // row in the state. A fresh NJ Senate row must not suppress an NJ-06 House
      // or Piscataway municipal ballot lookup.
      const cacheCutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
      const todayIso = new Date().toISOString().slice(0, 10);
      const expectedJurisdictions = new Set(['US', state.toUpperCase()]);
      const houseJurisdiction = districtJurisdiction(state, district);
      if (houseJurisdiction) expectedJurisdictions.add(houseJurisdiction);
      if (city) expectedJurisdictions.add(city);

      const { data: cachedRows } = await supabase
        .from('elections')
        .select('id, level, state, jurisdiction, source, updated_at')
        .or(`state.eq.${state},state.is.null`)
        .gte('election_date', todayIso)
        .gte('updated_at', cacheCutoff);

      const freshRows = cachedRows ?? [];
      const hasFederalStatewideOrNational = freshRows.some((row: any) => {
        if (row.level !== 'federal') return false;
        const normalized = normalizeText(row.jurisdiction);
        return normalized === 'us' || normalized === normalizeText(state);
      });
      const hasFederalHouse = !houseJurisdiction || freshRows.some((row: any) => (
        row.level === 'federal' && normalizeText(row.jurisdiction) === normalizeText(houseJurisdiction)
      ));
      const hasFederalScope = hasFederalStatewideOrNational && hasFederalHouse;
      const hasLocalScope = !city || freshRows.some((row: any) => row.level === 'local' && jurisdictionMatchesCity(row.jurisdiction, city));

      shouldFetch = !(hasFederalScope && hasLocalScope);
      console.log('[fetch-upcoming-elections] cache scope', {
        state, district, city, lat, lng, cachedRows: freshRows.length,
        hasFederalStatewideOrNational, hasFederalHouse, hasFederalScope, hasLocalScope, shouldFetch,
        expectedJurisdictions: Array.from(expectedJurisdictions),
      });
    }

    if (shouldFetch) {
      console.log('[fetch-upcoming-elections] queueing background fetch', { state, district, force });
      // Run fetch+persist in background to avoid 150s idle timeout.
      // Client polls and re-fetches; cached rows are returned immediately below.
      EdgeRuntime.waitUntil((async () => {
        try {
          const [fecRows, civicRows, aiRows] = await Promise.all([
            fetchFEC(state, district),
            fetchGoogleCivic(address ?? ''),
            fetchAIUpcomingElections({ state, district, city, address }),
          ]);
          console.log('[fetch-upcoming-elections] fetched rows', { fec: fecRows.length, civic: civicRows.length, ai: aiRows.length });
          await persistAll(supabase, [...fecRows, ...civicRows, ...aiRows]);
          console.log('[fetch-upcoming-elections] background persist complete');
        } catch (e) {
          console.error('[fetch-upcoming-elections] background error', e);
        }
      })());
    }

    // Read back the joined response.
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: elections } = await supabase
      .from('elections')
      .select('id, election_date, election_type, level, state, jurisdiction, name, source')
      .gte('election_date', todayIso)
      .or(`state.eq.${state},state.is.null`)
      .order('election_date', { ascending: true });

    const electionIds = (elections ?? []).map(e => e.id);
    const { data: ec } = await supabase
      .from('election_candidates')
      .select('election_id, candidate_id, office, is_incumbent, status')
      .in('election_id', electionIds.length ? electionIds : ['00000000-0000-0000-0000-000000000000']);

    const candidateIds = Array.from(new Set((ec ?? []).map(r => r.candidate_id)));
    const { data: cands } = candidateIds.length
      ? await supabase
          .from('candidates')
          .select('id, name, party, office, state, district, image_url, overall_score, coverage_tier, confidence, answers_source')
          .in('id', candidateIds)
      : { data: [] as any[] };

    const candById = new Map<string, any>((cands ?? []).map(c => [c.id, c]));
    const ecByEl = new Map<string, any[]>();
    for (const r of ec ?? []) {
      if (!ecByEl.has(r.election_id)) ecByEl.set(r.election_id, []);
      ecByEl.get(r.election_id)!.push(r);
    }

    const out: ElectionResponseRow[] = (elections ?? []).map(e => ({
      ...e,
      candidates: (ecByEl.get(e.id) ?? []).map(r => {
        const c = candById.get(r.candidate_id);
        if (!c) {
          return {
            candidate_id: r.candidate_id, name: 'Unknown', party: 'Other',
            office: r.office, state: '', district: null, image_url: null,
            is_incumbent: r.is_incumbent, overall_score: null,
            coverage_tier: 'tier_3', confidence: null, answers_source: null, is_pending_research: true,
          };
        }
        return {
          candidate_id: c.id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          district: c.district,
          image_url: c.image_url,
          is_incumbent: r.is_incumbent,
          overall_score: c.overall_score,
          coverage_tier: c.coverage_tier,
          confidence: c.confidence ?? null,
          answers_source: c.answers_source,
          is_pending_research: c.answers_source === 'pending_research' || (c.overall_score === 0 && c.answers_source !== 'calculated_from_answers'),
        };
      }),
    }));

    const context = { state, district, city };
    const scopedOut = out.filter((e) => electionMatchesUserContext(e, context));
    console.log('[fetch-upcoming-elections] readback scope', {
      state, district, city, readRows: out.length, returnedRows: scopedOut.length,
    });

    const grouped = {
      federal: scopedOut.filter(e => e.level === 'federal'),
      state: scopedOut.filter(e => e.level === 'state'),
      local: scopedOut.filter(e => e.level === 'local'),
    };

    return new Response(JSON.stringify(grouped), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[fetch-upcoming-elections] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ---- persist + auto-onboard ----------------------------------------------

async function persistAll(supabase: any, rows: ElectionPayload[]) {
  const newCandidateIds: string[] = [];
  const newCandidateMeta = new Map<string, CandidatePayload>();

  for (const row of rows) {
    // Manual upsert (the unique index uses COALESCE expressions, which PostgREST
    // onConflict cannot target). Look up by canonical keys; insert if missing.
    let electionId: string | null = null;
    const lookup = await supabase
      .from('elections')
      .select('id')
      .eq('source', row.source)
      .eq('election_date', row.election_date)
      .eq('source_ref', row.source_ref ?? '')
      .maybeSingle();

    if (lookup.data?.id) {
      electionId = lookup.data.id;
      const { error: updErr } = await supabase
        .from('elections')
        .update({
          election_type: row.election_type,
          level: row.level,
          state: row.state,
          jurisdiction: row.jurisdiction,
          name: row.name,
        })
        .eq('id', electionId);
      if (updErr) console.warn('[persist] failed to refresh election', row.source, row.source_ref, updErr.message);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('elections')
        .insert({
          election_date: row.election_date,
          election_type: row.election_type,
          level: row.level,
          state: row.state,
          jurisdiction: row.jurisdiction,
          name: row.name,
          source: row.source,
          source_ref: row.source_ref ?? null,
        })
        .select('id')
        .maybeSingle();
      if (insErr || !inserted) {
        console.warn('[persist] failed to insert election', row.source, row.source_ref, insErr?.message);
        continue;
      }
      electionId = inserted.id;
    }

    await persistCandidates(supabase, electionId, row.candidates, newCandidateIds, newCandidateMeta);
  }

  // Kick off background research for up to MAX_RESEARCH_PER_RUN new candidates.
  const toResearch = newCandidateIds.slice(0, MAX_RESEARCH_PER_RUN);
  if (toResearch.length > 0) {
    EdgeRuntime.waitUntil((async () => {
      for (const id of toResearch) {
        const meta = newCandidateMeta.get(id)!;
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/get-candidate-answers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              [INTERNAL_CHAIN_HEADER]: SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              candidateId: id,
              candidateName: meta.name,
              candidateParty: meta.party,
              candidateOffice: meta.office,
              candidateState: meta.state,
              useBackground: true,
            }),
          });
        } catch (e) {
          console.error('[research-kick] failed for', id, e);
        }
      }
    })());
  }
}

async function persistCandidates(
  supabase: any,
  electionId: string,
  candidates: CandidatePayload[],
  newCandidateIds: string[],
  newCandidateMeta: Map<string, CandidatePayload>,
) {
  // Normalization helpers — mirror the Postgres `_candidate_*` functions.
  const nameKey = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[,.]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t && !['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr'].includes(t))
      .sort()
      .join(' ');
  const officeClass = (o: string) => {
    const x = (o || '').toLowerCase();
    if (/senator|u\.s\. senate|us senate/.test(x)) return 'senate';
    if (/representative|u\.s\. house|us house|congress/.test(x)) return 'house';
    if (/president/.test(x)) return 'president';
    if (/governor/.test(x)) return 'governor';
    return x || 'other';
  };
  const districtKey = (d?: string | null) => {
    if (!d) return null;
    const t = String(d).replace(/^0+/, '');
    return t || '0';
  };

  for (const c of candidates) {
    // 1) Try collapsing by FEC candidate id.
    const looksLikeFecId = /^[HSP]\d[A-Z]{2}\d+$/.test(c.id);
    const fecLookup = c.fec_candidate_id || (looksLikeFecId ? c.id : null);
    if (fecLookup) {
      const { data: byFec } = await supabase
        .from('candidates')
        .select('id')
        .eq('fec_candidate_id', fecLookup)
        .maybeSingle();
      if (byFec && byFec.id !== c.id) {
        console.log(`[persist] collapsing FEC id ${c.id} → canonical ${byFec.id}`);
        c.id = byFec.id;
      }
    }

    // 2) Fallback: collapse by normalized (name, state, office class, district).
    {
      const targetKey = nameKey(c.name);
      const targetClass = officeClass(c.office);
      const targetDist = districtKey(c.district);
      const { data: candidatesInState } = await supabase
        .from('candidates')
        .select('id, name, office, district')
        .eq('state', c.state || 'US');
      const match = (candidatesInState || []).find((row: any) => {
        if (row.id === c.id) return false;
        if (nameKey(row.name) !== targetKey) return false;
        if (officeClass(row.office) !== targetClass) return false;
        const rd = districtKey(row.district);
        if (rd && targetDist && rd !== targetDist) return false;
        return true;
      });
      if (match) {
        console.log(`[persist] collapsing ${c.id} → existing ${match.id} by name+state+office`);
        c.id = match.id;
      }
    }

    // 3) Check if candidate exists.
    const { data: existing } = await supabase
      .from('candidates')
      .select('id, answers_source')
      .eq('id', c.id)
      .maybeSingle();

    if (!existing) {
      const insertRow = {
        id: c.id,
        name: c.name,
        party: c.party,
        office: c.office,
        state: c.state || 'US',
        district: c.district,
        image_url: c.image_url,
        fec_candidate_id: c.fec_candidate_id ?? null,
        is_incumbent: c.is_incumbent,
        overall_score: 0,
        coverage_tier: 'tier_3',
        confidence: 'low',
        answers_source: 'pending_research',
        score_version: 'v1.0',
      };
      const { error: insErr } = await supabase.from('candidates').insert(insertRow);
      if (insErr) {
        // The DB-level prevent_duplicate_candidate trigger will block name/state/office
        // collisions even if the lookup above missed them — log and skip.
        console.warn('[persist] candidate insert blocked/failed', c.id, insErr.message);
      } else {
        newCandidateIds.push(c.id);
        newCandidateMeta.set(c.id, c);
      }
    }

    // Upsert election_candidate link.
    const { error: ecErr } = await supabase.from('election_candidates').upsert({
      election_id: electionId,
      candidate_id: c.id,
      office: c.office,
      status: c.status ?? 'declared',
      is_incumbent: c.is_incumbent,
      source: c.source,
      source_ref: c.source_ref ?? null,
    }, { onConflict: 'election_id,candidate_id' });
    if (ecErr) console.warn('[persist] ec upsert failed', ecErr.message);
  }
}
