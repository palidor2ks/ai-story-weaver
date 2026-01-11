import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');

// Configuration
const BATCH_SIZE = 25;
// Match the congress coverage of fetch-member-votes (sponsored/cosponsored legislation)
const DEFAULT_CONGRESS_LIST = [119, 118, 117, 116, 115, 114, 113];
const RATE_LIMIT_DELAY = 50; // ms between API calls
const SUMMARY_FETCH_DELAY = 100; // ms between summary API calls

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

// Handle legacy/non-standard topic names
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

interface FloorVote {
  id: string;
  bill_id: string;
  bill_name: string;
  candidate_id: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
  action_type: 'floor_vote';
  topic: string;
  additional_topics?: string[];
  topic_flag?: string | null;
  omnibus_type?: string | null;
  description: string | null;
  date: string;
  vote_number: number;
  congress: number;
  session: number;
  chamber: 'house' | 'senate';
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

// Parse bill_id to extract type and number for summary fetching
function parseBillId(billId: string): { type: string; number: number } | null {
  // Handle formats: "HR.1234", "HR1234", "H.R. 1234", "S.1234", "VOTE-119-1-123", etc.
  // Skip vote placeholders that don't represent real bills
  if (billId.startsWith('VOTE-')) return null;
  
  const cleaned = billId.replace(/\s+/g, '').replace(/\./g, '');
  const match = cleaned.match(/^([A-Z]+)(\d+)$/i);
  if (match) {
    return { type: match[1].toUpperCase(), number: parseInt(match[2], 10) };
  }
  return null;
}

// Simple XML tag extraction (no external library needed)
function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const matches = xml.matchAll(regex);
  return Array.from(matches).map(m => m[1].trim());
}

function extractAttribute(xml: string, attr: string): string | null {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

// Map congress number to calendar years
function congressToYears(congress: number): [number, number] {
  // 118th Congress = 2023-2024
  // Formula: firstYear = (congress - 1) * 2 + 1789
  const firstYear = (congress - 1) * 2 + 1789;
  return [firstYear, firstYear + 1];
}

// Map vote position strings to our enum
function mapVotePosition(vote: string): 'Yea' | 'Nay' | 'Present' | 'Not Voting' {
  const v = (vote || '').toLowerCase().trim();
  switch (v) {
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

// Omnibus bill detection patterns
const OMNIBUS_PATTERNS: Record<string, RegExp[]> = {
  'appropriations': [/appropriation/i, /omnibus/i, /minibus/i, /continuing resolution/i, /consolidated appropriations/i],
  'ndaa': [/national defense authorization/i, /ndaa/i],
  'infrastructure': [/infrastructure/i, /invest in america/i, /jobs act/i],
  'reconciliation': [/reconciliation/i, /inflation reduction/i, /build back/i],
};

// Enhanced topic inference that returns multiple canonical topics
function inferTopics(question: string, description: string): { 
  primary: string; 
  additional: string[]; 
  topicCount: number;
  flag: string | null;
  omnibusType: string | null;
} {
  const text = `${question} ${description}`.toLowerCase();
  const matchedTopics: Array<{ topic: string; count: number }> = [];
  
  // Map keywords directly to our 10 canonical topics
  const topicKeywords: Record<string, string[]> = {
    'Healthcare': ['health', 'medicare', 'medicaid', 'hospital', 'medical', 'drug', 'prescription', 'healthcare', 'mental health', 'opioid', 'fentanyl', 'family', 'child', 'children', 'childcare'],
    'Defense': ['defense', 'military', 'veteran', 'armed forces', 'pentagon', 'national security', 'army', 'navy', 'marines', 'air force', 'foreign', 'international', 'diplomacy', 'embassy', 'ambassador', 'treaty', 'nato', 'united nations', 'emergency', 'disaster', 'fema'],
    'Immigration': ['immigration', 'border', 'visa', 'asylum', 'migrant', 'citizenship', 'daca', 'refugee', 'deportation'],
    'Civil Rights': ['civil rights', 'discrimination', 'voting rights', 'equality', 'lgbtq', 'affirmative action', 'minority', 'crime', 'criminal', 'police', 'law enforcement', 'prison', 'gun', 'firearm', 'weapon', 'fbi', 'atf', 'native american', 'tribal', 'tribe', 'indian', 'reservation', 'arts', 'culture', 'museum', 'library', 'religion', 'religious', 'sports', 'recreation', 'athletics', 'olympic'],
    'Judicial': ['court', 'judicial', 'judge', 'legal', 'lawsuit', 'litigation', 'sentencing', 'supreme court', 'appellate', 'jurisdiction', 'trial', 'verdict', 'precedent', 'constitutional'],
    'Education': ['education', 'school', 'student', 'college', 'university', 'pell grant', 'teacher', 'history', 'historical', 'census', 'research'],
    'Environment': ['energy', 'renewable', 'solar', 'wind', 'oil', 'gas', 'nuclear', 'fossil fuel', 'electricity', 'environment', 'climate', 'carbon', 'pollution', 'conservation', 'wildlife', 'epa', 'clean air', 'clean water', 'public land', 'national park', 'forest', 'wilderness', 'mining', 'drilling', 'water', 'dam', 'flood', 'drought', 'irrigation', 'wastewater', 'animal', 'endangered species'],
    'Economy': ['budget', 'fiscal', 'debt', 'deficit', 'appropriation', 'spending', 'economic', 'tax', 'taxes', 'taxation', 'irs', 'revenue', 'labor', 'employment', 'worker', 'wage', 'union', 'overtime', 'osha', 'workplace', 'commerce', 'business', 'trade', 'tariff', 'antitrust', 'consumer protection', 'bank', 'banking', 'financial', 'wall street', 'securities', 'cryptocurrency', 'fed', 'interest rate', 'transportation', 'highway', 'road', 'bridge', 'rail', 'transit', 'airport', 'infrastructure', 'agriculture', 'farm', 'food', 'crop', 'usda', 'nutrition', 'rural'],
    'Social Programs': ['welfare', 'snap', 'food stamp', 'poverty', 'homeless', 'social services', 'benefits', 'housing', 'rent', 'mortgage', 'hud', 'homelessness', 'affordable housing'],
    'Technology': ['technology', 'cyber', 'internet', 'data', 'privacy', 'broadband', 'ai', 'artificial intelligence'],
    'Government': ['filibuster', 'congressional', 'house rules', 'senate rules', 'term limit', 'federal agency', 'government', 'oversight', 'transparency', 'whistleblower'],
  };
  
  // Count keyword matches per topic
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    const matchCount = keywords.filter(kw => text.includes(kw)).length;
    if (matchCount > 0) {
      matchedTopics.push({ topic, count: matchCount });
    }
  }
  
  // Sort by match count (most relevant first)
  matchedTopics.sort((a, b) => b.count - a.count);
  
  const topics = matchedTopics.map(m => m.topic);
  const primary = topics[0] || 'Government';
  const additional = topics.slice(1);
  const topicCount = topics.length;
  
  // Detect omnibus type
  let omnibusType: string | null = null;
  for (const [type, patterns] of Object.entries(OMNIBUS_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      omnibusType = type;
      break;
    }
  }
  if (!omnibusType && topicCount >= 5) {
    omnibusType = 'other';
  }
  
  // Determine flag based on topic count
  let flag: string | null = null;
  if (topicCount >= 5 || omnibusType) {
    flag = 'omnibus_major';
  } else if (topicCount >= 3) {
    flag = 'omnibus_detected';
  } else if (topicCount === 2) {
    flag = 'multi_topic_detected';
  }
  
  return { primary, additional, topicCount, flag, omnibusType };
}

// Legacy single-topic function for backwards compatibility
function inferTopic(question: string, description: string): string {
  return inferTopics(question, description).primary;
}

// Fetch and parse a House roll call vote from clerk.house.gov
async function fetchHouseVote(
  year: number,
  rollNumber: number,
  bioguideId: string
): Promise<{ vote: FloorVote | null; metadata: any }> {
  const paddedRoll = String(rollNumber).padStart(3, '0');
  const url = `https://clerk.house.gov/evs/${year}/roll${paddedRoll}.xml`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { vote: null, metadata: { status: response.status } };
    }
    
    const xml = await response.text();
    
    // Extract vote metadata
    const congress = extractTag(xml, 'congress') || '';
    const session = extractTag(xml, 'session') || '1';
    const chamber = 'house';
    const voteQuestion = extractTag(xml, 'vote-question') || '';
    const voteDesc = extractTag(xml, 'vote-desc') || '';
    const actionDate = extractTag(xml, 'action-date');
    const actionTime = extractTag(xml, 'action-time');
    
    // Parse date (format: 10-Jan-2024)
    let voteDate = '';
    if (actionDate) {
      // Parse "10-Jan-2024" format
      const dateMatch = actionDate.match(/(\d+)-(\w+)-(\d+)/);
      if (dateMatch) {
        const months: Record<string, string> = {
          Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
          Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        };
        const [, day, mon, yr] = dateMatch;
        voteDate = `${yr}-${months[mon] || '01'}-${day.padStart(2, '0')}`;
      }
    }
    
    // Extract bill info if available
    const legNum = extractTag(xml, 'legis-num') || '';
    const billId = legNum || `VOTE-${congress}-${session}-${rollNumber}`;
    const billName = voteDesc || voteQuestion;
    
    // Find member by bioguide ID (name-id attribute)
    // Pattern: <legislator ... name-id="B001292" ...>
    const memberPattern = new RegExp(
      `<legislator[^>]*name-id="${bioguideId}"[^>]*>([^<]*)</legislator>`,
      'i'
    );
    const memberMatch = xml.match(memberPattern);
    
    if (!memberMatch) {
      return { vote: null, metadata: { found: false, bioguideId } };
    }
    
    // Extract vote from the recorded-vote block containing this member
    // Pattern: <recorded-vote><legislator ... name-id="B001292" ...>Name</legislator><vote>Aye</vote></recorded-vote>
    const voteBlockPattern = new RegExp(
      `<recorded-vote>\\s*<legislator[^>]*name-id="${bioguideId}"[^>]*>[^<]*</legislator>\\s*<vote>([^<]*)</vote>\\s*</recorded-vote>`,
      'i'
    );
    const voteMatch = xml.match(voteBlockPattern);
    
    if (!voteMatch) {
      return { vote: null, metadata: { found: false, noVoteBlock: true } };
    }
    
    const position = mapVotePosition(voteMatch[1]);
    const topicResult = inferTopics(voteQuestion, voteDesc);
    
    return {
      vote: {
        id: `${bioguideId}-floor-house-${year}-${rollNumber}`,
        bill_id: billId,
        bill_name: billName.slice(0, 500),
        candidate_id: bioguideId,
        position,
        action_type: 'floor_vote',
        topic: topicResult.primary,
        additional_topics: topicResult.additional,
        topic_flag: topicResult.flag,
        omnibus_type: topicResult.omnibusType,
        description: `${voteQuestion}. ${voteDesc}`.slice(0, 1000),
        date: voteDate || `${year}-01-01`,
        vote_number: rollNumber,
        congress: parseInt(congress) || 0,
        session: parseInt(session) || 1,
        chamber,
      },
      metadata: { found: true, position, congress, session },
    };
  } catch (error) {
    console.error(`[House] Error fetching roll ${rollNumber} for ${year}:`, error);
    return { vote: null, metadata: { error: String(error) } };
  }
}

// Fetch Senate vote list for a congress/session from senate.gov
async function fetchSenateVoteList(
  congress: number,
  session: number
): Promise<{ voteNumbers: string[]; error?: string }> {
  const url = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { voteNumbers: [], error: `HTTP ${response.status}` };
    }
    
    const xml = await response.text();
    
    // Extract vote numbers from <vote_number> tags
    const voteNumbers = extractAllTags(xml, 'vote_number');
    
    console.log(`[Senate] Congress ${congress} Session ${session}: found ${voteNumbers.length} votes`);
    
    return { voteNumbers };
  } catch (error) {
    console.error(`[Senate] Error fetching vote list for ${congress}/${session}:`, error);
    return { voteNumbers: [], error: String(error) };
  }
}

// Fetch a single Senate vote and find member's position
async function fetchSenateVote(
  congress: number,
  session: number,
  voteNumber: string,
  lisId: string,
  bioguideId: string
): Promise<{ vote: FloorVote | null; metadata: any }> {
  const paddedVote = voteNumber.padStart(5, '0');
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedVote}.xml`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { vote: null, metadata: { status: response.status } };
    }
    
    const xml = await response.text();
    
    // Extract vote metadata
    const voteQuestion = extractTag(xml, 'vote_question_text') || extractTag(xml, 'question') || '';
    const voteTitle = extractTag(xml, 'vote_title') || '';
    const voteDate = extractTag(xml, 'vote_date') || '';
    const voteResult = extractTag(xml, 'vote_result') || '';
    
    // Extract document info for bill ID
    const docNum = extractTag(xml, 'document_short_title') || extractTag(xml, 'issue') || '';
    const billId = docNum || `VOTE-${congress}-${session}-${voteNumber}`;
    const billName = voteTitle || voteQuestion;
    
    // Find member by lis_member_id
    // Pattern: <member><lis_member_id>S354</lis_member_id>...<vote_cast>Yea</vote_cast>...</member>
    const memberPattern = new RegExp(
      `<member>[\\s\\S]*?<lis_member_id>${lisId}</lis_member_id>[\\s\\S]*?<vote_cast>([^<]*)</vote_cast>[\\s\\S]*?</member>`,
      'i'
    );
    const memberMatch = xml.match(memberPattern);
    
    if (!memberMatch) {
      return { vote: null, metadata: { found: false, lisId } };
    }
    
    const position = mapVotePosition(memberMatch[1]);
    
    // Parse date (format varies: January 3, 2024 or 2024-01-03)
    let formattedDate = voteDate;
    if (voteDate.includes(',')) {
      // "January 3, 2024" format
      const dateMatch = voteDate.match(/(\w+)\s+(\d+),\s+(\d+)/);
      if (dateMatch) {
        const months: Record<string, string> = {
          January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
          July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
        };
        const [, mon, day, yr] = dateMatch;
        formattedDate = `${yr}-${months[mon] || '01'}-${day.padStart(2, '0')}`;
      }
    }
    
    return {
      vote: {
        id: `${bioguideId}-floor-senate-${congress}-${session}-${voteNumber}`,
        bill_id: billId,
        bill_name: billName.slice(0, 500),
        candidate_id: bioguideId,
        position,
        action_type: 'floor_vote',
        topic: inferTopic(voteQuestion, voteTitle),
        description: `${voteQuestion}. ${voteTitle}`.slice(0, 1000),
        date: formattedDate || `${(congress - 1) * 2 + 1789}-01-01`,
        vote_number: parseInt(voteNumber),
        congress,
        session,
        chamber: 'senate',
      },
      metadata: { found: true, position, congress, session },
    };
  } catch (error) {
    console.error(`[Senate] Error fetching vote ${voteNumber} for ${congress}/${session}:`, error);
    return { vote: null, metadata: { error: String(error) } };
  }
}

// Persist a batch of votes to bills + candidate_votes tables
async function persistVotesBatch(
  supabase: any,
  votes: FloorVote[],
  bioguideId: string,
  currentPersisted: number
): Promise<number> {
  if (votes.length === 0) return currentPersisted;
  
  // Deduplicate by ID
  const uniqueVotes = Array.from(new Map(votes.map(v => [v.id, v])).values());
  
  // Fetch summaries for votes that don't have them yet (limit to avoid rate limits)
  const SUMMARY_BATCH_LIMIT = 10;
  let summariesFetched = 0;
  
  for (const vote of uniqueVotes.slice(0, SUMMARY_BATCH_LIMIT)) {
    if (!vote.bill_summary) {
      const parsed = parseBillId(vote.bill_id);
      if (parsed && vote.congress) {
        const summary = await fetchBillSummary(vote.congress, parsed.type, parsed.number);
        if (summary) {
          vote.bill_summary = summary;
          vote.summary_fetched_at = new Date().toISOString();
          summariesFetched++;
        }
        await new Promise(r => setTimeout(r, SUMMARY_FETCH_DELAY));
      }
    }
  }
  
  if (summariesFetched > 0) {
    console.log(`[BG] Fetched ${summariesFetched} bill summaries for batch`);
  }
  
  // Extract unique bills and candidate votes
  const billsMap = new Map<string, any>();
  const candidateVotesData: any[] = [];
  
  for (const v of uniqueVotes) {
    // Upsert bill data (deduplicated by bill_id)
    if (!billsMap.has(v.bill_id)) {
      billsMap.set(v.bill_id, {
        id: v.bill_id,
        name: v.bill_name.slice(0, 500),
        topic: v.topic,
        additional_topics: v.additional_topics || [],
        topic_flag: v.topic_flag || null,
        omnibus_type: v.omnibus_type || null,
        description: v.description?.slice(0, 1000) || null,
        congress: v.congress,
        session: v.session,
        chamber: v.chamber,
        summary: v.bill_summary || null,
        summary_fetched_at: v.summary_fetched_at || null,
        last_action_date: v.date,
      });
    }
    
    // Create candidate_vote record
    candidateVotesData.push({
      bill_id: v.bill_id,
      candidate_id: v.candidate_id,
      action_type: 'floor_vote',
      position: v.position,
      action_date: v.date,
      vote_number: v.vote_number,
    });
  }
  
  const bills = Array.from(billsMap.values());
  
  // Upsert bills first
  if (bills.length > 0) {
    const { error: billsError } = await supabase
      .from('bills')
      .upsert(bills, { onConflict: 'id', ignoreDuplicates: false });
    
    if (billsError) {
      console.error(`[BG] Error upserting bills:`, billsError);
      throw new Error(billsError.message);
    }
  }
  
  // Insert candidate_votes
  if (candidateVotesData.length > 0) {
    const { error: votesError } = await supabase
      .from('candidate_votes')
      .upsert(candidateVotesData, { 
        onConflict: 'bill_id,candidate_id,action_type',
        ignoreDuplicates: true 
      });
    
    if (votesError) {
      // Fallback: insert one by one if composite key doesn't exist
      if (votesError.code === '42P10' || votesError.message?.includes('there is no unique')) {
        for (const cv of candidateVotesData) {
          await supabase.from('candidate_votes').insert(cv).select().maybeSingle();
        }
      } else {
        console.error(`[BG] Error inserting candidate_votes:`, votesError);
        throw new Error(votesError.message);
      }
    }
  }
  
  const newTotal = currentPersisted + uniqueVotes.length;
  
  // Update progress in vote_sync_status
  await supabase
    .from('vote_sync_status')
    .upsert({
      candidate_id: bioguideId,
      expected_floor_votes: newTotal,
      persisted_floor_votes: newTotal,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'candidate_id' });
  
  console.log(`[BG] Persisted batch of ${uniqueVotes.length} floor votes, total: ${newTotal}`);
  return newTotal;
}

// Process House floor votes for all congresses
async function processHouseFloorVotes(
  supabase: any,
  bioguideId: string,
  congressList: number[]
): Promise<{ totalPersisted: number; lastVoteDate: string | null; error?: string }> {
  let pendingVotes: FloorVote[] = [];
  let totalPersisted = 0;
  let lastVoteDate: string | null = null;
  
  console.log(`[House] Processing floor votes for ${bioguideId} across ${congressList.length} congresses...`);
  
  for (const congress of congressList) {
    const [year1, year2] = congressToYears(congress);
    
    for (const year of [year1, year2]) {
      let rollNumber = 1;
      let consecutiveMisses = 0;
      let foundInYear = 0;
      
      console.log(`[House] Processing ${year} (Congress ${congress})...`);
      
      // Iterate through roll calls until we hit 10 consecutive 404s
      while (consecutiveMisses < 10 && rollNumber < 1000) {
        const { vote, metadata } = await fetchHouseVote(year, rollNumber, bioguideId);
        
        if (metadata.status === 404) {
          consecutiveMisses++;
          rollNumber++;
          continue;
        }
        
        consecutiveMisses = 0;
        
        if (vote) {
          pendingVotes.push(vote);
          foundInYear++;
          
          if (!lastVoteDate || vote.date > lastVoteDate) {
            lastVoteDate = vote.date;
          }
          
          // Persist in batches
          if (pendingVotes.length >= BATCH_SIZE) {
            totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
            pendingVotes = [];
          }
        }
        
        rollNumber++;
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        
        // Progress log every 100 roll calls
        if (rollNumber % 100 === 0) {
          console.log(`[House] ${year}: processed ${rollNumber} roll calls, found ${foundInYear} votes`);
        }
      }
      
      console.log(`[House] ${year} complete: ${foundInYear} votes found`);
    }
  }
  
  // Persist remaining votes
  if (pendingVotes.length > 0) {
    totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
  }
  
  return { totalPersisted, lastVoteDate };
}

// Process Senate floor votes for all congresses
async function processSenateFloorVotes(
  supabase: any,
  bioguideId: string,
  lisId: string,
  congressList: number[]
): Promise<{ totalPersisted: number; lastVoteDate: string | null; error?: string }> {
  let pendingVotes: FloorVote[] = [];
  let totalPersisted = 0;
  let lastVoteDate: string | null = null;
  
  console.log(`[Senate] Processing floor votes for ${bioguideId} (LIS: ${lisId}) across ${congressList.length} congresses...`);
  
  for (const congress of congressList) {
    for (const session of [1, 2]) {
      const { voteNumbers, error } = await fetchSenateVoteList(congress, session);
      
      if (error) {
        console.log(`[Senate] Skipping Congress ${congress} Session ${session}: ${error}`);
        continue;
      }
      
      if (voteNumbers.length === 0) {
        console.log(`[Senate] No votes for Congress ${congress} Session ${session}`);
        continue;
      }
      
      console.log(`[Senate] Processing ${voteNumbers.length} votes for Congress ${congress} Session ${session}...`);
      
      let foundInSession = 0;
      
      for (const voteNum of voteNumbers) {
        const { vote } = await fetchSenateVote(congress, session, voteNum, lisId, bioguideId);
        
        if (vote) {
          pendingVotes.push(vote);
          foundInSession++;
          
          if (!lastVoteDate || vote.date > lastVoteDate) {
            lastVoteDate = vote.date;
          }
          
          // Persist in batches
          if (pendingVotes.length >= BATCH_SIZE) {
            totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
            pendingVotes = [];
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
      
      console.log(`[Senate] Congress ${congress} Session ${session} complete: ${foundInSession} votes found`);
    }
  }
  
  // Persist remaining votes
  if (pendingVotes.length > 0) {
    totalPersisted = await persistVotesBatch(supabase, pendingVotes, bioguideId, totalPersisted);
  }
  
  return { totalPersisted, lastVoteDate };
}

// Background processing function
async function processFloorVoteSync(
  bioguideId: string,
  chamber: 'house' | 'senate',
  congressList: number[]
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    console.log(`[BG] Starting floor vote sync for ${bioguideId} in ${chamber}...`);
    console.log(`[BG] Congresses: ${congressList.join(', ')}`);
    
    let result: { totalPersisted: number; lastVoteDate: string | null; error?: string };
    
    if (chamber === 'senate') {
      // Get LIS ID for Senate member
      const { data: candidate, error: fetchError } = await supabase
        .from('candidates')
        .select('lis_member_id, name')
        .eq('id', bioguideId)
        .single();
      
      if (fetchError || !candidate) {
        throw new Error(`Candidate ${bioguideId} not found`);
      }
      
      if (!candidate.lis_member_id) {
        // Try to fetch LIS ID from congress-legislators (GitHub raw)
        console.log(`[BG] No LIS ID found for ${candidate.name}, attempting to fetch from GitHub...`);
        
        const LIS_MAPPING_URL = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json';
        console.log(`[BG] Fetching LIS mapping from: ${LIS_MAPPING_URL}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        try {
          const legResponse = await fetch(LIS_MAPPING_URL, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          console.log(`[BG] LIS mapping fetch status: ${legResponse.status}`);
          
          if (legResponse.ok) {
            const legislators = await legResponse.json();
            console.log(`[BG] Fetched ${legislators.length} legislators from mapping`);
            
            const match = legislators.find((l: any) => l.id.bioguide === bioguideId);
            
            if (match?.id?.lis) {
              await supabase
                .from('candidates')
                .update({ lis_member_id: match.id.lis })
                .eq('id', bioguideId);
              
              console.log(`[BG] Updated ${candidate.name} with LIS ID: ${match.id.lis}`);
              result = await processSenateFloorVotes(supabase, bioguideId, match.id.lis, congressList);
            } else {
              throw new Error(`LIS member ID not found in mapping for Senate member ${candidate.name} (${bioguideId}). Run sync-lis-member-ids first.`);
            }
          } else {
            throw new Error(`Could not fetch LIS ID data: HTTP ${legResponse.status}`);
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            throw new Error(`LIS mapping fetch timed out after 15s`);
          }
          throw fetchErr;
        }
      } else {
        result = await processSenateFloorVotes(supabase, bioguideId, candidate.lis_member_id, congressList);
      }
    } else {
      result = await processHouseFloorVotes(supabase, bioguideId, congressList);
    }
    
    console.log(`[BG] Completed: ${result.totalPersisted} floor votes persisted for ${bioguideId}`);
    
    // Final status update
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        expected_floor_votes: result.totalPersisted,
        persisted_floor_votes: result.totalPersisted,
        last_floor_vote_date: result.lastVoteDate,
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
      congressList = DEFAULT_CONGRESS_LIST,
    } = body;

    if (!bioguideId || typeof bioguideId !== 'string') {
      throw new Error('bioguideId is required and must be a string');
    }

    const validChamber = chamber === 'senate' ? 'senate' : 'house';
    const validCongressList = Array.isArray(congressList) ? congressList : DEFAULT_CONGRESS_LIST;

    console.log(`[fetch-floor-votes] Request: ${bioguideId}, chamber=${validChamber}, congresses=${validCongressList.join(',')}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mark sync as started
    await supabase
      .from('vote_sync_status')
      .upsert({
        candidate_id: bioguideId,
        last_sync_started_at: syncStartedAt,
        floor_vote_sync_error: null,
        updated_at: syncStartedAt,
      }, { onConflict: 'candidate_id' });

    // Use background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof globalThis.EdgeRuntime !== 'undefined' && globalThis.EdgeRuntime.waitUntil) {
      // @ts-ignore
      globalThis.EdgeRuntime.waitUntil(processFloorVoteSync(bioguideId, validChamber, validCongressList));
      
      return new Response(JSON.stringify({
        status: 'processing',
        message: `Floor vote sync started for ${bioguideId} (${validChamber})`,
        chamber: validChamber,
        congresses: validCongressList,
        startedAt: syncStartedAt,
      }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Fallback: run synchronously
      await processFloorVoteSync(bioguideId, validChamber, validCongressList);
      
      return new Response(JSON.stringify({
        status: 'completed',
        message: `Floor vote sync completed for ${bioguideId} (${validChamber})`,
        chamber: validChamber,
        congresses: validCongressList,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[fetch-floor-votes] Error:', errorMessage);

    return new Response(JSON.stringify({
      status: 'error',
      error: errorMessage,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
