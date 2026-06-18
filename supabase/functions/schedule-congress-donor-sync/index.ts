import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestionHiddenList, loadHiddenStates } from "../_shared/onboard-candidate.ts";

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

    // Resolve in-scope candidates FIRST (coverage tier + visible state). This MUST precede the
    // per-run LIMIT: previously we fetched a created_at-ordered slice of stalled committees and
    // THEN filtered to visible/tier_1 — but that slice is dominated by hidden-state sitting members
    // (which the visible-states gate discards), so the few visible candidates that sort behind them
    // were never reached and their backfill stalled indefinitely (e.g. Deborah Ross, NC, sat at
    // rank ~115 behind 114 hidden rows while the fetch cap was 100). Scope-first fixes that.
    const hiddenSet = await loadHiddenStates(supabase);
    const hiddenList = ingestionHiddenList(hiddenSet);
    let scopeQuery = supabase
      .from('candidates')
      .select('id')
      .in('coverage_tier', coverageTiers)
      .not('fec_candidate_id', 'is', null);
    if (hiddenList.length > 0) {
      scopeQuery = scopeQuery.or(`state.is.null,state.not.in.(${hiddenList.join(',')})`);
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] visible-states gate active; ${hiddenList.length} hidden state(s) excluded`);
    }
    const { data: scopeCandidates, error: scopeError } = await scopeQuery;
    if (scopeError) {
      console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error fetching in-scope candidates:', scopeError);
      return new Response(
        JSON.stringify({ error: scopeError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const scopeIds = (scopeCandidates || []).map(c => c.id);
    if (scopeIds.length === 0) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] No candidates in scope=${scope}`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No candidates in scope' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find stalled committees (has_more=true) AMONG in-scope candidates only.
    // For backfill mode: prioritize never-synced (last_sync_completed_at IS NULL), oldest first.
    // For refresh mode: prioritize ones synced but stuck again (has_more=true), oldest completion first.
    let query = supabase
      .from('candidate_committees')
      .select('candidate_id')
      .eq('has_more', true)
      .in('candidate_id', scopeIds);

    if (mode === 'backfill') {
      query = query
        .is('last_sync_completed_at', null)
        .order('created_at', { ascending: true });
    } else if (mode === 'refresh') {
      query = query
        .not('last_sync_completed_at', 'is', null)
        .order('last_sync_completed_at', { ascending: true });
    }

    const { data: stalledRows, error: fetchError } = await query.limit(limit * 100); // fetch extra to dedupe

    if (fetchError) {
      console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error fetching stalled committees:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stalledRows || stalledRows.length === 0) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] No stalled committees found in scope=${scope}`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No stalled committees found in scope' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dedupe candidate_ids (preserving created_at order) and take this run's slice.
    const orderedCandidateIds = Array.from(new Set(stalledRows.map(row => row.candidate_id))).slice(0, limit);
    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, coverage_tier')
      .in('id', orderedCandidateIds);

    if (candError) {
      console.error('[SCHEDULE-CONGRESS-DONOR-SYNC] Error fetching candidates:', candError);
      return new Response(
        JSON.stringify({ error: candError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!candidates || candidates.length === 0) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] No candidates resolved for scope=${scope}`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No candidates resolved' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] Found ${candidates.length} candidates to sync for scope=${scope}`);

    // Call fetch-fec-donors directly for each stalled candidate.
    // DO NOT route through sync-all-donors: that function ignores the candidate list and
    // runs its own ORDER BY last_donor_sync query, which selects tier_2 candidates instead
    // of the tier_1 ones we identified here.
    // Auth: service-role key for both apikey and Authorization bearer so the gateway
    // accepts the request (conflicting keys = 401).
    const fetchFecDonorsUrl = `${supabaseUrl}/functions/v1/fetch-fec-donors`;
    const perCandidateResults: Array<{ name: string; status: number; ok: boolean }> = [];

    for (const candidate of candidates) {
      console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] Calling fetch-fec-donors for ${candidate.name} (${candidate.fec_candidate_id})`);
      const resp = await fetch(fetchFecDonorsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
        },
        body: JSON.stringify({
          candidateId: candidate.id,
          fecCandidateId: candidate.fec_candidate_id,
          cycle,
        }),
      });

      const result = await resp.json().catch(() => ({}));
      perCandidateResults.push({ name: candidate.name, status: resp.status, ok: resp.ok });

      if (!resp.ok) {
        console.error(`[SCHEDULE-CONGRESS-DONOR-SYNC] fetch-fec-donors HTTP ${resp.status} for ${candidate.name}:`, result);
      } else {
        console.log(`[SCHEDULE-CONGRESS-DONOR-SYNC] fetch-fec-donors done for ${candidate.name}: imported=${result?.imported ?? 'n/a'}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scope,
        mode,
        cycle,
        candidatesProcessed: candidates.length,
        results: perCandidateResults,
        message: `${mode} sync dispatched for ${candidates.length} candidates in scope=${scope}`,
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
