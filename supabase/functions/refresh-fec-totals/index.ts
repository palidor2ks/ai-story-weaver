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

          // Build lookup map for per-committee local totals (will be populated in loop)
          // UPDATED: field names now match RPC output (individual_total, transfer_total, loan_total, etc.)
          const committeeTotalsMap = new Map<string, {
            individual_total: number;
            individual_gross: number;
            pac_total: number;
            party_total: number;
            transfer_total: number;
            earmarked_total: number;
            loan_total: number;
            other_total: number;
            organization_total: number;
            memo_x_total: number;
          }>();

          // Fetch per-committee local totals for each committee
          for (const committee of committees) {
            const { data: cmteLocalData, error: cmteLocalErr } = await supabase
              .rpc('get_contribution_totals_by_committee', {
                p_committee_id: committee.fec_committee_id,
                p_cycle: cycle
              });
            
            if (cmteLocalErr) {
              console.warn(`[REFRESH-FEC-TOTALS] Error fetching local totals for committee ${committee.fec_committee_id}:`, cmteLocalErr);
              continue;
            }

            // RPC returns an array of rows - normalize to first row
            const ct = Array.isArray(cmteLocalData) ? cmteLocalData[0] : cmteLocalData;
            // Log actual keys from RPC to debug field name mismatches
            console.log(`[REFRESH-FEC-TOTALS] Committee ${committee.fec_committee_id} local RPC keys: ${ct ? Object.keys(ct).join(', ') : 'null'}`);
            if (ct) {
              committeeTotalsMap.set(committee.fec_committee_id, {
                // FIXED: Use correct RPC field names
                individual_total: Number(ct.individual_total) || 0,
                individual_gross: Number(ct.individual_gross) || 0,
                pac_total: Number(ct.pac_total) || 0,
                party_total: Number(ct.party_total) || 0,
                transfer_total: Number(ct.transfer_total) || 0,
                earmarked_total: Number(ct.earmarked_total) || 0,
                loan_total: Number(ct.loan_total) || 0,
                other_total: Number(ct.other_total) || 0,
                organization_total: Number(ct.organization_total) || 0,
                memo_x_total: Number(ct.memo_x_total) || 0,
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
          let localGrossIndividual = 0;
          let localPac = 0;
          let localParty = 0;
          let localOrganization = 0;
          let localTransfers = 0;
          let localEarmarked = 0;
          let localLoans = 0;
          let localOther = 0;
          let localMemoX = 0;

          for (const committee of committees) {
            const totals = await fetchFECTotals(fecApiKey, committee.fec_committee_id, cycle);
            
            // Get THIS committee's local totals (already fetched above)
            // FIXED: Use correct field names matching RPC output
            const cmteTotals = committeeTotalsMap.get(committee.fec_committee_id) || {
              individual_total: 0,
              individual_gross: 0,
              pac_total: 0,
              party_total: 0,
              transfer_total: 0,
              earmarked_total: 0,
              loan_total: 0,
              other_total: 0,
              organization_total: 0,
              memo_x_total: 0,
            };

            // Sum up local totals - FIXED field names
            // Compute local_itemized = individual + organization + pac + party (Line 11A + 11B + 11C)
            const cmteLocalItemized = cmteTotals.individual_total + cmteTotals.organization_total + cmteTotals.pac_total + cmteTotals.party_total;
            localItemized += cmteLocalItemized;
            localIndividual += cmteTotals.individual_total;
            localGrossIndividual += cmteTotals.individual_gross;
            localPac += cmteTotals.pac_total;
            localParty += cmteTotals.party_total;
            localOrganization += cmteTotals.organization_total;
            localTransfers += cmteTotals.transfer_total;
            localEarmarked += cmteTotals.earmarked_total;
            localLoans += cmteTotals.loan_total;
            localOther += cmteTotals.other_total;
            localMemoX += cmteTotals.memo_x_total;
            
            if (totals.fecItemized !== null) {
              hasValidData = true;
              totalFecItemized += totals.fecItemized;
              totalFecUnitemized += totals.fecUnitemized || 0;
              totalFecReceipts += totals.fecTotalReceipts || 0;
              totalFecPac += totals.fecPacContributions || 0;
              totalFecParty += totals.fecPartyContributions || 0;

              // Update committee_finance_rollups with PER-COMMITTEE local totals
              // FIXED: Use correct field names
              await supabase
                .from('committee_finance_rollups')
                .upsert({
                  committee_id: committee.fec_committee_id,
                  candidate_id: cId,
                  cycle,
                  fec_itemized: totals.fecItemized,
                  fec_unitemized: totals.fecUnitemized,
                  fec_total_receipts: totals.fecTotalReceipts,
                  // PER-COMMITTEE local totals - FIXED field names
                  local_itemized: cmteLocalItemized,
                  local_individual_itemized: cmteTotals.individual_total,
                  local_pac_contributions: cmteTotals.pac_total,
                  local_party_contributions: cmteTotals.party_total,
                  local_transfers: cmteTotals.transfer_total,
                  local_earmarked: cmteTotals.earmarked_total,
                  local_loans: cmteTotals.loan_total,
                  local_other: cmteTotals.other_total,
                  local_organization: cmteTotals.organization_total,
                  last_fec_check: new Date().toISOString()
                }, { onConflict: 'committee_id,cycle' });
            }
          }

          if (hasValidData) {
            // Calculate deltas - align with nightly-finance-reconciliation logic
            // FEC's individual_itemized_contributions = Line 11A (Individuals + Organizations) NET of memo_code='X'
            // So we use NET: (localIndividual + localOrganization) vs totalFecItemized
            const local11ATotal = localIndividual + localOrganization;
            const localComparableItemized = local11ATotal + localPac + localParty;
            const fecComparableItemized = totalFecItemized + totalFecPac + totalFecParty;
            
            const deltaAmount = localComparableItemized - fecComparableItemized;
            const deltaPct = fecComparableItemized > 0 ? (deltaAmount / fecComparableItemized) * 100 : 0;
            
            // Individual delta: (gross individual + organization) vs FEC itemized (both are Line 11A)
            const individualDeltaAmount = local11ATotal - totalFecItemized;
            const individualDeltaPct = totalFecItemized > 0 ? (individualDeltaAmount / totalFecItemized) * 100 : 0;
            
            const pacDeltaAmount = localPac - totalFecPac;
            const pacDeltaPct = totalFecPac > 0 ? (pacDeltaAmount / totalFecPac) * 100 : 0;

            const status = Math.abs(deltaPct) <= 2 ? 'ok' : Math.abs(deltaPct) <= 5 ? 'warning' : 'error';

            // Update finance_reconciliation with ALL fields
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
                local_itemized_net: localItemized,
                local_individual_itemized: localIndividual,
                local_gross_individual: localGrossIndividual,
                local_pac_contributions: localPac,
                local_party_contributions: localParty,
                local_organization: localOrganization,
                local_transfers: localTransfers,
                local_earmarked: localEarmarked,
                local_loans: localLoans,
                local_other_receipts: localOther,
                memo_x_amount: localMemoX,
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

    // Build lookup map for per-committee local totals (will be populated in loop)
    // UPDATED: field names now match RPC output (individual_total, transfer_total, loan_total, etc.)
    const committeeTotalsMap = new Map<string, {
      individual_total: number;
      individual_gross: number;
      pac_total: number;
      party_total: number;
      transfer_total: number;
      earmarked_total: number;
      loan_total: number;
      other_total: number;
      organization_total: number;
      memo_x_total: number;
    }>();

    // Fetch per-committee local totals for each committee BEFORE the main loop
    for (const committee of committees) {
      const { data: cmteLocalData, error: cmteLocalErr } = await supabase
        .rpc('get_contribution_totals_by_committee', {
          p_committee_id: committee.fec_committee_id,
          p_cycle: cycle
        });
      
      if (cmteLocalErr) {
        console.warn(`[REFRESH-FEC-TOTALS] Error fetching local totals for committee ${committee.fec_committee_id}:`, cmteLocalErr);
        continue;
      }

      // RPC returns an array of rows - normalize to first row
      const ct = Array.isArray(cmteLocalData) ? cmteLocalData[0] : cmteLocalData;
      // Log actual keys from RPC to debug field name mismatches
      console.log(`[REFRESH-FEC-TOTALS] Committee ${committee.fec_committee_id} local RPC keys: ${ct ? Object.keys(ct).join(', ') : 'null'}`);
      if (ct) {
        committeeTotalsMap.set(committee.fec_committee_id, {
          // FIXED: Use correct RPC field names
          individual_total: Number(ct.individual_total) || 0,
          individual_gross: Number(ct.individual_gross) || 0,
          pac_total: Number(ct.pac_total) || 0,
          party_total: Number(ct.party_total) || 0,
          transfer_total: Number(ct.transfer_total) || 0,
          earmarked_total: Number(ct.earmarked_total) || 0,
          loan_total: Number(ct.loan_total) || 0,
          other_total: Number(ct.other_total) || 0,
          organization_total: Number(ct.organization_total) || 0,
          memo_x_total: Number(ct.memo_x_total) || 0,
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
    let localGrossIndividual = 0;
    let localPac = 0;
    let localParty = 0;
    let localOrganization = 0;
    let localTransfers = 0;
    let localEarmarked = 0;
    let localLoans = 0;
    let localOther = 0;
    let localMemoX = 0;

    for (const committee of committees) {
      const totals = await fetchFECTotals(fecApiKey, committee.fec_committee_id, cycle);
      
      // Get THIS committee's local totals (already fetched above)
      // FIXED: Use correct field names matching RPC output
      const cmteTotals = committeeTotalsMap.get(committee.fec_committee_id) || {
        individual_total: 0,
        individual_gross: 0,
        pac_total: 0,
        party_total: 0,
        transfer_total: 0,
        earmarked_total: 0,
        loan_total: 0,
        other_total: 0,
        organization_total: 0,
        memo_x_total: 0,
      };

      // Sum up local totals for this candidate - FIXED field names
      // Compute local_itemized = individual + organization + pac + party (Line 11A + 11B + 11C)
      const cmteLocalItemized = cmteTotals.individual_total + cmteTotals.organization_total + cmteTotals.pac_total + cmteTotals.party_total;
      localItemized += cmteLocalItemized;
      localIndividual += cmteTotals.individual_total;
      localGrossIndividual += cmteTotals.individual_gross;
      localPac += cmteTotals.pac_total;
      localParty += cmteTotals.party_total;
      localOrganization += cmteTotals.organization_total;
      localTransfers += cmteTotals.transfer_total;
      localEarmarked += cmteTotals.earmarked_total;
      localLoans += cmteTotals.loan_total;
      localOther += cmteTotals.other_total;
      localMemoX += cmteTotals.memo_x_total;
      
      if (totals.fecItemized !== null) {
        totalFecItemized += totals.fecItemized;
        totalFecUnitemized += totals.fecUnitemized || 0;
        totalFecReceipts += totals.fecTotalReceipts || 0;
        totalFecPac += totals.fecPacContributions || 0;
        totalFecParty += totals.fecPartyContributions || 0;
        committeesUpdated++;

        // Update committee_finance_rollups with PER-COMMITTEE local totals
        // FIXED: Use correct field names
        await supabase
          .from('committee_finance_rollups')
          .upsert({
            committee_id: committee.fec_committee_id,
            candidate_id: candidateId,
            cycle,
            fec_itemized: totals.fecItemized,
            fec_unitemized: totals.fecUnitemized,
            fec_total_receipts: totals.fecTotalReceipts,
            // PER-COMMITTEE local totals - FIXED field names
            local_itemized: cmteLocalItemized,
            local_individual_itemized: cmteTotals.individual_total,
            local_pac_contributions: cmteTotals.pac_total,
            local_party_contributions: cmteTotals.party_total,
            local_transfers: cmteTotals.transfer_total,
            local_earmarked: cmteTotals.earmarked_total,
            local_loans: cmteTotals.loan_total,
            local_other: cmteTotals.other_total,
            local_organization: cmteTotals.organization_total,
            last_fec_check: new Date().toISOString()
          }, { onConflict: 'committee_id,cycle' });

        console.log(`[REFRESH-FEC-TOTALS] Updated ${committee.name}: FEC $${totals.fecItemized?.toLocaleString()}, Local $${cmteLocalItemized.toLocaleString()}`);
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

    // Calculate deltas - align with nightly-finance-reconciliation logic
    // FEC's individual_itemized_contributions = Line 11A (Individuals + Organizations) NET of memo_code='X'
    // So we use NET: (localIndividual + localOrganization) vs totalFecItemized for apples-to-apples
    const local11ATotal = localIndividual + localOrganization;
    const localComparableItemized = local11ATotal + localPac + localParty;
    const fecComparableItemized = totalFecItemized + totalFecPac + totalFecParty;
    
    const deltaAmount = localComparableItemized - fecComparableItemized;
    const deltaPct = fecComparableItemized > 0 ? (deltaAmount / fecComparableItemized) * 100 : 0;
    
    // Individual delta: (gross individual + organization) vs FEC itemized (both are Line 11A)
    const individualDeltaAmount = local11ATotal - totalFecItemized;
    const individualDeltaPct = totalFecItemized > 0 ? (individualDeltaAmount / totalFecItemized) * 100 : 0;
    
    // PAC delta
    const pacDeltaAmount = localPac - totalFecPac;
    const pacDeltaPct = totalFecPac > 0 ? (pacDeltaAmount / totalFecPac) * 100 : 0;

    const status = Math.abs(deltaPct) <= 2 ? 'ok' : Math.abs(deltaPct) <= 5 ? 'warning' : 'error';

    console.log(`[REFRESH-FEC-TOTALS] ${candidateId}: localGrossInd=$${localGrossIndividual}, localPac=$${localPac}, localParty=$${localParty}, fecInd=$${totalFecItemized}, fecPac=$${totalFecPac}, fecParty=$${totalFecParty}`);

    // Update finance_reconciliation with ALL fields matching nightly reconciliation
    await supabase
      .from('finance_reconciliation')
      .upsert({
        candidate_id: candidateId,
        cycle,
        // FEC totals
        fec_itemized: totalFecItemized,
        fec_unitemized: totalFecUnitemized,
        fec_total_receipts: totalFecReceipts,
        fec_pac_contributions: totalFecPac,
        fec_party_contributions: totalFecParty,
        // Local totals - ALL fields
        local_itemized: localItemized,
        local_itemized_net: localItemized, // same as itemized (net of memo X)
        local_individual_itemized: localIndividual,
        local_gross_individual: localGrossIndividual,
        local_pac_contributions: localPac,
        local_party_contributions: localParty,
        local_organization: localOrganization,
        local_transfers: localTransfers,
        local_earmarked: localEarmarked,
        local_loans: localLoans,
        local_other_receipts: localOther,
        memo_x_amount: localMemoX,
        // Deltas
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
