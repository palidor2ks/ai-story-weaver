// Public edge function — returns upcoming elections + candidates for the user's address.
// Auto-onboards any newly-discovered candidate into the `candidates` table and kicks off
// background research via `get-candidate-answers` so they become directly comparable.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  upsertElection,
  resolveAndUpsertCandidate,
  linkElectionCandidate,
  kickResearch,
} from '../_shared/onboard-candidate.ts';

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

const INTERNAL_CHAIN_HEADER = 'x-internal-chain-secret';
const MAX_RESEARCH_PER_RUN = 5;
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

const US_STATE_ABBREVS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return US_STATE_ABBREVS[trimmed.toLowerCase()] ?? null;
}

function nameKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr'].includes(t))
    .sort()
    .join(' ');
}

function districtKey(d?: string | null): string | null {
  if (!d) return null;
  const t = String(d).replace(/^0+/, '').toLowerCase();
  return t || '0';
}

function officeClass(o: string): string {
  const x = (o || '').toLowerCase();
  if (/president|white house/.test(x)) return 'president';
  if (/governor/.test(x)) return 'governor';
  if (/state\s+senate|state senator/.test(x)) return 'state-senate';
  if (/state\s+(assembly|house|representative|delegate|legislature)/.test(x)) return 'state-house';
  if (/u\.?s\.?\s+senate|us senate|senator/.test(x)) return 'senate';
  if (/u\.?s\.?\s+house|us house|congress|representative/.test(x)) return 'house';
  if (/mayor/.test(x)) return 'mayor';
  // County row offices are distinct races from a municipal/ward council seat and
  // must not collapse together (a County Commissioner is not a Town Council member).
  if (/surrogate/.test(x)) return 'county-surrogate';
  if (/commissioner|freeholder/.test(x)) return 'county-commissioner';
  if (/council|alder|select(wo)?man/.test(x)) return 'local-council';
  return x.replace(/\s+/g, ' ').trim() || 'other';
}

// Two records belong to the same race only if their districts are compatible.
// A null/empty district is treated as a wildcard to tolerate inconsistent data,
// but two *different* non-empty districts (e.g. Ward 1 vs Ward 2) never match.
function districtsCompatible(a?: string | null, b?: string | null): boolean {
  const da = districtKey(a);
  const db = districtKey(b);
  if (!da || !db) return true;
  return da === db;
}

function candidatePersonKey(c: ElectionResponseRow['candidates'][number]): string {
  return [nameKey(c.name), (c.state || '').toLowerCase(), officeClass(c.office), districtKey(c.district) ?? ''].join('|');
}

function candidateQuality(c: ElectionResponseRow['candidates'][number]): number {
  return Number(Boolean(c.image_url)) + Number(!c.is_pending_research) * 2 + Number(c.overall_score !== null) * 4;
}

function dedupeResponseCandidates(candidates: ElectionResponseRow['candidates']): ElectionResponseRow['candidates'] {
  const byPerson = new Map<string, ElectionResponseRow['candidates'][number]>();
  for (const candidate of candidates) {
    const key = candidatePersonKey(candidate);
    const existing = byPerson.get(key);
    if (!existing || candidateQuality(candidate) > candidateQuality(existing)) {
      byPerson.set(key, candidate);
    }
  }
  return Array.from(byPerson.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function onlyNextElection(rows: ElectionResponseRow[]): ElectionResponseRow[] {
  const sorted = rows
    .filter((e) => e.candidates.length > 0)
    .sort((a, b) => a.election_date.localeCompare(b.election_date));
  const nextDate = sorted[0]?.election_date;
  if (!nextDate) return [];

  // Merge elections that represent the same race — same candidates appearing in
  // multiple DB rows (from different Google Civic elections or contest variants).
  // Match by name overlap (nameKey) so that candidates with different district/state
  // values are still recognised as duplicates.
  const merged: ElectionResponseRow[] = [];
  for (const e of sorted.filter((row) => row.election_date === nextDate)) {
    const target = merged.find(
      (r) =>
        r.level === e.level &&
        e.candidates.some((c) =>
          r.candidates.some(
            (d) =>
              nameKey(d.name) === nameKey(c.name) &&
              officeClass(d.office) === officeClass(c.office) &&
              districtsCompatible(d.district, c.district),
          )
        ),
    );
    if (target) {
      const seenNames = new Map(target.candidates.map((c) => [nameKey(c.name), c]));
      for (const c of e.candidates) {
        const key = nameKey(c.name);
        const existing = seenNames.get(key);
        if (!existing) {
          target.candidates.push(c);
          seenNames.set(key, c);
        } else if (candidateQuality(c) > candidateQuality(existing)) {
          const idx = target.candidates.indexOf(existing);
          target.candidates[idx] = c;
          seenNames.set(key, c);
        }
      }
      target.candidates.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      merged.push({ ...e, candidates: [...e.candidates] });
    }
  }
  return merged;
}

async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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

    if (district) {
      const dist = district.replace(/^\D+/, '').padStart(2, '0');
      calls.push(fecFetch('H', `${base}?${common}&office=H&state=${state}&district=${dist}`));
    }
    calls.push(fecFetch('S', `${base}?${common}&office=S&state=${state}`));
    calls.push(fecFetch('P', `${base}?${common}&office=P`));

    const settled = await Promise.all(calls);

    // Group into a single "general" + "primary" placeholder; FEC doesn't give us exact dates.
    // Use Nov first Tuesday of cycle year for general.
    const generalDate = firstTuesdayAfterFirstMonday(parseInt(cycle), 11); // November

    for (const { office, data } of settled) {
      const officeLabel = office === 'H' ? `U.S. House ${state}-${district ?? ''}` : office === 'S' ? `U.S. Senate (${state})` : 'President of the United States';
      const candidates: CandidatePayload[] = (data?.results ?? []).map((c: any) => ({
        id: c.candidate_id,
        name: c.name || 'Unknown',
        party: mapParty(c.party_full || c.party),
        office: officeLabel,
        state: office === 'P' ? 'US' : state,
        district: office === 'H' ? district : null,
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
        jurisdiction: office === 'H' ? `${state}-${district ?? ''}` : (office === 'S' ? state : 'US'),
        name: `${cycle} ${office === 'P' ? 'U.S. Presidential' : 'Federal'} Election`,
        source: 'fec',
        source_ref: `${cycle}-${office}-${state}-${district ?? ''}`,
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

    // Accumulate results keyed by (electionDay + officeClass + district) so that
    // multiple Google Civic contests that represent the same race (e.g. a partisan
    // primary contest AND the ward-level contest) are merged into one payload rather
    // than producing duplicate election rows in the DB.
    const raceMap = new Map<string, ElectionPayload>();

    for (const election of upcoming.slice(0, 5)) {
      const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${GOOGLE_CIVIC_API_KEY}&address=${encodeURIComponent(address)}&electionId=${election.id}&returnAllAvailableData=true`;
      const viRes = await fetch(url);
      if (!viRes.ok) continue;
      const vi = await viRes.json();
      const contests: any[] = vi.contests ?? [];

      // Prefer the 2-letter state code from the OCD division ID; fall back to
      // normalizedInput.state (full name like "New Jersey" → "NJ" via lookup map).
      const stateAbbr = election.ocdDivisionId?.match(/state:(\w\w)/)?.[1]?.toUpperCase() ?? null;
      const stateRaw = stateAbbr || vi.normalizedInput?.state || null;

      for (const contest of contests) {
        const contestCandidates: any[] = contest.candidates ?? [];
        if (contestCandidates.length === 0) continue;

        const officeName: string = contest.office || contest.referendumTitle || 'Race';
        const district = contest.district?.name ?? null;
        const level = inferLevel(contest.level, contest.roles, officeName);
        // Canonical state: always 2-letter uppercase, using USPS lookup for full names.
        const state = normalizeState(stateRaw);

        // Normalise candidate IDs using officeClass only (omitting district) so the
        // same person across contest variants with different district labels gets the same ID.
        const candidates: CandidatePayload[] = await Promise.all(contestCandidates.map(async (c: any) => {
          const id = `civic_${await sha1(`${c.name}|${officeClass(officeName)}|${state ?? ''}`)}`;
          return {
            id,
            name: c.name,
            party: mapParty(c.party),
            office: officeName,
            state: state || '',
            district,
            is_incumbent: false,
            image_url: c.photoUrl ?? null,
            source: 'google_civic',
            source_ref: election.id,
          };
        }));

        // Merge into existing payload for this race, or create a new one.
        // Use the raw officeName (not officeClass) so that "City Council" and
        // "County Commissioner" don't collapse into the same payload, while two
        // contest variants with the exact same contest.office still merge.
        const raceKey = `${election.electionDay}|${level}|${officeName.toLowerCase().trim()}|${(district ?? '').toLowerCase()}`;
        const existing = raceMap.get(raceKey);
        if (existing) {
          const seenNames = new Set(existing.candidates.map((c) => nameKey(c.name)));
          for (const c of candidates) {
            if (!seenNames.has(nameKey(c.name))) {
              existing.candidates.push(c);
              seenNames.add(nameKey(c.name));
            }
          }
        } else {
          raceMap.set(raceKey, {
            election_date: election.electionDay,
            election_type: detectType(election.name),
            level,
            state: state,
            jurisdiction: district || vi.normalizedInput?.city || null,
            name: election.name,
            source: 'google_civic',
            source_ref: `${election.id}-${officeClass(officeName)}-${district ?? ''}`,
            candidates,
          });
        }
      }
    }
    return Array.from(raceMap.values());
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

// ----- Main handler --------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const address: string | undefined = body.address;
    const state: string | undefined = body.state;
    const district: string | null = body.district ?? null;
    const force: boolean = body.force === true;

    if (!state) {
      return new Response(JSON.stringify({ error: 'state is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let shouldFetch = force;
    if (!force) {
      // Cache check: any election rows newer than CACHE_TTL_HOURS for this state+district?
      const cacheCutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('elections')
        .select('id, updated_at')
        .eq('state', state)
        .gte('election_date', new Date().toISOString().slice(0, 10))
        .gte('updated_at', cacheCutoff)
        .limit(1);
      shouldFetch = !cached || cached.length === 0;
    }

    if (shouldFetch) {
      console.log('[fetch-upcoming-elections] queueing background fetch', { state, district, force });
      // Run fetch+persist in background to avoid 150s idle timeout.
      // Client polls and re-fetches; cached rows are returned immediately below.
      EdgeRuntime.waitUntil((async () => {
        try {
          const [fecRows, civicRows] = await Promise.all([
            fetchFEC(state, district),
            fetchGoogleCivic(address ?? ''),
          ]);
          console.log('[fetch-upcoming-elections] fetched rows', { fec: fecRows.length, civic: civicRows.length });
          await persistAll(supabase, [...fecRows, ...civicRows]);
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

    const out: ElectionResponseRow[] = onlyNextElection((elections ?? []).map(e => ({
      ...e,
      candidates: dedupeResponseCandidates((ecByEl.get(e.id) ?? []).map(r => {
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
          office: r.office || c.office,
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
      })),
    })));

    const grouped = {
      federal: out.filter(e => e.level === 'federal'),
      state: out.filter(e => e.level === 'state'),
      local: out.filter(e => e.level === 'local'),
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
  // Candidate resolution/dedup/insert now lives in the shared funnel
  // (_shared/onboard-candidate.ts) so this on-demand path and the scheduled discover-*
  // jobs onboard candidates identically. Behavior here is unchanged: the on-demand lookup
  // does NOT restrict to visible states (no restrictToVisible flag passed).
  const newItems: Array<{ id: string; meta: CandidatePayload }> = [];

  for (const row of rows) {
    const electionId = await upsertElection(supabase, row);
    if (!electionId) continue;

    for (const c of row.candidates) {
      const { candidateId, isNew } = await resolveAndUpsertCandidate(supabase, c);
      if (!candidateId) continue; // skipped (covered by static_officials)
      if (isNew) newItems.push({ id: candidateId, meta: c });
      await linkElectionCandidate(supabase, electionId, candidateId, c);
    }
  }

  // Kick off background research for up to MAX_RESEARCH_PER_RUN new candidates.
  const toResearch = newItems.slice(0, MAX_RESEARCH_PER_RUN);
  if (toResearch.length > 0) {
    EdgeRuntime.waitUntil(kickResearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, toResearch));
  }
}

// persistCandidates() was extracted into _shared/onboard-candidate.ts as
// resolveAndUpsertCandidate() + linkElectionCandidate() (the canonical dedup funnel,
// also used by the scheduled discover-* jobs). See persistAll() above.
