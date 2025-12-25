import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Known conduit organizations that process individual donations (pass-throughs)
const KNOWN_CONDUITS = ['ACTBLUE', 'WINRED', 'DEMOCRACY ENGINE'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: { candidateId?: string; dryRun?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided - run for all candidates
    }

    const { candidateId, dryRun = false } = body;
    const cycle = '2024';

    console.log('[CLEANUP] Starting donor aggregation cleanup', { candidateId, dryRun, cycle });

    // Step 1: Find all conduit org donors that need to be zeroed out
    let conduitQuery = supabase
      .from('donors')
      .select('id, name, amount, candidate_id, is_conduit_org')
      .eq('cycle', cycle)
      .gt('amount', 0); // Only those with non-zero amounts

    if (candidateId) {
      conduitQuery = conduitQuery.eq('candidate_id', candidateId);
    }

    const { data: allDonors, error: donorError } = await conduitQuery;

    if (donorError) {
      console.error('[CLEANUP] Error fetching donors:', donorError);
      throw donorError;
    }

    // Identify conduit orgs by name pattern
    const conduitDonors = (allDonors || []).filter(d => {
      const upperName = d.name.toUpperCase();
      return KNOWN_CONDUITS.some(c => upperName.includes(c)) || d.is_conduit_org;
    });

    console.log(`[CLEANUP] Found ${conduitDonors.length} conduit donors with non-zero amounts`);

    // Group by candidate for reporting
    const conduitsByCandidate = new Map<string, { count: number; totalAmount: number }>();
    for (const donor of conduitDonors) {
      const existing = conduitsByCandidate.get(donor.candidate_id) || { count: 0, totalAmount: 0 };
      existing.count++;
      existing.totalAmount += donor.amount;
      conduitsByCandidate.set(donor.candidate_id, existing);
    }

    let updatedCount = 0;
    const candidatesAffected: string[] = [];

    if (!dryRun && conduitDonors.length > 0) {
      // Step 2: Zero out conduit org amounts
      const conduitIds = conduitDonors.map(d => d.id);
      
      // Update in batches of 500
      for (let i = 0; i < conduitIds.length; i += 500) {
        const batch = conduitIds.slice(i, i + 500);
        const { error: updateError, count } = await supabase
          .from('donors')
          .update({ amount: 0, is_conduit_org: true })
          .in('id', batch);

        if (updateError) {
          console.error('[CLEANUP] Error updating donors batch:', updateError);
        } else {
          updatedCount += count || batch.length;
        }
      }

      console.log(`[CLEANUP] Zeroed out ${updatedCount} conduit donor amounts`);

      // Step 3: Recalculate finance_reconciliation for affected candidates
      const affectedCandidates = Array.from(conduitsByCandidate.keys());
      candidatesAffected.push(...affectedCandidates);

      for (const candId of affectedCandidates) {
        // Recalculate local_itemized from donors (now with zeroed conduits)
        const { data: candidateDonors } = await supabase
          .from('donors')
          .select('amount, is_contribution, is_transfer, is_conduit_org')
          .eq('candidate_id', candId)
          .eq('cycle', cycle);

        if (!candidateDonors) continue;

        // Calculate new totals
        let localItemized = 0;
        let localItemizedNet = 0;
        let localTransfers = 0;

        for (const d of candidateDonors) {
          const amt = d.amount || 0;
          if (d.is_transfer) {
            localTransfers += amt;
          } else if (d.is_contribution !== false && !d.is_conduit_org) {
            localItemized += amt;
            localItemizedNet += amt;
          }
        }

        // Get FEC totals from existing record
        const { data: existingRecon } = await supabase
          .from('finance_reconciliation')
          .select('fec_itemized, fec_unitemized, fec_total_receipts')
          .eq('candidate_id', candId)
          .eq('cycle', cycle)
          .maybeSingle();

        if (existingRecon) {
          const fecItemized = existingRecon.fec_itemized || 0;
          const deltaAmount = localItemizedNet - fecItemized;
          const deltaPct = fecItemized > 0 ? Math.round((deltaAmount / fecItemized) * 10000) / 100 : 0;
          
          let status = 'ok';
          if (Math.abs(deltaPct) > 10) status = 'error';
          else if (Math.abs(deltaPct) > 5) status = 'warning';

          const { error: reconError } = await supabase
            .from('finance_reconciliation')
            .update({
              local_itemized: localItemized,
              local_itemized_net: localItemizedNet,
              local_transfers: localTransfers,
              delta_amount: deltaAmount,
              delta_pct: deltaPct,
              status,
              checked_at: new Date().toISOString(),
              notes: `Cleaned up conduit double-counting on ${new Date().toISOString()}`
            })
            .eq('candidate_id', candId)
            .eq('cycle', cycle);

          if (reconError) {
            console.error(`[CLEANUP] Error updating reconciliation for ${candId}:`, reconError);
          } else {
            console.log(`[CLEANUP] Updated reconciliation for ${candId}: itemized=${localItemizedNet}, delta=${deltaPct}%`);
          }
        }
      }
    }

    // Build summary report
    const summary = {
      success: true,
      dryRun,
      cycle,
      candidateId: candidateId || 'all',
      conduitDonorsFound: conduitDonors.length,
      conduitDonorsUpdated: updatedCount,
      candidatesAffected: candidatesAffected.length,
      breakdown: Array.from(conduitsByCandidate.entries()).map(([id, stats]) => ({
        candidateId: id,
        conduitDonorCount: stats.count,
        totalAmountZeroed: stats.totalAmount
      }))
    };

    console.log('[CLEANUP] Completed:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CLEANUP] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
