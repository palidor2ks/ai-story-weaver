import { createClient } from "npm:@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions background processing
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_CHAIN_HEADER = 'x-internal-chain-secret';

// Rate limiting for Perplexity
let perplexityCallCount = 0;
const PERPLEXITY_BATCH_LIMIT = 100;
const PERPLEXITY_DELAY_MS = 1200; // 1.2 seconds between calls

// =============================================================================
// BACKGROUND PROCESSING PROGRESS TRACKING
// =============================================================================

let globalProgress = {
  candidateId: '',
  candidateName: '',
  processed: 0,
  total: 0,
  startTime: 0,
  status: 'idle' as 'idle' | 'running' | 'completed' | 'error',
};

// Log progress on shutdown (helps debug if function is terminated early)
addEventListener('beforeunload', (ev: Event) => {
  const detail = (ev as unknown as { detail?: { reason?: string } }).detail;
  const elapsed = globalProgress.startTime 
    ? Math.round((Date.now() - globalProgress.startTime) / 1000) 
    : 0;
  console.log(`=== SHUTDOWN (${detail?.reason || 'unknown'}) ===`);
  console.log(`Candidate: ${globalProgress.candidateName} (${globalProgress.candidateId})`);
  console.log(`Progress: ${globalProgress.processed}/${globalProgress.total} questions`);
  console.log(`Elapsed: ${elapsed} seconds`);
  console.log(`Status: ${globalProgress.status}`);
});

// =============================================================================
// TRUSTED SOURCES - Expanded for comprehensive research
// =============================================================================

const TRUSTED_SOURCES = `
PRIORITY SOURCES (search in this order):

1. OFFICIAL GOVERNMENT SOURCES
   - Congress.gov voting records, bill sponsorships, cosponsored legislation
   - Official .gov websites (e.g., sullivan.senate.gov, pelosi.house.gov)
   - Committee hearing transcripts and floor speeches
   - C-SPAN archives and official video

2. OFFICIAL CAMPAIGN & PARTY SOURCES  
   - Campaign websites (e.g., joebiden.com, donaldtrump.com)
   - Party platforms (democrats.org, gop.com, lp.org, gp.org)
   - Press releases and official statements
   - DNC and RNC official positions

3. SOCIAL MEDIA (with direct quotes)
   - X/Twitter posts from verified official accounts
   - Facebook official pages
   - YouTube official channels (speeches, town halls)
   - Instagram official accounts

4. NEWS & JOURNALISM
   - Major news outlets (AP, Reuters, NYT, WSJ, Washington Post)
   - Local news interviews and coverage
   - Political news (Politico, The Hill, Roll Call, Axios)
   - NPR, PBS NewsHour

5. RESEARCH & ADVOCACY ORGANIZATIONS
   - OpenSecrets.org (campaign finance, voting scorecards)
   - Heritage Foundation (heritage.org)
   - Brookings Institution
   - Cato Institute
   - Center for American Progress
   - League of Conservation Voters
   - NRA scorecards
   - Planned Parenthood Action
   - ACLU scorecards
   - Chamber of Commerce ratings

6. SPECIALIZED POLITICAL DATABASES
   - Ballotpedia
   - VoteSmart.org
   - GovTrack.us
   - FiveThirtyEight
   - ProPublica Congress API
`;

// =============================================================================
// TYPES
// =============================================================================

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
  evidence_type: 'voting_record' | 'public_statement' | 'campaign_position' | 'social_media' | 'news_quote' | 'organization_scorecard' | 'inferred' | 'mixed';
  voting_record_summary?: string;
  public_statement_summary?: string;
  has_discrepancy?: boolean;
  discrepancy_note?: string;
}

interface PerplexityAnswer {
  answer_value: number;
  confidence: 'high' | 'medium' | 'low';
  evidence_type: string;
  source_description: string;
  primary_source?: { url: string; title: string; date?: string };
  additional_sources?: { url: string; title: string }[];
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) return text.slice(0, sentenceEnd + 1);
  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) return text.slice(0, lastSpace) + '...';
  return text.slice(0, maxLength - 3) + '...';
}

function extractKeyPhrase(questionText: string): string {
  let phrase = questionText
    .replace(/^(should (the )?(u\.?s\.?|federal government|congress|government|states?))/i, '')
    .replace(/^(do you (support|believe|think))/i, '')
    .replace(/^(what is your (position|view|stance) on)/i, '')
    .replace(/\?$/, '')
    .trim();
  
  if (phrase.length > 80) {
    const clauses = phrase.split(/,|;|\band\b|\bor\b/i);
    phrase = clauses[0].trim();
  }
  
  if (phrase.length > 60) {
    const words = phrase.split(' ').slice(0, 8);
    phrase = words.join(' ');
  }
  
  return phrase.slice(0, 60);
}

function buildOfficialSiteDomain(candidateName: string, candidateOffice: string): string | null {
  let lastName = candidateName.split(' ').pop()?.toLowerCase() || '';
  lastName = lastName.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  if (!lastName || lastName.length < 2) return null;
  
  const officeLower = candidateOffice.toLowerCase();
  if (officeLower.includes('senator') || officeLower.includes('senate')) {
    return `${lastName}.senate.gov`;
  } else if (officeLower.includes('representative') || officeLower.includes('house') || officeLower.includes('congress')) {
    return `${lastName}.house.gov`;
  }
  return null;
}

function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

function extractJsonFromText(text: string): any | null {
  // Handle extremely long responses - trim to essential content first
  let workingText = text;
  if (text.length > 50000) {
    console.log(`[JSON Extract] Large response (${text.length} chars), attempting to extract JSON subset`);
    // Find the JSON object boundaries and extract just that section
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      workingText = text.slice(jsonStart, jsonEnd + 1);
      console.log(`[JSON Extract] Trimmed to ${workingText.length} chars`);
    }
  }

  // Try direct parse first (for clean JSON responses)
  try {
    return JSON.parse(workingText);
  } catch {
    // Continue to extraction methods
  }

  // Try to find JSON object in the text
  const jsonMatch = workingText.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*\n\n)/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue to other methods
    }
  }
  
  // Try to extract from markdown code blocks
  const codeBlockMatch = workingText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }
  
  // Look for JSON with required fields - more flexible matching for nested objects
  const structuredMatch = workingText.match(/\{[^{}]*"answer_value"\s*:\s*-?\d+[^{}]*"evidence_type"\s*:\s*"[^"]+"/);
  if (structuredMatch) {
    // Try to find the complete object by matching braces
    const startIdx = workingText.indexOf(structuredMatch[0]);
    let braceCount = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < workingText.length; i++) {
      if (workingText[i] === '{') braceCount++;
      if (workingText[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
    try {
      return JSON.parse(workingText.slice(startIdx, endIdx + 1));
    } catch {
      // Continue
    }
  }
  
  // Last resort: find any JSON-like structure with answer_value
  const anyJsonMatch = workingText.match(/\{[^{}]*"answer_value"[^{}]*\}/);
  if (anyJsonMatch) {
    try {
      return JSON.parse(anyJsonMatch[0]);
    } catch {
      // Give up
    }
  }
  
  return null;
}

// =============================================================================
// SMART EVIDENCE TYPE DETECTION (based on description content)
// =============================================================================

function detectEvidenceTypeFromDescription(description: string): GeneratedAnswer['evidence_type'] {
  if (!description) return 'inferred';
  
  const desc = description.toUpperCase();
  
  // Check for voting record indicators
  if (desc.includes('VOTED YEA') || desc.includes('VOTED NAY') || 
      desc.includes('VOTED FOR') || desc.includes('VOTED AGAINST') ||
      desc.includes('ROLL CALL') || desc.includes('VOTING RECORD') ||
      desc.match(/AFL-CIO|HERITAGE ACTION|LCV SCORE|NRA GRADE|ACLU SCORE/)) {
    return 'voting_record';
  }
  
  // Check for sponsorship indicators (also voting record evidence)
  if (desc.includes('SPONSORED') || desc.includes('CO-SPONSORED') ||
      desc.includes('COSPONSORED') || desc.includes('INTRODUCED') ||
      desc.match(/H\.R\.\s*\d+|S\.\s*\d+|H\.RES|S\.RES/)) {
    return 'voting_record';
  }
  
  // Check for organization scorecard indicators
  if (desc.match(/RATED|SCORED|GRADE[D]?|SCORECARD|% SCORE|RATING FROM|ACTION SCORE/)) {
    return 'organization_scorecard';
  }
  
  // Check for public statement indicators
  if (desc.includes('STATED') || desc.includes('SAID') || desc.includes('ANNOUNCED') ||
      desc.includes('DECLARED') || desc.includes('PRESS RELEASE') ||
      desc.includes('FLOOR SPEECH') || desc.includes('REMARKS') ||
      desc.includes('TESTIFIED') || desc.includes('STATEMENT')) {
    return 'public_statement';
  }
  
  // Check for campaign/website positions
  if (desc.includes('CAMPAIGN') || desc.includes('WEBSITE') || 
      desc.includes('PLATFORM') || desc.includes('POSITION PAGE') ||
      desc.includes('CAMPAIGN SITE') || desc.includes('OFFICIAL SITE')) {
    return 'campaign_position';
  }
  
  // Check for social media
  if (desc.includes('TWITTER') || desc.includes('X.COM') || desc.includes('TWEET') ||
      desc.includes('FACEBOOK') || desc.includes('INSTAGRAM') || desc.includes('POSTED ON')) {
    return 'social_media';
  }
  
  // Check for news/interview
  if (desc.includes('INTERVIEW') || desc.includes('TOWN HALL') ||
      desc.includes('REPORTED') || desc.includes('NEWS') || 
      desc.includes('TOLD REPORTERS') || desc.includes('IN AN INTERVIEW')) {
    return 'news_quote';
  }
  
  // Check for party alignment only (should be inferred)
  if (desc.includes('PARTY ALIGNMENT') || desc.includes('PARTY PLATFORM') ||
      desc.includes('BASED ON PARTY') || desc.includes('INFERRED FROM PARTY') ||
      desc.includes('NO DOCUMENTED POSITION') || desc.includes('NO DIRECT EVIDENCE')) {
    return 'inferred';
  }
  
  // If we got here but there's substantive content, it's likely mixed research
  if (desc.length > 100 && !desc.includes('INFERRED') && !desc.includes('PARTY AFFILIATION')) {
    return 'mixed';
  }
  
  return 'inferred';
}

// =============================================================================
// PERPLEXITY DEEP RESEARCH (PRIMARY RESEARCH ENGINE)
// =============================================================================

async function researchPositionWithPerplexity(
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question
): Promise<GeneratedAnswer | null> {
  if (!PERPLEXITY_API_KEY) {
    console.log('[Perplexity] API key not configured');
    return null;
  }

  if (perplexityCallCount >= PERPLEXITY_BATCH_LIMIT) {
    console.log('[Perplexity] Batch limit reached');
    return null;
  }

  perplexityCallCount++;
  
  const officialDomain = buildOfficialSiteDomain(candidateName, candidateOffice);
  const keyPhrase = extractKeyPhrase(question.text);
  
  // Build options context
  const optionsContext = question.question_options
    ?.sort((a, b) => a.value - b.value)
    .map(opt => `(${opt.value}) ${opt.text}`)
    .join('\n') || '';

  const topicName = question.topic_id?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'policy';

  const systemPrompt = `You are a political research analyst finding concrete evidence of elected officials' positions.

${TRUSTED_SOURCES}

EVIDENCE QUALITY HIERARCHY:
1. HIGH confidence: Roll call votes (Yea/Nay), bill sponsorships/cosponsorships, official .gov statements, floor speeches
2. MEDIUM confidence: Campaign statements, verified social media posts, news interviews with direct quotes, organization scorecards
3. LOW confidence: Party alignment inference, general party platform statements

CRITICAL EVIDENCE TYPE RULES (follow exactly):
- "voting_record": Use when you find roll call votes, bill sponsorships, cosponsored legislation, or organization voting scorecards (Heritage Action, AFL-CIO, LCV, NRA, ACLU, etc.)
- "organization_scorecard": Use when you find ratings/grades from advocacy organizations
- "public_statement": Use when you find official statements, floor speeches, press releases, or direct quotes from .gov sources
- "campaign_position": Use when you find campaign website positions or platform documents
- "social_media": Use when you find Twitter/X, Facebook, or social media posts
- "news_quote": Use when you find interview quotes or news article citations
- "inferred": ONLY use this if you found ZERO concrete evidence and must rely purely on party affiliation

DO NOT USE "inferred" if you found ANY votes, bills, statements, scorecards, or quotes!

OUTPUT RULES:
- Use the answer_value from the OPTIONS that matches the evidence found
- ALWAYS start source_description with evidence type in caps: "VOTED YEA on...", "SPONSORED...", "CO-SPONSORED...", "STATED...", "RATED by...", etc.
- Include specific bill numbers (H.R.XXX, S.XXX) when citing legislation
- Include dates when available
- If evidence shows SUPPORT for the policy, use the positive option value
- If evidence shows OPPOSITION, use the negative option value`;

  const userPrompt = `Research ${candidateName} (${candidateParty} ${candidateOffice}, ${candidateState}) position on this question:

TOPIC: ${topicName}
QUESTION: "${question.text}"

ANSWER OPTIONS (use these exact values):
${optionsContext}

${officialDomain ? `PRIORITY: Search ${officialDomain} first for official statements and press releases.` : ''}

SEARCH FOR ALL OF THESE (in order):
1. Roll call votes on related legislation (bill numbers, vote dates, Yea/Nay)
2. Bills they sponsored or cosponsored on this topic
3. Committee activity and hearing statements
4. Official statements from ${officialDomain || 'official websites'}
5. Campaign positions and press releases
6. Social media posts (Twitter/X, Facebook) with direct quotes
7. News interviews or town hall statements with direct quotes
8. Organization scorecards and ratings:
   - Heritage Foundation Action Scorecard
   - League of Conservation Voters (LCV)
   - NRA grades
   - Planned Parenthood Action ratings
   - ACLU scorecards
   - Chamber of Commerce ratings
   - OpenSecrets voting analysis

Return the answer_value from OPTIONS that best matches ALL evidence found. If multiple sources agree, confidence should be "high".`;

  try {
    // Rate limiting delay
    await new Promise(r => setTimeout(r, PERPLEXITY_DELAY_MS));

    console.log(`[Perplexity] Starting research for ${question.id} (${candidateName})...`);
    const perplexityStartTime = Date.now();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'candidate_position',
            schema: {
              type: 'object',
              properties: {
                answer_value: { type: 'integer' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                evidence_type: { 
                  type: 'string', 
                  enum: ['voting_record', 'public_statement', 'campaign_position', 
                         'social_media', 'news_quote', 'organization_scorecard', 'inferred'] 
                },
                source_description: { type: 'string' },
                primary_source: {
                  type: 'object',
                  properties: {
                    url: { type: 'string' },
                    title: { type: 'string' },
                    date: { type: 'string' }
                  }
                },
                additional_sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      title: { type: 'string' }
                    }
                  }
                }
              },
              required: ['answer_value', 'confidence', 'evidence_type', 'source_description']
            }
          }
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Perplexity] API error ${response.status}: ${errorText}`);
      
      if (response.status === 429) {
        console.log('[Perplexity] Rate limited, will fall back to Gemini');
        return null;
      }
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    
    const elapsedSec = Math.round((Date.now() - perplexityStartTime) / 1000);
    console.log(`[Perplexity] Completed ${question.id} in ${elapsedSec}s - ${content.length} chars, ${citations.length} citations`);

    // Parse the response
    const parsed = extractJsonFromText(content);
    
    if (!parsed || typeof parsed.answer_value !== 'number') {
      console.log(`[Perplexity] Failed to parse response for ${question.id}`);
      return null;
    }

    // Ensure confidence is valid
    const validConfidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';
    
    // Build source URLs from citations and parsed sources
    const sourceUrls: string[] = [];
    const sourceTitles: string[] = [];
    
    // Add citations from Perplexity
    if (Array.isArray(citations)) {
      citations.slice(0, 5).forEach((url: string) => {
        if (url && !sourceUrls.includes(url)) {
          sourceUrls.push(url);
          sourceTitles.push(url.split('/')[2] || 'Source');
        }
      });
    }
    
    // Add parsed primary source
    if (parsed.primary_source?.url && !sourceUrls.includes(parsed.primary_source.url)) {
      sourceUrls.unshift(parsed.primary_source.url);
      sourceTitles.unshift(parsed.primary_source.title || 'Primary Source');
    }
    
    // Add additional sources
    if (Array.isArray(parsed.additional_sources)) {
      parsed.additional_sources.forEach((src: any) => {
        if (src.url && !sourceUrls.includes(src.url) && sourceUrls.length < 5) {
          sourceUrls.push(src.url);
          sourceTitles.push(src.title || 'Source');
        }
      });
    }

    // Smart evidence type detection - don't blindly trust what Perplexity returns
    const perplexityEvidenceType = parsed.evidence_type;
    const detectedEvidenceType = detectEvidenceTypeFromDescription(parsed.source_description || '');
    
    // Use detected type if it found concrete evidence, otherwise trust Perplexity's response
    const finalEvidenceType = detectedEvidenceType !== 'inferred' 
      ? detectedEvidenceType 
      : validateEvidenceType(perplexityEvidenceType);

    const answer: GeneratedAnswer = {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || 'Research completed', 1000),
      source_url: sourceUrls[0] || null,
      source_urls: sourceUrls,
      source_titles: sourceTitles,
      source_type: mapEvidenceToSourceType(finalEvidenceType),
      confidence: validConfidence as 'high' | 'medium' | 'low',
      evidence_type: finalEvidenceType,
      voting_record_summary: ['voting_record', 'organization_scorecard'].includes(finalEvidenceType) ? parsed.source_description : undefined,
      public_statement_summary: ['public_statement', 'social_media', 'news_quote'].includes(finalEvidenceType) ? parsed.source_description : undefined,
    };

    console.log(`[Perplexity] ${question.id}: score=${answer.answer_value}, perplexity_type=${perplexityEvidenceType}, detected_type=${detectedEvidenceType}, final_type=${finalEvidenceType}, confidence=${answer.confidence}`);
    return answer;

  } catch (e) {
    console.error(`[Perplexity] Error for ${question.id}:`, e);
    return null;
  }
}

function mapEvidenceToSourceType(evidenceType: string): string {
  const mapping: Record<string, string> = {
    'voting_record': 'voting_record',
    'public_statement': 'public_statement',
    'campaign_position': 'campaign_website',
    'social_media': 'public_statement',
    'news_quote': 'interview',
    'organization_scorecard': 'web_research',
    'inferred': 'other',
    'mixed': 'web_research',
  };
  return mapping[evidenceType] || 'web_research';
}

function validateEvidenceType(type: string): GeneratedAnswer['evidence_type'] {
  const valid: GeneratedAnswer['evidence_type'][] = [
    'voting_record', 'public_statement', 'campaign_position', 'social_media', 
    'news_quote', 'organization_scorecard', 'inferred', 'mixed'
  ];
  return valid.includes(type as any) ? type as GeneratedAnswer['evidence_type'] : 'inferred';
}

// =============================================================================
// GEMINI FALLBACK (Only used when Perplexity rate limited)
// =============================================================================

async function researchWithGeminiFallback(
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question
): Promise<GeneratedAnswer | null> {
  if (!LOVABLE_API_KEY) return null;

  const optionsContext = question.question_options
    ?.sort((a, b) => a.value - b.value)
    .map(opt => `(${opt.value}) ${opt.text}`)
    .join('\n') || '';

  const topicName = question.topic_id?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'policy';
  const keyPhrase = extractKeyPhrase(question.text);

  const prompt = `Research ${candidateName} (${candidateParty} ${candidateOffice}, ${candidateState}) position on:

TOPIC: ${topicName}
QUESTION: "${question.text}"

OPTIONS:
${optionsContext}

Find evidence from: voting records, official statements, campaign positions, social media, news quotes, organization scorecards (Heritage, LCV, NRA, etc.).

Return JSON:
{
  "answer_value": <value from options>,
  "confidence": "high"|"medium"|"low",
  "evidence_type": "voting_record"|"public_statement"|"inferred",
  "source_description": "<evidence summary>"
}`;

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
          { role: 'system', content: 'You are a political research analyst. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error(`[Gemini] API error: ${response.status}`);
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error(`[Gemini] Failed to parse response as JSON`);
      return null;
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(content);

    if (!parsed || typeof parsed.answer_value !== 'number') {
      return null;
    }

    // Ensure confidence is valid
    const validConfidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low';
    
    // CRITICAL: Apply smart evidence detection from description (same as Perplexity path)
    const geminiEvidenceType = parsed.evidence_type || 'inferred';
    const detectedEvidenceType = detectEvidenceTypeFromDescription(parsed.source_description || '');
    const finalEvidenceType = detectedEvidenceType !== 'inferred' 
      ? detectedEvidenceType 
      : validateEvidenceType(geminiEvidenceType);
    
    // Log when detection overrides AI's evidence type
    if (detectedEvidenceType !== 'inferred' && detectedEvidenceType !== geminiEvidenceType) {
      console.log(`[Gemini] Evidence type override: ${geminiEvidenceType} → ${detectedEvidenceType} (detected from description)`);
    }
    
    console.log(`[Gemini] ${question.id}: score=${parsed.answer_value}, gemini_type=${geminiEvidenceType}, detected_type=${detectedEvidenceType}, final_type=${finalEvidenceType}`);
    
    // Extract legislative sources from description text (Gemini doesn't return citations)
    const extractedSources = (finalEvidenceType === 'voting_record' || finalEvidenceType === 'mixed')
      ? extractSourcesFromDescription(parsed.source_description || '')
      : { urls: [], titles: [] };
    
    if (extractedSources.urls.length > 0) {
      console.log(`[Gemini] Extracted ${extractedSources.urls.length} sources from description: ${extractedSources.titles.join(', ')}`);
    }
    
    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || 'Position inferred', 1000),
      source_url: extractedSources.urls[0] || null,
      source_urls: extractedSources.urls,
      source_titles: extractedSources.titles,
      source_type: mapEvidenceToSourceType(finalEvidenceType),
      confidence: validConfidence as 'high' | 'medium' | 'low',
      evidence_type: finalEvidenceType,
    };

  } catch (e) {
    console.error(`[Gemini] Error:`, e);
    return null;
  }
}

// =============================================================================
// SOURCE EXTRACTION FROM DESCRIPTION TEXT
// =============================================================================

function extractSourcesFromDescription(description: string): { urls: string[], titles: string[] } {
  const urls: string[] = [];
  const titles: string[] = [];
  
  if (!description) return { urls, titles };
  
  const foundBills = new Set<string>();
  
  // Extract bill references (S.1234, H.R.1234, S.Amdt.1234, etc.)
  // Senate bills: S.4230, S. 4230
  const senateBillMatches = description.matchAll(/\bS\.?\s?(\d+)/gi);
  for (const match of senateBillMatches) {
    const num = match[1];
    const key = `S.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/bill/119th-congress/senate-bill/${num}`);
      titles.push(`S.${num}`);
    }
  }
  
  // House bills: H.R.7608, HR 7608, H.R. 7608
  const houseBillMatches = description.matchAll(/\bH\.?R\.?\s?(\d+)/gi);
  for (const match of houseBillMatches) {
    const num = match[1];
    const key = `HR.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/bill/119th-congress/house-bill/${num}`);
      titles.push(`H.R.${num}`);
    }
  }
  
  // Senate amendments: S.Amdt.2323, S. Amdt. 2323
  const senateAmendMatches = description.matchAll(/\bS\.?\s?Amdt\.?\s?(\d+)/gi);
  for (const match of senateAmendMatches) {
    const num = match[1];
    const key = `S.Amdt.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/amendment/119th-congress/senate-amendment/${num}`);
      titles.push(`S.Amdt.${num}`);
    }
  }
  
  // House amendments: H.Amdt.1234
  const houseAmendMatches = description.matchAll(/\bH\.?\s?Amdt\.?\s?(\d+)/gi);
  for (const match of houseAmendMatches) {
    const num = match[1];
    const key = `H.Amdt.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/amendment/119th-congress/house-amendment/${num}`);
      titles.push(`H.Amdt.${num}`);
    }
  }
  
  console.log(`[Source Extraction] Found ${urls.length} legislative references in description`);
  
  // Limit to 5 sources max
  return { urls: urls.slice(0, 5), titles: titles.slice(0, 5) };
}

// =============================================================================
// PARTY INFERENCE FALLBACK (Last resort)
// =============================================================================

async function inferFromPartyAlignment(
  candidateName: string,
  candidateParty: string,
  question: Question
): Promise<GeneratedAnswer | null> {
  if (!LOVABLE_API_KEY) {
    console.log(`[Inference] Skipping ${question.id}: LOVABLE_API_KEY missing`);
    return null;
  }

  const optionsContext = question.question_options
    ?.sort((a, b) => a.value - b.value)
    .map(opt => `(${opt.value}) ${opt.text}`)
    .join('\n') || '';

  const prompt = `Based on ${candidateParty} party's general platform and ideology, what would be the most likely position on:

"${question.text}"

OPTIONS:
${optionsContext}

Party ideologies:
- Democrats: support government programs, progressive social policies, environmental protection, civil rights expansions
- Republicans: smaller government, free markets, traditional values, states' rights
- Libertarians: minimal government, individual liberty, non-intervention
- Green: environmental protection, social justice, grassroots democracy
- Independent: varies widely

Return JSON: {"score": <value>, "reasoning": "PARTY ALIGNMENT: <brief explanation>"}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.log(`[Inference] Skipping ${question.id}: party-alignment HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(content);

    if (!parsed || typeof parsed.score !== 'number') {
      console.log(`[Inference] Skipping ${question.id}: party-alignment returned unparseable output`);
      return null;
    }

    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.score),
      source_description: smartTruncate(parsed.reasoning || `Position inferred from ${candidateParty} party alignment`, 1000),
      source_url: null,
      source_urls: [],
      source_titles: [],
      source_type: 'other',
      confidence: 'low',
      evidence_type: 'inferred',
    };

  } catch (e) {
    console.log(`[Inference] Skipping ${question.id}: party-alignment threw`, e);
    return null;
  }
}

function createNeutralAnswer(questionId: string, description: string): GeneratedAnswer {
  return {
    question_id: questionId,
    answer_value: 0,
    source_description: description,
    source_url: null,
    source_urls: [],
    source_titles: [],
    source_type: 'other',
    confidence: 'low',
    evidence_type: 'inferred',
  };
}

// =============================================================================
// MAIN RESEARCH PIPELINE
// =============================================================================

async function researchQuestionPosition(
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question
): Promise<GeneratedAnswer | null> {
  // Step 1: Try Perplexity deep research (primary)
  const perplexityAnswer = await researchPositionWithPerplexity(
    candidateName, candidateOffice, candidateState, candidateParty, question
  );
  
  // Accept if Perplexity found concrete evidence (not inferred) - score 0 is valid for neutral positions
  if (perplexityAnswer && perplexityAnswer.evidence_type !== 'inferred') {
    console.log(`[Research] Using Perplexity: evidence=${perplexityAnswer.evidence_type}, score=${perplexityAnswer.answer_value}`);
    return perplexityAnswer;
  }

  // Log why Perplexity was rejected
  if (perplexityAnswer) {
    console.log(`[Research] Perplexity returned inferred for ${question.id}, trying Gemini...`);
  } else {
    console.log(`[Research] Perplexity failed for ${question.id}, trying Gemini...`);
  }

  // Step 2: Try Gemini fallback
  const geminiAnswer = await researchWithGeminiFallback(
    candidateName, candidateOffice, candidateState, candidateParty, question
  );
  
  // Accept if Gemini found concrete evidence (not inferred)
  if (geminiAnswer && geminiAnswer.evidence_type !== 'inferred') {
    console.log(`[Research] Using Gemini: evidence=${geminiAnswer.evidence_type}, score=${geminiAnswer.answer_value}`);
    return geminiAnswer;
  }

  // Step 3: Fall back to party inference (last resort)
  console.log(`[Research] No evidence from Perplexity or Gemini for ${question.id}, using party alignment`);
  return inferFromPartyAlignment(candidateName, candidateParty, question);
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

async function generateAnswersForCandidate(
  supabase: any,
  candidateId: string,
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[]
): Promise<{ generated: number; failed: number; researched: number }> {
  let totalGenerated = 0;
  let failedCount = 0;
  let researchedCount = 0;

  console.log(`[Generate] Processing ${questions.length} questions for ${candidateName} (${candidateParty})`);

  // Track answers by question_id to avoid duplicates
  const answersMap = new Map<string, GeneratedAnswer>();

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    
    // Skip if we already have an answer for this question
    if (answersMap.has(question.id)) {
      console.log(`[Generate] Skipping duplicate question ${question.id}`);
      continue;
    }
    
    console.log(`[Generate] Question ${i + 1}/${questions.length}: ${question.id}`);
    
    // Update global progress for shutdown handler
    globalProgress.processed = i;
    
    try {
      const answer = await researchQuestionPosition(
        candidateName, candidateOffice, candidateState, candidateParty, question
      );
      
      answersMap.set(answer.question_id, answer);
      
      if (answer.evidence_type !== 'inferred') {
        researchedCount++;
      }

      // Save each answer immediately to avoid data loss on shutdown
      await saveAnswersBatch(supabase, candidateId, [answer], questions);
      totalGenerated = answersMap.size;
      console.log(`[Generate] Saved ${totalGenerated}/${questions.length}`);

    } catch (e) {
      console.error(`[Generate] Error for ${question.id}:`, e);
      failedCount++;
      
      // Add a neutral answer on error (only if not already present)
      if (!answersMap.has(question.id)) {
        answersMap.set(question.id, createNeutralAnswer(question.id, 'Error during research'));
      }
    }
  }

  // Save all remaining answers
  const allAnswers = Array.from(answersMap.values());
  if (allAnswers.length > totalGenerated) {
    const remaining = allAnswers.slice(totalGenerated);
    if (remaining.length > 0) {
      await saveAnswersBatch(supabase, candidateId, remaining, questions);
      totalGenerated = allAnswers.length;
    }
  }

  console.log(`[Generate] Complete: ${totalGenerated} generated, ${researchedCount} researched, ${failedCount} failed`);
  return { generated: totalGenerated, failed: failedCount, researched: researchedCount };
}

async function saveAnswersBatch(
  supabase: any,
  candidateId: string,
  answers: GeneratedAnswer[],
  questions: Question[]
): Promise<void> {
  const questionMap = new Map(questions.map(q => [q.id, q]));
  
  const validSourceTypes = ['voting_record', 'public_statement', 'campaign_website', 'interview', 'legislation', 'web_research', 'other'];

  const answersToInsert = answers.map(answer => ({
    candidate_id: candidateId,
    question_id: answer.question_id,
    answer_value: answer.answer_value,
    source_description: answer.source_description,
    source_url: answer.source_url,
    source_urls: answer.source_urls,
    source_titles: answer.source_titles,
    source_type: validSourceTypes.includes(answer.source_type) ? answer.source_type : 'other',
    confidence: answer.confidence,
    evidence_type: answer.evidence_type,
    voting_record_summary: answer.voting_record_summary,
    public_statement_summary: answer.public_statement_summary,
    has_discrepancy: answer.has_discrepancy || false,
    discrepancy_note: answer.discrepancy_note,
  }));

  const { error } = await supabase
    .from('candidate_answers')
    .upsert(answersToInsert, { onConflict: 'candidate_id,question_id', ignoreDuplicates: false });

  if (error) {
    console.error('[Save] Error saving batch:', error);
    throw error;
  }
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
    console.log(`Updated overall_score to ${overallScore} for ${candidateName}`);
  } else {
    await supabase.from('candidate_overrides').upsert({
      candidate_id: candidateId,
      overall_score: overallScore,
    }, { onConflict: 'candidate_id', ignoreDuplicates: false });
  }
}

// =============================================================================
// BACKGROUND PROCESSING FUNCTION (CHUNKED)
// =============================================================================

const CHUNK_SIZE = 5; // Process max 5 questions per invocation to stay within wall-clock limit

async function processAnswersInBackground(
  candidateId: string,
  officialInfo: { name: string; party: string; office: string; state: string },
  questionsToGenerate: Question[],
  supabaseUrl: string,
  supabaseKey: string
) {
  // Create a fresh Supabase client for background processing
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Only process the first CHUNK_SIZE questions in this invocation
  const chunk = questionsToGenerate.slice(0, CHUNK_SIZE);
  const remaining = questionsToGenerate.slice(CHUNK_SIZE);
  
  globalProgress = {
    candidateId,
    candidateName: officialInfo.name,
    processed: 0,
    total: chunk.length,
    startTime: Date.now(),
    status: 'running',
  };

  console.log(`[Background] Starting chunk: ${chunk.length} questions for ${officialInfo.name} (${remaining.length} remaining for next chunk)`);
  console.log(`[Background] Using sonar-deep-research model (2-5 min per question)`);

  try {
    const { generated, failed, researched } = await generateAnswersForCandidate(
      supabase,
      candidateId,
      officialInfo.name,
      officialInfo.party,
      officialInfo.office,
      officialInfo.state,
      chunk
    );

    // Update progress
    globalProgress.processed = generated + failed;
    globalProgress.status = 'completed';

    await updateCandidateScore(supabase, candidateId, officialInfo.name);

    const elapsed = Math.round((Date.now() - globalProgress.startTime) / 1000);
    const elapsedMin = (elapsed / 60).toFixed(1);
    
    console.log(`[Background] ========================================`);
    console.log(`[Background] CHUNK COMPLETE: ${officialInfo.name}`);
    console.log(`[Background] Questions in chunk: ${chunk.length}`);
    console.log(`[Background] Successfully generated: ${generated}`);
    console.log(`[Background] Failed: ${failed}`);
    console.log(`[Background] With real evidence: ${researched}`);
    console.log(`[Background] Duration: ${elapsedMin} minutes (${elapsed}s)`);
    console.log(`[Background] Remaining questions: ${remaining.length}`);
    console.log(`[Background] ========================================`);

    // Self-chain: if there are remaining questions, invoke ourselves for the next chunk
    if (remaining.length > 0) {
      const remainingIds = remaining.map(q => q.id);
      console.log(`[Background] Self-chaining next chunk of ${Math.min(CHUNK_SIZE, remaining.length)} questions via direct fetch...`);

      try {
        const chainUrl = `${supabaseUrl}/functions/v1/get-candidate-answers`;
        const resp = await fetch(chainUrl, {
          method: 'POST',
          headers: {
            [INTERNAL_CHAIN_HEADER]: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            candidateId,
            questionIds: remainingIds,
            forceRegenerate: true,
            useBackground: true,
            _isChainedChunk: true,
          }),
        });

        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => '<no body>');
          console.error(`[Background] Self-chain HTTP ${resp.status}: ${bodyText.slice(0, 500)}`);
        } else {
          console.log(`[Background] Self-chain invoked successfully for ${remaining.length} remaining questions (HTTP ${resp.status})`);
          // Drain body to free resources
          await resp.text().catch(() => {});
        }
      } catch (chainError) {
        console.error(`[Background] Self-chain fetch error:`, chainError);
      }
    }
    
  } catch (error) {
    globalProgress.status = 'error';
    console.error(`[Background] ERROR for ${officialInfo.name}:`, error);
    
    // Even on error, try to chain remaining questions so they aren't lost
    if (remaining.length > 0) {
      console.log(`[Background] Attempting to chain remaining ${remaining.length} questions despite error...`);
      try {
        const chainUrl = `${supabaseUrl}/functions/v1/get-candidate-answers`;
        const resp = await fetch(chainUrl, {
          method: 'POST',
          headers: {
            [INTERNAL_CHAIN_HEADER]: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            candidateId,
            questionIds: remaining.map(q => q.id),
            forceRegenerate: true,
            useBackground: true,
            _isChainedChunk: true,
          }),
        });
        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => '<no body>');
          console.error(`[Background] Recovery chain HTTP ${resp.status}: ${bodyText.slice(0, 500)}`);
        } else {
          await resp.text().catch(() => {});
        }
      } catch (chainError) {
        console.error(`[Background] Recovery chain fetch error:`, chainError);
      }
    }
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestBody = await req.json().catch(() => ({}));

    // Auth check - require authenticated user OR internal chained request
    const authHeader = req.headers.get('Authorization');
    const internalChainSecret = req.headers.get(INTERNAL_CHAIN_HEADER);
    const isInternalChain = internalChainSecret === SUPABASE_SERVICE_ROLE_KEY;

    if (!isInternalChain) {
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[Auth] Missing bearer token and no valid internal chain header');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        console.error('[Auth] User auth failed for non-chained request:', authError?.message || 'no user');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }


  try {
    const {
      candidateId,
      questionIds,
      forceRegenerate = false,
      candidateName,
      candidateParty,
      candidateOffice,
      candidateState,
      useBackground = true, // Default to background processing for deep research
      _isChainedChunk = false, // Internal: set by self-chaining
    } = requestBody;

    if (_isChainedChunk) {
      console.log(`[Chain] Received chained chunk for ${candidateId} with ${questionIds?.length || 0} question IDs`);
    }

    if (!candidateId) {
      return new Response(JSON.stringify({ error: 'candidateId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!LOVABLE_API_KEY && !PERPLEXITY_API_KEY) {
      throw new Error('No AI API keys configured (need LOVABLE_API_KEY or PERPLEXITY_API_KEY)');
    }

    // Reset Perplexity counter for this request
    perplexityCallCount = 0;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get existing answers
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
        else {
          // Fallback: civic officials stored in candidate_overrides
          const { data: override } = await supabase.from('candidate_overrides').select('candidate_id, name, party, office, state').eq('candidate_id', candidateId).maybeSingle();
          if (override) officialInfo = { id: override.candidate_id, name: override.name, party: override.party, office: override.office, state: override.state };
        }
      }
    }

    if (!officialInfo) {
      return new Response(JSON.stringify({
        error: 'Candidate not found',
        answers: existingAnswers || [],
        source: 'database',
        existing: existingCount,
        generated: 0,
        missingBefore: 0,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine if this is a local official (governor and below)
    const localOffices = ['governor', 'lieutenant governor', 'attorney general', 'secretary of state',
      'state treasurer', 'state auditor', 'state comptroller', 'state senator', 'state representative',
      'mayor', 'city council', 'county executive', 'county commissioner', 'alderman', 'selectman',
      'town council', 'school board', 'sheriff', 'district attorney', 'municipal', 'borough',
      'township', 'village', 'assessor', 'clerk', 'recorder', 'coroner', 'public defender'];
    const officeLower = (officialInfo.office || '').toLowerCase();
    const isLocalOfficial = localOffices.some(lo => officeLower.includes(lo));

    // Get the correct topic scope for this official
    const targetScope = isLocalOfficial ? 'local' : 'all';
    const { data: scopeTopics } = await supabase.from('topics').select('id').eq('scope', targetScope);
    const scopeTopicIds = (scopeTopics || []).map((t: any) => t.id);

    // Get questions filtered by scope - ALWAYS enforce scope, even when caller passes questionIds.
    // This prevents federal questions from being answered for local officials (and vice versa).
    let questionsQuery = supabase
      .from('questions')
      .select('id, text, topic_id, question_options(value, text)')
      .in('topic_id', scopeTopicIds);
    if (questionIds && questionIds.length > 0) {
      questionsQuery = questionsQuery.in('id', questionIds);
    }

    const { data: questions, error: questionsError } = await questionsQuery;
    if (questionsError) throw questionsError;

    const totalQuestions = questions?.length || 0;
    if (totalQuestions === 0) {
      return new Response(JSON.stringify({ answers: [], source: 'none', existing: 0, generated: 0, missingBefore: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine which questions need generation
    const existingQuestionIds = new Set((existingAnswers || []).map(a => a.question_id));
    const questionsToGenerate = forceRegenerate ? questions : questions.filter(q => !existingQuestionIds.has(q.id));
    const missingBefore = questionsToGenerate.length;

    if (missingBefore === 0) {
      return new Response(JSON.stringify({
        answers: existingAnswers || [],
        source: 'database',
        existing: existingCount,
        generated: 0,
        missingBefore: 0,
        totalQuestions,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =========================================================================
    // BACKGROUND PROCESSING: For large batches, process in background to avoid timeout
    // =========================================================================
    
    // Use background processing for:
    // - 2+ questions (deep research takes 2-5 min per question)
    // - Force regenerate scenarios (typically full topic/candidate refresh)
    const shouldUseBackground = useBackground && (missingBefore >= 2 || forceRegenerate);
    
    if (shouldUseBackground) {
      console.log(`[Background] Queuing ${missingBefore} questions for ${officialInfo.name} - returning immediately`);
      
      // Start background processing - DO NOT await
      EdgeRuntime.waitUntil(processAnswersInBackground(
        candidateId,
        officialInfo,
        questionsToGenerate,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      ));

      // Estimate completion time (2-5 min per question with sonar-deep-research)
      const estimatedMinutes = Math.ceil(missingBefore * 3); // ~3 min average per question
      
      // Return immediately with "processing" status
      return new Response(JSON.stringify({
        status: 'processing',
        message: `Deep research started for ${officialInfo.name}. ${missingBefore} questions being processed in background using sonar-deep-research.`,
        candidateId,
        candidateName: officialInfo.name,
        questionsQueued: missingBefore,
        existingAnswers: existingCount,
        estimatedMinutes,
        researchEngine: 'perplexity-sonar-deep-research',
        logsUrl: `https://supabase.com/dashboard/project/ornnzinjrcyigazecctf/functions/get-candidate-answers/logs`,
        tips: [
          `Answers will be saved to database as they complete (expect ${estimatedMinutes} minutes)`,
          'Refresh the page after processing completes to see results',
          'Check logs for detailed progress of each question',
          'Each question uses deep web research for highest quality results',
        ],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =========================================================================
    // SYNCHRONOUS PROCESSING: For single questions, process immediately
    // =========================================================================
    
    console.log(`Generating ${missingBefore} answers for ${officialInfo.name} synchronously (single question)...`);

    const { generated, failed, researched } = await generateAnswersForCandidate(
      supabase,
      candidateId,
      officialInfo.name,
      officialInfo.party,
      officialInfo.office,
      officialInfo.state,
      questionsToGenerate
    );

    await updateCandidateScore(supabase, candidateId, officialInfo.name);

    const { data: finalAnswers } = await supabase.from('candidate_answers').select('*').eq('candidate_id', candidateId);

    return new Response(JSON.stringify({
      answers: finalAnswers || [],
      source: generated > 0 ? 'ai_generated' : 'database',
      existing: existingCount,
      generated,
      failed,
      researched,
      missingBefore,
      totalQuestions,
      researchEngine: 'perplexity-first',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in get-candidate-answers function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
