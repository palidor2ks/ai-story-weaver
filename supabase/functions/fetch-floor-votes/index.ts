import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Configuration
const MAX_ROLLCALLS = 100; // Cap to avoid timeout
const BATCH_SIZE = 25; // Persist every N votes

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
  'Finance and Financial Sector': 'Economy',
  'Commerce': 'Economy',
  'Agriculture and Food': 'Domestic Policy',
  'Transportation and Public Works': 'Domestic Policy',
  'Housing and Community Development': 'Domestic Policy',
  'Public Lands and Natural Resources': 'Environment',
  'Water Resources Development': 'Environment',
  'Native Americans': 'Civil Rights',
  'Sports and Recreation': 'Domestic Policy',
  'Arts, Culture, Religion': 'Social Issues',
  'Law': 'Criminal Justice',
  'Emergency Management': 'Domestic Policy',
};

interface FloorVote {
  id: string;
  bill_id: string;
  bill_name: string;
  candidate_id: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
  action_type: 'floor_vote';
  topic: string;
  description: string | null;
  date: string;
  vote_number: number;
  congress: number;
  session: number;
  chamber: 'house' | 'senate';
}

interface CongressVote {
  rollCallNumber: number;
  congress: number;
  session: number;
  chamber: string;
  date: string;
  question: string;
  description?: string;
  result: string;
  bill?: {
    number: number;
    type: string;
    title?: string;
    congress?: number;
  };
  nomination?: {
    number: string;
    description?: string;
  };
}

interface MemberPosition {
  bioguideId: string;
  memberName: string;
  party: string;
  state: string;
  votePosition: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
}

// Map API's voteCast values to our position enum
function mapVoteCast(voteCast: string): 'Yea' | 'Nay' | 'Present' | 'Not Voting' {
  const vote = (voteCast || '').toLowerCase().trim();
  switch (vote) {
    case 'aye':
    case 'yea':
    case 'yes':
      return 'Yea';
    case 'nay':
    case 'no':
      return 'Nay';
    case 'present':
      return 'Present';
    default:
      return 'Not Voting';
  }
}

// Fetch member positions for a specific vote
async function fetchVoteMemberPositions(
  chamber: 'house' | 'senate',
  congress: number,
  session: number,
  voteNumber: number
): Promise<MemberPosition[]> {
  const chamberPath = chamber === 'house' ? 'house-vote' : 'senate-vote';
  const url = `https://api.congress.gov/v3/${chamberPath}/${congress}/${session}/${voteNumber}/members?api_key=${CONGRESS_API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[BG] Failed to fetch vote ${voteNumber} members: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const positions: MemberPosition[] = [];
    
    // Congress.gov API returns: houseRollCallVoteMemberVotes or senateRollCallVoteMemberVotes
    const memberVotesKey = chamber === 'house' ? 'houseRollCallVoteMemberVotes' : 'senateRollCallVoteMemberVotes';
    const memberVotes = data[memberVotesKey] || data;
    
    // Navigate to the item array - API structure: {results: {item: [...]}} or {item: [...]}
    const results = memberVotes.results || memberVotes;
    const items = Array.isArray(results) ? results : (results.item || []);
    
    for (const member of items) {
      // API returns bioguideID (capital ID), not bioguideId
      const bioguide = member.bioguideID || member.bioguideId;
      if (bioguide) {
        positions.push({
          bioguideId: bioguide,
          memberName: `${member.firstName || ''} ${member.lastName || ''}`.trim(),
          party: member.voteParty || member.party || '',
          state: member.voteState || member.state || '',
          votePosition: mapVoteCast(member.voteCast || member.votePosition || ''),
        });
      }
    }
    
    return positions;
  } catch (e) {
    console.error(`Error fetching vote ${voteNumber} members:`, e);
    return [];
  }
}

// Fetch list of votes for a congress/session
async function fetchVotesList(
  chamber: 'house' | 'senate',
  congress: number,
  offset: number = 0,
  limit: number = 250
): Promise<{ votes: CongressVote[]; hasMore: boolean }> {
  const chamberPath = chamber === 'house' ? 'house-vote' : 'senate-vote';
  const url = `https://api.congress.gov/v3/${chamberPath}/${congress}?api_key=${CONGRESS_API_KEY}&offset=${offset}&limit=${limit}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`Failed to fetch ${chamber} votes for congress ${congress}: ${response.status}`);
      return { votes: [], hasMore: false };
    }
    
    const data = await response.json();
    
    // Congress.gov API returns houseRollCallVotes or senateRollCallVotes
    const votesKey = chamber === 'house' ? 'houseRollCallVotes' : 'senateRollCallVotes';
    const rawVotes = data[votesKey] || data.votes || [];
    
    console.log(`[BG] API response keys: ${Object.keys(data).join(', ')}, ${votesKey} count: ${rawVotes.length}`);
    
    const votes = rawVotes.map((v: any) => ({
      rollCallNumber: v.rollCallNumber || v.number,
      congress: v.congress || congress,
      session: v.sessionNumber || v.session || 1,
      chamber: chamber,
      date: v.startDate || v.updateDate || v.date || v.actionDate,
      question: v.voteQuestion || v.question || '',
      description: v.legislationType && v.legislationNumber 
        ? `${v.legislationType}${v.legislationNumber}` 
        : (v.description || v.title || ''),
      result: v.result || '',
      bill: v.legislationType ? {
        number: v.legislationNumber,
        type: v.legislationType,
        title: `${v.legislationType}${v.legislationNumber}`,
        congress: v.congress || congress,
      } : (v.bill ? {
        number: v.bill.number,
        type: v.bill.type,
        title: v.bill.title,
        congress: v.bill.congress || congress,
      } : undefined),
      nomination: v.nomination,
    }));
    
    const hasMore = votes.length === limit;
    return { votes, hasMore };
  } catch (e) {
    console.error(`Error fetching ${chamber} votes:`, e);
    return { votes: [], hasMore: false };
  }
}

// Infer topic from vote description and bill info
function inferTopic(vote: CongressVote): string {
  const text = `${vote.question} ${vote.description || ''} ${vote.bill?.title || ''}`.toLowerCase();
  
  const topicKeywords: Record<string, string[]> = {
    'Healthcare': ['health', 'medicare', 'medicaid', 'hospital', 'medical', 'drug', 'prescription', 'insurance'],
    'Economy': ['tax', 'budget', 'fiscal', 'spending', 'appropriation', 'debt', 'economic', 'trade', 'tariff'],
    'Environment': ['environment', 'climate', 'energy', 'carbon', 'pollution', 'conservation', 'wildlife'],
    'Immigration': ['immigration', 'border', 'visa', 'asylum', 'migrant', 'citizenship'],
    'Criminal Justice': ['crime', 'criminal', 'police', 'law enforcement', 'prison', 'justice'],
    'Civil Rights': ['civil rights', 'discrimination', 'voting rights', 'equality'],
    'Foreign Policy': ['defense', 'military', 'veteran', 'foreign', 'international', 'security', 'armed forces'],
    'Education': ['education', 'school', 'student', 'college', 'university'],
    'Social Issues': ['abortion', 'family', 'marriage', 'lgbtq', 'religious'],
    'Gun Policy': ['gun', 'firearm', 'weapon', 'second amendment', 'ammunition'],
    'Technology': ['technology', 'cyber', 'internet', 'data', 'privacy'],
  };
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return topic;
    }
  }
  
  return 'Domestic Policy';
}

// Preflight check: verify member exists in recent roll calls
async function checkMemberExists(
  bioguideId: string,
  chamber: 'house' | 'senate',
  congress: number
): Promise<{ exists: boolean; sampleVote?: CongressVote }> {
  console.log(`[BG] Preflight: checking if ${bioguideId} exists in ${chamber} roll calls for congress ${congress}...`);
  
  // Fetch just the first few votes to check membership
  const { votes } = await fetchVotesList(chamber, congress, 0, 10);
  
  if (votes.length === 0) {
    console.log(`[BG] Preflight: no votes found for ${chamber} congress ${congress}`);
    return { exists: false };
  }
  
  // Check the first 3 votes for this member
  for (const vote of votes.slice(0, 3)) {
    const positions = await fetchVoteMemberPositions(
      chamber,
      vote.congress,
      vote.session,
      vote.rollCallNumber
    );
    
    const found = positions.some(p => p.bioguideId === bioguideId);
    console.log(`[BG] Preflight vote ${vote.rollCallNumber}: ${positions.length} members, ${bioguideId} found: ${found}`);
    
    if (found) {
      return { exists: true, sampleVote: vote };
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`[BG] Preflight: ${bioguideId} NOT found in recent ${chamber} roll calls`);
  return { exists: false };
}

// Persist a batch of votes to DB
async function persistVotesBatch(
  supabase: any,
  votes: FloorVote[],
  bioguideId: string,
  currentPersisted: number
): Promise<number> {
  if (votes.length === 0) return currentPersisted;
  
  // Deduplicate by ID
  const uniqueVotes = Array.from(new Map(votes.map(v => [v.id, v])).values());
  
  const { error } = await supabase
    .from('votes')
    .upsert(uniqueVotes as any, { onConflict: 'id', ignoreDuplicates: false });
  
  if (error) {
    console.error(`[BG] Error persisting batch:`, error);
    throw new Error(error.message);
  }
  
  const newTotal = currentPersisted + uniqueVotes.length;
  
  // Update progress in vote_sync_status
  await supabase
    .from('vote_sync_status')
    .upsert({
      candidate_id: bioguideId,
      persisted_floor_votes: newTotal,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'candidate_id' });
  
  console.log(`[BG] Persisted batch of ${uniqueVotes.length} votes, total: ${newTotal}`);
  return newTotal;
}

// Background processing function
async function processFloorVoteSync(
  bioguideId: string,
  chamber: 'house' | 'senate',
  congress: number,
  syncStartedAt: string
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let pendingVotes: FloorVote[] = [];
  let totalPersisted = 0;

  try {
    console.log(`[BG] Starting floor vote sync for ${bioguideId} in ${chamber} congress ${congress}...`);
    
    // STEP 1: Preflight check - is this member in roll calls?
    const { exists } = await checkMemberExists(bioguideId, chamber, congress);
    
    if (!exists) {
      // Member not found - update status and exit early
      console.log(`[BG] ${bioguideId} is not a seated ${chamber} member in congress ${congress}. Exiting.`);
      
      await supabase
        .from('vote_sync_status')
        .upsert({
          candidate_id: bioguideId,
          expected_floor_votes: 0,
          persisted_floor_votes: 0,
          last_floor_vote_date: null,
          floor_vote_sync_error: `Not a seated ${chamber} member in Congress ${congress}. No roll-call votes available.`,
          last_sync_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'candidate_id' });
      
      return;
    }
    
    console.log(`[BG] Preflight passed. ${bioguideId} is seated. Processing up to ${MAX_ROLLCALLS} roll calls...`);
    
    // STEP 2: Fetch and process votes with incremental storage
    let offset = 0;
    let hasMore = true;
    let rollCallsProcessed = 0;
    let lastVoteDate: string | null = null;
    
    while (hasMore && rollCallsProcessed < MAX_ROLLCALLS) {
      const remaining = MAX_ROLLCALLS - rollCallsProcessed;
      const fetchLimit = Math.min(250, remaining);
      
      const { votes: votesList, hasMore: more } = await fetchVotesList(chamber, congress, offset, fetchLimit);
      hasMore = more && rollCallsProcessed + votesList.length < MAX_ROLLCALLS;
      
      console.log(`[BG] Processing ${votesList.length} votes (offset ${offset}, limit ${fetchLimit})...`);
      
      for (const vote of votesList) {
        if (rollCallsProcessed >= MAX_ROLLCALLS) break;
        rollCallsProcessed++;
        
        const positions = await fetchVoteMemberPositions(
          chamber,
          vote.congress,
          vote.session,
          vote.rollCallNumber
        );
        
        const memberPosition = positions.find(p => p.bioguideId === bioguideId);
        
        if (memberPosition) {
          const billId = vote.bill 
            ? `${vote.bill.type}${vote.bill.number}` 
            : `VOTE-${congress}-${vote.session}-${vote.rollCallNumber}`;
          
          const billName = vote.bill?.title || vote.description || vote.question;
          
          pendingVotes.push({
            id: `${bioguideId}-floor-${congress}-${vote.session}-${vote.rollCallNumber}`,
            bill_id: billId,
            bill_name: billName.slice(0, 500),
            candidate_id: bioguideId,
            position: memberPosition.votePosition,
            action_type: 'floor_vote',
            topic: inferTopic(vote),
            description: `${vote.question}. ${vote.description || ''}`.slice(0, 1000),
            date: vote.date,
            vote_number: vote.rollCallNumber,
            congress: vote.congress,
            session: vote.session,
            chamber: chamber,
          });
          
          // Track latest vote date
          if (!lastVoteDate || new Date(vote.date) > new Date(lastVoteDate)) {
            lastVoteDate = vote.date;
          }
          
          // Persist in batches of BATCH_SIZE
          if (pendingVotes.length >= BATCH_SIZE) {
            totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
            pendingVotes = [];
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Progress log every 25 roll calls
        if (rollCallsProcessed % 25 === 0) {
          console.log(`[BG] Processed ${rollCallsProcessed}/${MAX_ROLLCALLS} roll calls, found ${totalPersisted + pendingVotes.length} votes for ${bioguideId}`);
        }
      }
      
      offset += votesList.length;
    }
    
    // Persist any remaining votes
    if (pendingVotes.length > 0) {
      totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
    }
    
    console.log(`[BG] Completed: ${rollCallsProcessed} roll calls processed, ${totalPersisted} votes persisted for ${bioguideId}`);
    
    // Final status update
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        expected_floor_votes: rollCallsProcessed,
        persisted_floor_votes: totalPersisted,
        last_floor_vote_date: lastVoteDate,
        floor_vote_sync_error: null,
        last_sync_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BG] Error syncing floor votes for ${bioguideId}:`, errorMessage);
    
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        persisted_floor_votes: totalPersisted,
        floor_vote_sync_error: errorMessage,
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

    const { 
      bioguideId, 
      chamber = 'house',
      congress = 118,
    } = body as Record<string, unknown>;

    console.log(`Received floor vote sync request for: ${bioguideId}, chamber=${chamber}, congress=${congress}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    if (!bioguideId) {
      throw new Error('bioguideId is required');
    }

    const validChamber = chamber === 'senate' ? 'senate' : 'house';

    // Mark sync as started
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId as string,
        last_sync_started_at: syncStartedAt,
        floor_vote_sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'candidate_id' });

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      console.log(`Starting background floor vote sync for ${bioguideId}`);
      // @ts-ignore
      EdgeRuntime.waitUntil(processFloorVoteSync(
        bioguideId as string, 
        validChamber, 
        congress as number, 
        syncStartedAt
      ));

      return new Response(JSON.stringify({
        status: 'processing',
        message: `Floor vote sync started for ${bioguideId}. Processing up to ${MAX_ROLLCALLS} roll calls.`,
        bioguideId,
        chamber: validChamber,
        congress,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log(`Running floor vote sync synchronously for ${bioguideId}`);
      await processFloorVoteSync(bioguideId as string, validChamber, congress as number, syncStartedAt);

      return new Response(JSON.stringify({
        status: 'completed',
        message: `Floor vote sync completed for ${bioguideId}`,
        bioguideId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-floor-votes function:', errorMessage);

    return new Response(JSON.stringify({
      error: errorMessage,
      status: 'error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
