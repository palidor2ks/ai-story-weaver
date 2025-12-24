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

    const { candidateId, fecCandidateId } = body || {};

    if (!candidateId || !fecCandidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId and fecCandidateId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FEC-COMMITTEES] Fetching committees for:', { candidateId, fecCandidateId });

    // Fetch committees from FEC API
    const url = `https://api.open.fec.gov/v1/candidate/${fecCandidateId}/committees/?api_key=${fecApiKey}&designation=P,A&per_page=50`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[FEC-COMMITTEES] FEC API error:', response.status);
      return new Response(
        JSON.stringify({ error: `FEC API returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse FEC API response' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const committees: CommitteeResult[] = data?.results || [];
    
    console.log('[FEC-COMMITTEES] Found', committees.length, 'committees');

    if (committees.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          committees: [], 
          primaryCommitteeId: null,
          message: 'No committees found for this candidate' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find primary committee (designation P) or first authorized (A)
    const primaryCommittee = committees.find(c => c.designation === 'P') || committees[0];
    
    // Store all committees in candidate_committees table
    for (const cmte of committees) {
      const { error: upsertError } = await supabase
        .from('candidate_committees')
        .upsert({
          candidate_id: candidateId,
          fec_committee_id: cmte.committee_id,
          role: cmte.designation === 'P' ? 'principal' : 'authorized',
          active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'candidate_id,fec_committee_id'
        });

      if (upsertError) {
        console.warn('[FEC-COMMITTEES] Failed to upsert committee:', cmte.committee_id, upsertError);
      }
    }

    // Update candidate with primary committee ID
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ 
        fec_committee_id: primaryCommittee.committee_id,
        last_updated: new Date().toISOString()
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('[FEC-COMMITTEES] Failed to update candidate:', updateError);
    }

    console.log('[FEC-COMMITTEES] Linked primary committee:', primaryCommittee.committee_id);

    return new Response(
      JSON.stringify({
        success: true,
        committees: committees.map(c => ({
          id: c.committee_id,
          name: c.name,
          designation: c.designation,
          isPrimary: c.committee_id === primaryCommittee.committee_id
        })),
        primaryCommitteeId: primaryCommittee.committee_id,
        primaryCommitteeName: primaryCommittee.name,
        message: `Linked ${committees.length} committee(s), primary: ${primaryCommittee.committee_id}`
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
