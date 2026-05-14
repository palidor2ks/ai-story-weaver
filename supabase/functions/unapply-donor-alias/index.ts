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
    const patterns: string[] = (body?.patterns || []).filter((p: unknown) => typeof p === 'string' && p);
    const donorTypes: string[] = (body?.donor_types || []).filter((t: unknown) => typeof t === 'string' && t);
    const canonical: string | undefined = body?.canonical_name;

    if (patterns.length === 0 || donorTypes.length === 0) {
      return new Response(JSON.stringify({ error: 'patterns and donor_types required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const startTime = Date.now();
    let totalReset = 0;
    const errors: string[] = [];

    for (const pattern of patterns) {
      let processed = 0;
      for (let i = 0; i < 200; i++) {
        // Find rows currently set to the canonical name (or matching the pattern) — reset them
        let q = admin
          .from('donors')
          .select('id, name, type')
          .ilike('name', pattern)
          .in('type', donorTypes)
          .limit(BATCH_SIZE);

        if (canonical) {
          q = q.eq('display_name', canonical);
        }
        const { data: rows, error: selErr } = await q;

        if (selErr) {
          errors.push(`select pattern="${pattern}": ${selErr.message}`);
          break;
        }
        if (!rows || rows.length === 0) break;

        // Re-resolve via RPC and update one-by-one (small batch). Use bulk by grouping by resolved name.
        const resolved: Record<string, string[]> = {};
        for (const r of rows) {
          const { data: newName, error: rErr } = await admin
            .rpc('resolve_donor_display_name', { p_donor_name: r.name, p_donor_type: r.type });
          if (rErr) {
            errors.push(`resolve: ${rErr.message}`);
            continue;
          }
          const target = newName || r.name;
          (resolved[target] ||= []).push(r.id);
        }

        for (const [target, ids] of Object.entries(resolved)) {
          const { error: updErr } = await admin
            .from('donors')
            .update({ display_name: target })
            .in('id', ids);
          if (updErr) {
            errors.push(`update: ${updErr.message}`);
          } else {
            processed += ids.length;
            totalReset += ids.length;
          }
        }

        if (rows.length < BATCH_SIZE) break;
      }
      console.log(`Pattern "${pattern}": reset ${processed} donors`);
    }

    const { error: refreshErr } = await admin.rpc('refresh_donor_consolidated_mv');
    if (refreshErr) {
      console.error('MV refresh error:', refreshErr);
      errors.push(`mv refresh: ${refreshErr.message}`);
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      reset_count: totalReset,
      patterns,
      errors,
      elapsedMs: Date.now() - startTime,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('unapply-donor-alias error:', e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
