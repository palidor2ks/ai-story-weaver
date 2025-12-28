import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Allocate committees to candidates.
 * 
 * Modes:
 * 1. Single allocation: { committeeId, candidateId, cycle }
 * 2. Batch allocation: { batch: true, cycle } - allocates ALL J/U/B/D committees based on their candidate_committees links
 * 
 * When allocating:
 *   - Updates contributions with recipient_committee_id to have candidate_id
 *   - Updates donors with recipient_committee_id to have candidate_id
 *   - Deletes any transfer records FROM the J/U/B/D committee TO the candidate (prevents double-counting)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { committeeId, candidateId, cycle = '2024', batch = false } = body || {};

    // Batch mode: allocate all J/U/B/D committees based on their candidate_committees links
    if (batch) {
      console.log('[ALLOCATE-COMMITTEE] Starting batch allocation for cycle:', cycle);
      
      // Get all J/U/B/D committees that are linked to candidates
      const { data: linkedCommittees, error: fetchError } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id, candidate_id, name, designation')
        .in('designation', ['J', 'U', 'B', 'D'])
        .not('candidate_id', 'is', null);
      
      console.log('[ALLOCATE-COMMITTEE] Query result:', {
        count: linkedCommittees?.length,
        error: fetchError,
        firstFew: linkedCommittees?.slice(0, 3)
      });
      
      if (fetchError) {
        console.error('[ALLOCATE-COMMITTEE] Error fetching linked committees:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch linked committees' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('[ALLOCATE-COMMITTEE] Found', linkedCommittees?.length || 0, 'J/U/B/D committees to process');
      
      let totalContributionsUpdated = 0;
      let totalDonorsUpdated = 0;
      let totalTransfersDeleted = 0;
      let totalTransferDonorsDeleted = 0;
      let committeesProcessed = 0;
      
      for (const committee of linkedCommittees || []) {
        const result = await allocateSingleCommittee(
          supabase, 
          committee.fec_committee_id, 
          committee.candidate_id, 
          cycle,
          committee.name
        );
        
        totalContributionsUpdated += result.contributionsUpdated;
        totalDonorsUpdated += result.donorsUpdated;
        totalTransfersDeleted += result.transfersDeleted;
        totalTransferDonorsDeleted += result.transferDonorsDeleted;
        
        if (result.contributionsUpdated > 0 || result.donorsUpdated > 0 || result.transfersDeleted > 0) {
          committeesProcessed++;
        }
      }
      
      console.log('[ALLOCATE-COMMITTEE] Batch complete:', {
        committeesProcessed,
        totalContributionsUpdated,
        totalDonorsUpdated,
        totalTransfersDeleted,
        totalTransferDonorsDeleted
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          batch: true,
          cycle,
          committeesProcessed,
          totalContributionsUpdated,
          totalDonorsUpdated,
          totalTransfersDeleted,
          totalTransferDonorsDeleted,
          message: `Batch allocated ${committeesProcessed} committees: ${totalTransfersDeleted} transfers removed, ${totalContributionsUpdated} contributions + ${totalDonorsUpdated} donors assigned`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single committee mode
    if (!committeeId) {
      return new Response(
        JSON.stringify({ error: 'committeeId is required for single allocation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ALLOCATE-COMMITTEE] Single allocation:', { committeeId, candidateId, cycle });

    // Get committee info
    const { data: committeeData } = await supabase
      .from('candidate_committees')
      .select('name, designation, candidate_id')
      .eq('fec_committee_id', committeeId)
      .maybeSingle();

    const result = await allocateSingleCommittee(
      supabase,
      committeeId,
      candidateId,
      cycle,
      committeeData?.name
    );

    // Update candidate_committees if allocating
    if (candidateId) {
      const { data: existingLink } = await supabase
        .from('candidate_committees')
        .select('id')
        .eq('fec_committee_id', committeeId)
        .eq('candidate_id', candidateId)
        .maybeSingle();

      if (!existingLink) {
        const { error: linkError } = await supabase
          .from('candidate_committees')
          .upsert({
            candidate_id: candidateId,
            fec_committee_id: committeeId,
            active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'candidate_id,fec_committee_id' });

        if (linkError) {
          console.error('[ALLOCATE-COMMITTEE] Error linking committee:', linkError);
        }
      }
    }

    console.log('[ALLOCATE-COMMITTEE] Single allocation complete:', result);

    return new Response(
      JSON.stringify({
        success: true,
        committeeId,
        candidateId: candidateId || null,
        cycle,
        ...result,
        message: candidateId 
          ? `Allocated committee: ${result.transfersDeleted} transfers removed, ${result.contributionsUpdated} contributions + ${result.donorsUpdated} donors assigned`
          : `Deallocated committee: ${result.contributionsUpdated} contributions, ${result.donorsUpdated} donors cleared`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[ALLOCATE-COMMITTEE] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Allocate or deallocate a single committee
 */
async function allocateSingleCommittee(
  supabase: any,
  committeeId: string,
  candidateId: string | null,
  cycle: string,
  committeeName: string | null
): Promise<{
  contributionsUpdated: number;
  donorsUpdated: number;
  transfersDeleted: number;
  transferDonorsDeleted: number;
}> {
  let transfersDeleted = 0;
  let transferDonorsDeleted = 0;
  let contributionsUpdated = 0;
  let donorsUpdated = 0;

  // When allocating, first delete any transfer records to prevent double-counting
  if (candidateId && committeeName) {
    // Delete transfer contributions from this committee to the target candidate
    const { count: contribDeleteCount, error: contribDeleteError } = await supabase
      .from('contributions')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('is_transfer', true)
      .or(`contributor_name.ilike.%${committeeName}%,conduit_committee_name.ilike.%${committeeName}%`);
    
    if (contribDeleteError) {
      console.error('[ALLOCATE-COMMITTEE] Error deleting transfer contributions:', contribDeleteError);
    } else {
      transfersDeleted = contribDeleteCount || 0;
    }
    
    // Delete the committee from donors table for this candidate (transfer entries)
    const { count: donorDeleteCount, error: donorDeleteError } = await supabase
      .from('donors')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('is_transfer', true)
      .ilike('name', `%${committeeName}%`);
    
    if (donorDeleteError) {
      console.error('[ALLOCATE-COMMITTEE] Error deleting transfer donors:', donorDeleteError);
    } else {
      transferDonorsDeleted = donorDeleteCount || 0;
    }
  }

  // Update contributions
  if (candidateId) {
    const { count: contribCount, error: contribError } = await supabase
      .from('contributions')
      .update({ candidate_id: candidateId })
      .eq('recipient_committee_id', committeeId)
      .eq('cycle', cycle)
      .is('candidate_id', null);

    if (contribError) {
      console.error('[ALLOCATE-COMMITTEE] Error updating contributions:', contribError);
    } else {
      contributionsUpdated = contribCount || 0;
    }
  } else {
    // Deallocating - set candidate_id to null
    const { count: contribCount, error: contribError } = await supabase
      .from('contributions')
      .update({ candidate_id: null })
      .eq('recipient_committee_id', committeeId)
      .eq('cycle', cycle)
      .not('candidate_id', 'is', null);

    if (contribError) {
      console.error('[ALLOCATE-COMMITTEE] Error deallocating contributions:', contribError);
    } else {
      contributionsUpdated = contribCount || 0;
    }
  }

  // Update donors
  if (candidateId) {
    const { count: donorCount, error: donorError } = await supabase
      .from('donors')
      .update({ candidate_id: candidateId })
      .eq('recipient_committee_id', committeeId)
      .eq('cycle', cycle)
      .is('candidate_id', null);

    if (donorError) {
      console.error('[ALLOCATE-COMMITTEE] Error updating donors:', donorError);
    } else {
      donorsUpdated = donorCount || 0;
    }
  } else {
    const { count: donorCount, error: donorError } = await supabase
      .from('donors')
      .update({ candidate_id: null })
      .eq('recipient_committee_id', committeeId)
      .eq('cycle', cycle)
      .not('candidate_id', 'is', null);

    if (donorError) {
      console.error('[ALLOCATE-COMMITTEE] Error deallocating donors:', donorError);
    } else {
      donorsUpdated = donorCount || 0;
    }
  }

  return {
    contributionsUpdated,
    donorsUpdated,
    transfersDeleted,
    transferDonorsDeleted
  };
}
