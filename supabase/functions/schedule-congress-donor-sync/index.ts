import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const publishableKey = req.headers.get('apikey');

    // Validate: cron jobs send the publishable key (from Vault) as apikey header.
    // This is a lightweight auth for scheduled jobs.
    if (!publishableKey || publishableKey !== Deno.env.get('SUPABASE_ANON_KEY')) {
      console.log('[SCHEDULE-CONGRESS-DONOR-SYNC] Unauthorized: invalid or missing apikey');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { scope = 'congress_visible', mode = 'backfill', limit = 1, cycle = '2024' } = await req.json().catch(() => ({}));

    console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] Starting ${mode} sync (scope=${scope}, limit=${limit}, cycle=${cycle})`);

    // Create admin client for querying and triggering sync
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Filter candidates by scope
    let coverageTiers: string[] = [];
    if (scope === 'congress_visible') {
      coverageTiers = ['tier_1']; // Sitting members of Congress
    } else if (scope === 'all') {
      coverageTiers = ['tier_1', 'tier_2'];
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown scope: ${scope}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find candidates with stalled committees (has_more=true)
    // For backfill mode: prioritize never-synced (last_sync_completed_at IS NULL)
    // For refresh mode: prioritize ones that were synced but hit has_more again
    let query = supabase
      .from('candidate_committees')
      .select('candidate_id')
      .eq('has_more', true);

    if (mode === 'backfill') {
      // Backfill: prioritize never-synced, oldest first
      query = query
        .is('last_sync_completed_at', null)
        .order('created_at', { ascending: true });
    } else if (mode === 'refresh') {
      // Refresh: prioritize ones that were synced but got stuck again (has_more=true again)
      query = query
        .not('last_sync_completed_at', 'is', null)
        .order('last_sync_completed_at', { ascending: true });
    }

    const { data: stalledRows, error: fetchError } = await query.limit(limit * 100); // Fetch more to dedupe

    if (fetchError) {
      console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error fetching stalled committees:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stalledRows || stalledRows.length === 0) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] No stalled committees found for scope=${scope}`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No stalled committees found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dedupe candidate_ids and filter by coverage_tier
    const candidateIds = Array.from(new Set(stalledRows.map(row => row.candidate_id)));

    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, coverage_tier')
      .in('id', candidateIds)
      .in('coverage_tier', coverageTiers)
      .limit(limit);

    if (candError) {
      console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error fetching candidates:', candError);
      return new Response(
        JSON.stringify({ error: candError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!candidates || candidates.length === 0) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] No candidates in scope=${scope} with stalled committees`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No candidates in scope with stalled committees' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] Found ${candidates.length} candidates to sync for scope=${scope}`);

    // Call sync-all-donors to backfill/refresh these candidates
    const syncUrl = `${supabaseUrl}/functions/v1/sync-all-donors`;
    const resp = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': publishableKey,
      },
      body: JSON.stringify({
        cycle,
        limit: candidates.length, // Sync all filtered candidates in this batch
      }),
    });

    const syncResult = await resp.json().catch(() => ({}));

    console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] Sync result:`, syncResult);

    if (!resp.ok) {
      console.error(`[SCHEDULE-CONGRESS-DONOR-SYNC] Sync failed with HTTP ${resp.status}:`, syncResult);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Sync failed: HTTP ${resp.status}`,
          syncResult,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        scope,
        mode,
        candidatesProcessed: candidates.length,
        syncResult,
        message: `${mode} sync complete for ${candidates.length} candidates in scope=${scope}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
