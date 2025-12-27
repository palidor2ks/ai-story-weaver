import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommitteeResult {
  committee_id: string;
  name: string;
  designation: string;
  designation_full: string;
  committee_type: string;
  treasurer_name: string;
  cycles: number[];
}

// Retry fetch with exponential backoff for rate limits
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url);
    
    if (response.status === 429) {
      const backoffMs = Math.min(2000 * Math.pow(2, attempt), 16000);
      console.log(`[FEC-COMMITTEES] Rate limited (429), backing off ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded due to rate limiting');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[FEC-COMMITTEES] FEC_API_KEY not configured');
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

    const { candidateId, fecCandidateId, fetchAllFecIds = false } = body || {};

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which FEC IDs to fetch committees for
    let fecIdsToFetch: Array<{ fecCandidateId: string; office: string; isPrimary: boolean }> = [];

    if (fetchAllFecIds) {
      // Fetch all FEC IDs from the candidate_fec_ids table
      const { data: fecIdRecords, error: fecIdError } = await supabase
        .from('candidate_fec_ids')
        .select('fec_candidate_id, office, is_primary')
        .eq('candidate_id', candidateId);

      if (fecIdError) {
        console.error('[FEC-COMMITTEES] Error fetching FEC IDs:', fecIdError);
      }

      if (fecIdRecords && fecIdRecords.length > 0) {
        fecIdsToFetch = fecIdRecords.map(r => ({
          fecCandidateId: r.fec_candidate_id,
          office: r.office,
          isPrimary: r.is_primary
        }));
        console.log('[FEC-COMMITTEES] Found', fecIdsToFetch.length, 'FEC IDs for candidate:', candidateId);
      }
    }

    // If no FEC IDs found in the table or fetchAllFecIds is false, use the provided fecCandidateId
    if (fecIdsToFetch.length === 0) {
      if (!fecCandidateId) {
        return new Response(
          JSON.stringify({ error: 'fecCandidateId is required when fetchAllFecIds is false or no FEC IDs exist' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      fecIdsToFetch = [{ fecCandidateId, office: 'Unknown', isPrimary: true }];
    }

    console.log('[FEC-COMMITTEES] Fetching committees for:', { candidateId, fecIds: fecIdsToFetch.map(f => f.fecCandidateId) });

    const allCommittees: Array<{
      id: string;
      name: string;
      designation: string;
      designationFull: string;
      isPrimary: boolean;
      active: boolean;
      sourceFecCandidateId: string;
      sourceOffice: string;
    }> = [];
    
    let overallPrimaryCommittee: { id: string; name: string } | null = null;

    // Fetch committees for each FEC candidate ID
    for (const fecIdRecord of fecIdsToFetch) {
      const url = `https://api.open.fec.gov/v1/candidate/${fecIdRecord.fecCandidateId}/committees/?api_key=${fecApiKey}&designation=P&designation=A&per_page=50`;
      
      let response: Response;
      try {
        response = await fetchWithRetry(url);
      } catch (err) {
        console.error('[FEC-COMMITTEES] Failed after retries for', fecIdRecord.fecCandidateId, ':', err);
        continue; // Skip this FEC ID but continue with others
      }
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[FEC-COMMITTEES] FEC API error for', fecIdRecord.fecCandidateId, ':', response.status, errorBody);
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        console.error('[FEC-COMMITTEES] Failed to parse response for', fecIdRecord.fecCandidateId);
        continue;
      }

      const committees: CommitteeResult[] = data?.results || [];
      console.log('[FEC-COMMITTEES] Found', committees.length, 'committees for', fecIdRecord.fecCandidateId);

      // Find primary committee for this FEC ID
      const primaryCommittee = committees.find(c => c.designation === 'P') || committees[0];
      
      // Track overall primary (from the primary FEC ID)
      if (fecIdRecord.isPrimary && primaryCommittee && !overallPrimaryCommittee) {
        overallPrimaryCommittee = { id: primaryCommittee.committee_id, name: primaryCommittee.name };
      }

      // Store all committees with source tracking
      for (const cmte of committees) {
        const isPrimary = cmte.committee_id === primaryCommittee?.committee_id && fecIdRecord.isPrimary;
        
        const { error: upsertError } = await supabase
          .from('candidate_committees')
          .upsert({
            candidate_id: candidateId,
            fec_committee_id: cmte.committee_id,
            name: cmte.name,
            designation: cmte.designation,
            designation_full: cmte.designation_full,
            role: cmte.designation === 'P' ? 'principal' : 'authorized',
            active: cmte.designation === 'P' || cmte.designation === 'A',
            source_fec_candidate_id: fecIdRecord.fecCandidateId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'candidate_id,fec_committee_id'
          });

        if (upsertError) {
          console.warn('[FEC-COMMITTEES] Failed to upsert committee:', cmte.committee_id, upsertError);
        }

        allCommittees.push({
          id: cmte.committee_id,
          name: cmte.name,
          designation: cmte.designation,
          designationFull: cmte.designation_full,
          isPrimary,
          active: cmte.designation === 'P' || cmte.designation === 'A',
          sourceFecCandidateId: fecIdRecord.fecCandidateId,
          sourceOffice: fecIdRecord.office
        });
      }
    }

    // Update candidate with primary committee ID (from primary FEC ID)
    if (overallPrimaryCommittee) {
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ 
          fec_committee_id: overallPrimaryCommittee.id,
          last_updated: new Date().toISOString()
        })
        .eq('id', candidateId);

      if (updateError) {
        console.error('[FEC-COMMITTEES] Failed to update candidate:', updateError);
      }
    }

    console.log('[FEC-COMMITTEES] Total committees linked:', allCommittees.length, 'Primary:', overallPrimaryCommittee?.id);

    return new Response(
      JSON.stringify({
        success: true,
        committees: allCommittees,
        primaryCommitteeId: overallPrimaryCommittee?.id || null,
        primaryCommitteeName: overallPrimaryCommittee?.name,
        fecIdsProcessed: fecIdsToFetch.length,
        message: `Linked ${allCommittees.length} committee(s) from ${fecIdsToFetch.length} FEC ID(s)`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[FEC-COMMITTEES] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
