import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting constants - MORE CONSERVATIVE for totals-only operations
const MAX_REQUESTS_PER_MINUTE = 30;
const REQUEST_DELAY_MS = 400; // 400ms between requests
const MAX_RETRIES = 5;
const RETRY_BACKOFF_BASE_MS = 3000;
const RATE_LIMIT_BACKOFF_MS = 15000; // 15 second backoff for 429 errors

// Request tracking for rate limiting
let requestCount = 0;
let lastMinuteReset = Date.now();

// Rate-limited fetch with improved backoff for rate limits
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> {
  // Rate limit check
  const now = Date.now();
  if (now - lastMinuteReset > 60000) {
    requestCount = 0;
    lastMinuteReset = now;
  }
  
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (now - lastMinuteReset) + 1000;
    console.log(`[REFRESH-FEC-TOTALS] Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
    lastMinuteReset = Date.now();
  }
  
  requestCount++;
  
  // Add delay between requests
  await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // LONGER backoff specifically for rate limits
        const backoffMs = RATE_LIMIT_BACKOFF_MS * Math.pow(1.5, attempt);
        console.log(`[REFRESH-FEC-TOTALS] Rate limited (429), backing off ${Math.round(backoffMs/1000)}s...`);
        
        // Reset the minute counter to be safe
        requestCount = MAX_REQUESTS_PER_MINUTE;
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      if (response.status >= 500 && attempt < retries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[REFRESH-FEC-TOTALS] Server error ${response.status}, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < retries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[REFRESH-FEC-TOTALS] Fetch error, retrying in ${backoffMs}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Fetch FEC totals for a committee
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
  fecPacContributions: number | null;
  fecPartyContributions: number | null;
}> {
  try {
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=${fecApiKey}&cycle=${cycle}&per_page=1`;
    const response = await fetchWithRetry(url);
    
    if (!response?.ok) {
      console.warn(`[REFRESH-FEC-TOTALS] Could not fetch FEC totals for ${committeeId}:`, response?.status);
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, fecPacContributions: null, fecPartyContributions: null };
    }
    
    let data;
    try {
      data = await response.json();
    } catch {
      console.warn(`[REFRESH-FEC-TOTALS] Failed to parse FEC totals response for ${committeeId}`);
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, fecPacContributions: null, fecPartyContributions: null };
    }
    
    const totals = data?.results?.[0];
    
    if (!totals) {
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, fecPacContributions: null, fecPartyContributions: null };
    }
    
    return {
      fecItemized: Math.round(totals.individual_itemized_contributions || 0),
      fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
      fecTotalReceipts: Math.round(totals.receipts || 0),
      fecPacContributions: Math.round(totals.other_political_committee_contributions || 0),
      fecPartyContributions: Math.round(totals.political_party_committee_contributions || 0)
    };
  } catch (err) {
    console.warn(`[REFRESH-FEC-TOTALS] Error fetching FEC totals for ${committeeId}:`, err);
    return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, fecPacContributions: null, fecPartyContributions: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[REFRESH-FEC-TOTALS] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      candidateId, 
      candidateIds,
      cycle = '2024',
      batch = false,
      limit = 50
    } = body || {};

    // Batch mode: process multiple candidates
    if (batch && candidateIds?.length > 0) {
      console.log(`[REFRESH-FEC-TOTALS] Batch mode: refreshing ${candidateIds.length} candidates`);
      
      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        details: [] as Array<{ candidateId: string; status: string; error?: string }>
      };

      const toProcess = candidateIds.slice(0, limit);
      
      for (const cId of toProcess) {
        try {
          // Get committees for this candidate
          const { data: committees } = await supabase
            .from('candidate_committees')
            .select('fec_committee_id, designation')
            .eq('candidate_id', cId)
            .in('designation', ['P', 'A']);
          
          if (!committees || committees.length === 0) {
            results.skipped++;
            results.details.push({ candidateId: cId, status: 'skipped', error: 'No committees' });
            continue;
          }

          // Get PER-COMMITTEE local totals using the new database function
          const { data: perCommitteeTotals } = await supabase
            .rpc('get_contribution_totals_by_committee', {
              p_candidate_id: cId,
              p_cycle: cycle
            });

          // Build lookup map for per-committee local totals
          const committeeTotalsMap = new Map<string, {
            individual_total: number;
            pac_total: number;
            party_total: number;
            itemized_total: number;
            transfers_total: number;
            earmarked_total: number;
            contribution_count: number;
          }>();

          if (perCommitteeTotals) {
            for (const ct of perCommitteeTotals) {
              committeeTotalsMap.set(ct.committee_id, {
                individual_total: Number(ct.individual_total) || 0,
                pac_total: Number(ct.pac_total) || 0,
                party_total: Number(ct.party_total) || 0,
                itemized_total: Number(ct.itemized_total) || 0,
                transfers_total: Number(ct.transfers_total) || 0,
                earmarked_total: Number(ct.earmarked_total) || 0,
                contribution_count: Number(ct.contribution_count) || 0,
              });
            }
          }

          let totalFecItemized = 0;
          let totalFecUnitemized = 0;
          let totalFecReceipts = 0;
          let totalFecPac = 0;
          let totalFecParty = 0;
          let hasValidData = false;

          // Track summed local totals across all committees
          let localItemized = 0;
          let localIndividual = 0;
          let localPac = 0;
          let localParty = 0;
          let localTransfers = 0;
          let localEarmarked = 0;

          for (const committee of committees) {
            const totals = await fetchFECTotals(fecApiKey, committee.fec_committee_id, cycle);
            
            // Get THIS committee's local totals
            const cmteTotals = committeeTotalsMap.get(committee.fec_committee_id) || {
              individual_total: 0,
              pac_total: 0,
              party_total: 0,
              itemized_total: 0,
              transfers_total: 0,
              earmarked_total: 0,
              contribution_count: 0,
            };

            // Sum up local totals
            localItemized += cmteTotals.itemized_total;
            localIndividual += cmteTotals.individual_total;
            localPac += cmteTotals.pac_total;
            localParty += cmteTotals.party_total;
            localTransfers += cmteTotals.transfers_total;
            localEarmarked += cmteTotals.earmarked_total;
            
            if (totals.fecItemized !== null) {
              hasValidData = true;
              totalFecItemized += totals.fecItemized;
              totalFecUnitemized += totals.fecUnitemized || 0;
              totalFecReceipts += totals.fecTotalReceipts || 0;
              totalFecPac += totals.fecPacContributions || 0;
              totalFecParty += totals.fecPartyContributions || 0;

              // Update committee_finance_rollups with PER-COMMITTEE local totals
              await supabase
                .from('committee_finance_rollups')
                .upsert({
                  committee_id: committee.fec_committee_id,
                  candidate_id: cId,
                  cycle,
                  fec_itemized: totals.fecItemized,
                  fec_unitemized: totals.fecUnitemized,
                  fec_total_receipts: totals.fecTotalReceipts,
                  // PER-COMMITTEE local totals
                  local_itemized: cmteTotals.itemized_total,
                  local_individual_itemized: cmteTotals.individual_total,
                  local_pac_contributions: cmteTotals.pac_total,
                  local_party_contributions: cmteTotals.party_total,
                  local_transfers: cmteTotals.transfers_total,
                  local_earmarked: cmteTotals.earmarked_total,
                  contribution_count: cmteTotals.contribution_count,
                  last_fec_check: new Date().toISOString()
                }, { onConflict: 'committee_id,cycle' });
            }
          }

          if (hasValidData) {
            // Calculate deltas - compare apples to apples
            // FEC total itemized = individual + PAC + party contributions
            const fecTotalItemized = totalFecItemized + totalFecPac + totalFecParty;
            const localItemizedNet = localItemized - localEarmarked;
            const deltaAmount = fecTotalItemized - localItemizedNet;
            const deltaPct = fecTotalItemized > 0 ? (deltaAmount / fecTotalItemized) * 100 : 0;
            const individualDeltaAmount = totalFecItemized - localIndividual;
            const individualDeltaPct = totalFecItemized > 0 ? (individualDeltaAmount / totalFecItemized) * 100 : 0;
            const pacDeltaAmount = totalFecPac - localPac;
            const pacDeltaPct = totalFecPac > 0 ? (pacDeltaAmount / totalFecPac) * 100 : 0;

            const status = Math.abs(deltaPct) <= 2 ? 'ok' : Math.abs(deltaPct) <= 5 ? 'warning' : 'error';

            // Update finance_reconciliation
            await supabase
              .from('finance_reconciliation')
              .upsert({
                candidate_id: cId,
                cycle,
                fec_itemized: totalFecItemized,
                fec_unitemized: totalFecUnitemized,
                fec_total_receipts: totalFecReceipts,
                fec_pac_contributions: totalFecPac,
                fec_party_contributions: totalFecParty,
                local_itemized: localItemized,
                local_itemized_net: localItemizedNet,
                local_individual_itemized: localIndividual,
                local_pac_contributions: localPac,
                local_party_contributions: localParty,
                local_transfers: localTransfers,
                local_earmarked: localEarmarked,
                delta_amount: deltaAmount,
                delta_pct: deltaPct,
                individual_delta_amount: individualDeltaAmount,
                individual_delta_pct: individualDeltaPct,
                pac_delta_amount: pacDeltaAmount,
                pac_delta_pct: pacDeltaPct,
                status,
                checked_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'candidate_id,cycle' });

            results.success++;
            results.details.push({ candidateId: cId, status: 'success' });
          } else {
            results.skipped++;
            results.details.push({ candidateId: cId, status: 'skipped', error: 'FEC API returned no data' });
          }
        } catch (err) {
          console.error(`[REFRESH-FEC-TOTALS] Error processing ${cId}:`, err);
          results.failed++;
          results.details.push({ candidateId: cId, status: 'error', error: String(err) });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: results.success,
          failed: results.failed,
          skipped: results.skipped,
          details: results.details
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single candidate mode
    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[REFRESH-FEC-TOTALS] Refreshing FEC totals for candidate ${candidateId}`);

    // Get committees for this candidate
    const { data: committees } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, designation, name')
      .eq('candidate_id', candidateId)
      .in('designation', ['P', 'A']);

    if (!committees || committees.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No campaign committees found for this candidate' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PER-COMMITTEE local totals using the new database function
    const { data: perCommitteeTotals, error: perCommitteeError } = await supabase
      .rpc('get_contribution_totals_by_committee', {
        p_candidate_id: candidateId,
        p_cycle: cycle
      });

    if (perCommitteeError) {
      console.warn(`[REFRESH-FEC-TOTALS] Error fetching per-committee totals:`, perCommitteeError);
    }

    // Build lookup map for per-committee local totals
    const committeeTotalsMap = new Map<string, {
      individual_total: number;
      pac_total: number;
      party_total: number;
      itemized_total: number;
      transfers_total: number;
      earmarked_total: number;
      contribution_count: number;
    }>();

    if (perCommitteeTotals) {
      for (const ct of perCommitteeTotals) {
        committeeTotalsMap.set(ct.committee_id, {
          individual_total: Number(ct.individual_total) || 0,
          pac_total: Number(ct.pac_total) || 0,
          party_total: Number(ct.party_total) || 0,
          itemized_total: Number(ct.itemized_total) || 0,
          transfers_total: Number(ct.transfers_total) || 0,
          earmarked_total: Number(ct.earmarked_total) || 0,
          contribution_count: Number(ct.contribution_count) || 0,
        });
      }
    }

    let totalFecItemized = 0;
    let totalFecUnitemized = 0;
    let totalFecReceipts = 0;
    let totalFecPac = 0;
    let totalFecParty = 0;
    let committeesUpdated = 0;

    // Track summed local totals across all committees
    let localItemized = 0;
    let localIndividual = 0;
    let localPac = 0;
    let localParty = 0;
    let localTransfers = 0;
    let localEarmarked = 0;

    for (const committee of committees) {
      const totals = await fetchFECTotals(fecApiKey, committee.fec_committee_id, cycle);
      
      // Get THIS committee's local totals
      const cmteTotals = committeeTotalsMap.get(committee.fec_committee_id) || {
        individual_total: 0,
        pac_total: 0,
        party_total: 0,
        itemized_total: 0,
        transfers_total: 0,
        earmarked_total: 0,
        contribution_count: 0,
      };

      // Sum up local totals for this candidate
      localItemized += cmteTotals.itemized_total;
      localIndividual += cmteTotals.individual_total;
      localPac += cmteTotals.pac_total;
      localParty += cmteTotals.party_total;
      localTransfers += cmteTotals.transfers_total;
      localEarmarked += cmteTotals.earmarked_total;
      
      if (totals.fecItemized !== null) {
        totalFecItemized += totals.fecItemized;
        totalFecUnitemized += totals.fecUnitemized || 0;
        totalFecReceipts += totals.fecTotalReceipts || 0;
        totalFecPac += totals.fecPacContributions || 0;
        totalFecParty += totals.fecPartyContributions || 0;
        committeesUpdated++;

        // Update committee_finance_rollups with PER-COMMITTEE local totals
        await supabase
          .from('committee_finance_rollups')
          .upsert({
            committee_id: committee.fec_committee_id,
            candidate_id: candidateId,
            cycle,
            fec_itemized: totals.fecItemized,
            fec_unitemized: totals.fecUnitemized,
            fec_total_receipts: totals.fecTotalReceipts,
            // PER-COMMITTEE local totals (not candidate-wide!)
            local_itemized: cmteTotals.itemized_total,
            local_individual_itemized: cmteTotals.individual_total,
            local_pac_contributions: cmteTotals.pac_total,
            local_party_contributions: cmteTotals.party_total,
            local_transfers: cmteTotals.transfers_total,
            local_earmarked: cmteTotals.earmarked_total,
            contribution_count: cmteTotals.contribution_count,
            last_fec_check: new Date().toISOString()
          }, { onConflict: 'committee_id,cycle' });

        console.log(`[REFRESH-FEC-TOTALS] Updated ${committee.name}: FEC $${totals.fecItemized?.toLocaleString()}, Local $${cmteTotals.itemized_total.toLocaleString()}`);
      } else {
        console.warn(`[REFRESH-FEC-TOTALS] No data for committee ${committee.fec_committee_id}`);
      }
    }

    if (committeesUpdated === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'FEC API returned no data for any committees' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate deltas - compare apples to apples
    // FEC total itemized = individual + PAC + party contributions
    const fecTotalItemized = totalFecItemized + totalFecPac + totalFecParty;
    const localItemizedNet = localItemized - localEarmarked;
    const deltaAmount = fecTotalItemized - localItemizedNet;
    const deltaPct = fecTotalItemized > 0 ? (deltaAmount / fecTotalItemized) * 100 : 0;
    const individualDeltaAmount = totalFecItemized - localIndividual;
    const individualDeltaPct = totalFecItemized > 0 ? (individualDeltaAmount / totalFecItemized) * 100 : 0;
    const pacDeltaAmount = totalFecPac - localPac;
    const pacDeltaPct = totalFecPac > 0 ? (pacDeltaAmount / totalFecPac) * 100 : 0;

    const status = Math.abs(deltaPct) <= 2 ? 'ok' : Math.abs(deltaPct) <= 5 ? 'warning' : 'error';

    // Update finance_reconciliation
    await supabase
      .from('finance_reconciliation')
      .upsert({
        candidate_id: candidateId,
        cycle,
        fec_itemized: totalFecItemized,
        fec_unitemized: totalFecUnitemized,
        fec_total_receipts: totalFecReceipts,
        fec_pac_contributions: totalFecPac,
        fec_party_contributions: totalFecParty,
        local_itemized: localItemized,
        local_itemized_net: localItemizedNet,
        local_individual_itemized: localIndividual,
        local_pac_contributions: localPac,
        local_party_contributions: localParty,
        local_transfers: localTransfers,
        local_earmarked: localEarmarked,
        delta_amount: deltaAmount,
        delta_pct: deltaPct,
        individual_delta_amount: individualDeltaAmount,
        individual_delta_pct: individualDeltaPct,
        pac_delta_amount: pacDeltaAmount,
        pac_delta_pct: pacDeltaPct,
        status,
        checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'candidate_id,cycle' });

    console.log(`[REFRESH-FEC-TOTALS] Completed for ${candidateId}: FEC $${totalFecItemized.toLocaleString()}, Local $${localItemized.toLocaleString()}, Delta ${deltaPct.toFixed(1)}%`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        committeesUpdated,
        fecItemized: totalFecItemized,
        fecUnitemized: totalFecUnitemized,
        fecTotalReceipts: totalFecReceipts,
        localItemized,
        deltaPct: Math.round(deltaPct * 10) / 10,
        status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[REFRESH-FEC-TOTALS] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
