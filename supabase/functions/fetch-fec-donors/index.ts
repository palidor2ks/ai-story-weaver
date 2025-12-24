import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

// Identify contribution/transfer/other by line number
function getReceiptType(lineNumber: string | null): 'contribution' | 'transfer' | 'other_receipt' {
  if (!lineNumber) return 'contribution';
  const line = lineNumber.toUpperCase();
  if (line.startsWith('11')) return 'contribution'; // individual contributions
  if (line.startsWith('12')) return 'transfer';      // authorized committee transfers
  return 'other_receipt';                            // interest, refunds, loans, etc.
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
  isTransfer?: boolean;
  receiptType?: 'contribution' | 'transfer' | 'other_receipt';
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
      includeOtherReceipts = false, // Default OFF - only fetch actual contributions
      maxRuntimeMs = 4 * 60 * 1000, // Stop long-running jobs after ~4 minutes by default (resumable)
      rateLimitPerMinute = 50 // Safety throttle for FEC API
    } = await req.json();
    
    console.log('[FEC-DONORS] Fetching donors for:', { candidateId, fecCandidateId, fecCommitteeId, cycle, includeOtherReceipts });
    const startTime = Date.now();

    // Simple in-function rate limiter
    let windowStart = Date.now();
    let requestsInWindow = 0;
    const getRateLimited = async (url: string, options?: RequestInit) => {
      const now = Date.now();
      if (now - windowStart >= 60000) {
        windowStart = now;
        requestsInWindow = 0;
      }
      if (requestsInWindow >= rateLimitPerMinute) {
        const waitMs = 60000 - (now - windowStart);
        if (waitMs > 0) {
          console.log(`[FEC-DONORS] Rate limit sleep ${waitMs}ms`);
          await sleep(waitMs);
        }
        windowStart = Date.now();
        requestsInWindow = 0;
      }
      requestsInWindow += 1;
      return fetch(url, options);
    };

    const fetchWithRetry = async (url: string, label: string, maxRetries = 3) => {
      let attempt = 0;
      let backoff = 2000;
      while (attempt <= maxRetries) {
        const resp = await getRateLimited(url);
        if (resp.status === 429) {
          console.warn(`[FEC-DONORS] ${label} hit 429, backoff ${backoff}ms`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 20000);
          attempt++;
          continue;
        }
        if (!resp.ok && attempt < maxRetries) {
          console.warn(`[FEC-DONORS] ${label} error ${resp.status}, retrying in ${backoff}ms`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 20000);
          attempt++;
          continue;
        }
        return resp;
      }
      return await getRateLimited(url); // final attempt
    };

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build committee list (principal + authorized)
    const committees: Array<{ id: string; name: string; role: string; last_index?: string | null; last_contribution_date?: string | null; last_cycle?: string | null }> = [];
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
        const committeeResponse = await fetchWithRetry(committeeUrl, 'committee lookup');

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

    // Pull existing cursors for resumable syncs
    const { data: existingMappings } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, last_index, last_contribution_date, last_cycle')
      .eq('candidate_id', candidateId);

    const cursorMap = new Map<string, { last_index: string | null; last_contribution_date: string | null; last_cycle: string | null }>();
    (existingMappings || []).forEach(row => {
      cursorMap.set(row.fec_committee_id, {
        last_index: row.last_index || null,
        last_contribution_date: row.last_contribution_date || null,
        last_cycle: row.last_cycle || null,
      });
    });

    committees.forEach(cmte => {
      const cursor = cursorMap.get(cmte.id);
      if (cursor && cursor.last_cycle === cycle) {
        cmte.last_index = cursor.last_index;
        cmte.last_contribution_date = cursor.last_contribution_date;
        cmte.last_cycle = cursor.last_cycle;
      }
    });

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
          const cmteResp = await fetchWithRetry(cmteUrl, 'committee name');
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
      is_transfer?: boolean;
      receipt_type?: string | null;
    }> = [];

    let totalRaised = 0;
    let skippedNonContributions = 0;
    let committeesProcessed = 0;
    let hasMore = false;

    for (const committee of committees) {
      const startedAt = new Date().toISOString();

      // Global runtime guard to avoid timeouts on "sync all"
      if (Date.now() - startTime > maxRuntimeMs) {
        console.warn('[FEC-DONORS] Stopping early due to max runtime limit');
        hasMore = true;
        break;
      }

      const committeeId = committee.id;
      const committeeName = committee.name || committee.id;

      const aggregatedDonors = new Map<string, AggregatedDonor>();
      let lastIndex: string | null = committee.last_index || null;
      let lastContributionDate: string | null = committee.last_contribution_date || null;
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
        
        const response = await fetchWithRetry(contributionsUrl, `schedule_a page ${pageCount + 1}`);
        
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
          const receiptType = getReceiptType(lineNumber);
          const isContribution = receiptType === 'contribution';
          const isTransfer = receiptType === 'transfer';
          
          if (receiptType === 'other_receipt' && !includeOtherReceipts) {
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
          existing.lineNumber = existing.lineNumber || lineNumber;
          existing.isContribution = existing.isContribution || isContribution;
          existing.isTransfer = existing.isTransfer || isTransfer;
          existing.receiptType = existing.receiptType || receiptType;
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
              isContribution,
              isTransfer,
              receiptType
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

        // Per-committee runtime guard; save cursor and finish later
        if (Date.now() - startTime > maxRuntimeMs) {
          console.warn('[FEC-DONORS] Stopping mid-committee due to max runtime');
          hasMore = true;
          break;
        }
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
        is_transfer: donor.isTransfer || false,
        receipt_type: donor.receiptType || (donor.isContribution ? 'contribution' : 'other_receipt')
      });

        totalRaised += donor.amount;
      }

      committeesProcessed++;

      // Persist cursor for resumable syncs
      const cursorPayload = {
        last_index: hasMore ? lastIndex : null,
        last_contribution_date: hasMore ? lastContributionDate : null,
        last_cycle: hasMore ? cycle : null,
        last_sync_started_at: startedAt,
        last_sync_completed_at: hasMore ? null : new Date().toISOString(),
      };

      await supabase
        .from('candidate_committees')
        .update(cursorPayload)
        .eq('candidate_id', candidateId)
        .eq('fec_committee_id', committeeId);

      console.log('[FEC-DONORS] Completed committee', committeeId, '-> donors', aggregatedDonors.size, hasMore ? '(paused for next run)' : '');

      if (hasMore) break;
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
          committees: committees.map(c => ({ id: c.id, name: c.name })),
          hasMore
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
        hasMore,
        message: `Imported ${donors.length} contributors totaling $${totalRaised.toLocaleString()} across ${committeesProcessed} committees${hasMore ? ' (resumable - more data pending)' : ''}`
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
