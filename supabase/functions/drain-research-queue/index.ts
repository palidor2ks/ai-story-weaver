// Phase 2 — throttled enrichment queue drainer.
//
// Discovery (discover-fec-candidates / fetch-upcoming-elections) inserts skeleton
// candidates with answers_source='pending_research' and only kicks research for a few per
// run. This scheduled worker drains the rest at a safe, tunable rate: it claims the oldest
// pending candidates (VISIBLE states only), records an attempt, and fires
// get-candidate-answers — the same research entry point discovery uses (internal-chain
// auth + useBackground). A candidate leaves the queue when get-candidate-answers flips
// answers_source to 'ai_generated'.
//
// Idempotent + self-healing: last_research_at is a cooldown lease so in-flight or
// recently-tried candidates aren't re-kicked; research_attempts caps retries on candidates
// that never resolve. Invoked by pg_cron every 30 min. Cost is bounded by batchSize × cadence.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type CandidateInput, loadHiddenStates, kickResearch } from '../_shared/onboard-candidate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SOURCE = 'research-queue';
const DEFAULT_BATCH = 5;
const HARD_MAX_BATCH = 25;
const DEFAULT_COOLDOWN_HOURS = 6;
const DEFAULT_MAX_ATTEMPTS = 3;

import { requireCronAuth } from '../_shared/cron-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;



  const body = await req.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(HARD_MAX_BATCH, Number(body.batchSize) || DEFAULT_BATCH));
  const cooldownHours = Number.isFinite(Number(body.cooldownHours)) ? Math.max(0, Number(body.cooldownHours)) : DEFAULT_COOLDOWN_HOURS;
  const maxAttempts = Math.max(1, Number(body.maxAttempts) || DEFAULT_MAX_ATTEMPTS);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const result = await drain(supabase, batchSize, cooldownHours, maxAttempts);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[drain-research-queue] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function drain(supabase: any, batchSize: number, cooldownHours: number, maxAttempts: number) {
  const startedAt = new Date().toISOString();
  const cooldownCutoff = new Date(Date.now() - cooldownHours * 3600 * 1000).toISOString();
  const hiddenSet = await loadHiddenStates(supabase);

  // Pull a generous window of the most-claimable pending candidates; the cooldown +
  // visible-states filters are applied in code (avoids brittle PostgREST or()/in() strings).
  const { data: rows, error } = await supabase
    .from('candidates')
    .select('id, name, party, office, state, district, is_incumbent, last_research_at, research_attempts')
    .eq('answers_source', 'pending_research')
    .lt('research_attempts', maxAttempts)
    .order('last_research_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(batchSize * 4);

  if (error) {
    await writeStatus(supabase, startedAt, 'error', 0, 0, error.message);
    return { status: 'error', error: error.message };
  }

  const claimable = (rows ?? [])
    .filter((r: any) => {
      const st = (r.state || '').toUpperCase();
      const visible = st === 'US' || st === '' || !hiddenSet.has(st);
      const offCooldown = !r.last_research_at || r.last_research_at < cooldownCutoff;
      return visible && offCooldown;
    })
    .slice(0, batchSize);

  if (claimable.length === 0) {
    await writeStatus(supabase, startedAt, 'idle', 0, await pendingCount(supabase), null);
    return { status: 'idle', kicked: 0 };
  }

  // Claim (cooldown lease + attempt increment) BEFORE kicking, so the next run / a
  // concurrent invocation skip these while research is in flight.
  const nowIso = new Date().toISOString();
  for (const r of claimable) {
    const { error: claimErr } = await supabase
      .from('candidates')
      .update({ last_research_at: nowIso, research_attempts: (r.research_attempts ?? 0) + 1 })
      .eq('id', r.id);
    if (claimErr) console.warn('[drain-research-queue] claim failed', r.id, claimErr.message);
  }

  // Fire research via the shared kick (internal-chain auth + useBackground).
  const items = claimable.map((r: any) => ({
    id: r.id as string,
    meta: {
      id: r.id,
      name: r.name,
      party: r.party,
      office: r.office,
      state: r.state,
      district: r.district,
      is_incumbent: r.is_incumbent,
      source: SOURCE,
    } as CandidateInput,
  }));
  await kickResearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, items);

  const remaining = await pendingCount(supabase);
  await writeStatus(supabase, startedAt, 'idle', claimable.length, remaining, null);
  console.log('[drain-research-queue] kicked', { kicked: claimable.length, remaining });
  return { status: 'ok', kicked: claimable.length, remaining };
}

async function pendingCount(supabase: any): Promise<number> {
  const { count } = await supabase
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('answers_source', 'pending_research');
  return count ?? 0;
}

async function writeStatus(
  supabase: any,
  startedAt: string,
  status: string,
  kicked: number,
  remaining: number,
  err: string | null,
): Promise<void> {
  const { error } = await supabase.from('candidate_ingest_status').upsert(
    {
      source: SOURCE,
      cursor: { remaining_pending: remaining },
      status,
      last_started_at: startedAt,
      last_completed_at: new Date().toISOString(),
      last_total_fetched: kicked,
      last_total_new: kicked,
      error_message: err,
    },
    { onConflict: 'source' },
  );
  if (error) console.warn('[drain-research-queue] status write failed', error.message);
}
