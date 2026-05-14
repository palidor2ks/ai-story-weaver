import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const aliasId = body?.alias_id;
    if (!aliasId || typeof aliasId !== 'string') {
      return new Response(JSON.stringify({ error: 'alias_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const startTime = Date.now();

    const { data: alias, error: aliasErr } = await admin
      .from('donor_aliases')
      .select('canonical_name, alias_pattern, alias_patterns, donor_types')
      .eq('id', aliasId)
      .single();

    if (aliasErr || !alias) {
      return new Response(JSON.stringify({ error: aliasErr?.message || 'Alias not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const patterns: string[] = (alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern]).filter(Boolean);
    const donorTypes: string[] = alias.donor_types || [];
    const canonical = alias.canonical_name;

    let totalUpdated = 0;
    const errors: string[] = [];

    for (const pattern of patterns) {
      // Loop in batches by id range to avoid statement timeout
      // Use keyset pagination on id (text uuid) by selecting matching ids in batches
      let processed = 0;
      // Loop until no more matching rows
      // Safety: cap at 200 batches per pattern (~1M rows)
      for (let i = 0; i < 200; i++) {
        const { data: rows, error: selErr } = await admin
          .from('donors')
          .select('id')
          .ilike('name', pattern)
          .in('type', donorTypes)
          .neq('display_name', canonical)
          .limit(BATCH_SIZE);

        if (selErr) {
          errors.push(`select pattern="${pattern}": ${selErr.message}`);
          break;
        }
        if (!rows || rows.length === 0) break;

        const ids = rows.map(r => r.id);
        const { error: updErr, count } = await admin
          .from('donors')
          .update({ display_name: canonical }, { count: 'exact' })
          .in('id', ids);

        if (updErr) {
          errors.push(`update pattern="${pattern}": ${updErr.message}`);
          break;
        }
        const updated = count ?? rows.length;
        processed += updated;
        totalUpdated += updated;

        if (rows.length < BATCH_SIZE) break;
      }
      console.log(`Pattern "${pattern}": updated ${processed} donors`);
    }

    // Refresh the consolidated MV
    const { error: refreshErr } = await admin.rpc('refresh_donor_consolidated_mv');
    if (refreshErr) {
      console.error('MV refresh error:', refreshErr);
      errors.push(`mv refresh: ${refreshErr.message}`);
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      updated_count: totalUpdated,
      alias: canonical,
      patterns,
      errors,
      elapsedMs: Date.now() - startTime,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('apply-donor-alias error:', e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
