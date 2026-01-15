import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 11 canonical topics for the quiz system
const CANONICAL_TOPICS = [
  'Economy', 'Healthcare', 'Immigration', 'Environment', 'Defense',
  'Education', 'Civil Rights', 'Government', 'Social Programs', 'Technology', 'Judicial'
] as const;

// Normalize Congress.gov policy areas to our 10 canonical topics
const TOPIC_NORMALIZATION: Record<string, string> = {
  // Economy
  'Agriculture and Food': 'Economy',
  'Commerce': 'Economy',
  'Economics and Public Finance': 'Economy',
  'Finance and Financial Sector': 'Economy',
  'Foreign Trade and International Finance': 'Economy',
  'Labor and Employment': 'Economy',
  'Taxation': 'Economy',
  'Transportation and Public Works': 'Economy',
  
  // Healthcare
  'Health': 'Healthcare',
  'Families': 'Healthcare',
  
  // Environment
  'Energy': 'Environment',
  'Environmental Protection': 'Environment',
  'Public Lands and Natural Resources': 'Environment',
  'Water Resources Development': 'Environment',
  'Animals': 'Environment',
  
  // Immigration
  'Immigration': 'Immigration',
  
  // Defense
  'Armed Forces and National Security': 'Defense',
  'International Affairs': 'Defense',
  'Emergency Management': 'Defense',
  
  // Civil Rights
  'Civil Rights and Liberties, Minority Issues': 'Civil Rights',
  'Crime and Law Enforcement': 'Civil Rights',
  'Native Americans': 'Civil Rights',
  'Arts, Culture, Religion': 'Civil Rights',
  'Sports and Recreation': 'Civil Rights',
  
  // Judicial
  'Law': 'Judicial',
  
  // Education
  'Education': 'Education',
  'Social Sciences and History': 'Education',
  
  // Social Programs
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  
  // Government
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  
  // Technology
  'Science, Technology, Communications': 'Technology',
};

// Handle legacy/non-standard topic names that may already be in the database
const LEGACY_NORMALIZATION: Record<string, string> = {
  'Criminal Justice': 'Civil Rights',
  'Foreign Policy': 'Defense',
  'Domestic Policy': 'Government',
  'Government Reform': 'Government',
  'Gun Policy': 'Civil Rights',
  'Social Issues': 'Social Programs',
  'General': 'Government',
};

function normalizeTopic(topic: string): string {
  return TOPIC_NORMALIZATION[topic] 
    || LEGACY_NORMALIZATION[topic] 
    || 'Government'; // Default fallback
}

// Derive chamber from bill type prefix
function getChamberFromBillType(billType: string): 'house' | 'senate' | null {
  const type = (billType || '').toUpperCase();
  // House bills: HR, HRES, HJRES, HCONRES
  if (type.startsWith('H')) return 'house';
  // Senate bills: S, SRES, SJRES, SCONRES
  if (type.startsWith('S')) return 'senate';
  return null;
}

// Fetch with retry for handling rate limits (429) and server errors (500/503)
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) return response;
      
      if (response.status === 429) {
        // Rate limited - exponential backoff
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[BG] Rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        lastError = new Error(`Rate limited (429)`);
        continue;
      }
      
      if (response.status === 500 || response.status === 503) {
        // Server error - shorter retry
        const delay = 1000 * attempt;
        console.log(`[BG] Server error (${response.status}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        lastError = new Error(`Server error (${response.status})`);
        continue;
      }
      
      // Other errors - return immediately for caller to handle
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.log(`[BG] Fetch error, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  // Return a failed response after all retries exhausted
  console.error(`[BG] Failed after ${maxRetries} retries: ${lastError?.message}`);
  return new Response(null, { status: 429, statusText: 'Rate Limited After Retries' });
}

interface VoteRecord {
  id: string;
  bill_id: string;
  bill_name: string;
  candidate_id: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting' | 'Sponsored' | 'Cosponsored';
  topic: string;
  description: string | null;
  date: string;
  congress?: number;
  policy_area?: string;
  bill_type?: string;
  bill_number?: number;
  bill_summary?: string | null;
  summary_fetched_at?: string | null;
  chamber?: 'house' | 'senate' | null;
}

// Fetch CRS bill summary from Congress.gov API - NO character limit
async function fetchBillSummary(
  congress: number,
  billType: string,
  billNumber: number
): Promise<string | null> {
  if (!CONGRESS_API_KEY) return null;

  try {
    const typeMap: Record<string, string> = {
      'HR': 'hr', 'S': 's', 'HRES': 'hres', 'SRES': 'sres',
      'HJRES': 'hjres', 'SJRES': 'sjres', 'HCONRES': 'hconres', 'SCONRES': 'sconres'
    };
    const apiType = typeMap[billType.toUpperCase()] || 'hr';

    const url = `https://api.congress.gov/v3/bill/${congress}/${apiType}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const summaries = data.summaries || [];

    if (summaries.length === 0) return '[NO_SUMMARY]';

    // Get the most recent/detailed summary - FULL text, no character limit
    const latestSummary = summaries[summaries.length - 1];
    return latestSummary.text || '[NO_SUMMARY]';
  } catch (e) {
    console.log(`[BillSummary] Error fetching summary for ${billType}${billNumber}:`, e);
    return null;
  }
}

// Background processing function
async function processVoteSync(bioguideId: string, persistVotes: boolean, syncStartedAt: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const votes: VoteRecord[] = [];

  try {
    // Fetch ALL sponsored legislation with pagination
    let sponsoredOffset = 0;
    let totalSponsored = 0;
    let hasMoreSponsored = true;
    
    console.log(`[BG] Fetching sponsored legislation for ${bioguideId}...`);
    
    while (hasMoreSponsored) {
      const sponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250&offset=${sponsoredOffset}`;
      
      const sponsoredResponse = await fetchWithRetry(sponsoredUrl);
      
      if (sponsoredResponse.ok) {
        const sponsoredData = await sponsoredResponse.json();
        const sponsoredBills = sponsoredData.sponsoredLegislation || [];
        
        for (const bill of sponsoredBills) {
          const policyArea = bill.policyArea?.name || 'General';
          const mappedTopic = normalizeTopic(policyArea);
          
          votes.push({
            id: `${bioguideId}-${bill.congress || 0}-sponsored-${bill.type}${bill.number}`,
            bill_id: `${bill.type}.${bill.number}`,
            bill_name: bill.title || `${bill.type} ${bill.number}`,
            candidate_id: bioguideId,
            position: 'Sponsored',
            topic: mappedTopic,
            description: bill.latestAction?.text || 'Legislation sponsored by this member',
            date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
            congress: bill.congress,
            policy_area: policyArea,
            bill_type: bill.type,
            bill_number: bill.number,
            chamber: getChamberFromBillType(bill.type || ''),
          });
        }
        
        totalSponsored += sponsoredBills.length;
        
        if (sponsoredBills.length === 250) {
          sponsoredOffset += 250;
          await new Promise(resolve => setTimeout(resolve, 250));
        } else {
          hasMoreSponsored = false;
        }
      } else {
        console.error(`[BG] Congress API error for sponsored: ${sponsoredResponse.status}`);
        hasMoreSponsored = false;
      }
    }
    console.log(`[BG] Found ${totalSponsored} total sponsored bills for ${bioguideId}`);

    // Fetch ALL cosponsored legislation with pagination
    let cosponsoredOffset = 0;
    let totalCosponsored = 0;
    let hasMoreCosponsored = true;
    
    console.log(`[BG] Fetching cosponsored legislation for ${bioguideId}...`);
    
    while (hasMoreCosponsored) {
      const cosponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250&offset=${cosponsoredOffset}`;
      
      const cosponsoredResponse = await fetchWithRetry(cosponsoredUrl);
      
      if (cosponsoredResponse.ok) {
        const cosponsoredData = await cosponsoredResponse.json();
        const cosponsoredBills = cosponsoredData.cosponsoredLegislation || [];
        
        for (const bill of cosponsoredBills) {
          const policyArea = bill.policyArea?.name || 'General';
          const mappedTopic = normalizeTopic(policyArea);
          
          votes.push({
            id: `${bioguideId}-${bill.congress || 0}-cosponsored-${bill.type}${bill.number}`,
            bill_id: `${bill.type}.${bill.number}`,
            bill_name: bill.title || `${bill.type} ${bill.number}`,
            candidate_id: bioguideId,
            position: 'Cosponsored',
            topic: mappedTopic,
            description: bill.latestAction?.text || 'Legislation cosponsored by this member',
            date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
            congress: bill.congress,
            policy_area: policyArea,
            bill_type: bill.type,
            bill_number: bill.number,
            chamber: getChamberFromBillType(bill.type || ''),
          });
        }
        
        totalCosponsored += cosponsoredBills.length;
        
        if (cosponsoredBills.length === 250) {
          cosponsoredOffset += 250;
          await new Promise(resolve => setTimeout(resolve, 250));
        } else {
          hasMoreCosponsored = false;
        }
      } else {
        console.error(`[BG] Congress API error for cosponsored: ${cosponsoredResponse.status}`);
        hasMoreCosponsored = false;
      }
    }
    console.log(`[BG] Found ${totalCosponsored} total cosponsored bills for ${bioguideId}`);

    // Sort by date descending
    votes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`[BG] Found ${votes.length} total legislative actions for ${bioguideId}`);

    // Fetch bill summaries for votes (limit to avoid rate limits during sync)
    // We'll fetch summaries for the most recent bills first
    const SUMMARY_FETCH_LIMIT = 100;
    const DELAY_BETWEEN_FETCHES = 100;
    
    console.log(`[BG] Fetching bill summaries for up to ${SUMMARY_FETCH_LIMIT} bills...`);
    let summariesFetched = 0;
    
    for (const vote of votes.slice(0, SUMMARY_FETCH_LIMIT)) {
      if (vote.bill_type && vote.bill_number && vote.congress) {
        const summary = await fetchBillSummary(vote.congress, vote.bill_type, vote.bill_number);
        if (summary) {
          vote.bill_summary = summary;
          vote.summary_fetched_at = new Date().toISOString();
          summariesFetched++;
        }
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_FETCHES));
      }
    }
    
    console.log(`[BG] Fetched ${summariesFetched} bill summaries for ${bioguideId}`);

    // Persist to bills and candidate_votes tables
    let persisted = 0;
    if (persistVotes && votes.length > 0) {
      console.log(`[BG] Persisting ${votes.length} votes to new normalized tables for ${bioguideId}...`);
      
      // Extract unique bills and candidate votes
      const billsMap = new Map<string, any>();
      const candidateVotes: any[] = [];
      
      for (const v of votes) {
        // Upsert bill data (deduplicated by bill_id)
        if (!billsMap.has(v.bill_id)) {
          billsMap.set(v.bill_id, {
            id: v.bill_id,
            name: v.bill_name.slice(0, 500),
            topic: v.topic,
            description: v.description?.slice(0, 1000) || null,
            congress: v.congress,
            bill_type: v.bill_type,
            bill_number: v.bill_number,
            chamber: v.chamber,
            summary: v.bill_summary || null,
            summary_fetched_at: v.summary_fetched_at || null,
            introduced_date: v.date,
            last_action_date: v.date,
          });
        }
        
        // Skip invalid bill_ids to prevent data corruption
        if (!v.bill_id || v.bill_id.includes('null') || v.bill_id.includes('undefined')) {
          console.warn(`[BG] Skipping invalid bill_id: ${v.bill_id}`);
          continue;
        }
        
        // Create candidate_vote record with vote_number = 0 for sponsor/cosponsor
        candidateVotes.push({
          bill_id: v.bill_id,
          candidate_id: v.candidate_id,
          action_type: v.position === 'Sponsored' ? 'sponsor' : 'cosponsor',
          position: v.position,
          action_date: v.date,
          vote_number: 0, // Explicit 0 for sponsor/cosponsor to enable proper deduplication
        });
      }
      
      const bills = Array.from(billsMap.values());
      
      // Upsert bills first (in chunks)
      const CHUNK_SIZE = 50;
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 10000;
      
      console.log(`[BG] Upserting ${bills.length} unique bills...`);
      for (let i = 0; i < bills.length; i += CHUNK_SIZE) {
        const chunk = bills.slice(i, i + CHUNK_SIZE);
        let retries = 0;
        let success = false;
        
        while (!success && retries < MAX_RETRIES) {
          try {
            const { error } = await supabase
              .from('bills')
              .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
            
            if (error) {
              if (error.message?.includes('statement timeout') && retries < MAX_RETRIES - 1) {
                retries++;
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
                continue;
              }
              throw new Error(error.message);
            }
            success = true;
          } catch (e) {
            if (retries < MAX_RETRIES - 1) {
              retries++;
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
              continue;
            }
            throw e;
          }
        }
      }
      console.log(`[BG] Bills upserted successfully`);
      
      // Insert candidate_votes (in chunks, using upsert with composite key)
      console.log(`[BG] Inserting ${candidateVotes.length} candidate votes...`);
      for (let i = 0; i < candidateVotes.length; i += CHUNK_SIZE) {
        const chunk = candidateVotes.slice(i, i + CHUNK_SIZE);
        let retries = 0;
        let success = false;
        
        while (!success && retries < MAX_RETRIES) {
          try {
            // Use insert with onConflict to ignore duplicates - 4-column constraint
            const { error } = await supabase
              .from('candidate_votes')
              .upsert(chunk, { 
                onConflict: 'bill_id,candidate_id,action_type,vote_number',
                ignoreDuplicates: true 
              });
            
            if (error) {
              // If conflict constraint doesn't exist, just insert and ignore errors
              if (error.code === '42P10' || error.message?.includes('there is no unique')) {
                // Fallback: insert one by one, ignoring duplicates
                for (const cv of chunk) {
                  await supabase.from('candidate_votes').insert(cv).select().maybeSingle();
                }
                success = true;
                break;
              }
              if (error.message?.includes('statement timeout') && retries < MAX_RETRIES - 1) {
                retries++;
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
                continue;
              }
              throw new Error(error.message);
            }
            success = true;
            persisted += chunk.length;
            
            if (persisted % 500 === 0 || i + CHUNK_SIZE >= candidateVotes.length) {
              console.log(`[BG] Persisted ${persisted}/${candidateVotes.length} candidate votes`);
            }
          } catch (e) {
            if (retries < MAX_RETRIES - 1) {
              retries++;
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
              continue;
            }
            throw e;
          }
        }
      }
    }

    // Deduplicate votes for accurate expected count
    const uniqueVoteIds = new Set(votes.map(v => 
      `${bioguideId}-${v.congress || 0}-${v.position === 'Sponsored' ? 'sponsored' : 'cosponsored'}-${v.bill_id.replace('.', '')}`
    ));
    const uniqueExpected = uniqueVoteIds.size;

    // Log successful sync status
    const { error: statusError } = await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        expected_sponsored: totalSponsored,
        expected_cosponsored: totalCosponsored,
        expected_total: uniqueExpected,
        persisted_count: persisted,
        last_sync_started_at: syncStartedAt,
        last_sync_completed_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' });

    if (statusError) {
      console.error(`[BG] Failed to log sync status for ${bioguideId}:`, statusError);
    } else {
      console.log(`[BG] Completed sync for ${bioguideId}: ${persisted}/${totalSponsored + totalCosponsored} votes, ${summariesFetched} summaries`);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BG] Error in vote sync for ${bioguideId}:`, errorMessage);
    
    // Log failed sync status
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        sync_error: errorMessage,
        last_sync_started_at: syncStartedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const syncStartedAt = new Date().toISOString();
  
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      throw new Error('Request body must be valid JSON');
    }

    const { bioguideId: directId, memberId, member_id, persistVotes = false } = body as Record<string, unknown>;
    const bioguideId = (directId || memberId || member_id) as string | undefined;
    
    console.log(`Received vote sync request for: ${bioguideId}, persist=${persistVotes}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    if (!bioguideId) {
      throw new Error('bioguideId (or memberId/member_id) is required');
    }

    // Mark sync as started in database immediately
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        last_sync_started_at: syncStartedAt,
        sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' });

    // Use EdgeRuntime.waitUntil for background processing to avoid timeout
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      console.log(`Starting background sync for ${bioguideId}`);
      // @ts-ignore
      EdgeRuntime.waitUntil(processVoteSync(bioguideId, persistVotes as boolean, syncStartedAt));
      
      return new Response(JSON.stringify({ 
        status: 'processing',
        message: `Vote sync started for ${bioguideId}. Check vote_sync_status table for progress.`,
        bioguideId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Fallback: run synchronously (may timeout for large syncs)
      console.log(`EdgeRuntime.waitUntil not available, running synchronously for ${bioguideId}`);
      await processVoteSync(bioguideId, persistVotes as boolean, syncStartedAt);
      
      return new Response(JSON.stringify({ 
        status: 'completed',
        message: `Vote sync completed for ${bioguideId}`,
        bioguideId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-member-votes function:', errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      status: 'error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
