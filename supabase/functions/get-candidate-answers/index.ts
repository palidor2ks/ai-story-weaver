import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const CONGRESS_GOV_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CHUNK_SIZE = 10;

// Cross-topic matching: some questions span multiple topic areas
// This allows votes from related topics to be considered as evidence
const RELATED_TOPICS: Record<string, string[]> = {
  'civil-rights': ['criminal-justice', 'government-politics', 'immigration-society'],
  'criminal-justice': ['civil-rights', 'government-politics'],
  'government-politics': ['civil-rights', 'criminal-justice', 'economy-jobs'],
  'economy-jobs': ['government-politics', 'labor', 'trade'],
  'health-welfare': ['science-tech'],
  'science-tech': ['health-welfare', 'environment-energy'],
  'environment-energy': ['science-tech', 'economy-jobs'],
  'immigration-society': ['civil-rights', 'defense-foreign'],
  'defense-foreign': ['immigration-society', 'government-politics'],
  'education': ['economy-jobs', 'civil-rights'],
};

interface QuestionOption {
  value: number;
  text: string;
}

interface Question {
  id: string;
  text: string;
  topic_id: string;
  question_options?: QuestionOption[];
}

interface GeneratedAnswer {
  question_id: string;
  answer_value: number;
  source_description: string;
  source_url: string | null;
  source_urls: string[];
  source_titles: string[];
  source_type: string;
  confidence: 'high' | 'medium' | 'low';
  evidence_type: 'voting_record' | 'public_statement' | 'social_media' | 'inferred' | 'mixed';
  voting_record_summary?: string;
  public_statement_summary?: string;
  has_discrepancy?: boolean;
  discrepancy_note?: string;
}

interface LegislationRecord {
  bill_id: string;
  title: string;
  policy_area: string;
  action: 'Sponsored' | 'Cosponsored';
  congress: number;
  type: string;
  number: number;
}

interface GroundingResult {
  researchText: string;
  sourceUrls: string[];
  sourceTitles: string[];
  success: boolean;
}

interface StoredVote {
  bill_id: string;
  bill_name: string;
  position: string;
  topic: string;
  date: string;
  action_type?: string;
  vote_number?: number;
  congress?: number;
  chamber?: string;
  bill_summary?: string | null;
  summary_fetched_at?: string | null;
}

// Social media platforms - allow but handle specially (archive quotes)
const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
];

// Blocked domains that should be filtered out
const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'conservapedia.com',
  'thefederalistpapers.org',
  // Video platforms (block iframe embedding, hard to cite specific quotes)
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
];

// Smart truncation that ends at sentence/word boundaries
function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  
  // Try to end at a sentence boundary first
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) {
    return text.slice(0, sentenceEnd + 1);
  }
  
  // Fall back to word boundary
  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return text.slice(0, lastSpace) + '...';
  }
  
  // Last resort: hard cut with ellipsis
  return text.slice(0, maxLength - 3) + '...';
}

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

function isSocialMediaDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SOCIAL_MEDIA_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return 'Source';
  }
}

async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url.includes('vertexaisearch.cloud.google.com')) {
    return url;
  }
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.url || url;
  } catch {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return url;
  }
}

async function validateUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    let response = await fetch(url, { 
      method: 'HEAD', 
      redirect: 'follow',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (response.ok) return true;
    
    if (response.status === 405 || response.status === 403) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
      response = await fetch(url, { 
        method: 'GET', 
        redirect: 'follow',
        signal: controller2.signal 
      });
      clearTimeout(timeoutId2);
      
      const contentType = response.headers.get('content-type') || '';
      return response.ok && contentType.includes('text/html');
    }
    
    return false;
  } catch {
    return false;
  }
}

// Check if candidate ID is a congressional bioguide ID
function isBioguideId(candidateId: string): boolean {
  return /^[A-Z]\d{6}$/.test(candidateId);
}

// Check if the office indicates a congressional member
function isCongressionalOffice(office: string): boolean {
  const lowerOffice = office.toLowerCase();
  return lowerOffice.includes('senator') || 
         lowerOffice.includes('representative') ||
         lowerOffice.includes('u.s. senator') ||
         lowerOffice.includes('u.s. representative') ||
         lowerOffice.includes('united states senator') ||
         lowerOffice.includes('united states representative');
}

// Generate congress.gov profile URL
function buildCongressGovProfileUrl(bioguideId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[.,]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return `https://www.congress.gov/member/${slug}/${bioguideId}`;
}

// Build URL to a specific bill
function buildBillUrl(type: string, number: number, congress: number): string {
  const typeMap: Record<string, string> = {
    'HR': 'house-bill', 'S': 'senate-bill', 'HRES': 'house-resolution',
    'SRES': 'senate-resolution', 'HJRES': 'house-joint-resolution',
    'SJRES': 'senate-joint-resolution', 'HCONRES': 'house-concurrent-resolution',
    'SCONRES': 'senate-concurrent-resolution',
  };
  const urlType = typeMap[type.toUpperCase()] || 'bill';
  return `https://www.congress.gov/bill/${congress}th-congress/${urlType}/${number}`;
}

// Extract bill info from source_description
function extractBillInfo(sourceDescription: string): { type: string; number: number } | null {
  const patterns = [/\b(H\.?R\.?|S\.?|H\.?RES\.?|S\.?RES\.?|H\.?J\.?RES\.?|S\.?J\.?RES\.?)\s*(\d+)/i];
  for (const pattern of patterns) {
    const match = sourceDescription.match(pattern);
    if (match) {
      const type = match[1].replace(/\./g, '').toUpperCase();
      return { type, number: parseInt(match[2], 10) };
    }
  }
  return null;
}

// Fetch member's voting record from Congress.gov API
async function fetchMemberVotingRecord(bioguideId: string): Promise<LegislationRecord[]> {
  if (!CONGRESS_GOV_API_KEY) {
    console.log('CONGRESS_GOV_API_KEY not configured');
    return [];
  }
  
  const records: LegislationRecord[] = [];
  
  try {
    const sponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_GOV_API_KEY}&limit=50`;
    console.log(`Fetching sponsored legislation for ${bioguideId}...`);
    const sponsoredResponse = await fetch(sponsoredUrl);
    
    if (sponsoredResponse.ok) {
      const sponsoredData = await sponsoredResponse.json();
      const sponsored = (sponsoredData.sponsoredLegislation || []).map((bill: any) => ({
        bill_id: `${bill.type || 'HR'}${bill.number}`,
        title: bill.title || '',
        policy_area: bill.policyArea?.name || 'General',
        action: 'Sponsored' as const,
        congress: bill.congress || 118,
        type: bill.type || 'HR',
        number: bill.number || 0,
      }));
      records.push(...sponsored);
      console.log(`Found ${sponsored.length} sponsored bills`);
    }
    
    const cosponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_GOV_API_KEY}&limit=50`;
    const cosponsoredResponse = await fetch(cosponsoredUrl);
    
    if (cosponsoredResponse.ok) {
      const cosponsoredData = await cosponsoredResponse.json();
      const cosponsored = (cosponsoredData.cosponsoredLegislation || []).map((bill: any) => ({
        bill_id: `${bill.type || 'HR'}${bill.number}`,
        title: bill.title || '',
        policy_area: bill.policyArea?.name || 'General',
        action: 'Cosponsored' as const,
        congress: bill.congress || 118,
        type: bill.type || 'HR',
        number: bill.number || 0,
      }));
      records.push(...cosponsored);
      console.log(`Found ${cosponsored.length} cosponsored bills`);
    }
  } catch (e) {
    console.error('Error fetching voting record:', e);
  }
  
  return records;
}

// Normalize topic names for consistent matching (handles "domestic-policy" vs "Domestic Policy")
function normalizeTopicName(topic: string): string {
  return topic.toLowerCase().replace(/[-_\s]+/g, '');
}

// Extract keywords from question text for cross-topic vote matching
// PART F: Expanded with civil rights keywords
function extractQuestionKeywords(questionText: string): string[] {
  const text = questionText.toLowerCase();
  const keywordGroups: Record<string, string[]> = {
    gun: ['gun', 'firearm', 'weapon', 'background check', 'second amendment', 'ammunition', 'nics', 'atf', 'concealed', 'assault weapon', 'rifle', 'pistol', 'red flag', 'universal background'],
    immigration: ['immigration', 'immigrant', 'border', 'migrant', 'asylum', 'deportation', 'visa', 'daca', 'dreamer', 'citizenship'],
    healthcare: ['healthcare', 'health care', 'medicare', 'medicaid', 'insurance', 'hospital', 'medical', 'prescription', 'drug price', 'obamacare', 'aca'],
    abortion: ['abortion', 'reproductive', 'roe', 'pro-choice', 'pro-life', 'planned parenthood', 'contraception'],
    climate: ['climate', 'environment', 'carbon', 'emission', 'renewable', 'fossil fuel', 'clean energy', 'epa', 'pollution', 'greenhouse'],
    tax: ['tax', 'taxation', 'tariff', 'revenue', 'irs'],
    education: ['education', 'school', 'student', 'teacher', 'college', 'university', 'loan', 'tuition'],
    lgbtq: ['lgbtq', 'gay', 'transgender', 'same-sex', 'marriage equality', 'gender identity'],
    voting: ['voting', 'election', 'ballot', 'voter id', 'gerrymandering', 'filibuster'],
    labor: ['union', 'labor', 'worker', 'minimum wage', 'overtime'],
    military: ['military', 'defense', 'veteran', 'pentagon', 'armed forces'],
    // PART F: Civil rights keywords added
    civilrights: [
      'affirmative action', 'dei', 'diversity', 'equity', 'inclusion',
      'equal protection', 'civil rights act', 'title vi', 'title vii',
      'discrimination', 'race-based', 'admissions', 'racial preference',
      'minority', 'underrepresented', 'disparate impact', 'equal opportunity',
      'racial justice', 'systemic racism', 'reparations', 'voting rights act'
    ],
    // Criminal justice & due process keywords for cross-topic matching
    criminaljustice: [
      'civil asset forfeiture', 'asset forfeiture', 'forfeiture', 'seizure',
      'due process', 'property rights', 'property seizure', 'eminent domain',
      'criminal justice', 'justice reform', 'sentencing', 'sentencing reform',
      'prison reform', 'incarceration', 'bail reform', 'bail', 'pretrial',
      'police reform', 'law enforcement', 'miranda', 'miranda rights',
      'fifth amendment', 'fourth amendment', 'search and seizure', 'warrant',
      'qualified immunity', 'civil liberties', 'habeas corpus', 'wrongful conviction'
    ],
  };
  
  const matches: string[] = [];
  for (const keywords of Object.values(keywordGroups)) {
    if (keywords.some(kw => text.includes(kw))) {
      matches.push(...keywords);
    }
  }
  return [...new Set(matches)];
}

// Fetch stored votes from the database - returns BOTH floor votes and legislative actions
// Now includes bill_summary from cached CRS summaries
async function fetchStoredVotes(
  supabase: any,
  candidateId: string
): Promise<{ floorVotes: StoredVote[]; legislativeActions: StoredVote[] }> {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('bill_id, bill_name, position, topic, date, action_type, vote_number, congress, chamber, bill_summary, summary_fetched_at')
      .eq('candidate_id', candidateId)
      .order('date', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error('[VotesDB] Error fetching votes:', error);
      return { floorVotes: [], legislativeActions: [] };
    }
    
    const allVotes = data || [];
    
    // Separate floor votes from legislative actions
    const floorVotes = allVotes.filter((v: StoredVote) => v.action_type === 'floor_vote');
    const legislativeActions = allVotes.filter((v: StoredVote) => 
      v.action_type === 'sponsored' || v.action_type === 'cosponsored' || !v.action_type
    );
    
    const withSummaries = allVotes.filter((v: StoredVote) => v.bill_summary && v.bill_summary !== '[NO_SUMMARY]').length;
    console.log(`[VotesDB] Found ${floorVotes.length} floor votes + ${legislativeActions.length} legislative actions for ${candidateId} (${withSummaries} with summaries)`);
    return { floorVotes, legislativeActions };
  } catch (e) {
    console.error('[VotesDB] Exception fetching votes:', e);
    return { floorVotes: [], legislativeActions: [] };
  }
}

// DEPRECATED: fetchBillSummary is no longer used during answer generation
// Bill summaries are now cached in the votes table during sync
// Keeping this for reference but it should not be called

// PART E: Analyze votes with cached bill summaries for deeper matching
// Now uses pre-cached summaries from the database instead of live API calls
async function analyzeVotesWithSummaries(
  candidateName: string,
  candidateParty: string,
  candidateId: string,
  unansweredQuestions: Question[],
  storedVotes: StoredVote[]
): Promise<GeneratedAnswer[]> {
  if (unansweredQuestions.length === 0 || storedVotes.length === 0) return [];
  
  console.log(`[DeepAnalysis] Analyzing ${storedVotes.length} votes for ${unansweredQuestions.length} unanswered questions`);
  
  // Filter to votes that have cached summaries (not null and not [NO_SUMMARY])
  const billsWithSummaries = storedVotes
    .filter(v => v.bill_summary && v.bill_summary !== '[NO_SUMMARY]' && v.congress && v.bill_id)
    .slice(0, 50); // Can analyze more bills now since no API calls needed
  
  if (billsWithSummaries.length === 0) {
    console.log('[DeepAnalysis] No cached bill summaries available');
    return [];
  }
  
  console.log(`[DeepAnalysis] Using ${billsWithSummaries.length} cached bill summaries for analysis`);
  
  // Use AI to match summaries to questions - include options for accurate scoring
  const questionsText = unansweredQuestions.map(q => {
    let qStr = `- ${q.id}: "${q.text}"`;
    if (q.question_options && q.question_options.length > 0) {
      const sortedOptions = [...q.question_options].sort((a, b) => a.value - b.value);
      const optionsStr = sortedOptions.map(opt => `    (${opt.value}) ${opt.text}`).join('\n');
      qStr += `\n  OPTIONS:\n${optionsStr}`;
    }
    return qStr;
  }).join('\n');
  
  const billsText = billsWithSummaries.map(b => 
    `BILL ${b.bill_id} (${b.position || 'Sponsored'} on ${b.date?.slice(0,10)}):\n${b.bill_summary!.slice(0, 800)}`
  ).join('\n\n');
  
  const prompt = `Analyze if any of these bills are DIRECTLY relevant to answering these policy questions.

QUESTIONS (unanswered) - EACH HAS SPECIFIC OPTIONS WITH VALUES:
${questionsText}

BILL SUMMARIES:
${billsText}

For each question, if a bill summary directly addresses the topic:
- Return the question_id, the relevant bill_id, and a brief explanation of how the bill relates
- CRITICAL: Look at the OPTIONS for each question to determine the correct answer_value
- Use the answer_value that matches what sponsoring/voting for the bill indicates
- Example: If a question's +10 option is "Strongly support federal protections" and the candidate sponsored a pro-protection bill, use +10
- Example: If a question's -10 option is "Strongly oppose" and evidence shows opposition, use -10

Return JSON array: [{question_id, answer_value, bill_id, source_description}]
Only include questions where you found a DIRECT match. If no match, omit that question.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a legislative analyst. Only identify matches when the bill summary DIRECTLY addresses the policy question.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.log(`[DeepAnalysis] AI request failed: ${response.status}`);
      return [];
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    const parsed = parseAIResponse(content);
    return parsed.map((item: any) => {
      const matchedBill = billsWithSummaries.find(b => b.bill_id === item.bill_id);
      const billUrl = matchedBill 
        ? buildBillUrl(
            matchedBill.bill_id.replace(/[^A-Z]/gi, ''),
            parseInt(matchedBill.bill_id.replace(/[^0-9]/g, ''), 10),
            matchedBill.congress || 118
          )
        : null;
      
      return {
        question_id: item.question_id,
        answer_value: item.answer_value,
        source_description: item.source_description,
        source_url: billUrl,
        source_urls: billUrl ? [billUrl] : [],
        source_titles: matchedBill ? [`${matchedBill.bill_id}: ${matchedBill.bill_name?.slice(0, 80)}`] : [],
        source_type: 'voting_record',
        confidence: 'high' as const,
        evidence_type: 'voting_record' as const,
        voting_record_summary: item.source_description,
      };
    });
  } catch (e) {
    console.error('[DeepAnalysis] Error:', e);
    return [];
  }
}

// Snap to valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Validate that the score is consistent with the source description.
 * IMPORTANT: This function is DISABLED because it assumed a fixed left/right scale.
 * Each question now has its own option-specific scale, so generic keyword matching
 * cannot reliably determine which direction to adjust scores.
 * 
 * The AI prompts now include question options to ensure proper scoring at generation time.
 */
function validateScoreConsistency(
  answerValue: number,
  sourceDescription: string
): number {
  // DISABLED: Cannot use generic keywords to adjust scores because
  // the meaning of -10 vs +10 varies by question.
  // For example, "supports protections" might be +10 on one question
  // but -10 on another (if the question is about limiting protections).
  // The AI now receives question options and should score correctly at generation time.
  return answerValue;
}

/**
 * Research candidate position using Gemini with Google Search grounding
 */
async function researchCandidatePosition(
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  questionText: string,
  topicName: string,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;
  
  if (!GOOGLE_GEMINI_API_KEY) {
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Research ${candidateName} (${candidateOffice}, ${candidateState}) position on: "${questionText}"

GOAL: Find CONCRETE EVIDENCE of their position. We need:
1. SPECIFIC legislation they sponsored, cosponsored, or voted on related to this topic
2. DIRECT QUOTES or statements from the candidate
3. VOTING RECORD on related bills (include bill numbers like H.R.XXX or S.XXX)

CRITICAL: If you find ANY of the above evidence, DO NOT say "no clear position" or "no documented position".
Even co-sponsoring a related bill IS evidence of a position.
Even a related floor vote IS evidence of a position.

SEARCH BROADLY for related evidence:
- Criminal justice reform positions (if question relates to due process, forfeiture, rights)
- Bipartisan legislation sponsorship or co-sponsorship (2016-2025)
- Committee work and floor statements
- Facebook, Twitter/X posts, press releases
- News coverage of their stance

RELATED TERMS TO SEARCH:
- If about "civil asset forfeiture": also search "due process", "property rights", "justice reform", "Fifth Amendment"
- If about criminal justice: search "sentencing reform", "prison reform", "bail reform"
- Include any bills they sponsored or cosponsored related to this topic

OUTPUT FORMAT:
If evidence found, start with: "EVIDENCE FOUND: [specific bill numbers, quotes, or votes]"
Then provide details about their position.

If truly NO evidence exists after thorough search: "NO EVIDENCE FOUND after searching for legislation, statements, and votes."`
            }] 
          }],
          tools: [{ googleSearch: {} }]
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini grounding error: ${response.status} - ${errorBody}`);
      
      // Retry on transient errors
      if (retryCount < maxRetries && (response.status === 429 || response.status >= 500)) {
        const delay = Math.pow(2, retryCount + 1) * 1000;
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        return researchCandidatePosition(candidateName, candidateOffice, candidateState, questionText, topicName, retryCount + 1);
      }
      
      return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
    }

    const data = await response.json();
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract source URLs and titles from grounding metadata (Gemini 2.0 format)
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const rawSources: { url: string; title: string }[] = [];
    
    // Check groundingChunks (primary source for URLs)
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          rawSources.push({
            url: chunk.web.uri,
            title: chunk.web.title || ''
          });
        }
      }
    }
    
    // Log web searches performed
    if (groundingMetadata?.webSearchQueries) {
      console.log(`Web searches: ${groundingMetadata.webSearchQueries.join(', ')}`);
    }

    // Resolve redirects, validate, and filter blocked domains
    const resolvedSources: { url: string; title: string }[] = [];
    const seen = new Set<string>();
    
    for (const source of rawSources.slice(0, 8)) {
      try {
        const resolvedUrl = await resolveRedirectUrl(source.url);
        
        // Skip blocked domains and duplicates
        if (isBlockedDomain(resolvedUrl) || seen.has(resolvedUrl)) continue;
        seen.add(resolvedUrl);
        
        // Validate URL is accessible
        const isValid = await validateUrl(resolvedUrl);
        if (!isValid) {
          console.log(`Skipping invalid URL: ${resolvedUrl}`);
          continue;
        }
        
        resolvedSources.push({
          url: resolvedUrl,
          title: source.title || extractDomainName(resolvedUrl)
        });
        
        if (resolvedSources.length >= 5) break;
      } catch (e) {
        console.log(`Error processing URL ${source.url}:`, e);
      }
    }

    console.log(`Grounding for ${candidateName} on "${questionText.slice(0, 40)}...": ${researchText.length} chars, ${resolvedSources.length} valid sources`);

    return {
      researchText: researchText.slice(0, 2000),
      sourceUrls: resolvedSources.map(s => s.url),
      sourceTitles: resolvedSources.map(s => s.title),
      success: researchText.length > 50
    };
  } catch (e) {
    console.error('Gemini grounding error:', e);
    
    // Retry on network errors
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount + 1) * 1000;
      console.log(`Retrying after error in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      return researchCandidatePosition(candidateName, candidateOffice, candidateState, questionText, topicName, retryCount + 1);
    }
    
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
  }
}

// Parse tool call response
function parseToolCallResponse(toolCalls: any[]): any[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  const functionCall = toolCalls[0]?.function;
  if (!functionCall?.arguments) return [];
  try {
    const args = typeof functionCall.arguments === 'string' 
      ? JSON.parse(functionCall.arguments) : functionCall.arguments;
    return args.answers || [];
  } catch (e) {
    console.error('[AI] Failed to parse tool call arguments:', e);
    return [];
  }
}

// Extract answers from text
function extractAnswersFromText(content: string): any[] {
  const recovered: any[] = [];
  const segments = content.split(/"question_id"\s*:/);
  
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const qidMatch = segment.match(/^\s*"([^"]+)"/);
    if (!qidMatch) continue;
    const question_id = qidMatch[1];
    
    const valueMatch = segment.match(/"answer_value"\s*:\s*([+-]?\d+)/);
    if (!valueMatch) continue;
    const answer_value = parseInt(valueMatch[1], 10);
    
    const confMatch = segment.match(/"confidence"\s*:\s*"([^"]+)"/);
    const confidence = confMatch ? confMatch[1] : 'medium';
    
    const srcMatch = segment.match(/"source_description"\s*:\s*"([^"]*)"/);
    const source_description = srcMatch ? smartTruncate(srcMatch[1], 1000) : 'No documented position';
    
    recovered.push({ question_id, answer_value, confidence, source_description });
  }
  
  return recovered;
}

// Parse AI response
function parseAIResponse(content: string, finishReason?: string): any[] {
  if (!content || content.length === 0) throw new Error('Empty AI response');
  
  let cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.log('[AI] Standard JSON parse failed, trying recovery...');
    }
  }
  
  const recovered = extractAnswersFromText(cleaned);
  if (recovered.length > 0) return recovered;
  
  throw new Error('No JSON array found in response');
}

function hasDocumentedPosition(answer: GeneratedAnswer | null | undefined): boolean {
  if (!answer) return false;
  if (answer.answer_value === 0) return false;
  const desc = answer.source_description?.toLowerCase() || '';
  return desc.length > 10 && !desc.includes('no documented');
}

async function generateVotingRecordAnswers(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  candidateId: string,
  questions: Question[],
  votingRecord: LegislationRecord[],
  storedVotes: StoredVote[] = []
): Promise<GeneratedAnswer[]> {
  if (!LOVABLE_API_KEY) return [];
  const isCongressional = isBioguideId(candidateId) && isCongressionalOffice(candidateOffice);
  
  // Require either sponsored legislation OR stored floor votes
  const hasVotingData = votingRecord.length > 0 || storedVotes.length > 0;
  if (!isCongressional || !hasVotingData || questions.length === 0) return [];

  const congressGovUrl = buildCongressGovProfileUrl(candidateId, candidateName);
  const validQuestionIds = questions.map(q => q.id);
  const validIdsStr = validQuestionIds.join(', ');

  // Get topic IDs for the questions in this chunk
  const chunkTopicIds = [...new Set(questions.map(q => q.topic_id))];
  const normalizedChunkTopicIds = chunkTopicIds.map(normalizeTopicName);
  
  // Expand topic IDs to include related topics for cross-topic matching
  const expandedTopicIds = new Set(normalizedChunkTopicIds);
  for (const topicId of chunkTopicIds) {
    const relatedTopics = RELATED_TOPICS[topicId] || [];
    relatedTopics.forEach(rt => expandedTopicIds.add(normalizeTopicName(rt)));
  }
  
  // Extract keywords from all questions for cross-topic matching
  const allQuestionKeywords = questions.flatMap(q => extractQuestionKeywords(q.text));
  const uniqueKeywords = [...new Set(allQuestionKeywords)];
  
  // Filter stored votes: match by normalized topic (including related), by keyword in bill name, OR by keyword in bill summary
  const relevantStoredVotes = storedVotes.filter(v => {
    const normalizedVoteTopic = normalizeTopicName(v.topic);
    const matchesTopic = expandedTopicIds.has(normalizedVoteTopic);
    
    // Also check if bill name contains any question keywords (cross-topic matching)
    const billNameLower = v.bill_name.toLowerCase();
    const matchesKeyword = uniqueKeywords.some(kw => billNameLower.includes(kw));
    
    // Also check bill summary for keyword matches
    const billSummaryLower = (v.bill_summary || '').toLowerCase();
    const matchesSummaryKeyword = uniqueKeywords.some(kw => billSummaryLower.includes(kw));
    
    return matchesTopic || matchesKeyword || matchesSummaryKeyword;
  });
  console.log(`[VotingRecord] Using ${relevantStoredVotes.length} relevant floor votes (topic + related + keyword match from ${storedVotes.length} total) + ${votingRecord.length} sponsored bills`);

  const questionsText = questions.map((q, i) => {
    let questionStr = `Question ${i + 1}:\n  ID: "${q.id}"\n  Text: ${q.text}`;
    
    if (q.question_options && q.question_options.length > 0) {
      const sortedOptions = [...q.question_options].sort((a, b) => a.value - b.value);
      const optionsStr = sortedOptions.map(opt => `    (${opt.value}) ${opt.text}`).join('\n');
      questionStr += `\n  Options:\n${optionsStr}`;
    }
    return questionStr;
  }).join('\n\n');

  // Build voting context from floor votes AND legislative actions
  let votingContext = '';
  
  // Add floor votes first (highest priority - actual roll call votes)
  if (relevantStoredVotes.filter(v => v.action_type === 'floor_vote').length > 0) {
    const actualFloorVotes = relevantStoredVotes.filter(v => v.action_type === 'floor_vote');
    const floorVotesText = actualFloorVotes.slice(0, 20).map(v => 
      `- VOTED ${v.position.toUpperCase()} on "${v.bill_name.slice(0, 80)}" (${v.date.slice(0, 10)}) [${v.topic}]`
    ).join('\n');
    votingContext += `ROLL CALL FLOOR VOTES (Actual Congressional Votes - HIGHEST PRIORITY):\n${floorVotesText}\n\n`;
  }
  
  // Add legislative actions (sponsored/cosponsored)
  const legislativeActionVotes = relevantStoredVotes.filter(v => 
    v.action_type === 'sponsored' || v.action_type === 'cosponsored' || !v.action_type
  );
  if (legislativeActionVotes.length > 0) {
    const actionsText = legislativeActionVotes.slice(0, 20).map(v => 
      `- ${(v.position || v.action_type || 'Sponsored').toUpperCase()} "${v.bill_name.slice(0, 80)}" (${v.date.slice(0, 10)}) [${v.topic}]`
    ).join('\n');
    votingContext += `LEGISLATIVE ACTIONS (Bills Sponsored/Cosponsored):\n${actionsText}\n\n`;
  }
  
  // Add Congress.gov API records as supplementary
  if (votingRecord.length > 0) {
    const sponsoredText = votingRecord.slice(0, 15).map(v => 
      `- ${v.action} ${v.type}${v.number} (${v.policy_area}) — ${v.title.slice(0, 60)}`
    ).join('\n');
    votingContext += `ADDITIONAL SPONSORED LEGISLATION (Congress.gov):\n${sponsoredText}`;
  }

  const systemPrompt = `You are a political analyst mapping SPECIFIC voting records to question positions.

EVIDENCE PRIORITY (use in this order):
1. ROLL CALL FLOOR VOTES are the HIGHEST quality evidence - an actual Yea/Nay vote shows exactly where they stand
2. LEGISLATIVE ACTIONS (sponsored/cosponsored bills) are strong evidence - sponsoring shows active support
3. If no relevant evidence, return 0 with confidence "low"

Do NOT guess or infer beyond the documented votes/sponsorships.
If no voting record directly relates to a question, return 0 with confidence "low" and description "No relevant voting record found".

CRITICAL SCORING INSTRUCTIONS:
- Each question has specific answer OPTIONS with assigned values (-10, -5, 0, +5, +10)
- You MUST use the answer_value that corresponds to the position shown by the voting evidence
- READ THE OPTIONS CAREFULLY: The same value (e.g., +10) means different things for different questions!

BILL INTENT ANALYSIS - What does sponsoring a bill mean?
- "Equality Act", "Protection Act", "Rights Act" = SUPPORT for those rights → use the "support" option value
- "Disapproving the rule..." = OPPOSITION to that rule  
- "Prohibiting...", "Banning..." = OPPOSITION to the subject
- "No [X] for [Y]" = OPPOSITION to X (e.g., "No Place for LGBTQ+ Hate Act" = SUPPORTS LGBTQ+ protections)
- Sponsoring a pro-LGBTQ+ bill = supports LGBTQ+ rights → if question asks about protections, use the "support protections" option

EXAMPLE:
- Question: "Should there be federal protections for LGBTQ+?"  
- Options: -10="Strongly oppose", +10="Strongly support"
- Evidence: "Cosponsored Equality Act, No Place for LGBTQ+ Hate Act"
- These are PRO-protection bills → candidate SUPPORTS protections → use +10

Use "high" confidence only when citing clear floor votes or direct sponsorship.`;

  const userPrompt = `Official: ${candidateName} (${candidateParty}) - ${candidateOffice}, ${candidateState}

VOTING RECORD (prioritize floor votes, then sponsored legislation):
${votingContext}

Questions:
${questionsText}

Return ONLY JSON array: [{question_id, answer_value, confidence, source_description}]
- question_id MUST be one of: ${validIdsStr}
- answer_value must be -10, -5, 0, 5, or 10
- confidence: "high" when tied to a specific floor vote or bill sponsorship, otherwise "low" with answer_value 0
- source_description: cite exact floor votes (e.g., "Voted Yea on...") or bills (e.g., "Sponsored H.R.1234...") with dates. Use "No relevant voting record found" when none apply. No URLs.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    console.error('AI voting record error:', response.status);
    return [];
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || '';
  let parsed: any[] = [];

  if (content) {
    try { parsed = parseAIResponse(content); } catch (e) { parsed = []; }
  }

  if (parsed.length === 0) return [];

  return parsed
    .map((item: any) => {
      const questionId = String(item.question_id || '').replace(/[\[\]]/g, '');
      if (!validQuestionIds.includes(questionId)) return null;

      const sourceDesc = smartTruncate(item.source_description || 'No relevant voting record found', 1000);
      const answerValue = snapToValidValue(item.answer_value);
      const confidence = item.confidence === 'high' ? 'high' : 'low';

      // Find matching bill URL if referenced
      let sourceUrl: string | null = null;
      let sourceTitle: string | undefined;
      const billInfo = extractBillInfo(sourceDesc);
      if (billInfo) {
        const matchingBill = votingRecord.find(
          v => v.type.toUpperCase() === billInfo.type && v.number === billInfo.number
        );
        const congress = matchingBill?.congress || 118;
        sourceUrl = buildBillUrl(billInfo.type, billInfo.number, congress);
        sourceTitle = matchingBill?.title;
      } else {
        sourceUrl = congressGovUrl;
      }

      const urlList = sourceUrl ? [sourceUrl] : [];
      const titleList = sourceTitle ? [sourceTitle] : [];

      return {
        question_id: questionId,
        answer_value: answerValue,
        source_description: sourceDesc,
        source_url: sourceUrl,
        source_urls: urlList,
        source_titles: titleList,
        source_type: 'voting_record',
        confidence,
        evidence_type: 'voting_record' as const,
        voting_record_summary: sourceTitle,
        public_statement_summary: undefined,
        has_discrepancy: false,
        discrepancy_note: undefined,
      } as GeneratedAnswer;
    })
    .filter((a: GeneratedAnswer | null): a is GeneratedAnswer => {
      if (!a) return false;
      const desc = a.source_description?.toLowerCase() || '';
      return !(a.answer_value === 0 && desc.includes('no relevant voting record'));
    });
}

/**
 * PHASE 3: AI Inference with educational reasoning
 * Mirrors the party answer flow - provides detailed 2-3 sentence explanations
 * of WHY a candidate would hold a position based on party ideology
 */
async function inferCandidatePosition(
  question: Question,
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  relatedAnswers: GeneratedAnswer[]
): Promise<{ score: number; reasoning: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  
  const partyLower = candidateParty.toLowerCase();
  
  // Build options string for the question
  let optionsContext = '';
  if (question.question_options && question.question_options.length > 0) {
    const sortedOptions = [...question.question_options].sort((a, b) => a.value - b.value);
    optionsContext = `\nQUESTION OPTIONS (use these values):\n${sortedOptions.map(opt => `  (${opt.value}) ${opt.text}`).join('\n')}`;
  }
  
  const systemPrompt = `You are a political analyst inferring a candidate's likely position on a topic where no explicit documentation exists.

IMPORTANT: This is an INFERENCE based on general party ideology and related positions, NOT a documented fact.

CRITICAL: Use the QUESTION OPTIONS to determine the correct answer_value:
1. Read the question and its OPTIONS carefully
2. Determine what position a typical member of this party would take
3. Select the answer_value from the OPTIONS that matches that position
4. DO NOT assume -10 = progressive or +10 = conservative - read the actual option text!

Party Tendencies (use to determine which OPTION to select):
- Democrats typically: support government programs, support regulations, favor progressive social policies, favor environmental protection, support worker protections, support civil rights expansions
- Republicans typically: favor smaller government, support deregulation, favor traditional values, support free markets, favor states' rights, support religious liberty
- Libertarians typically: favor minimal government, support individual liberty, favor free markets, oppose intervention

EXAMPLE:
- Question: "Should there be federal protections for LGBTQ+ individuals?"
- Options: -10="Strongly oppose", 0="Neutral", +10="Strongly support"
- For a Democrat → typically support protections → use +10
- For a Republican → typically oppose federal mandate → use -10

Only return 0 if you truly cannot make a reasonable inference based on general party ideology.`;

  const relatedContext = relatedAnswers.length > 0 
    ? `\nRelated positions from this candidate that were documented:\n${relatedAnswers.slice(0, 3).map(a => `- Score ${a.answer_value}: ${a.source_description?.slice(0, 100)}`).join('\n')}`
    : '';

  const userPrompt = `Based on ${candidateName}'s party affiliation (${candidateParty}) and general party ideology, what would their likely position be on this question:

"${question.text}"
${optionsContext}
${relatedContext}

IMPORTANT: Use the answer_value from the OPTIONS that matches what a typical ${candidateParty} would choose.

Return ONLY a JSON object: {"score": <value from options>, "reasoning": "<2-3 sentence explanation of WHY this ${candidateParty} ${candidateOffice.toLowerCase()} would likely hold this position, referencing core party values, guiding principles, or how representatives from their party typically vote on this issue>"}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.error(`[AIInference] API error: ${response.status}`);
      return null;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: snapToValidValue(parsed.score || 0),
        reasoning: parsed.reasoning || 'Position inferred from party ideology.'
      };
    }
  } catch (e) {
    console.error('[AIInference] Parse error:', e);
  }
  
  return null;
}

/**
 * Search for direct statements from the candidate on social media, interviews, articles
 * Uses Gemini with Google Search grounding to find direct quotes
 */
async function searchCandidateStatements(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  question: Question
): Promise<{
  found: boolean;
  score: number;
  description: string;
  sourceUrls: string[];
  sourceTitles: string[];
  evidenceType: 'public_statement' | 'social_media' | null;
}> {
  if (!GOOGLE_GEMINI_API_KEY) {
    return { found: false, score: 0, description: '', sourceUrls: [], sourceTitles: [], evidenceType: null };
  }

  // Build options context for the prompt
  let optionsContext = '';
  if (question.question_options && question.question_options.length > 0) {
    const sortedOptions = [...question.question_options].sort((a, b) => a.value - b.value);
    optionsContext = `\nQUESTION OPTIONS (use these answer_values):\n${sortedOptions.map(opt => `  (${opt.value}) ${opt.text}`).join('\n')}`;
  }

  const searchPrompt = `Search for DIRECT STATEMENTS by ${candidateName} (${candidateParty} ${candidateOffice} from ${candidateState}) on this specific topic: "${question.text}"
${optionsContext}

PRIORITY SOURCES (in order):
1. Social media posts (X/Twitter, Facebook, Instagram) where they directly address this
2. Video interviews or podcasts (local news, town halls) where they state their position
3. Op-eds or articles WRITTEN BY ${candidateName}
4. Direct quotes in news articles where they specifically address this issue
5. Campaign website or official press releases

REQUIREMENTS:
- Must be a DIRECT QUOTE or clear statement from the candidate themselves
- Not a summary or interpretation by a journalist (unless directly quoting the candidate)
- Recent statements preferred (2022-2025)
- Provide the actual quote if possible

If you find a direct statement, respond with JSON:
{
  "found": true,
  "quote": "<the actual quote or clear paraphrase of their statement>",
  "source_type": "social_media" | "interview" | "op_ed" | "news_quote" | "campaign",
  "answer_value": <the value from the OPTIONS that best matches their stated position>
}

CRITICAL: Use the answer_value from the OPTIONS list that matches what the candidate stated.
For example, if options show "+10 = Strongly support" and they expressed strong support, use 10.

If NO direct statement can be found from the candidate on this specific topic, respond with:
{"found": false}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: searchPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
      }
    );

    if (!response.ok) {
      console.error(`[StatementSearch] API error: ${response.status}`);
      return { found: false, score: 0, description: '', sourceUrls: [], sourceTitles: [], evidenceType: null };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract grounding metadata for sources
    const groundingMeta = data.candidates?.[0]?.groundingMetadata;
    const groundingChunks = groundingMeta?.groundingChunks || [];
    
    // Parse the response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return { found: false, score: 0, description: '', sourceUrls: [], sourceTitles: [], evidenceType: null };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.found) {
      return { found: false, score: 0, description: '', sourceUrls: [], sourceTitles: [], evidenceType: null };
    }
    
    // Use the answer_value directly from the AI response (now option-aware)
    // Fallback to old position_lean logic for backwards compatibility
    let score = 0;
    if (typeof parsed.answer_value === 'number') {
      score = parsed.answer_value;
    } else if (parsed.position_lean === 'progressive') {
      score = parsed.strength === 'strong' ? -10 : -5;
    } else if (parsed.position_lean === 'conservative') {
      score = parsed.strength === 'strong' ? 10 : 5;
    }
    
    // Build description - use smart truncation for quotes
    const description = parsed.quote 
      ? `${candidateName} stated: "${smartTruncate(parsed.quote, 800)}"` 
      : `${candidateName} has expressed a position on this issue.`;
    
    // Extract source URLs from grounding
    const sourceUrls: string[] = [];
    const sourceTitles: string[] = [];
    
    for (const chunk of groundingChunks) {
      if (chunk.web?.uri && !isBlockedDomain(chunk.web.uri)) {
        const resolvedUrl = await resolveRedirectUrl(chunk.web.uri);
        if (!sourceUrls.includes(resolvedUrl)) {
          sourceUrls.push(resolvedUrl);
          sourceTitles.push(chunk.web.title || extractDomainName(resolvedUrl));
        }
      }
      if (sourceUrls.length >= 3) break;
    }
    
    // Determine evidence type
    const isSocialMedia = parsed.source_type === 'social_media' || 
                          sourceUrls.some(url => isSocialMediaDomain(url));
    const evidenceType: 'public_statement' | 'social_media' = isSocialMedia ? 'social_media' : 'public_statement';
    
    console.log(`[StatementSearch] Found ${evidenceType} for "${question.text.slice(0, 50)}...": score=${score}`);
    
    return {
      found: true,
      score: snapToValidValue(score),
      description: smartTruncate(description, 1000),
      sourceUrls,
      sourceTitles,
      evidenceType,
    };
  } catch (e) {
    console.error('[StatementSearch] Error:', e);
    return { found: false, score: 0, description: '', sourceUrls: [], sourceTitles: [], evidenceType: null };
  }
}

/**
 * PHASE 3 ENHANCED: Search for statements before falling back to pure ideology inference
 * This runs for questions that remain unresolved after voting record and web research phases
 */
async function inferWithResearch(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[],
  relatedAnswers: GeneratedAnswer[] = []
): Promise<GeneratedAnswer[]> {
  const results: GeneratedAnswer[] = [];
  const MAX_STATEMENT_SEARCHES = 10;
  let statementSearchCount = 0;
  
  for (const q of questions) {
    let answer: GeneratedAnswer | null = null;
    
    // Step 1: Try targeted statement search (limited to avoid slowdowns)
    if (statementSearchCount < MAX_STATEMENT_SEARCHES) {
      const statementSearch = await searchCandidateStatements(
        candidateName, candidateParty, candidateOffice, candidateState, q
      );
      statementSearchCount++;
      
      if (statementSearch.found && statementSearch.score !== 0) {
        // Found a direct statement! Use it instead of pure ideology inference
        answer = {
          question_id: q.id,
          answer_value: statementSearch.score,
          source_description: statementSearch.description,
          source_url: statementSearch.sourceUrls[0] || null,
          source_urls: statementSearch.sourceUrls,
          source_titles: statementSearch.sourceTitles,
          source_type: statementSearch.evidenceType === 'social_media' ? 'public_statement' : 'public_statement',
          confidence: 'medium' as const, // Upgrade from 'low' since we found a source
          evidence_type: statementSearch.evidenceType || 'public_statement',
          voting_record_summary: undefined,
          public_statement_summary: smartTruncate(statementSearch.description, 300),
          has_discrepancy: false,
          discrepancy_note: undefined,
        };
        console.log(`[Phase3+Research] Found direct statement for ${q.id}: score=${answer.answer_value}`);
      }
      
      // Rate limit between statement searches
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Step 2: Fall back to pure ideology inference if no statement found
    if (!answer) {
      const inference = await inferCandidatePosition(
        q, candidateName, candidateParty, candidateOffice, candidateState, relatedAnswers
      );
      
      if (inference && inference.score !== 0) {
        answer = {
          question_id: q.id,
          answer_value: inference.score,
          source_description: smartTruncate(inference.reasoning, 1000),
          source_url: null,
          source_urls: [],
          source_titles: [],
          source_type: 'other',
          confidence: 'low' as const,
          evidence_type: 'inferred' as const,
          voting_record_summary: undefined,
          public_statement_summary: undefined,
          has_discrepancy: false,
          discrepancy_note: undefined,
        };
      } else {
        // No position can be inferred
        answer = {
          question_id: q.id,
          answer_value: 0,
          source_description: 'No documented position found and insufficient context for inference.',
          source_url: null,
          source_urls: [],
          source_titles: [],
          source_type: 'other',
          confidence: 'low' as const,
          evidence_type: 'inferred' as const,
          voting_record_summary: undefined,
          public_statement_summary: undefined,
          has_discrepancy: false,
          discrepancy_note: undefined,
        };
      }
      
      // Small delay between inference calls
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    results.push(answer);
  }

  console.log(`[Phase3+Research] Processed ${questions.length} questions: ${statementSearchCount} statement searches, ${results.filter(r => r.evidence_type !== 'inferred').length} found via research`);
  return results;
}

async function generateChunkAnswers(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  candidateId: string,
  questions: Question[],
  votingRecord: LegislationRecord[],
  researchResults: Map<string, GroundingResult>
): Promise<GeneratedAnswer[]> {
  const isCongressional = isBioguideId(candidateId) && isCongressionalOffice(candidateOffice);
  const congressGovUrl = isCongressional ? buildCongressGovProfileUrl(candidateId, candidateName) : null;
  const validQuestionIds = questions.map(q => q.id);
  const validIdsStr = validQuestionIds.join(', ');

  // Build questions with research context
  const questionsText = questions.map((q, i) => {
    const research = researchResults.get(q.id);
    let questionStr = `Question ${i + 1}:\n  ID: "${q.id}"\n  Text: ${q.text}`;
    
    if (research?.success && research.researchText) {
      // Show more research context (1500 chars instead of 400) to help AI understand evidence
      questionStr += `\n  RESEARCH: ${research.researchText.slice(0, 1500)}`;
      if (research.sourceUrls.length > 0) {
        questionStr += `\n  SOURCES: ${research.sourceUrls.slice(0, 4).join(', ')}`;
      }
    }
    
    if (q.question_options && q.question_options.length > 0) {
      const sortedOptions = [...q.question_options].sort((a, b) => a.value - b.value);
      const optionsStr = sortedOptions.map(opt => `    (${opt.value}) ${opt.text}`).join('\n');
      questionStr += `\n  Options:\n${optionsStr}`;
    }
    return questionStr;
  }).join('\n\n');

  // Voting record context
  let votingContext = '';
  if (isCongressional && votingRecord.length > 0) {
    const relevantBills = votingRecord.slice(0, 30);
    votingContext = `\n\nLEGISLATIVE RECORD:
${relevantBills.map(v => `- ${v.action} ${v.type}${v.number}: "${v.title.slice(0, 60)}" (${v.policy_area})`).join('\n')}`;
  }

const systemPrompt = `You are a non-partisan political analyst scoring candidate positions based on RESEARCH and VOTING RECORDS provided.

CRITICAL SCORING INSTRUCTIONS - READ CAREFULLY:
- Each question has SPECIFIC OPTIONS with assigned values (-10, -5, 0, +5, +10)
- You MUST use the answer_value that matches the candidate's position as shown by the evidence
- DO NOT use a generic progressive/conservative scale - the meaning of each value varies by question!

EXAMPLES OF QUESTION-SPECIFIC SCORING:
- Question: "Should there be federal protections for X?" 
  - Options might be: -10 = "Strongly oppose protections" ... +10 = "Strongly support protections"
  - If candidate sponsored pro-protection bills → use +10
  - If candidate voted against protections → use -10
  
- Question: "Should the government regulate X?"
  - Options might be: -10 = "No regulation" ... +10 = "Strong regulation"  
  - If candidate opposes regulation → use -10
  - If candidate supports regulation → use +10

BILL INTENT ANALYSIS - Understand what sponsoring a bill means:
- "Equality Act", "Protection Act", "Rights Act" = SUPPORT for those rights (use the supporting option value)
- "Disapproving the rule..." = OPPOSITION to that rule
- "Prohibiting..." = OPPOSITION to the subject
- "No [X] for [Y]" = OPPOSITION to X

EVIDENCE PRIORITY:
1. Individual voting records and bill sponsorships (highest priority)
2. Official statements and campaign positions
3. Party voting patterns (only when individual evidence is sparse)

ONLY use values: -10, -5, 0, +5, or +10 from the OPTIONS provided. Return ONLY valid JSON array.`;

  const userPrompt = `Official: ${candidateName} (${candidateParty}) - ${candidateOffice}, ${candidateState}
${votingContext}

VALID QUESTION IDs: [${validIdsStr}]

Questions with Research:
${questionsText}

Return JSON array: [{question_id, answer_value, confidence, source_description}, ...]
- question_id: REQUIRED - Must be one of: ${validIdsStr}
- answer_value: -10, -5, 0, 5, or 10 (Use 0 when no evidence)
- confidence: "high" (specific evidence), "medium" (inferred), "low" (no evidence - must be 0)
- source_description: REQUIRED detailed affirmative position statement (100-300 words). Format: "[Name] [supports/opposes] [specific policy]. [Evidence: specific bill references, voting dates, statement quotes, or policy actions]." DO NOT include URLs, domain names, or website addresses - links are displayed separately. Example: "Rep. Smith explicitly supports expanding federal gun background checks. She sponsored H.R. 8 (Universal Background Checks Act) and voted YES on the Bipartisan Background Checks Act in 2021. In floor remarks, Smith stated: 'We must close the loopholes that allow dangerous individuals to obtain firearms.' Her voting record shows consistent support for gun safety measures including the Assault Weapons Ban." Use "No documented position found" only when research shows no evidence.

ONLY JSON array. No markdown.`;

  const answerSchema = {
    type: "function",
    function: {
      name: "submit_answers",
      description: "Submit political position answers",
      parameters: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question_id: { type: "string" },
                answer_value: { type: "integer", enum: [-10, -5, 0, 5, 10] },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                source_description: { type: "string" }
              }
            }
          }
        },
        required: ["answers"]
      }
    }
  };

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: [answerSchema],
      tool_choice: { type: "function", function: { name: "submit_answers" } },
      max_tokens: 6000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI Gateway error:', response.status, errorText);
    if (response.status === 402 || response.status === 429) return [];
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const choice = aiResponse.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  const content = choice?.message?.content || '';

  let parsed: any[] = [];
  
  if (toolCalls && toolCalls.length > 0) {
    parsed = parseToolCallResponse(toolCalls);
  }
  
  if (parsed.length === 0 && content) {
    try { parsed = parseAIResponse(content); } catch (e) { return []; }
  }
  
  if (parsed.length === 0) return [];

  // Map empty question_ids by position
  const emptyIdCount = parsed.filter((item: any) => !item.question_id || String(item.question_id).trim() === '').length;
  if (emptyIdCount > 0) {
    const mappableCount = Math.min(parsed.length, questions.length);
    for (let idx = 0; idx < mappableCount; idx++) {
      if (!parsed[idx].question_id || String(parsed[idx].question_id).trim() === '') {
        parsed[idx].question_id = questions[idx].id;
      }
    }
  }

  return parsed.map((item: any) => {
    const questionId = String(item.question_id || '').replace(/[\[\]]/g, '');
    const research = researchResults.get(questionId);
    let sourceDesc = smartTruncate(item.source_description || 'No documented position', 1000);
    let lowerDesc = sourceDesc.toLowerCase();
    
    // PART B: Enforce score-description contract with source-aware logic
    // If score is non-zero but description says "no documented position", check if we have grounding sources
    let answerValue = snapToValidValue(item.answer_value);
    const isContradictory = answerValue !== 0 && lowerDesc.includes('no documented position');
    const hasGroundingSources = research?.sourceUrls && research.sourceUrls.length > 0;
    
    if (isContradictory) {
      if (hasGroundingSources && research?.researchText) {
        // REPAIR: Replace "no documented position" with actual evidence from grounding research
        console.log(`[Contract] Repairing description for ${questionId} - grounding found ${research.sourceUrls.length} sources`);
        
        // Clean up the research text to use as description
        let repairedDesc = research.researchText;
        // Remove "EVIDENCE FOUND:" prefix if present
        repairedDesc = repairedDesc.replace(/^EVIDENCE FOUND:\s*/i, '');
        // Remove raw URLs (UI shows them separately)
        repairedDesc = repairedDesc.replace(/https?:\/\/\S+/g, '');
        // Clean up extra whitespace
        repairedDesc = repairedDesc.replace(/\s+/g, ' ').trim();
        // Truncate to reasonable length
        repairedDesc = smartTruncate(repairedDesc, 1000);
        
        if (repairedDesc.length > 50) {
          sourceDesc = repairedDesc;
          lowerDesc = sourceDesc.toLowerCase();
          console.log(`[Contract] Repaired description: "${sourceDesc.slice(0, 100)}..."`);
        }
        // Don't reset answerValue - keep it and use the sources
      } else if (hasGroundingSources) {
        // Have sources but no research text - keep the sources anyway
        console.log(`[Contract] Keeping score ${answerValue} for ${questionId} - grounding found ${research!.sourceUrls.length} sources`);
      } else {
        console.log(`[Contract] Contradictory output for ${questionId}: score ${answerValue} but "no documented position" with no sources -> routing to inference`);
        answerValue = 0; // Will be picked up by post-validation inference
      }
    }
    
    // Determine if truly no position found (used for source cleanup)
    // Only mark as "no position" if BOTH description says so AND no grounding sources
    const noPositionFound = (lowerDesc.includes('no documented position') && !hasGroundingSources) ||
                             (item.confidence === 'low' && !hasGroundingSources);
    
    // Determine source URL and titles: research > bill > congress profile > null
    let sourceUrl = noPositionFound ? null : congressGovUrl;
    let sourceUrls: string[] = [];
    let sourceTitles: string[] = [];
    
    if (!noPositionFound) {
      if (research?.sourceUrls && research.sourceUrls.length > 0) {
        sourceUrls = research.sourceUrls;
        sourceTitles = research.sourceTitles || [];
        sourceUrl = research.sourceUrls[0];
      } else if (isCongressional) {
        const billInfo = extractBillInfo(sourceDesc);
        if (billInfo) {
          const matchingBill = votingRecord.find(
            v => v.type.toUpperCase() === billInfo.type && v.number === billInfo.number
          );
          const congress = matchingBill?.congress || 118;
          sourceUrl = buildBillUrl(billInfo.type, billInfo.number, congress);
        }
      }
    } else if (research?.sourceUrls?.length) {
      console.log(`[Source Cleanup] Clearing ${research.sourceUrls.length} irrelevant sources for ${questionId} (no position found)`);
    }
    
    // Apply score consistency validation - adjust 0 scores if evidence suggests otherwise
    const hasValidSource = sourceDesc && 
      !lowerDesc.includes('no documented') &&
      sourceDesc.length > 10;
    
    if (hasValidSource) {
      answerValue = validateScoreConsistency(answerValue, sourceDesc);
    }
    
    // PART C: Determine evidence type based on FINAL stored URLs (post-cleanup)
    const hasVotingRecord = isCongressional && votingRecord.length > 0;
    const descLowerClean = sourceDesc.toLowerCase();
    
    // Check for actual floor vote citations
    const hasFloorVoteCitation = descLowerClean.includes('voted yea') || 
                                  descLowerClean.includes('voted nay') || 
                                  descLowerClean.includes('voted yes') || 
                                  descLowerClean.includes('voted no');
    const hasSponsorshipCitation = descLowerClean.includes('sponsored') || descLowerClean.includes('cosponsored');
    
    // Check if stored sources are from social media (use FINAL sourceUrls, not research)
    const hasSocialMediaSource = sourceUrls.some(url => isSocialMediaDomain(url));
    const hasStoredUrls = sourceUrls.length > 0;
    
    // Evidence type based on FINAL stored URLs
    let evidenceType: 'voting_record' | 'public_statement' | 'social_media' | 'inferred' | 'mixed' = 'inferred';
    
    if (hasFloorVoteCitation) {
      evidenceType = 'voting_record';
    } else if (hasSponsorshipCitation && hasVotingRecord) {
      evidenceType = 'voting_record';
    } else if (hasStoredUrls && hasSocialMediaSource) {
      evidenceType = 'social_media';
    } else if (hasStoredUrls) {
      evidenceType = 'public_statement';
    } else {
      // No stored URLs = mark as inferred so Phase 3 can provide ideology-based reasoning
      evidenceType = 'inferred';
    }
    
    // Fix source_type - set based on actual source, not just being congressional
    let sourceType = 'web_research';
    if (hasFloorVoteCitation || hasSponsorshipCitation) {
      sourceType = 'voting_record';
    } else if (hasStoredUrls) {
      sourceType = 'public_statement';
    }
    
    // Build voting record summary if available
    let votingRecordSummary: string | undefined;
    if (hasVotingRecord) {
      const relevantBills = votingRecord.filter(v => {
        const policyArea = v.policy_area?.toLowerCase() || '';
        return policyArea.includes(questionId.slice(0, 3).toLowerCase());
      }).slice(0, 3);
      if (relevantBills.length > 0) {
        votingRecordSummary = relevantBills.map(b => `${b.action} ${b.type}${b.number}`).join(', ');
      }
    }
    
    return {
      question_id: questionId,
      answer_value: answerValue,
      source_description: sourceDesc,
      source_url: sourceUrl,
      source_urls: sourceUrls,
      source_titles: sourceTitles,
      source_type: sourceType,
      confidence: item.confidence || 'medium',
      evidence_type: evidenceType,
      voting_record_summary: votingRecordSummary,
      public_statement_summary: research?.success ? research?.researchText?.slice(0, 200) : undefined,
      has_discrepancy: false,
      discrepancy_note: undefined,
    };
  });
}

// PART D: Validation converts unsourced non-zero to inferred instead of resetting to 0
function validateAnswerQuality(
  answers: GeneratedAnswer[],
  candidateParty: string
): { answers: GeneratedAnswer[]; convertedToInferredCount: number } {
  let convertedToInferredCount = 0;
  
  const validatedAnswers = answers.map(a => {
    // EXEMPT already-inferred answers - they are intentionally ideology-based
    if (a.evidence_type === 'inferred') {
      return a; // Keep inferred answers as-is
    }
    
    const hasValidSource = a.source_description && 
      !a.source_description.toLowerCase().includes('party platform') &&
      !a.source_description.toLowerCase().includes('typical') &&
      !a.source_description.toLowerCase().includes('no documented') &&
      a.source_description.length > 5;
    
    const hasStoredUrls = a.source_urls && a.source_urls.length > 0;
    
    // PART D: Instead of resetting to 0, convert to inferred with the existing score
    if (a.answer_value !== 0 && !hasValidSource && !hasStoredUrls && a.confidence !== 'high') {
      console.log(`[Validation] Converting unsourced answer for ${a.question_id} to inferred (keeping score ${a.answer_value})`);
      convertedToInferredCount++;
      return { 
        ...a, 
        evidence_type: 'inferred' as const, 
        confidence: 'low' as const, 
        source_description: smartTruncate(`Position inferred from ${candidateParty} party alignment. ${a.source_description}`, 1000),
        source_urls: [],
        source_titles: [],
      };
    }
    
    return a;
  });
  
  if (convertedToInferredCount > 0) {
    console.log(`[Validation] Converted ${convertedToInferredCount} unsourced answers to inferred`);
  }
  
  return { answers: validatedAnswers, convertedToInferredCount };
}

async function generateAnswersInChunks(
  supabase: any,
  candidateId: string,
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[],
  votingRecord: LegislationRecord[],
  floorVotes: StoredVote[] = [],
  legislativeActions: StoredVote[] = []
): Promise<{ generated: number; failed: number; validationConverted: number; researched: number }> {
  let totalGenerated = 0;
  let failedChunks = 0;
  let totalValidationConverted = 0;
  let totalResearched = 0;
  
  const allGeneratedAnswers: GeneratedAnswer[] = [];
  const hasGrounding = !!GOOGLE_GEMINI_API_KEY;
  
  const chunks: Question[][] = [];
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }
  
  // Combine floor votes and legislative actions for legacy code
  const storedVotes = [...floorVotes, ...legislativeActions];
  const hasVotingData = votingRecord.length > 0 || storedVotes.length > 0;
  console.log(`Processing ${questions.length} questions in ${chunks.length} chunks for ${candidateName}, grounding=${hasGrounding}, floorVotes=${floorVotes.length}, legislativeActions=${legislativeActions.length}`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Generating chunk ${i + 1}/${chunks.length} (${chunk.length} questions)...`);
    const answersById = new Map<string, GeneratedAnswer>();
    
    try {
      // Phase 1: Voting record answers (highest priority) - use BOTH sponsored bills AND stored floor votes
      let votingAnswers: GeneratedAnswer[] = [];
      if (isBioguideId(candidateId) && isCongressionalOffice(candidateOffice) && hasVotingData) {
        votingAnswers = await generateVotingRecordAnswers(
          candidateName, candidateParty, candidateOffice, candidateState,
          candidateId, chunk, votingRecord, storedVotes
        );
        votingAnswers.forEach(a => answersById.set(a.question_id, a));
        if (votingAnswers.length > 0) {
          console.log(`[Phase1] ${votingAnswers.length} answers derived from voting record in chunk ${i + 1}`);
        }
      }

      // Phase 1.5 (NEW): Deep bill analysis for unanswered questions
      const phase1AnsweredIds = new Set(votingAnswers.filter(a => a.answer_value !== 0).map(a => a.question_id));
      const unansweredAfterPhase1 = chunk.filter(q => !phase1AnsweredIds.has(q.id));
      
      if (unansweredAfterPhase1.length > 0 && storedVotes.length > 0) {
        console.log(`[Phase1.5] Deep analyzing ${unansweredAfterPhase1.length} unanswered questions via bill summaries`);
        const deepAnswers = await analyzeVotesWithSummaries(
          candidateName, candidateParty, candidateId, unansweredAfterPhase1, storedVotes
        );
        for (const deepAnswer of deepAnswers) {
          if (deepAnswer.answer_value !== 0 && !answersById.has(deepAnswer.question_id)) {
            answersById.set(deepAnswer.question_id, deepAnswer);
            console.log(`[Phase1.5] Found match for ${deepAnswer.question_id} via bill summary`);
          }
        }
      }

      // Identify remaining questions needing research
      const questionsNeedingResearch = chunk.filter(q => !answersById.has(q.id));

      // Phase 2: Research with Gemini grounding (for unanswered questions)
      const researchResults = new Map<string, GroundingResult>();
      
      if (hasGrounding && questionsNeedingResearch.length > 0) {
        for (const q of questionsNeedingResearch) {
          const research = await researchCandidatePosition(
            candidateName, candidateOffice, candidateState, q.text, q.topic_id
          );
          researchResults.set(q.id, research);
          if (research.success) totalResearched++;
          
          // Rate limiting: 2 second delay for reliability
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Phase 2: Generate answers with research context
      let researchAnswers: GeneratedAnswer[] = [];
      if (questionsNeedingResearch.length > 0) {
        researchAnswers = await generateChunkAnswers(
          candidateName, candidateParty, candidateOffice, candidateState,
          candidateId, questionsNeedingResearch, votingRecord, researchResults
        );
        researchAnswers.forEach(a => {
          if (!answersById.has(a.question_id)) {
            answersById.set(a.question_id, a);
          }
        });
      }

      // Phase 3: AI inference for truly unresolved positions ONLY
      // CRITICAL: Only infer when:
      // 1. No answer exists at all, OR
      // 2. Answer is 0 AND has no sources AND description says "no documented"
      const unresolvedQuestions = chunk.filter(q => {
        const existing = answersById.get(q.id);
        if (!existing) return true;
        
        // If we have sources, don't overwrite with inference
        if (existing.source_urls && existing.source_urls.length > 0) {
          console.log(`[Phase3] Skipping ${q.id}: has ${existing.source_urls.length} sources`);
          return false;
        }
        
        // If answer has a non-zero value, don't infer
        if (existing.answer_value !== 0) {
          console.log(`[Phase3] Skipping ${q.id}: has non-zero value ${existing.answer_value}`);
          return false;
        }
        
        // Catch ANY evidence type with no actual content (including stale 'public_statement' with no sources)
        if (existing.answer_value === 0 && (!existing.source_urls || existing.source_urls.length === 0)) {
          console.log(`[Phase3] Will infer ${q.id}: ${existing.evidence_type} evidence with no value and no sources`);
          return true;
        }
        
        // Also infer if truly no position found in description
        const desc = existing.source_description?.toLowerCase() || '';
        const needsInference = desc.includes('no documented position') || 
                               desc.includes('no relevant voting record') ||
                               desc.length < 20;
        
        if (needsInference) {
          console.log(`[Phase3] Will infer ${q.id}: value=0, no sources, desc="${desc.slice(0, 50)}..."`);
        }
        return needsInference;
      });

      if (unresolvedQuestions.length > 0) {
        console.log(`[Phase3] Running inference for ${unresolvedQuestions.length} truly unresolved questions`);
        
        // Pass existing answers for context (helps inform inference with related positions)
        const existingAnswersForContext = Array.from(answersById.values());
        const inferredAnswers = await inferWithResearch(
          candidateName, candidateParty, candidateOffice, candidateState, 
          unresolvedQuestions, existingAnswersForContext
        );

        inferredAnswers.forEach(a => {
          const existing = answersById.get(a.question_id);
          // Double-check: never overwrite if existing has sources
          if (existing?.source_urls?.length) {
            console.log(`[Phase3] Preserving ${a.question_id}: existing has sources`);
            return;
          }
          if (!hasDocumentedPosition(existing)) {
            answersById.set(a.question_id, a);
          }
        });
      }

      const answers = Array.from(answersById.values());
      
      if (answers.length === 0) {
        failedChunks++;
        continue;
      }
      
      // Filter valid answers
      const chunkQuestionIds = chunk.map(q => q.id);
      const validAnswers = answers.filter(a => 
        a.question_id && a.question_id.trim() !== '' && chunkQuestionIds.includes(a.question_id)
      );
      
      // Deduplicate
      const deduplicatedAnswers = Array.from(
        validAnswers.reduce((map, answer) => {
          map.set(answer.question_id, answer);
          return map;
        }, new Map()).values()
      ) as GeneratedAnswer[];
      
      if (deduplicatedAnswers.length === 0) {
        failedChunks++;
        continue;
      }
      
      allGeneratedAnswers.push(...deduplicatedAnswers);

      // Valid source_type values per database constraint
      const validSourceTypes = ['voting_record', 'public_statement', 'campaign_website', 'interview', 'legislation', 'web_research', 'other'];
      
      const answersToInsert = deduplicatedAnswers.map(answer => ({
        candidate_id: candidateId,
        question_id: answer.question_id,
        answer_value: answer.answer_value,
        source_description: answer.source_description,
        source_url: answer.source_url,
        source_urls: answer.source_urls,
        source_titles: answer.source_titles,
        source_type: validSourceTypes.includes(answer.source_type || '') ? answer.source_type : 'other',
        confidence: answer.confidence,
        evidence_type: answer.evidence_type,
        voting_record_summary: answer.voting_record_summary,
        public_statement_summary: answer.public_statement_summary,
        has_discrepancy: answer.has_discrepancy,
        discrepancy_note: answer.discrepancy_note,
      }));

      const { error: insertError } = await supabase
        .from('candidate_answers')
        .upsert(answersToInsert, { onConflict: 'candidate_id,question_id', ignoreDuplicates: false });
      
      if (insertError) {
        console.error(`Error saving chunk ${i + 1}:`, insertError);
        failedChunks++;
      } else {
        totalGenerated += deduplicatedAnswers.length;
        console.log(`Saved chunk ${i + 1}: ${deduplicatedAnswers.length} answers (total: ${totalGenerated})`);
      }
      
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error(`Error processing chunk ${i + 1}:`, e);
      failedChunks++;
    }
  }
  
  // PART A & D: Validate answer quality - convert unsourced to inferred instead of resetting
  if (allGeneratedAnswers.length > 0) {
    const validationResult = validateAnswerQuality(allGeneratedAnswers, candidateParty);
    totalValidationConverted = validationResult.convertedToInferredCount;
    
    if (validationResult.convertedToInferredCount > 0) {
      // Re-run inference for answers that were converted to inferred with value 0
      const answersNeedingInference = validationResult.answers.filter(a => 
        a.evidence_type === 'inferred' && a.answer_value === 0
      );
      
      if (answersNeedingInference.length > 0) {
        console.log(`[PostValidation] Running inference for ${answersNeedingInference.length} answers that were reset`);
        
        // Get question objects for inference
        const questionsForInference = answersNeedingInference.map(a => ({
          id: a.question_id,
          text: a.source_description || '', // Use description as proxy for question text
          topic_id: 'unknown'
        }));
        
        const reInferredAnswers = await inferWithResearch(
          candidateName, candidateParty, candidateOffice, candidateState,
          questionsForInference as Question[],
          validationResult.answers.filter(a => a.answer_value !== 0)
        );
        
        // Merge re-inferred answers
        const answerMap = new Map(validationResult.answers.map(a => [a.question_id, a]));
        for (const inferred of reInferredAnswers) {
          if (inferred.answer_value !== 0) {
            answerMap.set(inferred.question_id, inferred);
          }
        }
        validationResult.answers = Array.from(answerMap.values());
      }
      
      // Valid source_type values per database constraint
      const validSourceTypesForValidation = ['voting_record', 'public_statement', 'campaign_website', 'interview', 'legislation', 'web_research', 'other'];
      
      const validatedToUpsert = validationResult.answers.map(a => ({
        candidate_id: candidateId,
        question_id: a.question_id,
        answer_value: a.answer_value,
        source_description: a.source_description,
        source_url: a.source_url,
        source_urls: a.source_urls,
        source_titles: a.source_titles,
        source_type: validSourceTypesForValidation.includes(a.source_type || '') ? a.source_type : 'other',
        confidence: a.confidence,
        evidence_type: a.evidence_type,
      }));
      
      await supabase
        .from('candidate_answers')
        .upsert(validatedToUpsert, { onConflict: 'candidate_id,question_id', ignoreDuplicates: false });
    }
  }
  
  return { generated: totalGenerated, failed: failedChunks, validationConverted: totalValidationConverted, researched: totalResearched };
}

async function updateCandidateScore(supabase: any, candidateId: string, candidateName: string): Promise<void> {
  const { data: allAnswers } = await supabase
    .from('candidate_answers')
    .select('answer_value')
    .eq('candidate_id', candidateId);
  
  if (!allAnswers || allAnswers.length === 0) return;
  
  const totalScore = allAnswers.reduce((sum: number, a: any) => sum + a.answer_value, 0);
  const overallScore = Math.round((totalScore / allAnswers.length) * 100) / 100;
  
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .maybeSingle();
  
  if (existingCandidate) {
    await supabase.from('candidates').update({ 
      overall_score: overallScore,
      last_answers_sync: new Date().toISOString(),
      answers_source: 'ai_generated'
    }).eq('id', candidateId);
    console.log(`Updated candidates.overall_score to ${overallScore} for ${candidateName}`);
  } else {
    await supabase.from('candidate_overrides').upsert({
      candidate_id: candidateId,
      overall_score: overallScore,
    }, { onConflict: 'candidate_id', ignoreDuplicates: false });
    console.log(`Saved candidate_overrides.overall_score ${overallScore} for ${candidateName}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      candidateId, questionIds, forceRegenerate = false,
      candidateName, candidateParty, candidateOffice, candidateState,
    } = await req.json();

    if (!candidateId) {
      return new Response(JSON.stringify({ error: 'candidateId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let existingAnswersQuery = supabase.from('candidate_answers').select('*').eq('candidate_id', candidateId);
    if (questionIds && questionIds.length > 0) {
      existingAnswersQuery = existingAnswersQuery.in('question_id', questionIds);
    }

    const { data: existingAnswers, error: existingError } = await existingAnswersQuery;
    if (existingError) throw existingError;

    const existingCount = existingAnswers?.length || 0;
    console.log(`Found ${existingCount} existing answers for ${candidateId}`);

    // Get candidate info
    let officialInfo: { id: string; name: string; party: string; office: string; state: string } | null = null;

    if (candidateName && candidateParty && candidateOffice && candidateState) {
      officialInfo = { id: candidateId, name: candidateName, party: candidateParty, office: candidateOffice, state: candidateState };
    } else {
      const { data: candidate } = await supabase.from('candidates').select('id, name, party, office, state').eq('id', candidateId).maybeSingle();
      if (candidate) officialInfo = candidate;
      else {
        const { data: staticOfficial } = await supabase.from('static_officials').select('id, name, party, office, state').eq('id', candidateId).maybeSingle();
        if (staticOfficial) officialInfo = staticOfficial;
      }
    }

    if (!officialInfo) {
      return new Response(JSON.stringify({ 
        error: 'Candidate not found', answers: existingAnswers || [],
        source: 'database', existing: existingCount, generated: 0, missingBefore: 0,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let questionsQuery = supabase.from('questions').select('id, text, topic_id, question_options(value, text)');
    if (questionIds && questionIds.length > 0) questionsQuery = questionsQuery.in('id', questionIds);

    const { data: questions, error: questionsError } = await questionsQuery;
    if (questionsError) throw questionsError;

    const totalQuestions = questions?.length || 0;
    if (totalQuestions === 0) {
      return new Response(JSON.stringify({ answers: [], source: 'none', existing: 0, generated: 0, missingBefore: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingQuestionIds = new Set((existingAnswers || []).map(a => a.question_id));
    const questionsToGenerate = forceRegenerate ? questions : questions.filter(q => !existingQuestionIds.has(q.id));
    const missingBefore = questionsToGenerate.length;
    
    if (missingBefore === 0) {
      return new Response(JSON.stringify({
        answers: existingAnswers || [], source: 'database',
        existing: existingCount, generated: 0, missingBefore: 0, totalQuestions,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Generating ${missingBefore} missing answers for ${officialInfo.name}...`);

    const isCongressional = isBioguideId(candidateId) && isCongressionalOffice(officialInfo.office);
    let votingRecord: LegislationRecord[] = [];
    let floorVotes: StoredVote[] = [];
    let legislativeActions: StoredVote[] = [];
    
    if (isCongressional) {
      console.log(`Fetching voting record for congressional member ${candidateId}...`);
      
      // Fetch BOTH: sponsored legislation from Congress.gov AND stored votes from database
      const [congressApiRecords, dbVotes] = await Promise.all([
        fetchMemberVotingRecord(candidateId),
        fetchStoredVotes(supabase, candidateId)
      ]);
      
      votingRecord = congressApiRecords;
      floorVotes = dbVotes.floorVotes;
      legislativeActions = dbVotes.legislativeActions;
      
      console.log(`Retrieved ${votingRecord.length} Congress API records + ${floorVotes.length} floor votes + ${legislativeActions.length} legislative actions`);
    }

    const { generated, failed, validationConverted, researched } = await generateAnswersInChunks(
      supabase, candidateId, officialInfo.name, officialInfo.party,
      officialInfo.office, officialInfo.state, questionsToGenerate, votingRecord, floorVotes, legislativeActions
    );
    
    if (validationConverted > 0) {
      console.log(`[Quality] ${validationConverted} answers converted to inferred`);
    }

    await updateCandidateScore(supabase, candidateId, officialInfo.name);

    const { data: finalAnswers } = await supabase.from('candidate_answers').select('*').eq('candidate_id', candidateId);

    return new Response(JSON.stringify({
      answers: finalAnswers || [],
      source: generated > 0 ? 'ai_generated' : 'database',
      existing: existingCount,
      generated,
      failed,
      researched,
      validationConverted,
      missingBefore,
      totalQuestions,
      groundingEnabled: !!GOOGLE_GEMINI_API_KEY,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in get-candidate-answers function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
