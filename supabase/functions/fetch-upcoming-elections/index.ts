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
    const base = 'https://api.data.gov/fec/v1/candidates/search';
    const common = `api_key=${FEC_API_KEY}&candidate_status=C&per_page=100&cycle=${cycle}`;

    if (district) {
      const dist = district.replace(/^\D+/, '').padStart(2, '0');
      calls.push(
        fetch(`${base}?${common}&office=H&state=${state}&district=${dist}`)
          .then(r => r.json()).then(data => ({ office: 'H', data })).catch(() => ({ office: 'H', data: { results: [] } })),
      );
    }
    calls.push(
      fetch(`${base}?${common}&office=S&state=${state}`)
        .then(r => r.json()).then(data => ({ office: 'S', data })).catch(() => ({ office: 'S', data: { results: [] } })),
    );
    calls.push(
      fetch(`${base}?${common}&office=P`)
        .then(r => r.json()).then(data => ({ office: 'P', data })).catch(() => ({ office: 'P', data: { results: [] } })),
    );

    const settled = await Promise.all(calls);

    // Group into a single "general" + "primary" placeholder; FEC doesn't give us exact dates.
    // Use Nov first Tuesday of cycle year for general.
    const generalDate = firstTuesdayAfterFirstMonday(parseInt(cycle), 10); // Nov

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
      console.log('[fetch-upcoming-elections] fetching fresh', { state, district, force });
      const [fecRows, civicRows] = await Promise.all([
        fetchFEC(state, district),
        fetchGoogleCivic(address ?? ''),
      ]);
      console.log('[fetch-upcoming-elections] fetched rows', { fec: fecRows.length, civic: civicRows.length });
      await persistAll(supabase, [...fecRows, ...civicRows]);
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
  const newCandidateIds: string[] = [];
  const newCandidateMeta = new Map<string, CandidatePayload>();

  for (const row of rows) {
    // Upsert election.
    const { data: el, error: elErr } = await supabase
      .from('elections')
      .upsert({
        election_date: row.election_date,
        election_type: row.election_type,
        level: row.level,
        state: row.state,
        jurisdiction: row.jurisdiction,
        name: row.name,
        source: row.source,
        source_ref: row.source_ref ?? null,
      }, { onConflict: 'source,source_ref,election_date,jurisdiction,state', ignoreDuplicates: false })
      .select('id')
      .maybeSingle();

    if (elErr || !el) {
      // Conflict-without-returning workaround: re-select.
      const { data: existing } = await supabase
        .from('elections')
        .select('id')
        .eq('source', row.source)
        .eq('election_date', row.election_date)
        .eq('source_ref', row.source_ref ?? '')
        .maybeSingle();
      if (!existing) {
        console.warn('[persist] failed to upsert election', elErr);
        continue;
      }
      await persistCandidates(supabase, existing.id, row.candidates, newCandidateIds, newCandidateMeta);
      continue;
    }

    await persistCandidates(supabase, el.id, row.candidates, newCandidateIds, newCandidateMeta);
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
  for (const c of candidates) {
    // Check if candidate exists.
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
        console.warn('[persist] candidate insert failed', c.id, insErr.message);
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
