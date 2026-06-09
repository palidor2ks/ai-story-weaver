// Cron orchestrator for legislator voting-record sync.
//
// The per-member vote functions (fetch-floor-votes, fetch-member-votes) each
// process a single legislator per call and cannot iterate the roster on their
// own, so pg_cron cannot call them directly. This function is the "drain"
// orchestrator (same pattern as the NJ/FL finance crons): on each tick it picks
// the N stalest federal legislators and drives both sync functions for each.
//
// Auth: gated by a Vault-backed shared secret sent as the `x-sync-secret`
// header and validated via the service-role-only RPC `check_vote_sync_secret`.
// The same secret is forwarded to fetch-floor-votes (which accepts it as an
// alternative to an admin JWT). fetch-member-votes is already public.
//
// Body (all optional):
//   { "batch": 8, "scope": "both"|"floor"|"member", "congressList": [119,118,...] }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEFAULT_BATCH = 8;
const PER_CALL_DELAY_MS = 250; // gentle spacing between members to avoid rate limits

// Federal legislators are stored in `candidates` with a Bioguide-pattern id
// ([A-Z][0-9]{6}), matched here with a text-range filter (same as the admin UI).
const BIOGUIDE_LO = 'A000000';
const BIOGUIDE_HI = 'Z999999';

function chamberFromOffice(office: string | null): 'house' | 'senate' {
  return (office || '').toLowerCase().includes('senat') ? 'senate' : 'house';
}

async function callFunction(slug: string, body: unknown, syncSecret: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
  if (syncSecret) headers['x-sync-secret'] = syncSecret;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.ok, body: text.slice(0, 300) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const syncSecret = req.headers.get('x-sync-secret');
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth: shared secret validated against Vault (service-role-only RPC).
  const { data: secretOk } = await admin.rpc('check_vote_sync_secret', { p_token: syncSecret || '' });
  if (secretOk !== true) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batch = Math.max(1, Math.min(50, Number(body?.batch) || DEFAULT_BATCH));
    const scope: 'both' | 'floor' | 'member' = ['floor', 'member'].includes(body?.scope) ? body.scope : 'both';
    const congressList = Array.isArray(body?.congressList) ? body.congressList : undefined;

    // Pick the N stalest federal legislators. There is no FK between candidates
    // and vote_sync_status, so we can't embed/order across them in one query —
    // fetch both (the roster is ~540 rows) and merge: never-synced first (no
    // status row), then oldest last_sync_started_at.
    const { data: legislators, error: legErr } = await admin
      .from('candidates')
      .select('id, name, office')
      .gte('id', BIOGUIDE_LO)
      .lte('id', BIOGUIDE_HI);
    if (legErr) throw legErr;
    if (!legislators || legislators.length === 0) {
      return new Response(JSON.stringify({ status: 'idle', message: 'no federal legislators found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startedAt = new Map<string, string | null>();
    const ids = legislators.map((l) => l.id);
    const CHUNK = 300;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: st } = await admin
        .from('vote_sync_status')
        .select('candidate_id, last_sync_started_at')
        .in('candidate_id', ids.slice(i, i + CHUNK));
      for (const r of st || []) startedAt.set(r.candidate_id, r.last_sync_started_at);
    }

    const members = legislators
      .slice()
      .sort((a, b) => {
        const av = startedAt.has(a.id) ? startedAt.get(a.id) : null; // missing row => null => stalest
        const bv = startedAt.has(b.id) ? startedAt.get(b.id) : null;
        if (av == null && bv == null) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        return String(av).localeCompare(String(bv));
      })
      .slice(0, batch);

    const results: Array<Record<string, unknown>> = [];
    for (const m of members) {
      const chamber = chamberFromOffice(m.office);
      const entry: Record<string, unknown> = { id: m.id, name: m.name, chamber };

      if (scope === 'both' || scope === 'floor') {
        entry.floor = await callFunction(
          'fetch-floor-votes',
          { bioguideId: m.id, chamber, ...(congressList ? { congressList } : {}) },
          syncSecret,
        );
      }
      if (scope === 'both' || scope === 'member') {
        // fetch-member-votes is public; no secret needed but harmless to send.
        entry.member = await callFunction(
          'fetch-member-votes',
          { bioguideId: m.id, persistVotes: true },
          syncSecret,
        );
      }
      results.push(entry);
      await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS));
    }

    return new Response(
      JSON.stringify({ status: 'ok', scope, batch, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-legislator-votes] error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
