import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch FEC totals for a committee
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
}> {
  try {
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=${fecApiKey}&cycle=${cycle}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    const data = await response.json();
    const totals = data.results?.[0];
    
    if (!totals) {
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    return {
      fecItemized: Math.round(totals.individual_itemized_contributions || 0),
      fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
      fecTotalReceipts: Math.round(totals.receipts || 0)
    };
  } catch {
    return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      return new Response(
        JSON.stringify({ error: 'FEC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      cycle = '2024',
      limit = 50,
      onlyStale = true,      // Only check candidates with stale data (>7 days)
      onlyWithData = true,   // Only check candidates that have donor data
      varianceThreshold = 5  // % threshold to flag as warning
    } = await req.json().catch(() => ({}));

    console.log('[RECONCILIATION] Starting nightly reconciliation:', { cycle, limit, onlyStale, onlyWithData });

    // Get candidates to reconcile
    let query = supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, last_donor_sync')
      .not('fec_candidate_id', 'is', null);

    if (onlyWithData) {
      query = query.not('last_donor_sync', 'is', null);
    }

    if (onlyStale) {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 7);
      query = query.or(`last_donor_sync.is.null,last_donor_sync.lt.${staleDate.toISOString()}`);
    }

    const { data: candidates, error: candidatesError } = await query
      .order('last_donor_sync', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (candidatesError) {
      console.error('[RECONCILIATION] Error fetching candidates:', candidatesError);
      return new Response(
        JSON.stringify({ error: candidatesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RECONCILIATION] Found', candidates?.length || 0, 'candidates to reconcile');

    const results = {
      checked: 0,
      ok: 0,
      warning: 0,
      error: 0,
      skipped: 0,
      details: [] as Array<{ candidateId: string; name: string; status: string; deltaPct: number }>
    };

    for (const candidate of candidates || []) {
      try {
        // Get all committees for this candidate
        const { data: committees } = await supabase
          .from('candidate_committees')
          .select('fec_committee_id')
          .eq('candidate_id', candidate.id)
          .eq('active', true);

        if (!committees || committees.length === 0) {
          results.skipped++;
          continue;
        }

        // Get local totals from rollups
        const { data: rollups } = await supabase
          .from('committee_finance_rollups')
          .select('local_itemized, local_transfers, local_earmarked')
          .eq('candidate_id', candidate.id)
          .eq('cycle', cycle);

        const localItemized = (rollups || []).reduce((sum, r) => sum + (r.local_itemized || 0), 0);
        const localTransfers = (rollups || []).reduce((sum, r) => sum + (r.local_transfers || 0), 0);
        const localEarmarked = (rollups || []).reduce((sum, r) => sum + (r.local_earmarked || 0), 0);
        
        // Calculate local_itemized_net by querying contributions directly
        // Exclude earmark pass-throughs (contributions with "SEE BELOW" memo text)
        const { data: passThroughData } = await supabase
          .from('contributions')
          .select('amount')
          .eq('candidate_id', candidate.id)
          .eq('cycle', cycle)
          .eq('is_contribution', true)
          .ilike('memo_text', '%SEE BELOW%');
        
        const passThroughTotal = (passThroughData || []).reduce((sum, c) => sum + (c.amount || 0), 0);
        const localItemizedNet = localItemized - passThroughTotal;

        // Fetch fresh FEC totals for each committee
        let fecItemized = 0;
        let fecUnitemized = 0;
        let fecTotalReceipts = 0;

        for (const cmte of committees) {
          const totals = await fetchFECTotals(fecApiKey, cmte.fec_committee_id, cycle);
          fecItemized += totals.fecItemized || 0;
          fecUnitemized += totals.fecUnitemized || 0;
          fecTotalReceipts += totals.fecTotalReceipts || 0;

          // Update committee rollup with fresh FEC data
          await supabase
            .from('committee_finance_rollups')
            .upsert({
              committee_id: cmte.fec_committee_id,
              candidate_id: candidate.id,
              cycle,
              fec_itemized: totals.fecItemized,
              fec_unitemized: totals.fecUnitemized,
              fec_total_receipts: totals.fecTotalReceipts,
              last_fec_check: new Date().toISOString()
            }, { onConflict: 'committee_id,cycle' });

          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Calculate variance using NET itemized (comparable to FEC)
        const deltaAmount = localItemizedNet - fecItemized;
        const deltaPct = fecItemized > 0 
          ? Math.round((deltaAmount / fecItemized) * 10000) / 100 
          : 0;

        let status = 'ok';
        if (Math.abs(deltaPct) > 10) status = 'error';
        else if (Math.abs(deltaPct) > varianceThreshold) status = 'warning';

        // Upsert reconciliation record
        await supabase
          .from('finance_reconciliation')
          .upsert({
            candidate_id: candidate.id,
            cycle,
            local_itemized: localItemized,
            local_itemized_net: localItemizedNet,
            local_transfers: localTransfers,
            local_earmarked: localEarmarked,
            fec_itemized: fecItemized,
            fec_unitemized: fecUnitemized,
            fec_total_receipts: fecTotalReceipts,
            delta_amount: deltaAmount,
            delta_pct: deltaPct,
            status,
            checked_at: new Date().toISOString()
          }, { onConflict: 'candidate_id,cycle' });

        results.checked++;
        if (status === 'ok') results.ok++;
        else if (status === 'warning') results.warning++;
        else if (status === 'error') results.error++;

        results.details.push({
          candidateId: candidate.id,
          name: candidate.name,
          status,
          deltaPct
        });

        console.log(`[RECONCILIATION] ${candidate.name}: ${status} (${deltaPct.toFixed(1)}% variance)`);

      } catch (err) {
        console.error(`[RECONCILIATION] Error processing ${candidate.name}:`, err);
        results.skipped++;
      }
    }

    console.log('[RECONCILIATION] Complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: `Reconciled ${results.checked} candidates: ${results.ok} OK, ${results.warning} warnings, ${results.error} errors`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[RECONCILIATION] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
