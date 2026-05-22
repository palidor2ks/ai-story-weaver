// Import a single FEC committee by ID into external_pacs.
// Body: { committee_id: string }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEC_API_KEY = Deno.env.get('FEC_API_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const committeeId = String(body.committee_id ?? '').trim().toUpperCase();
    if (!/^C\d{8}$/.test(committeeId)) {
      return new Response(JSON.stringify({ error: 'Invalid committee_id (expected format C########)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: only admins can call this from the client
    const authHeader = req.headers.get('Authorization');
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
    }

    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/?api_key=${FEC_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `FEC API ${r.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const j = await r.json();
    const result = j?.results?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: 'Committee not found at FEC' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      fec_committee_id: committeeId,
      name: result.name ?? committeeId,
      committee_type: result.committee_type ?? null,
      committee_type_full: result.committee_type_full ?? null,
      designation: result.designation ?? null,
      designation_full: result.designation_full ?? null,
      party: result.party ?? null,
      state: result.state ?? null,
      treasurer_name: result.treasurer_name ?? null,
      street_1: result.street_1 ?? null,
      city: result.city ?? null,
      zip: result.zip ?? null,
      filing_frequency: result.filing_frequency ?? null,
      organization_type: result.organization_type ?? null,
      cycles: Array.isArray(result.cycles) ? result.cycles.map(String) : [],
      first_file_date: result.first_file_date ?? null,
      last_file_date: result.last_file_date ?? null,
      is_active: true,
      source: 'manual',
    };

    const { error } = await supabase.from('external_pacs').upsert(row, { onConflict: 'fec_committee_id' });
    if (error) throw error;
    await supabase.rpc('refresh_committee_pool').catch((e: any) => console.warn('pool refresh failed', e?.message));

    return new Response(JSON.stringify({ ok: true, committee: row }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('import-fec-committee', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
