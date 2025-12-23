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
function generateDonorId(contributorName: string, candidateId: string, cycle: string): string {
  // Create a simple hash from contributor name + candidate + cycle
  const key = `${contributorName}-${candidateId}-${cycle}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `fec-${key}`.slice(0, 100);
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

    const { candidateId, fecCandidateId, fecCommitteeId, cycle = '2024', maxPages = 150 } = await req.json();
    console.log('[FEC-DONORS] Fetching donors for:', { candidateId, fecCandidateId, fecCommitteeId, cycle });

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // We need either fecCommitteeId (preferred) or fecCandidateId (to look up committee)
    let committeeId = fecCommitteeId;

    // If no committee ID provided, try to get it from the candidate record or look it up
    if (!committeeId) {
      // First check if we already have it in the database
      const { data: candidateData } = await supabase
        .from('candidates')
        .select('fec_committee_id, fec_candidate_id')
        .eq('id', candidateId)
        .single();

      if (candidateData?.fec_committee_id) {
        committeeId = candidateData.fec_committee_id;
        console.log('[FEC-DONORS] Using stored committee ID:', committeeId);
      } else if (fecCandidateId || candidateData?.fec_candidate_id) {
        // Look up the principal committee from FEC API
        const fecId = fecCandidateId || candidateData?.fec_candidate_id;
        console.log('[FEC-DONORS] Looking up committee for FEC candidate:', fecId);
        
        const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/?api_key=${fecApiKey}`;
        const committeeResponse = await fetch(committeeUrl);
        
        if (committeeResponse.ok) {
          const committeeData = await committeeResponse.json();
          const principalCommittees = committeeData.results?.[0]?.principal_committees || [];
          if (principalCommittees.length > 0) {
            committeeId = principalCommittees[0].committee_id;
            console.log('[FEC-DONORS] Found principal committee:', committeeId);
            
            // Store it for future use
            await supabase
              .from('candidates')
              .update({ fec_committee_id: committeeId })
              .eq('id', candidateId);
          }
        }
      }
    }

    if (!committeeId) {
      console.error('[FEC-DONORS] No committee ID available');
      return new Response(
        JSON.stringify({ error: 'No FEC committee ID available. Please link FEC ID first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ALL contributions using pagination
    // FEC API returns max 100 results per page, so we need to paginate
    const aggregatedDonors = new Map<string, {
      name: string;
      type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
      amount: number;
    }>();

    let lastIndex: string | null = null;
    let lastContributionDate: string | null = null;
    let pageCount = 0;
    let totalContributions = 0;

    console.log('[FEC-DONORS] Starting paginated fetch for committee:', committeeId);

    while (pageCount < maxPages) {
      const params = new URLSearchParams({
        api_key: fecApiKey,
        committee_id: committeeId,
        two_year_transaction_period: cycle,
        per_page: '100',
        sort: '-contribution_receipt_date',
        sort_null_only: 'false',
      });

      // Add pagination cursors if we have them
      if (lastIndex && lastContributionDate) {
        params.set('last_index', lastIndex);
        params.set('last_contribution_receipt_date', lastContributionDate);
      }

      const contributionsUrl = `https://api.open.fec.gov/v1/schedules/schedule_a/?${params.toString()}`;
      
      if (pageCount === 0) {
        console.log('[FEC-DONORS] Fetching page 1:', contributionsUrl.replace(fecApiKey, 'REDACTED'));
      }

      const response = await fetch(contributionsUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FEC-DONORS] API error on page', pageCount + 1, ':', response.status, errorText);
        break; // Continue with what we have
      }

      const data = await response.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        console.log('[FEC-DONORS] No more results after page', pageCount);
        break;
      }

      totalContributions += results.length;
      pageCount++;

      // Process contributions
      for (const contribution of results) {
        const name = contribution.contributor_name || 'Unknown Contributor';
        const type = mapEntityType(contribution.entity_type);
        const amount = Math.round(contribution.contribution_receipt_amount || 0);
        
        const key = `${name}-${type}`;
        const existing = aggregatedDonors.get(key);
        
        if (existing) {
          existing.amount += amount;
        } else {
          aggregatedDonors.set(key, { name, type, amount });
        }
      }

      // Get pagination info for next page
      const pagination = data.pagination;
      if (!pagination?.last_indexes || results.length < 100) {
        console.log('[FEC-DONORS] Reached end of results at page', pageCount);
        break;
      }

      lastIndex = pagination.last_indexes.last_index;
      lastContributionDate = pagination.last_indexes.last_contribution_receipt_date;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('[FEC-DONORS] Fetched', totalContributions, 'contributions across', pageCount, 'pages');

    if (aggregatedDonors.size === 0) {
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

    // Transform to our donor format and deduplicate by ID
    const donorMap = new Map<string, {
      id: string;
      candidate_id: string;
      name: string;
      type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
      amount: number;
      cycle: string;
    }>();

    for (const donor of aggregatedDonors.values()) {
      const donorId = generateDonorId(donor.name, candidateId, cycle);
      const existing = donorMap.get(donorId);
      
      if (existing) {
        // Merge amounts if same ID (name collision after sanitization)
        existing.amount += donor.amount;
      } else {
        donorMap.set(donorId, {
          id: donorId,
          candidate_id: candidateId,
          name: donor.name,
          type: donor.type,
          amount: donor.amount,
          cycle: cycle,
        });
      }
    }

    const donors = Array.from(donorMap.values());
    console.log('[FEC-DONORS] Aggregated to', donors.length, 'unique donors (after ID dedup)');

    // Upsert donors into database in batches to avoid conflicts
    const batchSize = 500;
    let totalUpserted = 0;

    for (let i = 0; i < donors.length; i += batchSize) {
      const batchRaw = donors.slice(i, i + batchSize);

      // Safety: ensure no duplicate IDs within a single upsert payload
      const batchMap = new Map<string, typeof batchRaw[number]>();
      for (const row of batchRaw) {
        const existing = batchMap.get(row.id);
        if (existing) {
          existing.amount += row.amount;
        } else {
          batchMap.set(row.id, { ...row });
        }
      }

      const batch = Array.from(batchMap.values());
      if (batch.length !== batchRaw.length) {
        console.warn('[FEC-DONORS] Deduped', batchRaw.length - batch.length, 'duplicate IDs within batch', Math.floor(i / batchSize) + 1);
      }

      const { data: upsertedData, error: upsertError } = await supabase
        .from('donors')
        .upsert(batch, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        })
        .select();

      if (upsertError) {
        console.error('[FEC-DONORS] Upsert error on batch', Math.floor(i / batchSize) + 1, ':', upsertError);
        return new Response(
          JSON.stringify({ error: `Database error: ${upsertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      totalUpserted += upsertedData?.length || 0;
    }

    console.log('[FEC-DONORS] Successfully upserted', totalUpserted, 'donors');

    // Update last_donor_sync timestamp on candidate
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ last_donor_sync: new Date().toISOString() })
      .eq('id', candidateId);

    if (updateError) {
      console.warn('[FEC-DONORS] Failed to update last_donor_sync:', updateError);
    }

    // Calculate total raised
    const totalRaised = donors.reduce((sum, d) => sum + d.amount, 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: donors.length,
        totalRaised,
        cycle,
        committeeId,
        message: `Imported ${donors.length} donors totaling $${totalRaised.toLocaleString()}`
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
