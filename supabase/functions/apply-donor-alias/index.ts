import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ID_BATCH_SIZE = 10000;

type AliasRow = {
  canonical_name: string;
  alias_pattern: string | null;
  alias_patterns: string[] | null;
  donor_types: string[] | null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const aliasId = body?.alias_id as string | undefined;
    if (!aliasId) return new Response(JSON.stringify({ error: 'alias_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: alias, error: aliasError } = await supabase
      .from('donor_aliases')
      .select('canonical_name, alias_pattern, alias_patterns, donor_types')
      .eq('id', aliasId)
      .eq('is_active', true)
      .single<AliasRow>();
    if (aliasError || !alias) return new Response(JSON.stringify({ error: aliasError?.message || 'Alias not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const patterns = (alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern]).filter(Boolean) as string[];
    const donorTypes = alias.donor_types || [];
    if (!patterns.length || !donorTypes.length) return new Response(JSON.stringify({ success: true, updated: 0, message: 'No valid patterns or donor types to apply' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let totalUpdated = 0;
    for (const pattern of patterns) {
      const { data: matches, error: matchError } = await supabase
        .from('donors')
        .select('id')
        .ilike('name', pattern)
        .in('type', donorTypes)
        .neq('display_name', alias.canonical_name)
        .order('id', { ascending: true });
      if (matchError) throw matchError;

      const ids = (matches || []).map((row) => row.id);
      for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
        const { data: updatedRows, error: updateError } = await supabase.from('donors').update({ display_name: alias.canonical_name }).in('id', ids.slice(i, i + ID_BATCH_SIZE)).select('id');
        if (updateError) throw updateError;
        totalUpdated += updatedRows?.length || 0;
      }
    }

    const { error: refreshError } = await supabase.rpc('refresh_donor_consolidated_mv');
    if (refreshError) throw refreshError;

    return new Response(JSON.stringify({ success: true, alias_id: aliasId, canonical_name: alias.canonical_name, patterns, donor_types: donorTypes, updated: totalUpdated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
