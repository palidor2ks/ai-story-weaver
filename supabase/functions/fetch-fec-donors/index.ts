import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map FEC entity types to our donor types
function mapEntityType(entityType: string): 'Individual' | 'PAC' | 'Organization' | 'Unknown' {
  switch (entityType?.toUpperCase()) {
    case 'IND':
      return 'Individual';
    case 'COM':
    case 'PAC':
    case 'PTY':
      return 'PAC';
    case 'ORG':
    case 'CCM':
    case 'CAN':
      return 'Organization';
    default:
      return 'Unknown';
  }
}

// Generate a consistent ID for a donor contribution
function generateDonorId(fecContributionId: string, candidateId: string): string {
  return `fec-${candidateId}-${fecContributionId}`.slice(0, 100);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[FEC-DONORS] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { candidateId, fecCandidateId, cycle = '2024', maxResults = 100 } = await req.json();
    console.log('[FEC-DONORS] Fetching donors for:', { candidateId, fecCandidateId, cycle });

    if (!candidateId || !fecCandidateId) {
      return new Response(
        JSON.stringify({ error: 'Both candidateId and fecCandidateId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch contributions from FEC API (Schedule A = individual contributions)
    const params = new URLSearchParams({
      api_key: fecApiKey,
      candidate_id: fecCandidateId,
      two_year_transaction_period: cycle,
      per_page: String(Math.min(maxResults, 100)),
      sort: '-contribution_receipt_amount',
      is_individual: 'true', // Start with individual contributions
    });

    const contributionsUrl = `https://api.open.fec.gov/v1/schedules/schedule_a/?${params.toString()}`;
    console.log('[FEC-DONORS] Fetching contributions:', contributionsUrl.replace(fecApiKey, 'REDACTED'));

    const response = await fetch(contributionsUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FEC-DONORS] API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `FEC API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[FEC-DONORS] Found', data.results?.length || 0, 'contributions');

    if (!data.results || data.results.length === 0) {
      // Still update last_donor_sync even if no donors found
      await supabase
        .from('candidates')
        .update({ last_donor_sync: new Date().toISOString() })
        .eq('id', candidateId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          imported: 0, 
          message: 'No contributions found for this candidate/cycle' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform FEC contributions to our donor format
    const donors = data.results.map((contribution: any) => {
      // Use sub_id or line_number as unique identifier
      const fecId = contribution.sub_id || contribution.line_number || 
                    `${contribution.contributor_name}-${contribution.contribution_receipt_amount}`;
      
      return {
        id: generateDonorId(String(fecId), candidateId),
        candidate_id: candidateId,
        name: contribution.contributor_name || 'Unknown Contributor',
        type: mapEntityType(contribution.entity_type),
        amount: Math.round(contribution.contribution_receipt_amount || 0),
        cycle: cycle,
      };
    });

    // Aggregate donations by contributor name (sum amounts for same donor)
    const aggregatedDonors = new Map<string, typeof donors[0]>();
    for (const donor of donors) {
      const key = `${donor.name}-${donor.type}`;
      const existing = aggregatedDonors.get(key);
      if (existing) {
        existing.amount += donor.amount;
      } else {
        aggregatedDonors.set(key, { ...donor });
      }
    }

    const uniqueDonors = Array.from(aggregatedDonors.values());
    console.log('[FEC-DONORS] Aggregated to', uniqueDonors.length, 'unique donors');

    // Upsert donors into database
    const { data: upsertedData, error: upsertError } = await supabase
      .from('donors')
      .upsert(uniqueDonors, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select();

    if (upsertError) {
      console.error('[FEC-DONORS] Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: `Database error: ${upsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FEC-DONORS] Successfully upserted', upsertedData?.length || 0, 'donors');

    // Update last_donor_sync timestamp on candidate
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ last_donor_sync: new Date().toISOString() })
      .eq('id', candidateId);

    if (updateError) {
      console.warn('[FEC-DONORS] Failed to update last_donor_sync:', updateError);
    }

    // Calculate total raised
    const totalRaised = uniqueDonors.reduce((sum, d) => sum + d.amount, 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: uniqueDonors.length,
        totalRaised,
        cycle,
        message: `Imported ${uniqueDonors.length} donors totaling $${totalRaised.toLocaleString()}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[FEC-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
