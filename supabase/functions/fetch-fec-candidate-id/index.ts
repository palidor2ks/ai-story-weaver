import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district?: string;
  cycles: number[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[FEC] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { candidateId, candidateName, state, updateDatabase } = await req.json();
    console.log('[FEC] Looking up FEC candidate ID for:', { candidateId, candidateName, state });

    if (!candidateName && !candidateId) {
      return new Response(
        JSON.stringify({ error: 'Either candidateName or candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search query
    const params = new URLSearchParams({
      api_key: fecApiKey,
      per_page: '5',
      sort: '-election_years',
    });

    if (candidateName) {
      // Clean name - remove prefixes like "Rep.", "Sen.", etc.
      const cleanName = candidateName
        .replace(/^(Rep\.|Sen\.|Hon\.|Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
        .trim();
      params.append('q', cleanName);
    }
    if (state) {
      params.append('state', state);
    }

    const searchUrl = `https://api.open.fec.gov/v1/candidates/search/?${params.toString()}`;
    console.log('[FEC] Searching:', searchUrl.replace(fecApiKey, 'REDACTED'));

    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FEC] API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `FEC API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[FEC] Found', data.results?.length || 0, 'candidates');

    if (!data.results || data.results.length === 0) {
      return new Response(
        JSON.stringify({ found: false, candidates: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map results to our format
    const candidates: FECCandidate[] = data.results.map((r: any) => ({
      candidate_id: r.candidate_id,
      name: r.name,
      party: r.party_full || r.party,
      office: r.office_full || r.office,
      state: r.state,
      district: r.district,
      cycles: r.election_years || [],
    }));

    // If updateDatabase is true and we have a candidateId, update the candidates table
    if (updateDatabase && candidateId && candidates.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Use the first (best) match
      const bestMatch = candidates[0];
      console.log('[FEC] Updating candidate', candidateId, 'with FEC ID:', bestMatch.candidate_id);

      const { error: updateError } = await supabase
        .from('candidates')
        .update({ fec_candidate_id: bestMatch.candidate_id })
        .eq('id', candidateId);

      if (updateError) {
        console.error('[FEC] Failed to update candidate:', updateError);
      } else {
        console.log('[FEC] Successfully updated candidate with FEC ID');
      }

      return new Response(
        JSON.stringify({ 
          found: true, 
          updated: !updateError,
          fecCandidateId: bestMatch.candidate_id,
          candidates 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ found: true, candidates }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[FEC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
