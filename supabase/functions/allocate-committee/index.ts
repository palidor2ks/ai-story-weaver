import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Allocate or deallocate a committee to/from a candidate.
 * This updates contributions and donors tables to associate them with the candidate.
 * 
 * When allocating (candidateId provided):
 *   - Updates all contributions with recipient_committee_id = committeeId to have candidate_id = candidateId
 *   - Updates all donors with recipient_committee_id = committeeId to have candidate_id = candidateId
 *   - Updates candidate_committees to link the committee to the candidate
 * 
 * When deallocating (candidateId is null):
 *   - Updates contributions and donors to have candidate_id = null
 *   - Does NOT remove the committee from candidate_committees (keeps the relationship for tracking)
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

    const { committeeId, candidateId, cycle = '2024' } = body || {};

    if (!committeeId) {
      return new Response(
        JSON.stringify({ error: 'committeeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ALLOCATE-COMMITTEE] Starting allocation:', { committeeId, candidateId, cycle });

    // Get committee info for logging
    const { data: committeeData } = await supabase
      .from('candidate_committees')
      .select('name, designation, candidate_id')
      .eq('fec_committee_id', committeeId)
      .maybeSingle();

    const previousCandidateId = committeeData?.candidate_id;
    console.log('[ALLOCATE-COMMITTEE] Committee info:', {
      name: committeeData?.name,
      designation: committeeData?.designation,
      previousCandidateId
    });

    // Update contributions
    let contributionsUpdated = 0;
    if (candidateId) {
      // Allocating to a candidate
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
    let donorsUpdated = 0;
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

    // Update candidate_committees if allocating
    if (candidateId) {
      // Check if the committee is already linked to this candidate
      const { data: existingLink } = await supabase
        .from('candidate_committees')
        .select('id')
        .eq('fec_committee_id', committeeId)
        .eq('candidate_id', candidateId)
        .maybeSingle();

      if (!existingLink) {
        // Create or update the link
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

    console.log('[ALLOCATE-COMMITTEE] Complete:', {
      contributionsUpdated,
      donorsUpdated,
      candidateId: candidateId || '(deallocated)'
    });

    return new Response(
      JSON.stringify({
        success: true,
        committeeId,
        candidateId: candidateId || null,
        cycle,
        contributionsUpdated,
        donorsUpdated,
        message: candidateId 
          ? `Allocated committee to candidate: ${contributionsUpdated} contributions, ${donorsUpdated} donors updated`
          : `Deallocated committee: ${contributionsUpdated} contributions, ${donorsUpdated} donors cleared`
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
