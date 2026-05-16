import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DonorInput { name: string; type: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(url, service);
    const { data: roleData } = await admin.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const alias_id: string = body?.alias_id;
    const donors: DonorInput[] = (body?.donors || []).filter(
      (d: unknown): d is DonorInput =>
        !!d && typeof (d as DonorInput).name === 'string' && typeof (d as DonorInput).type === 'string'
    );

    if (!alias_id || donors.length === 0) {
      return new Response(JSON.stringify({ error: 'alias_id and donors[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: alias, error: aliasErr } = await admin
      .from('donor_aliases').select('id, canonical_name').eq('id', alias_id).maybeSingle();
    if (aliasErr || !alias) {
      return new Response(JSON.stringify({ error: 'Alias not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rows = donors.map(d => ({ alias_id, donor_name: d.name, donor_type: d.type }));
    const { error: upErr } = await admin
      .from('donor_alias_members')
      .upsert(rows, { onConflict: 'donor_name,donor_type' });
    if (upErr) throw upErr;

    // Bulk update donors: one query per donor type instead of one per donor
    const typeGroups = new Map<string, string[]>();
    for (const d of donors) {
      const arr = typeGroups.get(d.type) ?? [];
      arr.push(d.name);
      typeGroups.set(d.type, arr);
    }

    let attached = 0;
    const errors: string[] = [];
    for (const [type, names] of typeGroups.entries()) {
      const { error: updErr, count } = await admin
        .from('donors')
        .update({ display_name: alias.canonical_name }, { count: 'exact' })
        .in('name', names)
        .eq('type', type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      if (updErr) errors.push(updErr.message);
      else attached += count || 0;
    }

    // MV refresh is now coalesced by the caller. The client triggers one refresh
    // after all chunks complete via supabase.rpc('refresh_donor_consolidated_mv').
    // Pass skip_mv_refresh=false to opt into the old per-call refresh behaviour.
    const skip_mv_refresh: boolean = body?.skip_mv_refresh !== false; // default: skip
    let mv_refreshed = false;
    if (!skip_mv_refresh) {
      try {
        // @ts-ignore EdgeRuntime is available in Deno deploy
        EdgeRuntime.waitUntil(admin.rpc('refresh_donor_consolidated_mv').then(() => {}, () => {}));
      } catch (_) {}
    }

    return new Response(JSON.stringify({
      success: true, attached_count: donors.length, donors_updated: attached, mv_refreshed, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('attach-donors-to-alias error:', e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
