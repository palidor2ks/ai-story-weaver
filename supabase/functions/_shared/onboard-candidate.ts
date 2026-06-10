// Canonical candidate onboarding + dedup funnel shared by every discovery source:
// the on-demand `fetch-upcoming-elections` path AND the scheduled `discover-*` jobs.
//
//   • resolveAndUpsertCandidate — collapse a discovered candidate onto the canonical
//     person/candidate (FEC id → candidate_fec_ids alias → resolve_person → name/office)
//     and insert a skeleton row (answers_source='pending_research') if it's new.
//   • upsertElection / linkElectionCandidate — idempotent election + membership rows.
//   • loadHiddenStates + the visible-states gate — when `restrictToVisible` is set,
//     candidates in hidden states are skipped (President / national are always allowed).
//   • kickResearch — fire throttled background enrichment via get-candidate-answers.
//
// The dedup logic is ported verbatim from the original inline persistCandidates() so the
// existing on-demand behavior is preserved; the new behavior (visible-states gate,
// per-run in-state cache) is strictly opt-in via `opts`.

export type Level = 'federal' | 'state' | 'local';
export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Other';

export interface CandidateInput {
  id: string;
  name: string;
  party: Party;
  office: string;
  state: string;
  district?: string | null;
  is_incumbent: boolean;
  image_url?: string | null;
  fec_candidate_id?: string | null;
  /**
   * FEC principal committee id for this candidacy. FEC assigns one principal
   * committee per person across offices, so it is the strongest cross-office
   * identity signal — used to collapse a House incumbent's new Senate candidacy
   * onto the existing person instead of minting a duplicate. See
   * docs/candidate-deduplication-plan.md.
   */
  principal_committee_id?: string | null;
  source: string;
  source_ref?: string | null;
  status?: string;
}

export interface ElectionInput {
  election_date: string; // YYYY-MM-DD
  election_type: string;
  level: Level;
  state: string | null;
  jurisdiction: string | null;
  name: string;
  source: string;
  source_ref?: string | null;
}

const INTERNAL_CHAIN_HEADER = 'x-internal-chain-secret';

// ----- pure helpers --------------------------------------------------------

export function mapParty(raw: string | undefined | null): Party {
  if (!raw) return 'Other';
  const s = raw.toLowerCase();
  if (s.includes('dem')) return 'Democrat';
  if (s.includes('rep')) return 'Republican';
  if (s.includes('ind') || s.includes('non')) return 'Independent';
  return 'Other';
}

export const US_STATE_ABBREVS: Record<string, string> = {
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

export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return US_STATE_ABBREVS[trimmed.toLowerCase()] ?? null;
}

export function nameKey(s: string): string {
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

export function districtKey(d?: string | null): string | null {
  if (!d) return null;
  const t = String(d).replace(/^0+/, '').toLowerCase();
  return t || '0';
}

export function officeClass(o: string): string {
  const x = (o || '').toLowerCase();
  if (/president|white house/.test(x)) return 'president';
  if (/governor/.test(x)) return 'governor';
  if (/state\s+senate|state senator/.test(x)) return 'state-senate';
  if (/state\s+(assembly|house|representative|delegate|legislature)/.test(x)) return 'state-house';
  if (/u\.?s\.?\s+senate|us senate|senator/.test(x)) return 'senate';
  if (/u\.?s\.?\s+house|us house|congress|representative/.test(x)) return 'house';
  if (/mayor/.test(x)) return 'mayor';
  if (/council|alder|select(wo)?man|commissioner|freeholder/.test(x)) return 'local-council';
  return x.replace(/\s+/g, ' ').trim() || 'other';
}

export async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function firstTuesdayAfterFirstMonday(year: number, month: number): string {
  // Standard U.S. general election: Tue after first Mon of November.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dow = first.getUTCDay(); // 0=Sun..6=Sat
  const firstMon = ((1 - dow + 7) % 7) + 1; // day of month
  const tueAfter = firstMon + 1;
  const date = new Date(Date.UTC(year, month - 1, tueAfter));
  return date.toISOString().slice(0, 10);
}

export function nextCycles(): string[] {
  const y = new Date().getFullYear();
  const even = y % 2 === 0 ? y : y + 1;
  return [String(even), String(even + 2)];
}

// ----- visible-states gate -------------------------------------------------

/** Visible = NOT present in hidden_states (mirrors the app-wide convention). */
export async function loadHiddenStates(supabase: any): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('hidden_states').select('state_code');
    return new Set((data ?? []).map((r: any) => String(r.state_code).toUpperCase()));
  } catch (e) {
    console.warn('[onboard] loadHiddenStates failed (treating all visible):', (e as Error).message);
    return new Set();
  }
}

function isNationalRace(state: string | null | undefined, office: string): boolean {
  const st = (state || '').toUpperCase();
  return !st || st === 'US' || officeClass(office) === 'president';
}

// ----- onboarding ----------------------------------------------------------

export interface OnboardOpts {
  hiddenSet?: Set<string>;
  /** When true, candidates in hidden states are skipped (President/national always kept). */
  restrictToVisible?: boolean;
  /** Optional per-run cache of candidates-in-state, to avoid a full-state fetch per candidate. */
  inStateCache?: Map<string, Array<{ id: string; name: string; office: string; district: string | null }>>;
}

export async function upsertElection(supabase: any, row: ElectionInput): Promise<string | null> {
  // Manual upsert (the unique index uses COALESCE expressions, which PostgREST
  // onConflict cannot target). Look up by canonical keys; insert if missing.
  const lookup = await supabase
    .from('elections')
    .select('id')
    .eq('source', row.source)
    .eq('election_date', row.election_date)
    .eq('source_ref', row.source_ref ?? '')
    .maybeSingle();

  if (lookup.data?.id) return lookup.data.id;

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
    console.warn('[onboard] failed to insert election', row.source, row.source_ref, insErr?.message);
    return null;
  }
  return inserted.id;
}

/**
 * Resolve a discovered candidate to the canonical candidate row, inserting a skeleton
 * (answers_source='pending_research') when new. Returns the canonical id for linking, or
 * candidateId=null when the candidate was skipped (hidden state, or already covered by a
 * static_officials record). Ported verbatim from fetch-upcoming-elections' persistCandidates.
 */
export async function resolveAndUpsertCandidate(
  supabase: any,
  c: CandidateInput,
  opts: OnboardOpts = {},
): Promise<{ candidateId: string | null; isNew: boolean; skipped?: string }> {
  // Visible-states gate (opt-in). National/President races are always kept.
  if (opts.restrictToVisible && opts.hiddenSet && !isNationalRace(c.state, c.office)) {
    if (opts.hiddenSet.has((c.state || '').toUpperCase())) {
      return { candidateId: null, isNew: false, skipped: 'hidden_state' };
    }
  }

  let resolvedPersonId: string | null = null;

  // 0) Strongest signal — shared principal committee. FEC assigns one principal
  // committee per person across offices, so if this committee is already linked to
  // an existing candidate, the discovered candidacy is the SAME person changing
  // office (e.g. a U.S. House incumbent filing for U.S. Senate). Collapse onto that
  // candidate. Unlike step 3 below, this is office-agnostic, which is exactly the
  // case the office-scoped fallback misses. See docs/candidate-deduplication-plan.md.
  if (c.principal_committee_id) {
    const { data: byCommittee } = await supabase
      .from('candidate_committees')
      .select('candidate_id')
      .eq('fec_committee_id', c.principal_committee_id)
      .eq('active', true)
      .order('candidate_id', { ascending: true })
      .limit(1);
    const committeeOwner = byCommittee?.[0]?.candidate_id;
    if (committeeOwner && committeeOwner !== c.id) {
      console.log(`[onboard] collapsing ${c.id} onto ${committeeOwner} via shared committee ${c.principal_committee_id}`);
      c.id = committeeOwner;
    }
  }

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
      c.id = byFec.id;
    } else {
      const { data: byAlias } = await supabase
        .from('candidate_fec_ids')
        .select('candidate_id')
        .eq('fec_candidate_id', fecLookup)
        .limit(1);
      const aliasId = byAlias?.[0]?.candidate_id;
      if (aliasId && aliasId !== c.id) c.id = aliasId;
    }
  }

  // 2) Person table match: reuse an existing profile resolved from another source.
  try {
    const { data: pid } = await supabase.rpc('resolve_person', {
      _name: c.name,
      _state: c.state || 'US',
      _office: c.office,
      _bioguide_id: null,
      _fec_candidate_id: c.fec_candidate_id ?? null,
      _openstates_id: null,
    });
    if (pid) {
      resolvedPersonId = pid as string;
      const { data: byPerson } = await supabase
        .from('candidates')
        .select('id')
        .eq('person_id', pid as string)
        .limit(1);
      const personCandidateId = byPerson?.[0]?.id;
      if (personCandidateId && personCandidateId !== c.id) c.id = personCandidateId;
    }
  } catch (e) {
    console.warn('[onboard] resolve_person candidate match failed (continuing):', (e as Error).message);
  }

  // 3) Fallback: collapse by normalized (name, state, office class, district).
  {
    const targetKey = nameKey(c.name);
    const targetClass = officeClass(c.office);
    const targetDist = districtKey(c.district);
    const stateCode = c.state || 'US';

    let candidatesInState: Array<{ id: string; name: string; office: string; district: string | null }>;
    if (opts.inStateCache) {
      const cached = opts.inStateCache.get(stateCode);
      if (cached) {
        candidatesInState = cached;
      } else {
        const { data } = await supabase.from('candidates').select('id, name, office, district').eq('state', stateCode);
        candidatesInState = (data || []) as any[];
        opts.inStateCache.set(stateCode, candidatesInState);
      }
    } else {
      const { data } = await supabase.from('candidates').select('id, name, office, district').eq('state', stateCode);
      candidatesInState = (data || []) as any[];
    }

    const match = candidatesInState.find((row: any) => {
      if (row.id === c.id) return false;
      if (nameKey(row.name) !== targetKey) return false;
      if (officeClass(row.office) !== targetClass) return false;
      const rd = districtKey(row.district);
      if (rd && targetDist && rd !== targetDist) return false;
      return true;
    });
    if (match) c.id = match.id;
  }

  // 4) Check if candidate exists.
  const { data: existing } = await supabase
    .from('candidates')
    .select('id, answers_source')
    .eq('id', c.id)
    .maybeSingle();

  if (existing) return { candidateId: c.id, isNew: false };

  if (!resolvedPersonId) {
    try {
      const { data: pid } = await supabase.rpc('resolve_person', {
        _name: c.name,
        _state: c.state || 'US',
        _office: c.office,
        _bioguide_id: null,
        _fec_candidate_id: c.fec_candidate_id ?? null,
        _openstates_id: null,
      });
      resolvedPersonId = (pid as string) ?? null;
    } catch (e) {
      console.warn('[onboard] resolve_person insert metadata failed (continuing):', (e as Error).message);
    }
  }

  // Guard: skip inserting a duplicate candidate row when a static_officials record
  // already covers this person (avoids ghost profiles for incumbents).
  if (resolvedPersonId) {
    const { data: backed } = await supabase
      .from('static_officials')
      .select('id')
      .eq('person_id', resolvedPersonId)
      .limit(1);
    if (backed && backed.length > 0) {
      console.log(`[onboard] skipping candidate insert ${c.id} — static_officials covers person ${resolvedPersonId}`);
      return { candidateId: null, isNew: false, skipped: 'static_official' };
    }
  }

  const insertRow = {
    id: c.id,
    name: c.name,
    party: c.party,
    office: c.office,
    state: c.state || 'US',
    district: c.district,
    image_url: c.image_url ?? null,
    fec_candidate_id: c.fec_candidate_id ?? null,
    person_id: resolvedPersonId,
    is_incumbent: c.is_incumbent,
    overall_score: 0,
    coverage_tier: 'tier_3',
    confidence: 'low',
    answers_source: 'pending_research',
    score_version: 'v1.0',
  };
  const { error: insErr } = await supabase.from('candidates').insert(insertRow);
  if (insErr) {
    // Insert failed (commonly a race where the row now exists). Match the original
    // behavior: don't count it as new, but still return the id so the caller links the
    // election_candidate row.
    console.warn('[onboard] candidate insert blocked/failed', c.id, insErr.message);
    return { candidateId: c.id, isNew: false };
  }

  // Keep the per-run in-state cache consistent so later candidates see this insert.
  if (opts.inStateCache) {
    const list = opts.inStateCache.get(c.state || 'US');
    if (list) list.push({ id: c.id, name: c.name, office: c.office, district: c.district ?? null });
  }

  return { candidateId: c.id, isNew: true };
}

export async function linkElectionCandidate(
  supabase: any,
  electionId: string,
  candidateId: string,
  c: CandidateInput,
): Promise<void> {
  const { error } = await supabase.from('election_candidates').upsert(
    {
      election_id: electionId,
      candidate_id: candidateId,
      office: c.office,
      status: c.status ?? 'declared',
      is_incumbent: c.is_incumbent,
      source: c.source,
      source_ref: c.source_ref ?? null,
    },
    { onConflict: 'election_id,candidate_id' },
  );
  if (error) console.warn('[onboard] ec upsert failed', error.message);
}

/** Fire background research for newly-onboarded candidates. Caller throttles the list size. */
export async function kickResearch(
  supabaseUrl: string,
  serviceKey: string,
  items: Array<{ id: string; meta: CandidateInput }>,
): Promise<void> {
  for (const { id, meta } of items) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/get-candidate-answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [INTERNAL_CHAIN_HEADER]: serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
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
      console.error('[onboard] research kick failed for', id, e);
    }
  }
}
