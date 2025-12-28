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

    // Check if committee already exists with role='external'
    // We now allow importing even if it exists under a different role (like 'leadership_pac')
    const { data: existingExternal, error: existingError } = await supabase
      .from('candidate_committees')
      .select('id, fec_committee_id, name, candidate_id, role')
      .eq('fec_committee_id', committeeId)
      .eq('role', 'external');

    if (existingError) {
      console.error('[IMPORT-COMMITTEE] Error checking existing committees:', existingError);
    }

    // If already exists with role='external', return that
    if (existingExternal && existingExternal.length > 0) {
      console.log('[IMPORT-COMMITTEE] Committee already exists as external:', existingExternal);
      const orphanCommittee = existingExternal.find(c => c.candidate_id === null) || existingExternal[0];
      return new Response(
        JSON.stringify({ 
          success: true,
          message: `Committee already exists as external PAC`,
          committee: orphanCommittee,
          alreadyExists: true,
          existingCount: existingExternal.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if it exists under other roles (for logging purposes)
    const { data: existingOtherRoles } = await supabase
      .from('candidate_committees')
      .select('id, name, role')
      .eq('fec_committee_id', committeeId)
      .neq('role', 'external');

    if (existingOtherRoles && existingOtherRoles.length > 0) {
      console.log('[IMPORT-COMMITTEE] Committee exists under other roles:', existingOtherRoles.map(c => c.role));
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

    // Insert committee into candidate_committees with role='external'
    // This creates a new external row even if the committee exists under another role
    const committeeRecord = {
      fec_committee_id: committee.committee_id,
      name: committee.name,
      designation: committee.designation || 'U', // Default to U (Unauthorized/Super PAC)
      designation_full: committee.designation_full || committee.committee_type_full,
      candidate_id: null, // External/orphan committee
      role: 'external', // Mark as externally imported Super PAC
      active: true, // Active by default so it appears in Super PACs table
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

    const otherRolesNote = existingOtherRoles && existingOtherRoles.length > 0
      ? ` (also exists as ${existingOtherRoles.map(c => c.role).join(', ')})`
      : '';

    console.log('[IMPORT-COMMITTEE] Successfully imported committee as external:', insertedCommittee);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully imported ${committee.name} as external PAC${otherRolesNote}`,
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
