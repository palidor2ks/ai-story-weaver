// Scheduled nationwide FEC candidate discovery (Phase 1).
//
// Sweeps OpenFEC /candidates/ for the current + next election cycle in bounded page
// batches, onboards new/missing candidates through the shared dedup funnel (VISIBLE
// states only — hidden_states are skipped, President/national always kept), links them to
// a federal general-election row, and kicks throttled enrichment for a few brand-new ones.
//
// Invoked by pg_cron every ~6h. Fully idempotent: existing candidates are no-ops thanks to
// the shared resolver. A per-source page cursor in candidate_ingest_status advances each
// run and wraps at the end so the whole federal field is continuously (re)swept, catching
// new Statement-of-Candidacy filers within a day or so — comfortably inside FEC's rate limit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type CandidateInput,
  type ElectionInput,
  mapParty,
  firstTuesdayAfterFirstMonday,
  nextCycles,
  loadHiddenStates,
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

const SOURCE = 'fec';
const OFFICES = ['H', 'S', 'P'] as const;
type Office = (typeof OFFICES)[number];

const PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 8; // FEC list calls per run
const HARD_MAX_PAGES = 40;
const MAX_CANDIDATES_PER_RUN = 500; // safety cap so a run stays well under the edge timeout
const MAX_RESEARCH_PER_RUN = 5; // throttle expensive AI enrichment kicks

function officeLabel(office: Office, state: string, district: string | null): string {
  if (office === 'H') return `U.S. House ${state}-${district ?? ''}`;
  if (office === 'S') return `U.S. Senate (${state})`;
  return 'President of the United States';
}

async function fecFetch(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn('[discover-fec] non-OK', { status: r.status, body: body.slice(0, 200) });
    return { results: [], pagination: { pages: 0, page: 0, count: 0 } };
  }
  return await r.json();
}

// Persist the page cursor after each page so a background run that gets cut short still
// resumes where it left off (rather than re-sweeping from page 1 forever).
async function saveCursor(supabase: any, cursor: Record<string, number>, startedAt: string): Promise<void> {
  const { error } = await supabase.from('candidate_ingest_status').upsert(
    { source: SOURCE, cursor: { pages: cursor }, status: 'running', last_started_at: startedAt },
    { onConflict: 'source' },
  );
  if (error) console.warn('[discover-fec] cursor save failed', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!FEC_API_KEY) {
    return new Response(JSON.stringify({ error: 'FEC_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const maxPages = Math.max(1, Math.min(HARD_MAX_PAGES, Number(body.maxPages) || DEFAULT_MAX_PAGES));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Sweep in the background so the cron invocation returns immediately.
  EdgeRuntime.waitUntil(runSweep(supabase, maxPages).catch((e) => console.error('[discover-fec] sweep error', e)));

  return new Response(JSON.stringify({ status: 'started', maxPages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function runSweep(supabase: any, maxPages: number): Promise<void> {
  const startedAt = new Date().toISOString();

  // Load the page cursor (position per `${cycle}-${office}`) from the last run.
  const { data: statusRow } = await supabase
    .from('candidate_ingest_status')
    .select('cursor')
    .eq('source', SOURCE)
    .maybeSingle();
  const cursor: Record<string, number> = statusRow?.cursor?.pages ?? {};

  const hiddenSet = await loadHiddenStates(supabase);
  const inStateCache = new Map<string, Array<{ id: string; name: string; office: string; district: string | null }>>();
  const electionCache = new Map<string, string>(); // election source_ref -> id
  const cycles = nextCycles();

  let pagesUsed = 0;
  let processed = 0;
  let totalFetched = 0;
  let totalNew = 0;
  let lastError: string | null = null;
  const newItems: Array<{ id: string; meta: CandidateInput }> = [];

  outer: for (const cycle of cycles) {
    for (const office of OFFICES) {
      const key = `${cycle}-${office}`;
      let page = cursor[key] && cursor[key] > 0 ? cursor[key] : 1;

      while (pagesUsed < maxPages && processed < MAX_CANDIDATES_PER_RUN) {
        const url =
          `https://api.open.fec.gov/v1/candidates/?api_key=${FEC_API_KEY}` +
          `&candidate_status=C&election_year=${cycle}&office=${office}` +
          `&per_page=${PER_PAGE}&page=${page}&sort=name`;

        let data: any;
        try {
          data = await fecFetch(url);
        } catch (e) {
          lastError = String(e);
          break;
        }
        pagesUsed++;
        const results: any[] = data?.results ?? [];
        totalFetched += results.length;

        for (const fc of results) {
          if (processed >= MAX_CANDIDATES_PER_RUN) break;
          const state = office === 'P' ? 'US' : (fc.state || '');
          const district = office === 'H' ? (fc.district ?? null) : null;

          // Cheap visible-states pre-filter (the shared funnel enforces it again).
          if (office !== 'P' && state && hiddenSet.has(String(state).toUpperCase())) continue;

          const candidate: CandidateInput = {
            id: fc.candidate_id,
            name: fc.name || 'Unknown',
            party: mapParty(fc.party_full || fc.party),
            office: officeLabel(office, state, district),
            state,
            district,
            is_incumbent: fc.incumbent_challenge === 'I',
            image_url: null,
            fec_candidate_id: fc.candidate_id,
            source: SOURCE,
            source_ref: cycle,
          };

          const { candidateId, isNew } = await resolveAndUpsertCandidate(supabase, candidate, {
            hiddenSet,
            restrictToVisible: true,
            inStateCache,
          });
          processed++;
          if (!candidateId) continue;
          if (isNew) {
            totalNew++;
            if (newItems.length < MAX_RESEARCH_PER_RUN) newItems.push({ id: candidateId, meta: candidate });
          }

          // Link to the cycle's federal general-election row for this jurisdiction.
          const jurisdiction = office === 'H' ? `${state}-${district ?? ''}` : office === 'S' ? state : 'US';
          const sourceRef = `${cycle}-${office}-${state}-${district ?? ''}`;
          let electionId = electionCache.get(sourceRef);
          if (!electionId) {
            const electionInput: ElectionInput = {
              election_date: firstTuesdayAfterFirstMonday(parseInt(cycle), 11),
              election_type: 'general',
              level: 'federal',
              state: office === 'P' ? null : state,
              jurisdiction,
              name: `${cycle} ${office === 'P' ? 'U.S. Presidential' : 'Federal'} Election`,
              source: SOURCE,
              source_ref: sourceRef,
            };
            const eid = await upsertElection(supabase, electionInput);
            if (eid) {
              electionId = eid;
              electionCache.set(sourceRef, eid);
            }
          }
          if (electionId) await linkElectionCandidate(supabase, electionId, candidateId, candidate);
        }

        const pages = data?.pagination?.pages ?? 0;

        if (results.length === 0 && pages === 0) {
          // Likely a transient non-OK/empty FEC response: stop this office WITHOUT touching
          // the cursor, so the next run retries the same page instead of losing progress.
          break;
        }
        if (results.length < PER_PAGE || page >= pages) {
          // Genuine end of this cycle-office: wrap to page 1 so future runs re-sweep for new filers.
          cursor[key] = 1;
          await saveCursor(supabase, cursor, startedAt);
          break;
        }
        page++;
        cursor[key] = page;
        await saveCursor(supabase, cursor, startedAt);
      }

      if (pagesUsed >= maxPages || processed >= MAX_CANDIDATES_PER_RUN) break outer;
    }
  }

  // Persist cursor + run metrics (mirrors the *_sync_status convention).
  await supabase.from('candidate_ingest_status').upsert(
    {
      source: SOURCE,
      cursor: { pages: cursor },
      status: lastError ? 'error' : 'idle',
      last_started_at: startedAt,
      last_completed_at: new Date().toISOString(),
      last_total_fetched: totalFetched,
      last_total_new: totalNew,
      last_page: pagesUsed,
      error_message: lastError,
    },
    { onConflict: 'source' },
  );

  // Throttled enrichment for brand-new candidates (the rest stay pending_research for the
  // Phase 2 queue drainer / on-demand research).
  if (newItems.length > 0) {
    await kickResearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, newItems);
  }

  console.log('[discover-fec] sweep done', { pagesUsed, processed, totalFetched, totalNew, hadError: !!lastError });
}
