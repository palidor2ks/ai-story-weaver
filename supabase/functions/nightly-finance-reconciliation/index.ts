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
  fecOffsetsToOperatingExpenditures: number | null;
}> {
  const nullResult = { 
    fecItemized: null, fecUnitemized: null, fecTotalReceipts: null, 
    fecPacContributions: null, fecPartyContributions: null,
    fecLoans: null, fecTransfers: null, fecCandidateContribution: null, fecOtherReceipts: null,
    fecOffsetsToOperatingExpenditures: null
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
      // Line 14: Offsets to operating expenditures (refunds, rebates, etc.)
      fecOffsetsToOperatingExpenditures: Math.round(totals.offsets_to_operating_expenditures || 0),
    };
  } catch {
    return nullResult;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    // NOTE: FEC cycles are 2-year periods ending in even years:
    // - Cycle 2024 = contributions from Jan 1, 2023 - Dec 31, 2024
    // - Cycle 2022 = contributions from Jan 1, 2021 - Dec 31, 2022
    // Both local data AND FEC API queries must use consistent cycle boundaries
    // to avoid apples-to-oranges comparisons (e.g., comparing 4 years of local data
    // against 2 years of FEC totals, which caused the Katie Boyd Britt +1300% delta bug)
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

    const candidatesList = candidates || [];
    // For bulk runs (no specific candidateId), offload processing to background
    // to avoid the 150s edge function idle timeout. Single-candidate runs stay
    // synchronous so the admin UI can show immediate results.
    const runInBackground = !candidateId && candidatesList.length > 1;

    const processCandidates = async () => {
    for (const candidate of candidatesList) {
      try {
        // Get only Principal (P) and Authorized (A) committees for this candidate
        // Excludes: J (Joint Fundraising), U (Unauthorized/Super PACs), B (Bundler), D (Leadership PAC)
        let { data: committees } = await supabase
          .from('candidate_committees')
          .select('fec_committee_id, designation')
          .eq('candidate_id', candidate.id)
          .eq('active', true)
          .in('designation', ['P', 'A']);

        // Fallback to candidates.fec_committee_id if no separate committee records exist
        if ((!committees || committees.length === 0) && candidate.fec_committee_id) {
          committees = [{ fec_committee_id: candidate.fec_committee_id, designation: 'P' }];
          console.log(`[RECONCILIATION] ${candidate.name}: Using fallback fec_committee_id ${candidate.fec_committee_id}`);
        }

        if (!committees || committees.length === 0) {
          console.log(`[RECONCILIATION] ${candidate.name}: No P/A committees found, skipping`);
          results.skippedCount++;
          continue;
        }

        console.log(`[RECONCILIATION] ${candidate.name}: Found ${committees.length} P/A committees`);

        // Calculate CANDIDATE-LEVEL local totals (for finance_reconciliation)
        const { data: categoryTotals, error: totalsError } = await supabase
          .rpc('get_contribution_totals', {
            p_candidate_id: candidate.id,
            p_cycle: cycle
          });
        
        if (totalsError) {
          console.error(`[RECONCILIATION] ${candidate.name}: Error fetching contribution totals:`, totalsError);
          results.skippedCount++;
          continue;
        }

        const totals = categoryTotals?.[0] || categoryTotals || {};
        // Field names below MUST match get_contribution_totals' actual output columns:
        // individual_total, individual_gross, organization_total, pac_total, party_total,
        // transfer_total, loan_total, offset_total, other_receipts_total, earmarked_total,
        // memo_x_total, conduit_excluded, pass_through_excluded, other_total, grand_total.
        // (The RPC was corrected to exclude memo_code='X' conduit pass-through from its
        // contribution sums; reading the old names silently yielded 0 and produced the
        // stale, inflated finance_reconciliation rows. See HANDOFF 2026-06-10.)
        const localIndividualItemized = Number(totals.individual_total) || 0;  // Net (excludes memo_code='X')
        const localGrossIndividual = Number(totals.individual_gross) || 0;  // Gross (includes memo_code='X' for FEC comparison)
        const memoXAmount = localGrossIndividual - localIndividualItemized;  // Amount in memo_code='X' individual entries
        const localPacContributions = Number(totals.pac_total) || 0;
        const localPartyContributions = Number(totals.party_total) || 0;
        // local "itemized" = Line 11A (individual + organization) + 11B (party) + 11C (pac),
        // net of memo_code='X' conduit pass-through — the RPC exposes this as grand_total, so
        // earmarked/conduit dollars are not double-counted into total receipts.
        const localItemized = Number(totals.grand_total) || 0;
        const localTransfers = Number(totals.transfer_total) || 0;
        const localEarmarked = Number(totals.earmarked_total) || 0;
        const passThroughTotal = Number(totals.pass_through_excluded) || 0;
        const localOther = Number(totals.other_total) || 0;
        const localLoans = Number(totals.loan_total) || 0;
        const localOrganization = Number(totals.organization_total) || 0;
        // get_contribution_totals exposes no contribution-count column; log-only, kept at 0.
        const contributionCount = Number(totals.contribution_count) || 0;

        // local_itemized now excludes transfers (Line 12), loans (Line 13A), and other receipts (Line 15)
        // It equals: Individual + PAC + Party contributions
        const localItemizedNet = localItemized - passThroughTotal;

        // Build a lookup map for per-committee local totals (will be populated in loop)
        // UPDATED: field names now match RPC output (individual_total, transfer_total, loan_total, etc.)
        const committeeTotalsMap = new Map<string, {
          individual_total: number;
          individual_gross: number;
          pac_total: number;
          party_total: number;
          transfer_total: number;
          earmarked_total: number;
          other_total: number;
          organization_total: number;
        }>();
        
        // Fetch per-committee local totals for each committee BEFORE the main loop
        for (const cmte of committees) {
          const { data: cmteLocalData, error: cmteLocalErr } = await supabase
            .rpc('get_contribution_totals_by_committee', {
              p_committee_id: cmte.fec_committee_id,
              p_cycle: cycle
            });
          
          if (cmteLocalErr) {
            console.warn(`[RECONCILIATION] ${candidate.name}: Error fetching local totals for committee ${cmte.fec_committee_id}:`, cmteLocalErr);
            continue;
          }

          // RPC returns an array of rows - normalize to first row
          const ct = Array.isArray(cmteLocalData) ? cmteLocalData[0] : cmteLocalData;
          // Log actual keys from RPC to debug field name mismatches
          console.log(`[RECONCILIATION] ${candidate.name}: Committee ${cmte.fec_committee_id} local RPC keys: ${ct ? Object.keys(ct).join(', ') : 'null'}`);
          if (ct) {
            committeeTotalsMap.set(cmte.fec_committee_id, {
              // FIXED: Use correct RPC field names
              individual_total: Number(ct.individual_total) || 0,
              individual_gross: Number(ct.individual_gross) || 0,
              pac_total: Number(ct.pac_total) || 0,
              party_total: Number(ct.party_total) || 0,
              transfer_total: Number(ct.transfer_total) || 0,
              earmarked_total: Number(ct.earmarked_total) || 0,
              other_total: Number(ct.other_total) || 0,
              organization_total: Number(ct.organization_total) || 0,
            });
          }
        }

        console.log(`[RECONCILIATION] ${candidate.name}: ${contributionCount} contributions - Individual(net): $${localIndividualItemized}, Gross: $${localGrossIndividual}, memo_X: $${memoXAmount}, Org: $${localOrganization}, PAC: $${localPacContributions}, Party: $${localPartyContributions}`);

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
        let fecOffsetsToOperatingExpenditures = 0;

        for (const cmte of committees) {
          const fecTotals = await fetchFECTotals(fecApiKey, cmte.fec_committee_id, cycle);
          fecItemized += fecTotals.fecItemized || 0;
          fecUnitemized += fecTotals.fecUnitemized || 0;
          fecTotalReceipts += fecTotals.fecTotalReceipts || 0;
          fecPacContributions += fecTotals.fecPacContributions || 0;
          fecPartyContributions += fecTotals.fecPartyContributions || 0;
          fecLoans += fecTotals.fecLoans || 0;
          fecTransfers += fecTotals.fecTransfers || 0;
          fecCandidateContribution += fecTotals.fecCandidateContribution || 0;
          fecOtherReceipts += fecTotals.fecOtherReceipts || 0;
          fecOffsetsToOperatingExpenditures += fecTotals.fecOffsetsToOperatingExpenditures || 0;

          // Get THIS COMMITTEE's local totals (not candidate-wide totals!)
          // FIXED: Use correct field names matching RPC output
          const cmteTotals = committeeTotalsMap.get(cmte.fec_committee_id) || {
            individual_total: 0,
            individual_gross: 0,
            pac_total: 0,
            party_total: 0,
            transfer_total: 0,
            earmarked_total: 0,
            other_total: 0,
            organization_total: 0,
          };

          // Compute local_itemized = individual + organization + pac + party (Line 11A + 11B + 11C)
          const cmteLocalItemized = cmteTotals.individual_total + cmteTotals.organization_total + cmteTotals.pac_total + cmteTotals.party_total;

          // Update committee rollup with fresh FEC data AND per-committee local totals
          // FIXED: Use correct field names
          await supabase
            .from('committee_finance_rollups')
            .upsert({
              committee_id: cmte.fec_committee_id,
              candidate_id: candidate.id,
              cycle,
              // FEC data
              fec_itemized: fecTotals.fecItemized,
              fec_unitemized: fecTotals.fecUnitemized,
              fec_total_receipts: fecTotals.fecTotalReceipts,
              // PER-COMMITTEE local totals - FIXED field names
              local_itemized: cmteLocalItemized,
              local_individual_itemized: cmteTotals.individual_total,
              local_pac_contributions: cmteTotals.pac_total,
              local_party_contributions: cmteTotals.party_total,
              local_transfers: cmteTotals.transfer_total,
              local_earmarked: cmteTotals.earmarked_total,
              local_other: cmteTotals.other_total,
              local_organization: cmteTotals.organization_total,
              last_fec_check: new Date().toISOString(),
              updated_at: new Date().toISOString()
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
        // FEC's individual_itemized_contributions = Line 11A (Individuals + Organizations) NET of memo_code='X'
        // So we compare NET values: (localIndividualItemized + localOrganization) vs fecItemized
        const local11ATotal = localIndividualItemized + localOrganization;
        const individualDeltaAmount = local11ATotal - fecItemized;
        const individualDeltaPct = fecItemized > 0 
          ? Math.round((individualDeltaAmount / fecItemized) * 10000) / 100 
          : 0;
        
        // PAC: local_pac_contributions vs fec_pac_contributions (both are Line 11C)
        const pacDeltaAmount = localPacContributions - fecPacContributions;
        const pacDeltaPct = fecPacContributions > 0 
          ? Math.round((pacDeltaAmount / fecPacContributions) * 10000) / 100 
          : 0;
        
        // Party: local_party_contributions vs fec_party_contributions (both are Line 11B)
        const partyDeltaAmount = localPartyContributions - fecPartyContributions;
        
        // FIXED: Calculate Local Total to match FEC Total Receipts formula
        // Use Math.max for Transfers/Loans/Other to fill gaps when local data is incomplete
        // This handles cases where parent aggregate records are missing from local imports
        const effectiveTransfers = Math.max(localTransfers, fecTransfers);
        const effectiveLoans = Math.max(localLoans, fecLoans);
        const effectiveOther = Math.max(localOther, fecOtherReceipts + fecOffsetsToOperatingExpenditures);
        const localTotal = localItemized + effectiveTransfers + effectiveLoans + effectiveOther;

        // Total receipts delta (apples-to-apples with FEC Total Receipts, includes FEC-only items)
        const localTotalReceipts = localItemized + effectiveTransfers + effectiveLoans + effectiveOther
          + (fecUnitemized || 0) + (fecCandidateContribution || 0);
        const totalReceiptsDeltaAmount = fecTotalReceipts > 0
          ? Math.round(localTotalReceipts - fecTotalReceipts)
          : null;
        const totalReceiptsDeltaPct = fecTotalReceipts > 0
          ? ((localTotalReceipts - fecTotalReceipts) / fecTotalReceipts) * 100
          : null;
        
        // Compare local vs FEC at the comparable itemized level
        // Use (gross individual + organization) for Line 11A, matching FEC individual_itemized
        const fecComparableItemized = fecItemized + fecPacContributions + fecPartyContributions;
        const localComparableItemized = local11ATotal + localPacContributions + localPartyContributions;
        
        // Overall delta: compare comparable itemized totals
        const deltaAmount = localComparableItemized - fecComparableItemized;
        const deltaPct = fecComparableItemized > 0 
          ? Math.round((deltaAmount / fecComparableItemized) * 10000) / 100 
          : 0;

        // Status based on overall delta
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
            local_gross_individual: localGrossIndividual,
            memo_x_amount: memoXAmount,
            local_pac_contributions: localPacContributions,
            local_party_contributions: localPartyContributions,
            local_loans: localLoans,
            local_organization: localOrganization,
            // Local other receipts (Line 14 + 15)
            local_other_receipts: localOther,
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
            // FEC offsets (Line 14)
            fec_offsets_to_operating_expenditures: fecOffsetsToOperatingExpenditures,
            // Category-level deltas
            individual_delta_amount: individualDeltaAmount,
            individual_delta_pct: individualDeltaPct,
            pac_delta_amount: pacDeltaAmount,
            pac_delta_pct: pacDeltaPct,
            // Overall delta
            delta_amount: deltaAmount,
            delta_pct: deltaPct,
            total_receipts_delta_amount: totalReceiptsDeltaAmount,
            total_receipts_delta_pct: totalReceiptsDeltaPct,
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
    };

    if (runInBackground) {
      // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
      EdgeRuntime.waitUntil(processCandidates());
      return new Response(
        JSON.stringify({
          success: true,
          queued: true,
          candidates: candidatesList.length,
          message: `Reconciliation started in background for ${candidatesList.length} candidates. Results will appear as each candidate completes.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await processCandidates();

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
