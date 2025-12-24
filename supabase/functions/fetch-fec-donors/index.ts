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

interface LineClassification {
  isContribution: boolean;
  isTransfer: boolean;
}

// Classify a line_number to determine if it's a contribution and/or transfer
function classifyLineNumber(lineNumber: string | null): LineClassification {
  if (!lineNumber) return { isContribution: true, isTransfer: false }; // Default to contribution
  
  const line = lineNumber.toUpperCase();
  // Line 11* = Individual/PAC contributions (not transfers)
  // Line 12* = Transfers from authorized committees (contributions but marked as transfer)
  // Line 15* = Other receipts (loans, refunds, etc.) - not contributions
  // Line 17A = Itemized contributions from individuals
  const isLine11 = line.startsWith('11');
  const isLine12 = line.startsWith('12');
  const isLine17 = line.startsWith('17');
  
  const isContribution = isLine11 || isLine12 || isLine17;
  const isTransfer = isLine12; // Committee-to-committee transfers
  
  return { isContribution, isTransfer };
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
  isTransfer: boolean;
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

    // Build committee list (principal + authorized)
    const committees: Array<{ id: string; name: string; role: string }> = [];
    const committeeSet = new Set<string>();

    const pushCommittee = (id: string, name = '', role = 'authorized') => {
      if (!id || committeeSet.has(id)) return;
      committeeSet.add(id);
      committees.push({ id, name, role });
    };

    const { data: candidateData } = await supabase
      .from('candidates')
      .select('fec_committee_id, fec_candidate_id')
      .eq('id', candidateId)
      .single();

    const fecId = fecCandidateId || candidateData?.fec_candidate_id || null;

    if (fecCommitteeId) pushCommittee(fecCommitteeId, '', 'manual');
    if (candidateData?.fec_committee_id) pushCommittee(candidateData.fec_committee_id, '', 'stored');

    if (!fecCommitteeId && fecId) {
      try {
        const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/committees/?api_key=${fecApiKey}&designation=P,A&per_page=50`;
        const committeeResponse = await fetch(committeeUrl);

        if (committeeResponse.ok) {
          const committeeData = await committeeResponse.json();
          const results = committeeData.results || [];
          results.forEach((cmte: { committee_id: string; name?: string; designation?: string }) => {
            const role = cmte.designation === 'P' ? 'principal' : 'authorized';
            pushCommittee(cmte.committee_id, cmte.name || '', role);
          });

          const primary = results.find((cmte: { designation?: string }) => cmte.designation === 'P');
          if (primary?.committee_id && !candidateData?.fec_committee_id) {
            const { error: storeError } = await supabase
              .from('candidates')
              .update({ fec_committee_id: primary.committee_id })
              .eq('id', candidateId);

            if (storeError) {
              console.warn('[FEC-DONORS] Failed to store committee ID:', storeError);
            }
          }
        } else {
          const errorText = await committeeResponse.text();
          console.error('[FEC-DONORS] Committee lookup API error:', committeeResponse.status, errorText);
        }
      } catch (err) {
        console.error('[FEC-DONORS] Committee lookup failed:', err);
      }
    }

    if (committees.length === 0) {
      console.error('[FEC-DONORS] No committee IDs available');
      return new Response(
        JSON.stringify({ error: 'No FEC committee ID available. Please link FEC ID first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const cmte of committees) {
      if (!cmte.name) {
        try {
          const cmteUrl = `https://api.open.fec.gov/v1/committee/${cmte.id}/?api_key=${fecApiKey}`;
          const cmteResp = await fetch(cmteUrl);
          if (cmteResp.ok) {
            const cmteData = await cmteResp.json();
            cmte.name = cmteData.results?.[0]?.name || cmte.id;
          } else {
            cmte.name = cmte.id;
          }
        } catch (err) {
          console.warn('[FEC-DONORS] Could not fetch committee name:', err);
          cmte.name = cmte.id;
        }
      }
    }

    try {
      await supabase
        .from('candidate_committees')
        .upsert(
          committees.map(cmte => ({
            candidate_id: candidateId,
            fec_committee_id: cmte.id,
            role: cmte.role,
            active: true,
          })),
          { onConflict: 'candidate_id,fec_committee_id' }
        );
    } catch (err) {
      console.warn('[FEC-DONORS] Failed to upsert candidate_committees:', err);
    }

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
      is_transfer: boolean;
    }> = [];

    let totalRaised = 0;
    let skippedNonContributions = 0;
    let committeesProcessed = 0;

    for (const committee of committees) {
      const committeeId = committee.id;
      const committeeName = committee.name || committee.id;

      const aggregatedDonors = new Map<string, AggregatedDonor>();
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

        if (lastIndex && lastContributionDate) {
          params.set('last_index', lastIndex);
          params.set('last_contribution_receipt_date', lastContributionDate);
        }

        const contributionsUrl = `https://api.open.fec.gov/v1/schedules/schedule_a/?${params.toString()}`;
        
        const response = await fetch(contributionsUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[FEC-DONORS] API error on page', pageCount + 1, ':', response.status, errorText);
          
          if (response.status === 429) {
            console.log('[FEC-DONORS] Rate limited, waiting 60s...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            continue;
          }
          break;
        }

        const data = await response.json();
        const results = data.results || [];
        
        if (results.length === 0) {
          console.log('[FEC-DONORS] No more results after page', pageCount, 'for committee', committeeId);
          break;
        }

        pageCount++;

        for (const contribution of results) {
          const lineNumber = contribution.line_number || '';
          const classification = classifyLineNumber(lineNumber);
          
          if (!classification.isContribution && !includeOtherReceipts) {
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
              isContribution: classification.isContribution,
              isTransfer: classification.isTransfer
            });
          }
        }

        const pagination = data.pagination;
        if (!pagination?.last_indexes || results.length < 100) {
          console.log('[FEC-DONORS] Reached end of results at page', pageCount, 'for committee', committeeId);
          break;
        }

        lastIndex = pagination.last_indexes.last_index;
        lastContributionDate = pagination.last_indexes.last_contribution_receipt_date;

        if (pageCount % 10 === 0) {
          console.log(`[FEC-DONORS] Progress: page ${pageCount}, ${totalContributions} contributions, ${aggregatedDonors.size} unique donors (committee ${committeeId})`);
        }

        await new Promise(resolve => setTimeout(resolve, 250));
      }

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
          is_contribution: donor.isContribution,
          is_transfer: donor.isTransfer
        });

        totalRaised += donor.amount;
      }

      committeesProcessed++;
      console.log('[FEC-DONORS] Completed committee', committeeId, '-> donors', aggregatedDonors.size);
    }

    if (donors.length === 0) {
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
          committees: committees.map(c => ({ id: c.id, name: c.name }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FEC-DONORS] Aggregated to', donors.length, 'unique donors across', committeesProcessed, 'committees');

    const { error: deleteError } = await supabase
      .from('donors')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('cycle', cycle);

    if (deleteError) {
      console.warn('[FEC-DONORS] Delete error (continuing):', deleteError);
    }

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

    const { error: updateError } = await supabase
      .from('candidates')
      .update({ last_donor_sync: new Date().toISOString() })
      .eq('id', candidateId);

    if (updateError) {
      console.warn('[FEC-DONORS] Failed to update last_donor_sync:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: donors.length,
        totalRaised,
        cycle,
        committees: committees.map(c => ({ id: c.id, name: c.name })),
        skippedNonContributions,
        message: `Imported ${donors.length} contributors totaling $${totalRaised.toLocaleString()} across ${committeesProcessed} committees`
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
