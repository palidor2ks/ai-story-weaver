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
const CONTRIBUTION_BATCH_SIZE = 250;
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
    console.log(`[COMMITTEE-DONORS] Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
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
        console.log(`[COMMITTEE-DONORS] Rate limited (429), backing off ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      if (response.status >= 500 && attempt < maxRetries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[COMMITTEE-DONORS] Server error ${response.status}, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[COMMITTEE-DONORS] Fetch error, retrying in ${backoffMs}ms:`, error);
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
  
  return `fec-${hashHex.slice(0, 32)}`;
}

async function generateContributionHash(
  contributorName: string,
  amount: number,
  receiptDate: string | null,
  committeeId: string,
  cycle: string,
  fecSubId: string | null
): Promise<string> {
  const identityKey = fecSubId 
    ? `${fecSubId}|${cycle}`
    : [
        contributorName.toLowerCase().trim(),
        amount.toString(),
        receiptDate || '',
        committeeId,
        cycle
      ].join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  
  return `contrib-${hashHex.slice(0, 32)}`;
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
}

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    console.log('[COMMITTEE-DONORS] Starting fetch for committee:', committeeId, 'cycle:', cycle);

    // Verify committee exists in our database
    const { data: committee, error: committeeError } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, name, candidate_id')
      .eq('fec_committee_id', committeeId)
      .maybeSingle();

    if (committeeError || !committee) {
      return new Response(
        JSON.stringify({ error: 'Committee not found. Import it first using import-external-committee.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch Schedule A receipts (donations TO this committee)
    let allReceipts: any[] = [];
    let lastIndex: string | null = null;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore && pagesFetched < maxPages) {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_RUNTIME_MS) {
        console.log('[COMMITTEE-DONORS] Approaching time limit, stopping pagination');
        break;
      }

      let url = `https://api.open.fec.gov/v1/schedules/schedule_a/?api_key=${fecApiKey}&committee_id=${committeeId}&two_year_transaction_period=${cycle}&per_page=100&sort=-contribution_receipt_date`;
      
      if (lastIndex) {
        url += `&last_index=${lastIndex}`;
      }

      console.log(`[COMMITTEE-DONORS] Fetching page ${pagesFetched + 1}...`);
      
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        console.error('[COMMITTEE-DONORS] FEC API error:', response.status);
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

    console.log(`[COMMITTEE-DONORS] Fetched ${allReceipts.length} receipts from ${pagesFetched} pages`);

    if (allReceipts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No receipts found for this committee',
          stats: { receipts: 0, contributions: 0, donors: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process receipts into contributions and aggregate donors
    const contributions: any[] = [];
    const donorMap = new Map<string, AggregatedDonor>();

    for (const receipt of allReceipts) {
      const contributorName = receipt.contributor_name || 'Unknown';
      const amount = Math.round(receipt.contribution_receipt_amount || 0);
      const entityType = receipt.entity_type || 'UNK';
      const city = receipt.contributor_city || '';
      const state = receipt.contributor_state || '';
      const zip = receipt.contributor_zip || '';
      const receiptDate = receipt.contribution_receipt_date || null;

      // Generate contribution hash
      const identityHash = await generateContributionHash(
        contributorName,
        amount,
        receiptDate,
        committeeId,
        cycle,
        receipt.sub_id || null
      );

      contributions.push({
        identity_hash: identityHash,
        fec_transaction_id: receipt.sub_id || null,
        contributor_name: contributorName,
        contributor_type: mapEntityType(entityType),
        contributor_city: city,
        contributor_state: state,
        contributor_zip: zip,
        amount,
        receipt_date: receiptDate,
        recipient_committee_id: committeeId,
        recipient_committee_name: committee.name,
        cycle,
        candidate_id: committee.candidate_id, // Will be null for orphan committees
        line_number: receipt.line_number || null,
        memo_text: receipt.memo_text || null,
        memo_code: receipt.memo_code || null,
        employer: receipt.contributor_employer || null,
        occupation: receipt.contributor_occupation || null,
        is_contribution: true,
        is_transfer: false,
        is_earmarked: false,
      });

      // Aggregate into donors
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
          lineNumber: receipt.line_number || '',
        });
      }
    }

    // Batch upsert contributions
    let contributionsSaved = 0;
    for (let i = 0; i < contributions.length; i += CONTRIBUTION_BATCH_SIZE) {
      const batch = contributions.slice(i, i + CONTRIBUTION_BATCH_SIZE);
      const { error } = await supabase
        .from('contributions')
        .upsert(batch, { onConflict: 'identity_hash' });
      
      if (error) {
        console.error('[COMMITTEE-DONORS] Error saving contributions batch:', error);
      } else {
        contributionsSaved += batch.length;
      }
    }

    // Prepare and batch upsert donors
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
      candidate_id: committee.candidate_id, // Will be null for orphan committees
      line_number: donor.lineNumber || null,
      is_contribution: true,
      is_transfer: false,
    }));

    let donorsSaved = 0;
    for (let i = 0; i < donorRecords.length; i += DONOR_BATCH_SIZE) {
      const batch = donorRecords.slice(i, i + DONOR_BATCH_SIZE);
      const { error } = await supabase
        .from('donors')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error('[COMMITTEE-DONORS] Error saving donors batch:', error);
      } else {
        donorsSaved += batch.length;
      }
    }

    // Update committee sync info
    await supabase
      .from('candidate_committees')
      .update({
        last_sync_date: new Date().toISOString(),
        last_sync_completed_at: new Date().toISOString(),
        local_itemized_total: contributions.reduce((sum, c) => sum + c.amount, 0),
      })
      .eq('fec_committee_id', committeeId);

    const totalAmount = contributions.reduce((sum, c) => sum + c.amount, 0);

    console.log('[COMMITTEE-DONORS] Sync complete:', {
      receipts: allReceipts.length,
      contributions: contributionsSaved,
      donors: donorsSaved,
      totalAmount,
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Fetched ${allReceipts.length} receipts, saved ${contributionsSaved} contributions and ${donorsSaved} donors`,
        stats: {
          receipts: allReceipts.length,
          contributions: contributionsSaved,
          donors: donorsSaved,
          totalAmount,
          pagesFetched,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[COMMITTEE-DONORS] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
