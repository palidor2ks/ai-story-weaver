import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Map policy areas to our topics
const topicMapping: Record<string, string> = {
  'Health': 'Healthcare',
  'Economics and Public Finance': 'Economy',
  'Taxation': 'Economy',
  'Education': 'Education',
  'Environmental Protection': 'Environment',
  'Energy': 'Environment',
  'Immigration': 'Immigration',
  'Crime and Law Enforcement': 'Criminal Justice',
  'Civil Rights and Liberties, Minority Issues': 'Civil Rights',
  'Armed Forces and National Security': 'Foreign Policy',
  'International Affairs': 'Foreign Policy',
  'Government Operations and Politics': 'Government Reform',
  'Congress': 'Government Reform',
  'Social Welfare': 'Social Issues',
  'Families': 'Social Issues',
  'Labor and Employment': 'Economy',
  'Science, Technology, Communications': 'Technology',
};

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
      
      const sponsoredResponse = await fetch(sponsoredUrl);
      
      if (sponsoredResponse.ok) {
        const sponsoredData = await sponsoredResponse.json();
        const sponsoredBills = sponsoredData.sponsoredLegislation || [];
        
        for (const bill of sponsoredBills) {
          const policyArea = bill.policyArea?.name || 'General';
          const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
          
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
          });
        }
        
        totalSponsored += sponsoredBills.length;
        
        if (sponsoredBills.length === 250) {
          sponsoredOffset += 250;
          await new Promise(resolve => setTimeout(resolve, 100));
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
      
      const cosponsoredResponse = await fetch(cosponsoredUrl);
      
      if (cosponsoredResponse.ok) {
        const cosponsoredData = await cosponsoredResponse.json();
        const cosponsoredBills = cosponsoredData.cosponsoredLegislation || [];
        
        for (const bill of cosponsoredBills) {
          const policyArea = bill.policyArea?.name || 'General';
          const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
          
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
          });
        }
        
        totalCosponsored += cosponsoredBills.length;
        
        if (cosponsoredBills.length === 250) {
          cosponsoredOffset += 250;
          await new Promise(resolve => setTimeout(resolve, 100));
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

    // Persist votes to database if requested
    let persisted = 0;
    if (persistVotes && votes.length > 0) {
      console.log(`[BG] Persisting ${votes.length} votes to database for ${bioguideId}...`);
      
      // Map to votes table schema
      const votesToInsert = votes.map(v => ({
        id: v.id,
        bill_id: v.bill_id,
        bill_name: v.bill_name.slice(0, 500),
        candidate_id: v.candidate_id,
        position: v.position,
        action_type: v.position === 'Sponsored' ? 'sponsored' : 'cosponsored',
        topic: v.topic,
        description: v.description?.slice(0, 1000) || null,
        date: v.date,
        congress: v.congress,
        bill_summary: v.bill_summary || null,
        summary_fetched_at: v.summary_fetched_at || null,
      }));

      // Deduplicate by ID
      const uniqueVotes = Array.from(
        new Map(votesToInsert.map(v => [v.id, v])).values()
      );

      if (uniqueVotes.length > 0) {
        const CHUNK_SIZE = 100;

        for (let i = 0; i < uniqueVotes.length; i += CHUNK_SIZE) {
          const chunk = uniqueVotes.slice(i, i + CHUNK_SIZE);

          const { error: upsertError } = await supabase
            .from('votes')
            .upsert(chunk, { 
              onConflict: 'id',
              ignoreDuplicates: false
            });

          if (upsertError) {
            console.error(`[BG] Error persisting votes chunk for ${bioguideId}:`, upsertError);
            throw new Error(upsertError.message || 'Failed to persist votes');
          }

          persisted += chunk.length;
          if (persisted % 500 === 0 || persisted === uniqueVotes.length) {
            console.log(`[BG] Persisted ${persisted}/${uniqueVotes.length} votes for ${bioguideId}`);
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
