import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate-limited fetch with retries
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        const backoffMs = 2000 * Math.pow(2, attempt);
        console.log(`[IMPORT-COMMITTEE] Rate limited (429), backing off ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const backoffMs = 2000 * Math.pow(2, attempt);
        console.log(`[IMPORT-COMMITTEE] Fetch error, retrying in ${backoffMs}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[IMPORT-COMMITTEE] FEC_API_KEY not configured');
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

    const { committeeId } = body;

    if (!committeeId) {
      return new Response(
        JSON.stringify({ error: 'committeeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IMPORT-COMMITTEE] Importing committee:', committeeId);

    // Check if committee already exists - check ALL rows with this fec_committee_id
    // (there can be duplicates with different candidate_ids due to unique constraint on candidate_id+fec_committee_id)
    const { data: existingCommittees, error: existingError } = await supabase
      .from('candidate_committees')
      .select('id, fec_committee_id, name, candidate_id')
      .eq('fec_committee_id', committeeId);

    if (existingError) {
      console.error('[IMPORT-COMMITTEE] Error checking existing committees:', existingError);
    }

    if (existingCommittees && existingCommittees.length > 0) {
      console.log('[IMPORT-COMMITTEE] Committee already exists:', existingCommittees);
      // Return the first one (or the one with null candidate_id if it exists)
      const orphanCommittee = existingCommittees.find(c => c.candidate_id === null) || existingCommittees[0];
      return new Response(
        JSON.stringify({ 
          success: true,
          message: `Committee already exists (${existingCommittees.length} record${existingCommittees.length > 1 ? 's' : ''})`,
          committee: orphanCommittee,
          alreadyExists: true,
          existingCount: existingCommittees.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch committee details from FEC API
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/?api_key=${fecApiKey}`;
    console.log('[IMPORT-COMMITTEE] Fetching from FEC API...');
    
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[IMPORT-COMMITTEE] FEC API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `FEC API returned ${response.status}: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const committee = data?.results?.[0];

    if (!committee) {
      return new Response(
        JSON.stringify({ error: 'Committee not found in FEC database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IMPORT-COMMITTEE] FEC committee data:', {
      id: committee.committee_id,
      name: committee.name,
      designation: committee.designation,
      designation_full: committee.designation_full,
      committee_type: committee.committee_type,
      committee_type_full: committee.committee_type_full
    });

    // Insert committee into candidate_committees with NULL candidate_id
    // External/imported committees start inactive - require admin activation
    const committeeRecord = {
      fec_committee_id: committee.committee_id,
      name: committee.name,
      designation: committee.designation || 'U', // Default to U (Unauthorized/Super PAC)
      designation_full: committee.designation_full || committee.committee_type_full,
      candidate_id: null, // Orphan committee - will be allocated later
      role: 'external', // Mark as externally imported
      active: false, // Inactive by default - admin must activate
      source_fec_candidate_id: null, // Not linked to any FEC candidate
    };

    const { data: insertedCommittee, error: insertError } = await supabase
      .from('candidate_committees')
      .insert(committeeRecord)
      .select()
      .single();

    if (insertError) {
      console.error('[IMPORT-COMMITTEE] Error inserting committee:', insertError);
      return new Response(
        JSON.stringify({ error: `Failed to save committee: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IMPORT-COMMITTEE] Successfully imported committee:', insertedCommittee);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully imported ${committee.name}`,
        committee: {
          id: insertedCommittee.id,
          fec_committee_id: committee.committee_id,
          name: committee.name,
          designation: committee.designation,
          designation_full: committee.designation_full || committee.committee_type_full,
        },
        alreadyExists: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[IMPORT-COMMITTEE] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
