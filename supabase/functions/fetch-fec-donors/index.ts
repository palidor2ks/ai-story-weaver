import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

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

// Check if a line_number represents an actual contribution (not other receipts)
function isContributionLine(lineNumber: string | null): boolean {
  if (!lineNumber) return true; // Default to true if not specified
  const line = lineNumber.toUpperCase();
  // Line 11* = Contributions from individuals/persons
  // Line 12* = Transfers from authorized committees  
  // Line 15 = Other receipts (interest, refunds, etc) - EXCLUDE
  // Line 16/17 = Loans/etc - EXCLUDE
  return line.startsWith('11') || line.startsWith('12');
}

// Generate a stable SHA-256 based ID for donor identity
async function generateDonorId(
  contributorName: string,
  entityType: string,
  city: string,
  state: string,
  zip: string,
  committeeId: string,
  cycle: string
): Promise<string> {
  // Build identity key based on entity type
  let identityKey: string;
  
  if (entityType === 'IND') {
    // For individuals: name + location gives best deduplication
    identityKey = [
      contributorName.toLowerCase().trim(),
      city.toLowerCase().trim(),
      state.toUpperCase().trim(),
      zip.slice(0, 5), // First 5 digits of zip
      committeeId,
      cycle
    ].join('|');
  } else {
    // For PACs/orgs: name + state + committee ID if available
    identityKey = [
      contributorName.toLowerCase().trim(),
      state.toUpperCase().trim(),
      committeeId,
      cycle
    ].join('|');
  }
  
  // Create SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  
  return `fec-${hashHex.slice(0, 32)}`;
}

interface AggregatedDonor {
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  transactionCount: number;
  firstReceiptDate: string | null;
  lastReceiptDate: string | null;
  city: string;
  state: string;
  zip: string;
  employer: string;
  occupation: string;
  lineNumber: string;
  isContribution: boolean;
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

    const { 
      candidateId, 
      fecCandidateId, 
      fecCommitteeId, 
      cycle = '2024', 
      maxPages = 150,
      includeOtherReceipts = false // Default OFF - only fetch actual contributions
    } = await req.json();
    
    console.log('[FEC-DONORS] Fetching donors for:', { candidateId, fecCandidateId, fecCommitteeId, cycle, includeOtherReceipts });

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // We need either fecCommitteeId (preferred) or fecCandidateId (to look up committee)
    let committeeId = fecCommitteeId;
    let committeeName = '';

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
        // Look up the principal committee from FEC API (designation=P)
        const fecId = fecCandidateId || candidateData?.fec_candidate_id;
        console.log('[FEC-DONORS] Looking up principal committee for FEC candidate:', fecId);

        try {
          const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/committees/?api_key=${fecApiKey}&designation=P&per_page=1`;
          const committeeResponse = await fetch(committeeUrl);

          if (!committeeResponse.ok) {
            const errorText = await committeeResponse.text();
            console.error('[FEC-DONORS] Committee lookup API error:', committeeResponse.status, errorText);
          } else {
            const committeeData = await committeeResponse.json();
            const principalCommittee = committeeData.results?.[0];

            if (principalCommittee?.committee_id) {
              committeeId = principalCommittee.committee_id;
              committeeName = principalCommittee.name || '';
              console.log('[FEC-DONORS] Found principal committee:', committeeId, committeeName);

              // Store it for future use
              const { error: storeError } = await supabase
                .from('candidates')
                .update({ fec_committee_id: committeeId })
                .eq('id', candidateId);

              if (storeError) {
                console.warn('[FEC-DONORS] Failed to store committee ID:', storeError);
              }
            } else {
              console.warn('[FEC-DONORS] No principal committee found for FEC candidate:', fecId);
            }
          }
        } catch (err) {
          console.error('[FEC-DONORS] Committee lookup failed:', err);
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

    // If we don't have committee name yet, fetch it
    if (!committeeName) {
      try {
        const cmteUrl = `https://api.open.fec.gov/v1/committee/${committeeId}/?api_key=${fecApiKey}`;
        const cmteResp = await fetch(cmteUrl);
        if (cmteResp.ok) {
          const cmteData = await cmteResp.json();
          committeeName = cmteData.results?.[0]?.name || committeeId;
        }
      } catch (err) {
        console.warn('[FEC-DONORS] Could not fetch committee name:', err);
        committeeName = committeeId;
      }
    }

    // Fetch ALL contributions using pagination
    const aggregatedDonors = new Map<string, AggregatedDonor>();

    let lastIndex: string | null = null;
    let lastContributionDate: string | null = null;
    let pageCount = 0;
    let totalContributions = 0;
    let skippedNonContributions = 0;

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
        
        // Handle rate limiting
        if (response.status === 429) {
          console.log('[FEC-DONORS] Rate limited, waiting 60s...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue; // Retry same page
        }
        break; // Other errors, continue with what we have
      }

      const data = await response.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        console.log('[FEC-DONORS] No more results after page', pageCount);
        break;
      }

      pageCount++;

      // Process contributions
      for (const contribution of results) {
        const lineNumber = contribution.line_number || '';
        const isContribution = isContributionLine(lineNumber);
        
        // Skip non-contributions unless explicitly requested
        if (!isContribution && !includeOtherReceipts) {
          skippedNonContributions++;
          continue;
        }

        totalContributions++;
        
        const name = contribution.contributor_name || 'Unknown Contributor';
        const type = mapEntityType(contribution.entity_type);
        const amount = Math.round(contribution.contribution_receipt_amount || 0);
        const city = contribution.contributor_city || '';
        const state = contribution.contributor_state || '';
        const zip = contribution.contributor_zip || '';
        const employer = contribution.contributor_employer || '';
        const occupation = contribution.contributor_occupation || '';
        const receiptDate = contribution.contribution_receipt_date || null;
        
        // Generate stable ID for this donor
        const donorId = await generateDonorId(
          name,
          contribution.entity_type || '',
          city,
          state,
          zip,
          committeeId,
          cycle
        );
        
        const existing = aggregatedDonors.get(donorId);
        
        if (existing) {
          existing.amount += amount;
          existing.transactionCount++;
          if (receiptDate) {
            if (!existing.firstReceiptDate || receiptDate < existing.firstReceiptDate) {
              existing.firstReceiptDate = receiptDate;
            }
            if (!existing.lastReceiptDate || receiptDate > existing.lastReceiptDate) {
              existing.lastReceiptDate = receiptDate;
            }
          }
        } else {
          aggregatedDonors.set(donorId, { 
            name, 
            type, 
            amount,
            transactionCount: 1,
            firstReceiptDate: receiptDate,
            lastReceiptDate: receiptDate,
            city,
            state,
            zip,
            employer,
            occupation,
            lineNumber,
            isContribution
          });
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

      // Log progress every 10 pages
      if (pageCount % 10 === 0) {
        console.log(`[FEC-DONORS] Progress: page ${pageCount}, ${totalContributions} contributions, ${aggregatedDonors.size} unique donors`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    console.log('[FEC-DONORS] Fetched', totalContributions, 'contributions across', pageCount, 'pages');
    console.log('[FEC-DONORS] Skipped', skippedNonContributions, 'non-contribution receipts');

    if (aggregatedDonors.size === 0) {
      await supabase
        .from('candidates')
        .update({ last_donor_sync: new Date().toISOString() })
        .eq('id', candidateId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          imported: 0, 
          message: 'No contributions found for this candidate/cycle',
          skippedNonContributions,
          committeeId,
          committeeName
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform to our donor format
    const donors: Array<{
      id: string;
      candidate_id: string;
      name: string;
      type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
      amount: number;
      cycle: string;
      recipient_committee_id: string;
      recipient_committee_name: string;
      first_receipt_date: string | null;
      last_receipt_date: string | null;
      transaction_count: number;
      contributor_city: string;
      contributor_state: string;
      contributor_zip: string;
      employer: string;
      occupation: string;
      line_number: string;
      is_contribution: boolean;
    }> = [];

    for (const [donorId, donor] of aggregatedDonors.entries()) {
      donors.push({
        id: donorId,
        candidate_id: candidateId,
        name: donor.name,
        type: donor.type,
        amount: donor.amount,
        cycle: cycle,
        recipient_committee_id: committeeId,
        recipient_committee_name: committeeName,
        first_receipt_date: donor.firstReceiptDate,
        last_receipt_date: donor.lastReceiptDate,
        transaction_count: donor.transactionCount,
        contributor_city: donor.city,
        contributor_state: donor.state,
        contributor_zip: donor.zip,
        employer: donor.employer,
        occupation: donor.occupation,
        line_number: donor.lineNumber,
        is_contribution: donor.isContribution
      });
    }

    console.log('[FEC-DONORS] Aggregated to', donors.length, 'unique donors');

    // Delete existing donors for this candidate/cycle before inserting fresh data
    // This ensures clean data without conflicts
    const { error: deleteError } = await supabase
      .from('donors')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('cycle', cycle);

    if (deleteError) {
      console.warn('[FEC-DONORS] Delete error (continuing):', deleteError);
    }

    // Insert donors in batches
    const batchSize = 500;
    let totalInserted = 0;

    for (let i = 0; i < donors.length; i += batchSize) {
      const batch = donors.slice(i, i + batchSize);

      const { data: insertedData, error: insertError } = await supabase
        .from('donors')
        .insert(batch)
        .select();

      if (insertError) {
        console.error('[FEC-DONORS] Insert error on batch', Math.floor(i / batchSize) + 1, ':', insertError);
        return new Response(
          JSON.stringify({ error: `Database error: ${insertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      totalInserted += insertedData?.length || 0;
    }

    console.log('[FEC-DONORS] Successfully inserted', totalInserted, 'donors');

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
        committeeName,
        skippedNonContributions,
        message: `Imported ${donors.length} contributors totaling $${totalRaised.toLocaleString()}`
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
