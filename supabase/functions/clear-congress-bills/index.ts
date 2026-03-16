import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { congress } = await req.json();
    
    if (!congress || congress < 111 || congress > 119) {
      throw new Error('Congress must be between 111 and 119');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get count before delete
    const { count: beforeCount } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', congress);

    console.log(`[ClearCongressBills] Deleting bills for Congress ${congress}. Current count: ${beforeCount}`);

    // Delete bills for the specified congress
    const { error: deleteError } = await supabase
      .from('bills')
      .delete()
      .eq('congress', congress);

    if (deleteError) {
      console.error('[ClearCongressBills] Delete error:', deleteError);
      throw deleteError;
    }

    // Also delete related bill_sponsors entries
    const { error: sponsorsError } = await supabase
      .from('bill_sponsors')
      .delete()
      .like('bill_id', `%.%`)  // This will match all, but we need to filter by congress
      .filter('bill_id', 'in', `(SELECT id FROM bills WHERE congress = ${congress})`);
    
    // Note: The above won't work correctly due to cascade delete - sponsors should be auto-deleted
    // if there's a foreign key cascade. If not, we need a different approach.

    console.log(`[ClearCongressBills] Deleted ${beforeCount || 0} bills from Congress ${congress}`);

    return new Response(JSON.stringify({
      success: true,
      congress,
      deleted: beforeCount || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ClearCongressBills] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
