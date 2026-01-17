import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limiting for Perplexity
let perplexityCallCount = 0;
const PERPLEXITY_BATCH_LIMIT = 100;
const PERPLEXITY_DELAY_MS = 1200; // 1.2 seconds between calls

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
  // Try to find JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*\n\n)/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue to other methods
    }
  }
  
  // Try to extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }
  
  // Last resort: find any JSON-like structure
  const anyJsonMatch = text.match(/\{[^{}]*"answer_value"[^{}]*\}/);
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

OUTPUT RULES:
- Use the answer_value from the OPTIONS that matches the evidence found
- Start source_description with evidence type: "VOTED YEA on...", "SPONSORED...", "STATED on Twitter...", "RATED by Heritage Foundation...", etc.
- Include specific bill numbers (H.R.XXX, S.XXX) when citing legislation
- Include dates when available
- If evidence shows SUPPORT for the policy, use the positive option value
- If evidence shows OPPOSITION, use the negative option value
- If NO concrete evidence found, return answer_value: 0 with evidence_type: "inferred" and explain based on party alignment

CRITICAL: Return ONLY valid JSON matching this schema:
{
  "answer_value": <number from -10 to 10>,
  "confidence": "high" | "medium" | "low",
  "evidence_type": "voting_record" | "public_statement" | "campaign_position" | "social_media" | "news_quote" | "organization_scorecard" | "inferred",
  "source_description": "<concise evidence starting with type, max 500 chars>",
  "primary_source": {"url": "<url>", "title": "<title>", "date": "<date if known>"},
  "additional_sources": [{"url": "<url>", "title": "<title>"}]
}`;

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
    
    console.log(`[Perplexity] Response for ${question.id}: ${content.length} chars, ${citations.length} citations`);

    // Parse the response
    const parsed = extractJsonFromText(content);
    
    if (!parsed || typeof parsed.answer_value !== 'number') {
      console.log(`[Perplexity] Failed to parse response for ${question.id}`);
      return null;
    }

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

    const answer: GeneratedAnswer = {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || 'Research completed', 1000),
      source_url: sourceUrls[0] || null,
      source_urls: sourceUrls,
      source_titles: sourceTitles,
      source_type: mapEvidenceToSourceType(parsed.evidence_type),
      confidence: parsed.confidence || 'medium',
      evidence_type: validateEvidenceType(parsed.evidence_type),
      voting_record_summary: parsed.evidence_type === 'voting_record' ? parsed.source_description : undefined,
      public_statement_summary: ['public_statement', 'social_media', 'news_quote'].includes(parsed.evidence_type) ? parsed.source_description : undefined,
    };

    console.log(`[Perplexity] ${question.id}: score=${answer.answer_value}, type=${answer.evidence_type}, confidence=${answer.confidence}`);
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(content);

    if (!parsed || typeof parsed.answer_value !== 'number') {
      return null;
    }

    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || 'Position inferred', 1000),
      source_url: null,
      source_urls: [],
      source_titles: [],
      source_type: mapEvidenceToSourceType(parsed.evidence_type || 'inferred'),
      confidence: parsed.confidence || 'low',
      evidence_type: validateEvidenceType(parsed.evidence_type || 'inferred'),
    };

  } catch (e) {
    console.error(`[Gemini] Error:`, e);
    return null;
  }
}

// =============================================================================
// PARTY INFERENCE FALLBACK (Last resort)
// =============================================================================

async function inferFromPartyAlignment(
  candidateName: string,
  candidateParty: string,
  question: Question
): Promise<GeneratedAnswer> {
  if (!LOVABLE_API_KEY) {
    return createNeutralAnswer(question.id, 'Unable to research position');
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
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return createNeutralAnswer(question.id, 'Unable to infer position');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJsonFromText(content);

    if (!parsed || typeof parsed.score !== 'number') {
      return createNeutralAnswer(question.id, 'Unable to determine position');
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
    return createNeutralAnswer(question.id, 'Error inferring position');
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
): Promise<GeneratedAnswer> {
  // Step 1: Try Perplexity deep research (primary)
  const perplexityAnswer = await researchPositionWithPerplexity(
    candidateName, candidateOffice, candidateState, candidateParty, question
  );
  
  if (perplexityAnswer && perplexityAnswer.answer_value !== 0) {
    return perplexityAnswer;
  }

  // Step 2: Try Gemini fallback (if Perplexity failed/rate limited)
  if (!perplexityAnswer) {
    console.log(`[Research] Trying Gemini fallback for ${question.id}`);
    const geminiAnswer = await researchWithGeminiFallback(
      candidateName, candidateOffice, candidateState, candidateParty, question
    );
    
    if (geminiAnswer && geminiAnswer.answer_value !== 0) {
      return geminiAnswer;
    }
  }

  // Step 3: Fall back to party inference
  console.log(`[Research] No evidence found for ${question.id}, inferring from party alignment`);
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

  const answers: GeneratedAnswer[] = [];

  for (const question of questions) {
    try {
      const answer = await researchQuestionPosition(
        candidateName, candidateOffice, candidateState, candidateParty, question
      );
      
      answers.push(answer);
      
      if (answer.evidence_type !== 'inferred') {
        researchedCount++;
      }

      // Save every 10 answers to avoid data loss
      if (answers.length % 10 === 0) {
        await saveAnswersBatch(supabase, candidateId, answers.slice(-10), questions);
        totalGenerated += 10;
        console.log(`[Generate] Saved batch: ${totalGenerated}/${questions.length}`);
      }

    } catch (e) {
      console.error(`[Generate] Error for ${question.id}:`, e);
      failedCount++;
      
      // Add a neutral answer on error
      answers.push(createNeutralAnswer(question.id, 'Error during research'));
    }
  }

  // Save remaining answers
  const remaining = answers.slice(totalGenerated);
  if (remaining.length > 0) {
    await saveAnswersBatch(supabase, candidateId, remaining, questions);
    totalGenerated += remaining.length;
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
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    } = await req.json();

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

    // Get questions
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

    console.log(`Generating ${missingBefore} answers for ${officialInfo.name} using Perplexity-first research...`);

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
