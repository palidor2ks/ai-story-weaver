import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_REQUESTS_PER_MINUTE = 45;
const REQUEST_DELAY_MS = 200;
const MAX_RUNTIME_MS = 25000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;
const DONOR_BATCH_SIZE = 100;

let requestCount = 0;
let lastMinuteReset = Date.now();

async function fetchWithRetry(url: string, maxRetries = MAX_RETRIES): Promise<Response> {
  const now = Date.now();
  if (now - lastMinuteReset > 60000) {
    requestCount = 0;
    lastMinuteReset = now;
  }
  
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (now - lastMinuteReset) + 1000;
    console.log(`[PAC-DONORS] Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
    lastMinuteReset = Date.now();
  }
  
  requestCount++;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[PAC-DONORS] Rate limited (429), backing off ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      if (response.status >= 500 && attempt < maxRetries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[PAC-DONORS] Server error ${response.status}, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[PAC-DONORS] Fetch error, retrying in ${backoffMs}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

function mapEntityType(entityType: string): 'Individual' | 'PAC' | 'Organization' | 'Unknown' {
  switch (entityType?.toUpperCase()) {
    case 'IND': return 'Individual';
    case 'COM': case 'PAC': case 'PTY': return 'PAC';
    case 'ORG': case 'CCM': case 'CAN': return 'Organization';
    default: return 'Unknown';
  }
}

async function generateDonorId(
  contributorName: string,
  entityType: string,
  city: string,
  state: string,
  zip: string,
  committeeId: string,
  cycle: string
): Promise<string> {
  let identityKey: string;
  
  if (entityType === 'IND') {
    identityKey = [
      contributorName.toLowerCase().trim(),
      city.toLowerCase().trim(),
      state.toUpperCase().trim(),
      zip.slice(0, 5),
      committeeId,
      cycle
    ].join('|');
  } else {
    identityKey = [
      contributorName.toLowerCase().trim(),
      state.toUpperCase().trim(),
      committeeId,
      cycle
    ].join('|');
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  
  return `pac-donor-${hashHex.slice(0, 32)}`;
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
}

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
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

    const { committeeId, cycle = '2024', maxPages = 50 } = body;

    if (!committeeId) {
      return new Response(
        JSON.stringify({ error: 'committeeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[PAC-DONORS] Starting fetch for Super PAC:', committeeId, 'cycle:', cycle);

    // Verify committee exists and is external (Super PAC)
    const { data: committee, error: committeeError } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, name, role')
      .eq('fec_committee_id', committeeId)
      .maybeSingle();

    if (committeeError || !committee) {
      return new Response(
        JSON.stringify({ error: 'Committee not found. Import it first using import-external-committee.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (committee.role !== 'external') {
      console.log('[PAC-DONORS] Warning: Committee is not marked as external, role:', committee.role);
    }

    // Fetch Schedule A receipts (donations TO this PAC)
    let allReceipts: any[] = [];
    let lastIndex: string | null = null;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore && pagesFetched < maxPages) {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_RUNTIME_MS) {
        console.log('[PAC-DONORS] Approaching time limit, stopping pagination');
        break;
      }

      let url = `https://api.open.fec.gov/v1/schedules/schedule_a/?api_key=${fecApiKey}&committee_id=${committeeId}&two_year_transaction_period=${cycle}&per_page=100&sort=-contribution_receipt_amount`;
      
      if (lastIndex) {
        url += `&last_index=${lastIndex}`;
      }

      console.log(`[PAC-DONORS] Fetching page ${pagesFetched + 1}...`);
      
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        console.error('[PAC-DONORS] FEC API error:', response.status);
        break;
      }

      const data = await response.json();
      const results = data?.results || [];
      
      if (results.length === 0) {
        hasMore = false;
        break;
      }

      allReceipts.push(...results);
      pagesFetched++;
      
      lastIndex = data?.pagination?.last_indexes?.last_index;
      hasMore = !!lastIndex && results.length >= 100;
      
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    console.log(`[PAC-DONORS] Fetched ${allReceipts.length} receipts from ${pagesFetched} pages`);

    if (allReceipts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No receipts found for this PAC',
          stats: { receipts: 0, donors: 0, totalAmount: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aggregate receipts into donors (no individual contribution records needed for PAC donors)
    const donorMap = new Map<string, AggregatedDonor>();

    for (const receipt of allReceipts) {
      const contributorName = receipt.contributor_name || 'Unknown';
      const amount = Math.round(receipt.contribution_receipt_amount || 0);
      const entityType = receipt.entity_type || 'UNK';
      const city = receipt.contributor_city || '';
      const state = receipt.contributor_state || '';
      const zip = receipt.contributor_zip || '';
      const receiptDate = receipt.contribution_receipt_date || null;

      // Generate donor ID unique to this PAC
      const donorId = await generateDonorId(contributorName, entityType, city, state, zip, committeeId, cycle);
      
      if (donorMap.has(donorId)) {
        const donor = donorMap.get(donorId)!;
        donor.amount += amount;
        donor.transactionCount++;
        if (receiptDate) {
          if (!donor.firstReceiptDate || receiptDate < donor.firstReceiptDate) {
            donor.firstReceiptDate = receiptDate;
          }
          if (!donor.lastReceiptDate || receiptDate > donor.lastReceiptDate) {
            donor.lastReceiptDate = receiptDate;
          }
        }
      } else {
        donorMap.set(donorId, {
          name: contributorName,
          type: mapEntityType(entityType),
          amount,
          transactionCount: 1,
          firstReceiptDate: receiptDate,
          lastReceiptDate: receiptDate,
          city,
          state,
          zip,
          employer: receipt.contributor_employer || '',
          occupation: receipt.contributor_occupation || '',
        });
      }
    }

    // Prepare donor records - candidate_id is NULL for PAC donors
    const donorRecords = Array.from(donorMap.entries()).map(([id, donor]) => ({
      id,
      name: donor.name,
      type: donor.type,
      amount: donor.amount,
      transaction_count: donor.transactionCount,
      first_receipt_date: donor.firstReceiptDate,
      last_receipt_date: donor.lastReceiptDate,
      contributor_city: donor.city,
      contributor_state: donor.state,
      contributor_zip: donor.zip,
      employer: donor.employer || null,
      occupation: donor.occupation || null,
      recipient_committee_id: committeeId,
      recipient_committee_name: committee.name,
      cycle,
      candidate_id: null, // PAC donors are not tied to a specific candidate
      is_contribution: true,
      is_transfer: false,
    }));

    // Batch upsert donors
    let donorsSaved = 0;
    for (let i = 0; i < donorRecords.length; i += DONOR_BATCH_SIZE) {
      const batch = donorRecords.slice(i, i + DONOR_BATCH_SIZE);
      const { error } = await supabase
        .from('donors')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error('[PAC-DONORS] Error saving donors batch:', error);
      } else {
        donorsSaved += batch.length;
      }
    }

    // Update committee sync info
    const totalAmount = donorRecords.reduce((sum, d) => sum + d.amount, 0);
    
    await supabase
      .from('candidate_committees')
      .update({
        last_sync_date: new Date().toISOString(),
        last_sync_completed_at: new Date().toISOString(),
        local_itemized_total: totalAmount,
      })
      .eq('fec_committee_id', committeeId);

    // Get top donors for response
    const topDonors = Array.from(donorMap.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 10)
      .map(([id, donor]) => ({
        name: donor.name,
        type: donor.type,
        amount: donor.amount,
      }));

    console.log('[PAC-DONORS] Sync complete:', {
      receipts: allReceipts.length,
      donors: donorsSaved,
      totalAmount,
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Fetched ${allReceipts.length} receipts, saved ${donorsSaved} donors totaling $${(totalAmount / 1000000).toFixed(1)}M`,
        stats: {
          receipts: allReceipts.length,
          donors: donorsSaved,
          totalAmount,
          pagesFetched,
          topDonors,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PAC-DONORS] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
