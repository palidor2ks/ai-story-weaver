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

// Blocked domains that should be filtered out
const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'conservapedia.com',
  'thefederalistpapers.org',
];

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(d => hostname.includes(d));
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

// Snap to valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Validate that the score is consistent with the source description.
 * If evidence clearly indicates progressive/conservative stance but score is 0, adjust it.
 */
function validateScoreConsistency(
  answerValue: number,
  sourceDescription: string
): number {
  // Only adjust neutral scores that have evidence suggesting a clear stance
  if (answerValue !== 0) return answerValue;
  
  const lowerDesc = sourceDescription.toLowerCase();
  
  // Skip if truly no evidence
  if (lowerDesc.includes('no documented') && lowerDesc.length < 50) {
    return answerValue;
  }
  
  // Progressive/left-leaning indicators (expanded for evidence-informed scoring)
  const progressiveIndicators = [
    'supports comprehensive',
    'supports universal',
    'supports expanding',
    'supports stricter',
    'supports increasing',
    'supports strengthening',
    'advocates for',
    'pushed for legislation',
    'strongly supports',
    'supports federal funding',
    'supports government-funded',
    'supports banning',
    'opposes restrictions',
    'opposes cuts to',
    'voted for',
    'sponsored',
    'cosponsored',
    // Evidence-informed indicators
    'generally supports',
    'typically supports',
    'party supports',
    'democrats support',
    'democratic party supports',
    'has advocated for',
    'favors expanding',
    'favors increasing',
    'supports protections for',
    'supports rights for',
    'supports access to',
  ];
  
  // Conservative/right-leaning indicators (expanded for evidence-informed scoring)
  const conservativeIndicators = [
    'opposes government',
    'opposes federal',
    'opposes regulations',
    'supports deregulation',
    'supports reducing',
    'supports limiting government',
    'supports state rights',
    'supports parental rights',
    'supports school choice',
    'supports second amendment',
    'opposes tax increases',
    'supports tax cuts',
    'supports traditional',
    'opposes abortion',
    'voted against',
    // Evidence-informed indicators
    'generally opposes',
    'typically opposes',
    'party opposes',
    'republicans support',
    'republican party supports',
    'has advocated against',
    'favors limiting',
    'favors reducing',
    'opposes mandates',
    'opposes requirements',
    'supports lower taxes',
  ];
  
  const hasProgressiveEvidence = progressiveIndicators.some(
    indicator => lowerDesc.includes(indicator)
  );
  
  const hasConservativeEvidence = conservativeIndicators.some(
    indicator => lowerDesc.includes(indicator)
  );
  
  // Only adjust if there's clear evidence one way and not the other
  if (hasProgressiveEvidence && !hasConservativeEvidence) {
    console.log(`[Consistency] Adjusting score: Progressive evidence with neutral score -> -5`);
    return -5;
  }
  
  if (hasConservativeEvidence && !hasProgressiveEvidence) {
    console.log(`[Consistency] Adjusting score: Conservative evidence with neutral score -> 5`);
    return 5;
  }
  
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

Look for:
- Voting records and bill sponsorships
- Official statements and speeches
- Campaign website policy positions
- News coverage of their stance
- How representatives from their party typically vote on this issue

Summarize specific evidence found. If the candidate lacks individual documentation but their party has a well-established position, note that pattern.`
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
    const source_description = srcMatch ? srcMatch[1].slice(0, 50) : 'Party position';
    
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
      questionStr += `\n  RESEARCH: ${research.researchText.slice(0, 400)}`;
      if (research.sourceUrls.length > 0) {
        questionStr += `\n  SOURCES: ${research.sourceUrls.slice(0, 2).join(', ')}`;
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

EVIDENCE-INFORMED SCORING APPROACH:
- Score based on ALL evidence in RESEARCH including:
  * Individual voting records and bill sponsorships
  * Official statements and campaign positions
  * How representatives from their party typically vote on this issue
  * Well-established party positions when individual evidence is sparse
- If research shows a clear directional lean (from individual OR party patterns), assign a score reflecting that lean
- Use 0 (neutral) ONLY when research shows genuine centrism, mixed positions, or truly unaddressed topics

SCORING SCALE:
- -10 = Strong Progressive/Left position
- -5 = Moderate Progressive/Left lean  
- 0 = Genuinely neutral, centrist, or mixed position
- +5 = Moderate Conservative/Right lean
- +10 = Strong Conservative/Right position

ASSIGNMENT LOGIC:
- Individual voting records take priority over party patterns
- When individual evidence is sparse, use party voting patterns as guidance
- "Party typically supports X" -> Use party tendency to inform score with confidence "medium"
- Only use 0 when evidence shows genuine neutrality or topic is unaddressed

ONLY use values: -10, -5, 0, +5, or +10. Return ONLY valid JSON array.`;

  const userPrompt = `Official: ${candidateName} (${candidateParty}) - ${candidateOffice}, ${candidateState}
${votingContext}

VALID QUESTION IDs: [${validIdsStr}]

Questions with Research:
${questionsText}

Return JSON array: [{question_id, answer_value, confidence, source_description}, ...]
- question_id: REQUIRED - Must be one of: ${validIdsStr}
- answer_value: -10, -5, 0, 5, or 10 (Use 0 when no evidence)
- confidence: "high" (specific evidence), "medium" (inferred), "low" (no evidence - must be 0)
- source_description: Brief citation from research or voting record

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
    const sourceDesc = (item.source_description || 'No documented position').slice(0, 50);
    
    // Determine source URL and titles: research > bill > congress profile > null
    let sourceUrl = congressGovUrl;
    let sourceUrls: string[] = [];
    let sourceTitles: string[] = [];
    
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
    
    // Apply score consistency validation - adjust 0 scores if evidence suggests otherwise
    let answerValue = snapToValidValue(item.answer_value);
    const hasValidSource = sourceDesc && 
      !sourceDesc.toLowerCase().includes('no documented') &&
      sourceDesc.length > 10;
    
    if (hasValidSource) {
      answerValue = validateScoreConsistency(answerValue, sourceDesc);
    }
    
    return {
      question_id: questionId,
      answer_value: answerValue,
      source_description: sourceDesc,
      source_url: sourceUrl,
      source_urls: sourceUrls,
      source_titles: sourceTitles,
      source_type: isCongressional ? 'voting_record' : 'web_research',
      confidence: item.confidence || 'medium',
    };
  });
}

function validateAnswerQuality(
  answers: GeneratedAnswer[]
): { answers: GeneratedAnswer[]; rejectedCount: number } {
  let rejectedCount = 0;
  
  const validatedAnswers = answers.map(a => {
    const hasValidSource = a.source_description && 
      !a.source_description.toLowerCase().includes('party platform') &&
      !a.source_description.toLowerCase().includes('typical') &&
      !a.source_description.toLowerCase().includes('no documented') &&
      a.source_description.length > 5;
    
    if (a.answer_value !== 0 && !hasValidSource && a.confidence !== 'high') {
      console.log(`[Validation] Resetting unsourced answer for ${a.question_id}: ${a.answer_value} -> 0`);
      rejectedCount++;
      return { ...a, answer_value: 0, confidence: 'low' as const, source_description: 'No documented position' };
    }
    
    return a;
  });
  
  if (rejectedCount > 0) {
    console.log(`[Validation] Reset ${rejectedCount} unsourced answers to neutral`);
  }
  
  return { answers: validatedAnswers, rejectedCount };
}

async function generateAnswersInChunks(
  supabase: any,
  candidateId: string,
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[],
  votingRecord: LegislationRecord[]
): Promise<{ generated: number; failed: number; validationRejected: number; researched: number }> {
  let totalGenerated = 0;
  let failedChunks = 0;
  let totalValidationRejected = 0;
  let totalResearched = 0;
  
  const allGeneratedAnswers: GeneratedAnswer[] = [];
  const hasGrounding = !!GOOGLE_GEMINI_API_KEY;
  
  const chunks: Question[][] = [];
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`Processing ${questions.length} questions in ${chunks.length} chunks for ${candidateName}, grounding=${hasGrounding}`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Generating chunk ${i + 1}/${chunks.length} (${chunk.length} questions)...`);
    
    try {
      // Phase 1: Research with Gemini grounding (for non-congressional or supplemental research)
      const researchResults = new Map<string, GroundingResult>();
      
      if (hasGrounding) {
        // For congressional members with voting records, only research questions without clear bill matches
        const needsResearch = !isBioguideId(candidateId) || votingRecord.length < 20;
        
        if (needsResearch) {
          for (const q of chunk) {
            const research = await researchCandidatePosition(
              candidateName, candidateOffice, candidateState, q.text, q.topic_id
            );
            researchResults.set(q.id, research);
            if (research.success) totalResearched++;
            
            // Rate limiting: 2 second delay for reliability
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // Phase 2: Generate answers with research context
      const answers = await generateChunkAnswers(
        candidateName, candidateParty, candidateOffice, candidateState,
        candidateId, chunk, votingRecord, researchResults
      );
      
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

      const answersToInsert = deduplicatedAnswers.map(answer => ({
        candidate_id: candidateId,
        question_id: answer.question_id,
        answer_value: answer.answer_value,
        source_description: answer.source_description,
        source_url: answer.source_url,
        source_urls: answer.source_urls,
        source_titles: answer.source_titles,
        source_type: answer.source_type,
        confidence: answer.confidence,
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
  
  // Validate answer quality
  if (allGeneratedAnswers.length > 0) {
    const validationResult = validateAnswerQuality(allGeneratedAnswers);
    totalValidationRejected = validationResult.rejectedCount;
    
    if (validationResult.rejectedCount > 0) {
      const validatedToUpsert = validationResult.answers.map(a => ({
        candidate_id: candidateId,
        question_id: a.question_id,
        answer_value: a.answer_value,
        source_description: a.source_description,
        source_url: a.source_url,
        source_urls: a.source_urls,
        source_titles: a.source_titles,
        source_type: a.source_type,
        confidence: a.confidence,
      }));
      
      await supabase
        .from('candidate_answers')
        .upsert(validatedToUpsert, { onConflict: 'candidate_id,question_id', ignoreDuplicates: false });
    }
  }
  
  return { generated: totalGenerated, failed: failedChunks, validationRejected: totalValidationRejected, researched: totalResearched };
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
    
    if (isCongressional) {
      console.log(`Fetching voting record for congressional member ${candidateId}...`);
      votingRecord = await fetchMemberVotingRecord(candidateId);
      console.log(`Retrieved ${votingRecord.length} legislative records`);
    }

    const { generated, failed, validationRejected, researched } = await generateAnswersInChunks(
      supabase, candidateId, officialInfo.name, officialInfo.party,
      officialInfo.office, officialInfo.state, questionsToGenerate, votingRecord
    );
    
    if (validationRejected > 0) {
      console.log(`[Quality] ${validationRejected} answers reset to neutral for lacking sources`);
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
      validationRejected,
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
