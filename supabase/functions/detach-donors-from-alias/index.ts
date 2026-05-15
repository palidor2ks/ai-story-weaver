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
    const donors: DonorInput[] = (body?.donors || []).filter(
      (d: unknown): d is DonorInput =>
        !!d && typeof (d as DonorInput).name === 'string' && typeof (d as DonorInput).type === 'string'
    );

    if (donors.length === 0) {
      return new Response(JSON.stringify({ error: 'donors[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const errors: string[] = [];
    for (const d of donors) {
      const { error: delErr } = await admin
        .from('donor_alias_members')
        .delete()
        .eq('donor_name', d.name)
        .eq('donor_type', d.type);
      if (delErr) errors.push(delErr.message);

      const { error: updErr } = await admin
        .from('donors')
        .update({ display_name: d.name })
        .eq('name', d.name)
        .eq('type', d.type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      if (updErr) errors.push(updErr.message);
    }

    await admin.rpc('refresh_donor_consolidated_mv').catch(() => {});

    return new Response(JSON.stringify({
      success: true, detached_count: donors.length, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('detach-donors-from-alias error:', e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
