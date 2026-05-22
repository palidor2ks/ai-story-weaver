// Bulk-sync FEC committees (PACs, SuperPACs, party, leadership) into external_pacs.
// Body: { cycles?: number[], committee_types?: string[] }
// Defaults: cycles=[2024,2026], committee_types=['N','Q','O','V','W','X','Y','Z','U']
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEC_API_KEY = Deno.env.get('FEC_API_KEY')!;

const DEFAULT_CYCLES = [2024, 2026];
const DEFAULT_TYPES = ['N', 'Q', 'O', 'V', 'W', 'X', 'Y', 'Z', 'U'];
const PER_PAGE = 100;
const MAX_PAGES_PER_RUN = 400; // safety cap (~40k rows)

async function runSync(supabase: any, sessionId: string, cycles: number[], types: string[]) {
  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let lastIdx: string | undefined;

  const baseParams = new URLSearchParams();
  baseParams.set('api_key', FEC_API_KEY);
  baseParams.set('per_page', String(PER_PAGE));
  baseParams.set('sort', '-receipts');
  for (const t of types) baseParams.append('committee_type', t);
  for (const c of cycles) baseParams.append('cycle', String(c));

  try {
    while (page <= MAX_PAGES_PER_RUN) {
      const params = new URLSearchParams(baseParams);
      if (lastIdx) {
        params.set('last_index', lastIdx);
      } else {
        params.set('page', String(page));
      }
      const r = await fetch(`https://api.open.fec.gov/v1/committees/?${params}`);
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`FEC ${r.status}: ${txt.slice(0, 300)}`);
      }
      const j = await r.json();
      const results = j?.results ?? [];
      if (results.length === 0) break;

      const rows = results.map((res: any) => ({
        fec_committee_id: res.committee_id,
        name: res.name ?? res.committee_id,
        committee_type: res.committee_type ?? null,
        committee_type_full: res.committee_type_full ?? null,
        designation: res.designation ?? null,
        designation_full: res.designation_full ?? null,
        party: res.party ?? null,
        state: res.state ?? null,
        treasurer_name: res.treasurer_name ?? null,
        street_1: res.street_1 ?? null,
        city: res.city ?? null,
        zip: res.zip ?? null,
        filing_frequency: res.filing_frequency ?? null,
        organization_type: res.organization_type ?? null,
        cycles: Array.isArray(res.cycles) ? res.cycles.map(String) : [],
        first_file_date: res.first_file_date ?? null,
        last_file_date: res.last_file_date ?? null,
        is_active: true,
        source: 'fec_api',
      })).filter((r: any) => r.fec_committee_id);

      // Batch upsert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from('external_pacs').upsert(chunk, { onConflict: 'fec_committee_id' });
        if (error) throw error;
        totalUpserted += chunk.length;
      }
      totalFetched += results.length;

      await supabase.from('fec_committee_sync_status').update({
        total_fetched: totalFetched, total_upserted: totalUpserted, last_page: page,
      }).eq('id', sessionId);

      // Pagination via last_indexes when present (better than page beyond 100)
      const next = j?.pagination?.last_indexes;
      if (next && next.last_index) {
        lastIdx = String(next.last_index);
      } else if (!next) {
        page += 1;
        if (page > (j?.pagination?.pages ?? 0)) break;
      } else {
        break; // no more pages
      }
      page += 1;
      await new Promise((res) => setTimeout(res, 150)); // gentle rate limit
    }

    await supabase.from('fec_committee_sync_status').update({
      status: 'completed', completed_at: new Date().toISOString(),
      total_fetched: totalFetched, total_upserted: totalUpserted,
    }).eq('id', sessionId);
  } catch (e) {
    console.error('sync-fec-committees failed', e);
    await supabase.from('fec_committee_sync_status').update({
      status: 'failed', completed_at: new Date().toISOString(),
      error_message: e instanceof Error ? e.message : String(e),
      total_fetched: totalFetched, total_upserted: totalUpserted,
    }).eq('id', sessionId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const cycles = Array.isArray(body.cycles) && body.cycles.length ? body.cycles.map(Number) : DEFAULT_CYCLES;
    const types = Array.isArray(body.committee_types) && body.committee_types.length ? body.committee_types : DEFAULT_TYPES;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: admin-only
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Admin only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    // Don't allow overlapping runs
    const { data: running } = await supabase
      .from('fec_committee_sync_status')
      .select('id')
      .eq('status', 'running')
      .limit(1)
      .maybeSingle();
    if (running) {
      return new Response(JSON.stringify({ error: 'A sync is already running', session_id: running.id }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: session, error: sErr } = await supabase
      .from('fec_committee_sync_status')
      .insert({ status: 'running', triggered_by: userId })
      .select('id')
      .single();
    if (sErr) throw sErr;

    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(runSync(supabase, session.id, cycles, types));

    return new Response(JSON.stringify({ ok: true, session_id: session.id, cycles, types }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('sync-fec-committees error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
