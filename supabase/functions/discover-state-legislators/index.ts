// Weekly OpenStates → candidates ingestion for NJ + NC state legislators.
//
// Directory-first: rows land with coverage_tier='tier_3' and answers_source='pending_research'
// but kickResearch is intentionally NOT called — legislators are browseable in the directory
// without burning AI quota for the full body. The shared resolver deduplicates against rows
// already ingested by fetch-civic-officials (same openstates_${id} convention).
//
// Rate limit: OpenStates free tier is 10 req/min. We sleep 7s between page requests.
// Volume is tiny (~290 people total, ~7 pages), so both states finish in one run with no
// page cursor needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type CandidateInput,
  mapParty,
  loadHiddenStates,
  resolveAndUpsertCandidate,
} from '../_shared/onboard-candidate.ts';
import { requireCronAuth } from '../_shared/cron-auth.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPEN_STATES_API_KEY = Deno.env.get('OPEN_STATES_API_KEY') ?? '';

const SOURCE = 'openstates_state_leg';

// Postal code + OpenStates jurisdiction full name (used in the API query).
const STATES = [
  ['NJ', 'New Jersey'],
  ['NC', 'North Carolina'],
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  if (!OPEN_STATES_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPEN_STATES_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Sweep in the background so the cron invocation returns immediately.
  EdgeRuntime.waitUntil(
    runSweep(supabase).catch((e) => console.error('[discover-state-legislators] sweep error', e)),
  );

  return new Response(JSON.stringify({ status: 'started' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function runSweep(supabase: any): Promise<void> {
  const startedAt = new Date().toISOString();

  const hiddenSet = await loadHiddenStates(supabase);
  const inStateCache = new Map<string, Array<{ id: string; name: string; office: string; district: string | null }>>();

  let processed = 0;
  let totalFetched = 0;
  let totalNew = 0;
  let lastError: string | null = null;

  for (const [postal, fullName] of STATES) {
    let page = 1;

    while (true) {
      const url = `https://v3.openstates.org/people?jurisdiction=${encodeURIComponent(fullName)}&per_page=50&page=${page}`;

      let data: any;
      try {
        const res = await fetch(url, {
          headers: {
            'X-API-KEY': OPEN_STATES_API_KEY,
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn('[discover-state-legislators] non-OK response', {
            state: postal,
            page,
            status: res.status,
            body: body.slice(0, 200),
          });
          lastError = `HTTP ${res.status} for ${postal} page ${page}`;
          break;
        }

        data = await res.json();
      } catch (e) {
        console.warn('[discover-state-legislators] fetch error', { state: postal, page, error: String(e) });
        lastError = String(e);
        break;
      }

      const results: any[] = data?.results ?? [];
      totalFetched += results.length;

      for (const person of results) {
        if (!person.current_role) continue;

        const role = person.current_role;
        const office =
          role.org_classification === 'upper'
            ? 'State Senator'
            : role.org_classification === 'lower'
              ? 'State Representative'
              : 'State Legislator';

        // OpenStates v3 returns `party` as a flat string on the .geo endpoint (what
        // fetch-civic-officials uses) but as an array of { name } objects on this bulk
        // /people endpoint. Without this guard mapParty([{...}]) → 'Other' for everyone.
        const rawParty = Array.isArray(person.party)
          ? (person.party[0]?.name ?? null)
          : person.party;
        if (Array.isArray(person.party)) {
          console.log('[discover-state-legislators] party is array-shaped (bulk endpoint):', rawParty);
        }

        const candidate: CandidateInput = {
          // Same id convention as fetch-civic-officials — critical for dedup across sources.
          id: `openstates_${person.id.replace(/\//g, '_')}`,
          name: person.name,
          party: mapParty(rawParty),
          office,
          state: postal,
          district: role.district ? `${postal}-${role.district}` : null,
          is_incumbent: true,
          image_url: person.image || null,
          source: SOURCE,
          source_ref: person.id,
        };

        const { isNew } = await resolveAndUpsertCandidate(supabase, candidate, {
          hiddenSet,
          restrictToVisible: true,
          inStateCache,
        });
        processed++;
        if (isNew) totalNew++;
      }

      const maxPage: number = data?.pagination?.max_page ?? 1;
      if (page >= maxPage || results.length === 0) break;

      page++;
      // Respect OpenStates free-tier rate limit (10 req/min).
      await new Promise((r) => setTimeout(r, 7000));
    }
  }

  // Persist run metrics (mirrors the candidate_ingest_status convention).
  const { error: upsertError } = await supabase.from('candidate_ingest_status').upsert(
    {
      source: SOURCE,
      status: lastError ? 'error' : 'idle',
      last_started_at: startedAt,
      last_completed_at: new Date().toISOString(),
      last_total_fetched: totalFetched,
      last_total_new: totalNew,
      error_message: lastError,
    },
    { onConflict: 'source' },
  );
  if (upsertError) console.warn('[discover-state-legislators] status upsert failed', upsertError.message);

  console.log('[discover-state-legislators] sweep done', {
    processed,
    totalFetched,
    totalNew,
    hadError: !!lastError,
  });
}
