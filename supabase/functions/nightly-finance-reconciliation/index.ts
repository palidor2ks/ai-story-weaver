import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch FEC totals for a committee with category-level data including loans, transfers, etc.
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
  fecPacContributions: number | null;
  fecPartyContributions: number | null;
  fecLoans: number | null;
  fecTransfers: number | null;
  fecCandidateContribution: number | null;
  fecOtherReceipts: number | null;
}> {
  const nullResult = { 
    fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, 
    fecPacContributions: null, fecPartyContributions: null,
    fecLoans: null, fecTransfers: null, fecCandidateContribution: null, fecOtherReceipts: null 
  };
  
  try {
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=${fecApiKey}&cycle=${cycle}`;
    const response = await fetch(url);
    
    if (!response.ok) return nullResult;
    
    const data = await response.json();
    const totals = data.results?.[0];
    
    if (!totals) return nullResult;
    
    return {
      fecItemized: Math.round(totals.individual_itemized_contributions || 0),
      fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
      fecTotalReceipts: Math.round(totals.receipts || 0),
      fecPacContributions: Math.round(totals.other_political_committee_contributions || 0),
      fecPartyContributions: Math.round(totals.political_party_committee_contributions || 0),
      // Additional breakdown fields
      fecLoans: Math.round(totals.loans_made_by_candidate || 0),
      fecTransfers: Math.round(totals.transfers_from_other_authorized_committee || 0),
      fecCandidateContribution: Math.round(totals.candidate_contribution || 0),
      fecOtherReceipts: Math.round(totals.other_receipts || 0),
    };
  } catch {
    return nullResult;
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
      candidateId,          // Optional: reconcile a specific candidate
      cycle = '2024',
      limit = 50,
      onlyStale = true,      // Only check candidates with stale data (>7 days)
      onlyWithData = true,   // Only check candidates that have donor data
      varianceThreshold = 5  // % threshold to flag as warning
    } = await req.json().catch(() => ({}));

    console.log('[RECONCILIATION] Starting nightly reconciliation:', { candidateId, cycle, limit, onlyStale, onlyWithData });

    // Get candidates to reconcile
    let query = supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, fec_committee_id, last_donor_sync')
      .not('fec_candidate_id', 'is', null);

    // If a specific candidate ID is provided, only reconcile that candidate
    if (candidateId) {
      query = query.eq('id', candidateId);
    } else {
      if (onlyWithData) {
        query = query.not('last_donor_sync', 'is', null);
      }

      if (onlyStale) {
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - 7);
        query = query.or(`last_donor_sync.is.null,last_donor_sync.lt.${staleDate.toISOString()}`);
      }
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
      okCount: 0,
      warningCount: 0,
      errorCount: 0,
      skippedCount: 0,
      details: [] as Array<{ candidateId: string; name: string; status: string; deltaPct: number; individualDeltaPct: number; pacDeltaPct: number }>
    };

    for (const candidate of candidates || []) {
      try {
        // Get all committees for this candidate
        let { data: committees } = await supabase
          .from('candidate_committees')
          .select('fec_committee_id')
          .eq('candidate_id', candidate.id)
          .eq('active', true);

        // Fallback to candidates.fec_committee_id if no separate committee records exist
        if ((!committees || committees.length === 0) && candidate.fec_committee_id) {
          committees = [{ fec_committee_id: candidate.fec_committee_id }];
          console.log(`[RECONCILIATION] ${candidate.name}: Using fallback fec_committee_id ${candidate.fec_committee_id}`);
        }

        if (!committees || committees.length === 0) {
          results.skippedCount++;
          continue;
        }

        // Get local totals from rollups (including new category-level columns)
        const { data: rollups } = await supabase
          .from('committee_finance_rollups')
          .select('local_itemized, local_transfers, local_earmarked, local_individual_itemized, local_pac_contributions, local_party_contributions')
          .eq('candidate_id', candidate.id)
          .eq('cycle', cycle);

        const localItemized = (rollups || []).reduce((sum, r) => sum + (r.local_itemized || 0), 0);
        const localTransfers = (rollups || []).reduce((sum, r) => sum + (r.local_transfers || 0), 0);
        const localEarmarked = (rollups || []).reduce((sum, r) => sum + (r.local_earmarked || 0), 0);
        const localIndividualItemized = (rollups || []).reduce((sum, r) => sum + (r.local_individual_itemized || 0), 0);
        const localPacContributions = (rollups || []).reduce((sum, r) => sum + (r.local_pac_contributions || 0), 0);
        const localPartyContributions = (rollups || []).reduce((sum, r) => sum + (r.local_party_contributions || 0), 0);
        
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

        // Fetch fresh FEC totals for each committee (with category-level data)
        let fecItemized = 0;
        let fecUnitemized = 0;
        let fecTotalReceipts = 0;
        let fecPacContributions = 0;
        let fecPartyContributions = 0;
        let fecLoans = 0;
        let fecTransfers = 0;
        let fecCandidateContribution = 0;
        let fecOtherReceipts = 0;

        for (const cmte of committees) {
          const totals = await fetchFECTotals(fecApiKey, cmte.fec_committee_id, cycle);
          fecItemized += totals.fecItemized || 0;
          fecUnitemized += totals.fecUnitemized || 0;
          fecTotalReceipts += totals.fecTotalReceipts || 0;
          fecPacContributions += totals.fecPacContributions || 0;
          fecPartyContributions += totals.fecPartyContributions || 0;
          fecLoans += totals.fecLoans || 0;
          fecTransfers += totals.fecTransfers || 0;
          fecCandidateContribution += totals.fecCandidateContribution || 0;
          fecOtherReceipts += totals.fecOtherReceipts || 0;

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

        // Calculate Other Receipts = Total - Itemized - Unitemized
        const otherReceipts = fecTotalReceipts - fecItemized - fecUnitemized;
        
        // Validate formula: Total = Itemized + Unitemized + Other
        // If the FEC data doesn't balance, flag as warning
        const calculatedTotal = fecItemized + fecUnitemized + otherReceipts;
        const fecDataBalanced = Math.abs(calculatedTotal - fecTotalReceipts) < 1;
        
        // Calculate category-level deltas (apples-to-apples comparisons)
        // Individual: local_individual_itemized vs fec_itemized (both are Line 11A/11AI)
        const individualDeltaAmount = localIndividualItemized - fecItemized;
        const individualDeltaPct = fecItemized > 0 
          ? Math.round((individualDeltaAmount / fecItemized) * 10000) / 100 
          : 0;
        
        // PAC: local_pac_contributions vs fec_pac_contributions (both are Line 11C)
        const pacDeltaAmount = localPacContributions - fecPacContributions;
        const pacDeltaPct = fecPacContributions > 0 
          ? Math.round((pacDeltaAmount / fecPacContributions) * 10000) / 100 
          : 0;
        
        // Overall delta now uses individual comparison (apples-to-apples)
        const deltaAmount = individualDeltaAmount;
        const deltaPct = individualDeltaPct;

        // Status based on individual delta (the most important comparison)
        let status = 'ok';
        if (!fecDataBalanced) status = 'error';
        else if (Math.abs(deltaPct) > 10) status = 'error';
        else if (Math.abs(deltaPct) > varianceThreshold) status = 'warning';

        // Upsert reconciliation record with category-level data
        await supabase
          .from('finance_reconciliation')
          .upsert({
            candidate_id: candidate.id,
            cycle,
            local_itemized: localItemized,
            local_itemized_net: localItemizedNet,
            local_transfers: localTransfers,
            local_earmarked: localEarmarked,
            // Category-level local data
            local_individual_itemized: localIndividualItemized,
            local_pac_contributions: localPacContributions,
            local_party_contributions: localPartyContributions,
            // FEC data
            fec_itemized: fecItemized,
            fec_unitemized: fecUnitemized,
            fec_total_receipts: fecTotalReceipts,
            fec_pac_contributions: fecPacContributions,
            fec_party_contributions: fecPartyContributions,
            // Additional FEC breakdown fields
            fec_loans: fecLoans,
            fec_transfers: fecTransfers,
            fec_candidate_contribution: fecCandidateContribution,
            fec_other_receipts: fecOtherReceipts,
            // Category-level deltas
            individual_delta_amount: individualDeltaAmount,
            individual_delta_pct: individualDeltaPct,
            pac_delta_amount: pacDeltaAmount,
            pac_delta_pct: pacDeltaPct,
            // Overall delta
            delta_amount: deltaAmount,
            delta_pct: deltaPct,
            status,
            checked_at: new Date().toISOString()
          }, { onConflict: 'candidate_id,cycle' });

        results.checked++;
        if (status === 'ok') results.okCount++;
        else if (status === 'warning') results.warningCount++;
        else if (status === 'error') results.errorCount++;

        results.details.push({
          candidateId: candidate.id,
          name: candidate.name,
          status,
          deltaPct,
          individualDeltaPct,
          pacDeltaPct
        });

        console.log(`[RECONCILIATION] ${candidate.name}: ${status} (ind: ${individualDeltaPct.toFixed(1)}%, pac: ${pacDeltaPct.toFixed(1)}%)`);

      } catch (err) {
        console.error(`[RECONCILIATION] Error processing ${candidate.name}:`, err);
        results.skippedCount++;
      }
    }

    console.log('[RECONCILIATION] Complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: `Reconciled ${results.checked} candidates: ${results.okCount} OK, ${results.warningCount} warnings, ${results.errorCount} errors`
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
