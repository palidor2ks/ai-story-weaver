import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting constants
const MAX_REQUESTS_PER_MINUTE = 45; // FEC limit is 1000/hour, be conservative
const REQUEST_DELAY_MS = 200;
const MAX_RUNTIME_MS = 25000; // 25 seconds - safe margin to avoid WORKER_LIMIT
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;

// Batch sizes for streaming saves
const CONTRIBUTION_BATCH_SIZE = 500;
const DONOR_BATCH_SIZE = 500;
const DONOR_FLUSH_PAGES = 10; // Flush donors to DB every N pages to avoid memory buildup

// Request tracking for rate limiting
let requestCount = 0;
let lastMinuteReset = Date.now();

// Rate-limited fetch with retries and defensive error handling
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> {
  // Rate limit check
  const now = Date.now();
  if (now - lastMinuteReset > 60000) {
    requestCount = 0;
    lastMinuteReset = now;
  }
  
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (now - lastMinuteReset) + 1000;
    console.log(`[FEC-DONORS] Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
    lastMinuteReset = Date.now();
  }
  
  requestCount++;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited by API
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[FEC-DONORS] Rate limited (429), backing off ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      if (response.status >= 500 && attempt < retries - 1) {
        // Server error - retry with backoff
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[FEC-DONORS] Server error ${response.status}, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < retries - 1) {
        const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[FEC-DONORS] Fetch error, retrying in ${backoffMs}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

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
  receiptType: 'contribution' | 'transfer' | 'other_receipt';
}

// Classify a line_number to determine receipt type
function classifyLineNumber(lineNumber: string | null): LineClassification {
  if (!lineNumber) return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  
  const line = lineNumber.toUpperCase();
  const isLine11 = line.startsWith('11'); // Individual contributions
  const isLine12 = line.startsWith('12'); // Authorized committee transfers
  const isLine17 = line.startsWith('17'); // Other federal receipts
  
  if (isLine11) {
    return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  } else if (isLine12) {
    return { isContribution: true, isTransfer: true, receiptType: 'transfer' };
  } else if (isLine17) {
    return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  }
  
  return { isContribution: false, isTransfer: false, receiptType: 'other_receipt' };
}

// Generate a stable SHA-256 based ID for donor identity (aggregated)
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

// Generate a unique identity hash for a single contribution transaction
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

// Parse earmark info from memo text
interface EarmarkInfo {
  isEarmarked: boolean;
  earmarkedForName: string | null;
  conduitCommitteeId: string | null;
}

function parseEarmarkInfo(memoText: string | null, _memoCode: string | null): EarmarkInfo {
  if (!memoText) {
    return { isEarmarked: false, earmarkedForName: null, conduitCommitteeId: null };
  }
  
  const upperMemo = memoText.toUpperCase();
  
  const earmarkPatterns = [
    /EARMARKED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
    /DESIGNATED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
    /EAR\s*MARKED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
  ];
  
  for (const pattern of earmarkPatterns) {
    const match = memoText.match(pattern);
    if (match) {
      return {
        isEarmarked: true,
        earmarkedForName: match[1].trim(),
        conduitCommitteeId: null
      };
    }
  }
  
  if (upperMemo.includes('ACTBLUE') || upperMemo.includes('WINRED') || upperMemo.includes('CONDUIT')) {
    return {
      isEarmarked: true,
      earmarkedForName: null,
      conduitCommitteeId: null
    };
  }
  
  return { isEarmarked: false, earmarkedForName: null, conduitCommitteeId: null };
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
  receiptType: 'contribution' | 'transfer' | 'other_receipt';
}

// Fetch FEC totals for a committee to compare with local data
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
}> {
  try {
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=${fecApiKey}&cycle=${cycle}&per_page=1`;
    const response = await fetchWithRetry(url);
    
    // Defensive: check response exists and is ok
    if (!response?.ok) {
      console.warn('[FEC-DONORS] Could not fetch FEC totals:', response?.status);
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    // Defensive: safe JSON parse
    let data;
    try {
      data = await response.json();
    } catch {
      console.warn('[FEC-DONORS] Failed to parse FEC totals response');
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    const totals = data?.results?.[0];
    
    if (!totals) {
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    return {
      fecItemized: Math.round(totals.individual_itemized_contributions || 0),
      fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
      fecTotalReceipts: Math.round(totals.receipts || 0)
    };
  } catch (err) {
    console.warn('[FEC-DONORS] Error fetching FEC totals:', err);
    return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
  }
}

serve(async (req) => {
  const startTime = Date.now();
  
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

    // Defensive: safe JSON parse of request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      candidateId, 
      fecCandidateId, 
      fecCommitteeId, 
      cycle = '2024', 
      maxPages = 100,
      includeOtherReceipts = false,
      forceFullSync = false,
      resumeFromCursor = true // Use saved cursors by default
    } = body || {};
    
    console.log('[FEC-DONORS] Starting sync for:', { candidateId, fecCandidateId, fecCommitteeId, cycle, forceFullSync, resumeFromCursor });

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build committee list with cursor info
    interface CommitteeInfo {
      id: string;
      name: string;
      role: string;
      lastSyncDate?: string;
      lastContributionDate?: string;
      lastIndex?: string;
      lastSyncCompletedAt?: string;
      hasMore?: boolean;
    }
    
    const committees: CommitteeInfo[] = [];
    const committeeSet = new Set<string>();

    const pushCommittee = (id: string, name = '', role = 'authorized', syncInfo?: Partial<CommitteeInfo>) => {
      if (!id || committeeSet.has(id)) return;
      committeeSet.add(id);
      committees.push({ id, name, role, ...syncInfo });
    };

    // Fetch existing committee sync info from database
    const { data: existingCommittees } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, last_sync_date, last_contribution_date, last_index, last_sync_completed_at')
      .eq('candidate_id', candidateId);

    const committeeSyncInfo = new Map(
      (existingCommittees || []).map(c => [c.fec_committee_id, {
        lastSyncDate: c.last_sync_date,
        lastContributionDate: c.last_contribution_date,
        lastIndex: c.last_index,
        lastSyncCompletedAt: c.last_sync_completed_at
      }])
    );

    const { data: candidateData } = await supabase
      .from('candidates')
      .select('fec_committee_id, fec_candidate_id')
      .eq('id', candidateId)
      .maybeSingle();

    const fecId = fecCandidateId || candidateData?.fec_candidate_id || null;

    if (fecCommitteeId) {
      const syncInfo = committeeSyncInfo.get(fecCommitteeId);
      pushCommittee(fecCommitteeId, '', 'manual', syncInfo);
    }
    if (candidateData?.fec_committee_id) {
      const syncInfo = committeeSyncInfo.get(candidateData.fec_committee_id);
      pushCommittee(candidateData.fec_committee_id, '', 'stored', syncInfo);
    }

    // Look up committees from FEC API if needed
    if (!fecCommitteeId && fecId) {
      try {
        const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/committees/?api_key=${fecApiKey}&designation=P,A&per_page=50`;
        const committeeResponse = await fetchWithRetry(committeeUrl);

        if (committeeResponse?.ok) {
          let committeeData;
          try {
            committeeData = await committeeResponse.json();
          } catch {
            console.error('[FEC-DONORS] Failed to parse committee response');
            committeeData = {};
          }
          const results = committeeData?.results || [];
          results.forEach((cmte: { committee_id: string; name?: string; designation?: string }) => {
            const role = cmte.designation === 'P' ? 'principal' : 'authorized';
            const syncInfo = committeeSyncInfo.get(cmte.committee_id);
            pushCommittee(cmte.committee_id, cmte.name || '', role, syncInfo);
          });

          const primary = results.find((cmte: { designation?: string }) => cmte.designation === 'P');
          if (primary?.committee_id && !candidateData?.fec_committee_id) {
            await supabase
              .from('candidates')
              .update({ fec_committee_id: primary.committee_id })
              .eq('id', candidateId);
          }
        }
      } catch (err) {
        console.error('[FEC-DONORS] Committee lookup failed:', err);
      }
    }

    if (committees.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No FEC committee ID available. Please link FEC ID first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Process only ONE committee per invocation to avoid worker limits
    // Find the first committee that needs syncing (has cursor OR not completed yet)
    let targetCommittee: CommitteeInfo | null = null;
    let remainingCommittees = 0;
    
    for (const cmte of committees) {
      const hasIncompleteSync = cmte.lastIndex && !cmte.lastSyncCompletedAt;
      const neverSynced = !cmte.lastSyncCompletedAt;
      const needsSync = forceFullSync || hasIncompleteSync || neverSynced;
      
      if (needsSync) {
        if (!targetCommittee) {
          targetCommittee = cmte;
        } else {
          remainingCommittees++;
        }
      }
    }

    if (!targetCommittee) {
      // All committees are fully synced
      console.log('[FEC-DONORS] All committees already synced');
      return new Response(
        JSON.stringify({ 
          success: true, 
          imported: 0,
          contributionsImported: 0,
          totalRaised: 0,
          hasMore: false,
          message: 'All committees already fully synced',
          committees: committees.map(c => ({ id: c.id, name: c.name }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enrich committee name if missing
    if (!targetCommittee.name) {
      try {
        const cmteUrl = `https://api.open.fec.gov/v1/committee/${targetCommittee.id}/?api_key=${fecApiKey}`;
        const cmteResp = await fetchWithRetry(cmteUrl);
        if (cmteResp?.ok) {
          let cmteData;
          try {
            cmteData = await cmteResp.json();
          } catch {
            cmteData = {};
          }
          targetCommittee.name = cmteData?.results?.[0]?.name || targetCommittee.id;
        } else {
          targetCommittee.name = targetCommittee.id;
        }
      } catch {
        targetCommittee.name = targetCommittee.id;
      }
    }

    // Upsert committee mapping
    await supabase
      .from('candidate_committees')
      .upsert({
        candidate_id: candidateId,
        fec_committee_id: targetCommittee.id,
        role: targetCommittee.role,
        active: true,
      }, { onConflict: 'candidate_id,fec_committee_id' });

    let totalRaised = 0;
    let totalDonors = 0;
    let totalContributions = 0;
    let skippedNonContributions = 0;
    let earmarkedCount = 0;
    let transferCount = 0;
    let committeeHasMore = false;
    let stoppedDueToTimeout = false;

    // Process the single target committee with STREAMING saves
    const committeeId = targetCommittee.id;
    const committeeName = targetCommittee.name || targetCommittee.id;
    
    // Determine starting cursor for resumable sync
    let lastIndex: string | null = null;
    let lastContributionDate: string | null = null;
    
    if (resumeFromCursor && !forceFullSync && targetCommittee.lastIndex && targetCommittee.lastContributionDate) {
      lastIndex = targetCommittee.lastIndex;
      lastContributionDate = targetCommittee.lastContributionDate;
      console.log(`[FEC-DONORS] Resuming ${committeeId} from cursor: ${lastIndex}`);
    }

    // Per-committee aggregation
    const aggregatedDonors = new Map<string, AggregatedDonor & { id: string }>();
    let contributionBatch: Array<{
      identity_hash: string;
      fec_transaction_id: string | null;
      candidate_id: string;
      recipient_committee_id: string;
      recipient_committee_name: string;
      contributor_name: string;
      contributor_type: string;
      amount: number;
      receipt_date: string | null;
      cycle: string;
      line_number: string;
      is_contribution: boolean;
      is_transfer: boolean;
      is_earmarked: boolean;
      earmarked_for_candidate_id: string | null;
      conduit_committee_id: string | null;
      memo_text: string | null;
      contributor_city: string;
      contributor_state: string;
      contributor_zip: string;
      employer: string;
      occupation: string;
    }> = [];

    let pageCount = 0;
    let committeeContributions = 0;
    let newestContributionDate: string | null = null;
    let newestIndex: string | null = null;
    
    let committeeItemized = 0;
    let committeeTransfers = 0;
    let committeeEarmarked = 0;
    let committeeContributionsSaved = 0;

    console.log('[FEC-DONORS] Starting fetch for committee:', committeeId);

    // Helper to save contribution batch
    const saveContributionBatch = async () => {
      if (contributionBatch.length === 0) return;
      
      const { error } = await supabase
        .from('contributions')
        .upsert(contributionBatch, { onConflict: 'identity_hash,cycle', ignoreDuplicates: false });
      
      if (error) {
        console.error('[FEC-DONORS] Contribution batch save error:', error.message);
      } else {
        committeeContributionsSaved += contributionBatch.length;
      }
      
      contributionBatch = []; // Clear memory
    };

    // Helper to save donors batch (for periodic flushing)
    const saveDonorBatch = async () => {
      if (aggregatedDonors.size === 0) return;
      
      const donors = Array.from(aggregatedDonors.values()).map(donor => ({
        id: donor.id,
        candidate_id: candidateId,
        name: donor.name,
        type: donor.type,
        amount: donor.amount,
        cycle,
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
      }));

      // Save in batches
      for (let i = 0; i < donors.length; i += DONOR_BATCH_SIZE) {
        const batch = donors.slice(i, i + DONOR_BATCH_SIZE);
        const { error } = await supabase
          .from('donors')
          .upsert(batch, { onConflict: 'id' });
        
        if (error) {
          console.error('[FEC-DONORS] Donor batch save error:', error.message);
        }
      }
      
      totalDonors += donors.length;
      console.log(`[FEC-DONORS] Flushed ${donors.length} donors to DB`);
      aggregatedDonors.clear(); // Clear memory after flush
    };

    // Save cursor to database for resumability
    const saveCursor = async (hasMore: boolean) => {
      const updateData: Record<string, unknown> = {
        last_sync_date: new Date().toISOString(),
        last_contribution_date: lastContributionDate,
        last_index: hasMore ? lastIndex : null, // Clear cursor when complete
        local_itemized_total: committeeItemized,
        has_more: hasMore
      };
      
      if (!hasMore) {
        // Mark as fully completed
        updateData.last_sync_completed_at = new Date().toISOString();
      }
      
      await supabase
        .from('candidate_committees')
        .update(updateData)
        .eq('candidate_id', candidateId)
        .eq('fec_committee_id', committeeId);
    };

    while (pageCount < maxPages) {
      // Check runtime guard during pagination
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log('[FEC-DONORS] Runtime limit reached mid-pagination');
        committeeHasMore = true;
        stoppedDueToTimeout = true;
        break;
      }

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
      
      let response: Response;
      try {
        response = await fetchWithRetry(contributionsUrl);
      } catch (err) {
        console.error('[FEC-DONORS] Fetch failed after retries:', err);
        committeeHasMore = true;
        break;
      }
      
      // Defensive: check response
      if (!response?.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          errorText = 'Unknown error';
        }
        console.error('[FEC-DONORS] API error on page', pageCount + 1, ':', response?.status, errorText);
        
        if (response?.status === 429) {
          // Rate limited - save cursor and return partial results
          console.log('[FEC-DONORS] Rate limited, saving progress and returning hasMore=true');
          committeeHasMore = true;
          await saveContributionBatch();
          await saveDonorBatch();
          await saveCursor(true);
          break;
        }
        break;
      }

      // Defensive: safe JSON parse
      let data;
      try {
        data = await response.json();
      } catch {
        console.error('[FEC-DONORS] Failed to parse page response');
        committeeHasMore = true;
        break;
      }
      
      const results = data?.results || [];
      
      if (results.length === 0) {
        break;
      }

      pageCount++;
      
      // Store newest cursor for next sync
      if (pageCount === 1 && results.length > 0 && !lastIndex) {
        newestContributionDate = results[0]?.contribution_receipt_date;
        newestIndex = data?.pagination?.last_indexes?.last_index;
      }

      for (const contribution of results) {
        const receiptDate = contribution?.contribution_receipt_date || null;
        const lineNumber = contribution?.line_number || '';
        const classification = classifyLineNumber(lineNumber);
        
        if (!classification.isContribution && !includeOtherReceipts) {
          skippedNonContributions++;
          continue;
        }

        committeeContributions++;
        
        const name = contribution?.contributor_name || 'Unknown Contributor';
        const type = mapEntityType(contribution?.entity_type);
        const amount = Math.round(contribution?.contribution_receipt_amount || 0);
        const city = contribution?.contributor_city || '';
        const state = contribution?.contributor_state || '';
        const zip = contribution?.contributor_zip || '';
        const employer = contribution?.contributor_employer || '';
        const occupation = contribution?.contributor_occupation || '';
        const memoText = contribution?.memo_text || null;
        const memoCode = contribution?.memo_code || null;
        const fecSubId = contribution?.sub_id || null;
        
        const earmarkInfo = parseEarmarkInfo(memoText, memoCode);
        if (earmarkInfo.isEarmarked) {
          earmarkedCount++;
          committeeEarmarked += amount;
        }
        if (classification.isTransfer) {
          transferCount++;
          committeeTransfers += amount;
        }
        if (classification.isContribution && !classification.isTransfer) {
          committeeItemized += amount;
        }
        
        const contributionHash = await generateContributionHash(
          name, amount, receiptDate, committeeId, cycle, fecSubId
        );
        
        contributionBatch.push({
          identity_hash: contributionHash,
          fec_transaction_id: fecSubId,
          candidate_id: candidateId,
          recipient_committee_id: committeeId,
          recipient_committee_name: committeeName,
          contributor_name: name,
          contributor_type: type,
          amount,
          receipt_date: receiptDate,
          cycle,
          line_number: lineNumber,
          is_contribution: classification.isContribution,
          is_transfer: classification.isTransfer,
          is_earmarked: earmarkInfo.isEarmarked,
          earmarked_for_candidate_id: null,
          conduit_committee_id: earmarkInfo.conduitCommitteeId,
          memo_text: memoText,
          contributor_city: city,
          contributor_state: state,
          contributor_zip: zip,
          employer,
          occupation
        });

        // STREAM: Save contributions every CONTRIBUTION_BATCH_SIZE to reduce memory
        if (contributionBatch.length >= CONTRIBUTION_BATCH_SIZE) {
          await saveContributionBatch();
        }
        
        const donorId = await generateDonorId(
          name, contribution?.entity_type || '', city, state, zip, committeeId, cycle
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
            id: donorId,
            name, type, amount,
            transactionCount: 1,
            firstReceiptDate: receiptDate,
            lastReceiptDate: receiptDate,
            city, state, zip, employer, occupation,
            lineNumber,
            isContribution: classification.isContribution,
            isTransfer: classification.isTransfer,
            receiptType: classification.receiptType
          });
        }
      }

      const pagination = data?.pagination;
      if (!pagination?.last_indexes || results.length < 100) {
        break;
      }

      lastIndex = pagination.last_indexes.last_index;
      lastContributionDate = pagination.last_indexes.last_contribution_receipt_date;

      // Periodic save every DONOR_FLUSH_PAGES pages to avoid memory buildup
      if (pageCount % DONOR_FLUSH_PAGES === 0) {
        console.log(`[FEC-DONORS] Progress: page ${pageCount}, ${committeeContributions} contributions - flushing to DB`);
        await saveContributionBatch();
        await saveDonorBatch();
        await saveCursor(true); // Save cursor for resumability
      }

      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    // Save remaining contributions and donors
    await saveContributionBatch();
    await saveDonorBatch();

    totalContributions = committeeContributionsSaved;
    totalRaised = committeeItemized;

    // Update committee sync cursors
    await saveCursor(committeeHasMore);

    // Fetch FEC totals and store rollup (only if we completed the committee)
    if (!committeeHasMore) {
      const fecTotals = await fetchFECTotals(fecApiKey, committeeId, cycle);
      
      await supabase
        .from('committee_finance_rollups')
        .upsert({
          committee_id: committeeId,
          candidate_id: candidateId,
          cycle,
          local_itemized: committeeItemized,
          local_transfers: committeeTransfers,
          local_earmarked: committeeEarmarked,
          fec_itemized: fecTotals.fecItemized,
          fec_unitemized: fecTotals.fecUnitemized,
          fec_total_receipts: fecTotals.fecTotalReceipts,
          contribution_count: committeeContributions,
          donor_count: totalDonors,
          last_sync: new Date().toISOString(),
          last_fec_check: new Date().toISOString()
        }, { onConflict: 'committee_id,cycle' });
    }

    console.log(`[FEC-DONORS] Completed ${committeeId}: ${totalDonors} donors, ${totalContributions} contributions, $${committeeItemized} itemized, hasMore=${committeeHasMore}`);

    // Determine if there are more committees to process
    const globalHasMore = committeeHasMore || remainingCommittees > 0;

    // Update reconciliation record
    const { data: rollups } = await supabase
      .from('committee_finance_rollups')
      .select('local_itemized, local_transfers, local_earmarked, fec_itemized, fec_unitemized, fec_total_receipts')
      .eq('candidate_id', candidateId)
      .eq('cycle', cycle);
    
    let totalLocalItemized = 0;
    let totalLocalTransfers = 0;
    let totalLocalEarmarked = 0;
    let totalFecItemized = 0;
    let totalFecUnitemized = 0;
    let totalFecReceipts = 0;
    
    for (const r of rollups || []) {
      totalLocalItemized += r.local_itemized || 0;
      totalLocalTransfers += r.local_transfers || 0;
      totalLocalEarmarked += r.local_earmarked || 0;
      totalFecItemized += r.fec_itemized || 0;
      totalFecUnitemized += r.fec_unitemized || 0;
      totalFecReceipts += r.fec_total_receipts || 0;
    }
    
    const deltaAmount = totalLocalItemized - totalFecItemized;
    const deltaPct = totalFecItemized > 0 ? Math.round((deltaAmount / totalFecItemized) * 10000) / 100 : 0;
    let status = 'ok';
    if (Math.abs(deltaPct) > 10) status = 'error';
    else if (Math.abs(deltaPct) > 5) status = 'warning';
    if (globalHasMore) status = 'partial'; // Mark as partial if sync incomplete
    
    await supabase
      .from('finance_reconciliation')
      .upsert({
        candidate_id: candidateId,
        cycle,
        local_itemized: totalLocalItemized,
        local_transfers: totalLocalTransfers,
        local_earmarked: totalLocalEarmarked,
        fec_itemized: totalFecItemized,
        fec_unitemized: totalFecUnitemized,
        fec_total_receipts: totalFecReceipts,
        delta_amount: deltaAmount,
        delta_pct: deltaPct,
        status,
        checked_at: new Date().toISOString()
      }, { onConflict: 'candidate_id,cycle' });

    if (!globalHasMore) {
      await supabase
        .from('candidates')
        .update({ last_donor_sync: new Date().toISOString() })
        .eq('id', candidateId);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[FEC-DONORS] Sync completed in ${Math.round(elapsedMs/1000)}s, hasMore=${globalHasMore}, remaining committees=${remainingCommittees}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: totalDonors,
        contributionsImported: totalContributions,
        totalRaised,
        earmarkedCount,
        transferCount,
        cycle,
        hasMore: globalHasMore, // Key field for resumable sync
        stoppedDueToTimeout,
        committeesProcessed: 1,
        committeesSynced: committeeId,
        committeesRemaining: remainingCommittees,
        committees: committees.map(c => ({ id: c.id, name: c.name })),
        skippedNonContributions,
        reconciliation: { 
          localItemized: totalLocalItemized, 
          localTransfers: totalLocalTransfers,
          fecItemized: totalFecItemized, 
          deltaPct, 
          status 
        },
        elapsedMs,
        message: globalHasMore 
          ? `Partial sync: ${totalDonors} donors from ${committeeName}. ${remainingCommittees} committees remaining. Call again to continue.`
          : `Imported ${totalDonors} donors (${totalContributions} transactions) totaling $${totalRaised.toLocaleString()}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[FEC-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, hasMore: true }), // Return hasMore=true on error so caller can retry
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
