import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const CONGRESS_GOV_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CHUNK_SIZE = 20; // Generate 20 questions at a time to avoid truncated responses

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

// Check if candidate ID is a congressional bioguide ID (letter + 6 digits, e.g., K000383)
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

// Generate congress.gov profile URL from name and bioguide ID
function buildCongressGovProfileUrl(bioguideId: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  
  return `https://www.congress.gov/member/${slug}/${bioguideId}`;
}

// Build URL to a specific bill on congress.gov
function buildBillUrl(type: string, number: number, congress: number): string {
  const typeMap: Record<string, string> = {
    'HR': 'house-bill',
    'S': 'senate-bill',
    'HRES': 'house-resolution',
    'SRES': 'senate-resolution',
    'HJRES': 'house-joint-resolution',
    'SJRES': 'senate-joint-resolution',
    'HCONRES': 'house-concurrent-resolution',
    'SCONRES': 'senate-concurrent-resolution',
  };
  const urlType = typeMap[type.toUpperCase()] || 'bill';
  return `https://www.congress.gov/bill/${congress}th-congress/${urlType}/${number}`;
}

// Extract bill info from source_description to build specific bill URL
function extractBillInfo(sourceDescription: string): { type: string; number: number } | null {
  // Match patterns like "H.R. 1234", "S. 567", "HR1234", "S567", etc.
  const patterns = [
    /\b(H\.?R\.?|S\.?|H\.?RES\.?|S\.?RES\.?|H\.?J\.?RES\.?|S\.?J\.?RES\.?)\s*(\d+)/i,
  ];
  
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
    console.log('CONGRESS_GOV_API_KEY not configured, skipping voting record fetch');
    return [];
  }
  
  const records: LegislationRecord[] = [];
  
  try {
    // Fetch sponsored legislation
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
    } else {
      console.error(`Failed to fetch sponsored legislation: ${sponsoredResponse.status}`);
    }
    
    // Fetch cosponsored legislation
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
    } else {
      console.error(`Failed to fetch cosponsored legislation: ${cosponsoredResponse.status}`);
    }
  } catch (e) {
    console.error('Error fetching voting record:', e);
  }
  
  return records;
}

// Map policy areas to question topics for relevance matching
const policyAreaToTopics: Record<string, string[]> = {
  'Health': ['healthcare'],
  'Economics and Public Finance': ['economy', 'taxes'],
  'Taxation': ['economy', 'taxes'],
  'Education': ['education'],
  'Environmental Protection': ['environment', 'climate'],
  'Energy': ['environment', 'climate', 'energy'],
  'Immigration': ['immigration'],
  'Crime and Law Enforcement': ['criminal-justice', 'gun-policy'],
  'Civil Rights and Liberties, Minority Issues': ['civil-rights', 'lgbtq'],
  'Armed Forces and National Security': ['foreign-policy', 'defense'],
  'International Affairs': ['foreign-policy', 'israel-palestine', 'china-taiwan'],
  'Labor and Employment': ['economy', 'labor'],
  'Social Welfare': ['welfare', 'economy'],
  'Agriculture and Food': ['agriculture'],
  'Science, Technology, Communications': ['technology'],
  'Government Operations and Politics': ['government'],
  'Transportation and Public Works': ['infrastructure'],
  'Housing and Community Development': ['housing'],
  'Finance and Financial Sector': ['economy', 'finance'],
  'Commerce': ['economy', 'commerce'],
};

// Snap AI-generated values to the nearest valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

// Parse tool call arguments for structured output
function parseToolCallResponse(toolCalls: any[]): any[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  
  const functionCall = toolCalls[0]?.function;
  if (!functionCall?.arguments) return [];
  
  try {
    const args = typeof functionCall.arguments === 'string' 
      ? JSON.parse(functionCall.arguments) 
      : functionCall.arguments;
    return args.answers || [];
  } catch (e) {
    console.error('[AI] Failed to parse tool call arguments:', e);
    return [];
  }
}

// Extract individual answer objects from text using field-by-field extraction
function extractAnswersFromText(content: string): any[] {
  const recovered: any[] = [];
  
  // Split by "question_id" occurrences to find each object segment
  const segments = content.split(/"question_id"\s*:/);
  
  for (let i = 1; i < segments.length; i++) { // Skip first segment (before first question_id)
    const segment = segments[i];
    
    // Extract question_id value
    const qidMatch = segment.match(/^\s*"([^"]+)"/);
    if (!qidMatch) continue;
    const question_id = qidMatch[1];
    
    // Extract answer_value - look for the pattern with or without sign
    const valueMatch = segment.match(/"answer_value"\s*:\s*([+-]?\d+)/);
    if (!valueMatch) continue;
    const answer_value = parseInt(valueMatch[1], 10);
    
    // Extract confidence
    const confMatch = segment.match(/"confidence"\s*:\s*"([^"]+)"/);
    const confidence = confMatch ? confMatch[1] : 'medium';
    
    // Extract source_description (optional, may be truncated)
    const srcMatch = segment.match(/"source_description"\s*:\s*"([^"]*)"/);
    const source_description = srcMatch ? srcMatch[1].slice(0, 50) : 'Party position';
    
    recovered.push({
      question_id,
      answer_value,
      confidence,
      source_description
    });
  }
  
  return recovered;
}

// Clean and parse JSON from AI response - handles code fences, whitespace, and truncation
function parseAIResponse(content: string, finishReason?: string): any[] {
  const contentLen = content?.length || 0;
  console.log(`[AI] Parsing response: ${contentLen} chars, finish_reason: ${finishReason || 'unknown'}`);
  
  if (!content || contentLen === 0) {
    throw new Error('Empty AI response');
  }
  
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  
  // First try normal JSON parsing
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[AI] Successfully parsed ${parsed.length} answers`);
        return parsed;
      }
    } catch (e) {
      console.log('[AI] Standard JSON parse failed, trying recovery...');
    }
  }
  
  // Recovery: use field-by-field extraction
  console.log('[AI] Attempting field-by-field extraction...');
  const recovered = extractAnswersFromText(cleaned);
  
  if (recovered.length > 0) {
    console.log(`[AI] Recovered ${recovered.length} answers via field extraction`);
    return recovered;
  }
  
  // Log first/last chars for debugging
  console.error(`[AI] Parse failed. First 150 chars: ${cleaned.slice(0, 150)}`);
  console.error(`[AI] Last 150 chars: ${cleaned.slice(-150)}`);
  
  throw new Error('No JSON array found in response');
}

async function generateChunkAnswers(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  candidateId: string,
  questions: Question[],
  votingRecord: LegislationRecord[]
): Promise<GeneratedAnswer[]> {
  const isCongressional = isBioguideId(candidateId) && isCongressionalOffice(candidateOffice);
  const congressGovUrl = isCongressional 
    ? buildCongressGovProfileUrl(candidateId, candidateName) 
    : null;

  // Build list of valid question IDs for this chunk
  const validQuestionIds = questions.map(q => q.id);
  const validIdsStr = validQuestionIds.join(', ');

  // Format questions with MORE PROMINENT IDs to reduce empty question_id errors
  const questionsText = questions
    .map((q, i) => {
      let questionStr = `Question ${i + 1}:\n  ID: "${q.id}"\n  Text: ${q.text}`;
      if (q.question_options && q.question_options.length > 0) {
        const sortedOptions = [...q.question_options].sort((a, b) => a.value - b.value);
        const optionsStr = sortedOptions
          .map(opt => `    (${opt.value}) ${opt.text}`)
          .join('\n');
        questionStr += `\n  Options:\n${optionsStr}`;
      }
      return questionStr;
    })
    .join('\n\n');

  // Build voting record context for congressional members
  let votingContext = '';
  if (isCongressional && votingRecord.length > 0) {
    const relevantBills = votingRecord.slice(0, 40); // Limit to keep prompt size reasonable
    votingContext = `\n\nLEGISLATIVE RECORD (cite specific bills in source_description when relevant):
${relevantBills.map(v => `- ${v.action} ${v.type}${v.number}: "${v.title.slice(0, 80)}" (${v.policy_area})`).join('\n')}`;
  }

  const systemPrompt = `You are a non-partisan political analyst. Determine likely positions for elected officials based on party platform, voting record, public statements, and state context.

Use LEFT-RIGHT spectrum: -10 = Far LEFT, -5 = Left, 0 = Neutral, +5 = Right, +10 = Far RIGHT.
Democrats: generally NEGATIVE. Republicans: generally POSITIVE.
ONLY use: -10, -5, 0, +5, or +10. No intermediate values.

Return ONLY valid JSON array, no markdown fences, no extra text.`;

  const sourceInstructions = isCongressional && votingRecord.length > 0
    ? `- source_description: CITE SPECIFIC BILL briefly (e.g., "HR1234 Climate Act"). Max 40 chars.`
    : `- source_description: brief source (max 30 chars)`;

  const userPrompt = `Official: ${candidateName} (${candidateParty}) - ${candidateOffice}, ${candidateState}
${votingContext}

VALID QUESTION IDs (you MUST use EXACTLY one of these for each answer): [${validIdsStr}]

Questions:
${questionsText}

Return JSON array: [{question_id, answer_value, confidence, source_description}, ...]
- question_id: REQUIRED - Must be EXACTLY one of: ${validIdsStr}
- answer_value: -10, -5, 0, 5, or 10
- confidence: "high"/"medium"/"low"
${sourceInstructions}

CRITICAL: Every answer MUST have a question_id matching one of the IDs listed above.
ONLY JSON array. No markdown.`;

  // Use tool calling for structured output - more reliable than text parsing
  const answerSchema = {
    type: "function",
    function: {
      name: "submit_answers",
      description: "Submit the political position answers for the candidate. Each answer MUST have a valid question_id.",
      parameters: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            description: `Array of answers. Each MUST have question_id matching one of: ${validIdsStr}`,
            items: {
              type: "object",
              properties: {
                question_id: { 
                  type: "string", 
                  description: `REQUIRED: The exact question ID from the list: ${validIdsStr}. Must match exactly.`
                },
                answer_value: { type: "integer", enum: [-10, -5, 0, 5, 10], description: "Position on left-right scale" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                source_description: { type: "string", description: "Brief source (max 30 chars)" }
              }
              // Note: 'required' removed from items - Google Gemini doesn't support nested required arrays
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
    
    if (response.status === 402 || response.status === 429) {
      console.log(`AI Gateway ${response.status} - rate limited or payment required`);
      return []; 
    }
    
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const choice = aiResponse.choices?.[0];
  const finishReason = choice?.finish_reason;
  const toolCalls = choice?.message?.tool_calls;
  const content = choice?.message?.content || '';
  
  console.log(`[AI] Response finish_reason: ${finishReason}, has_tool_calls: ${!!toolCalls}, content_len: ${content.length}`);

  let parsed: any[] = [];
  
  // Try tool call response first (preferred)
  if (toolCalls && toolCalls.length > 0) {
    parsed = parseToolCallResponse(toolCalls);
    if (parsed.length > 0) {
      console.log(`[AI] Got ${parsed.length} answers from tool call`);
    }
  }
  
  // Fallback to text parsing if tool call failed
  if (parsed.length === 0 && content) {
    try {
      parsed = parseAIResponse(content, finishReason);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      return [];
    }
  }
  
  if (parsed.length === 0) {
    console.error('[AI] No answers extracted from response');
    return [];
  }

  // FALLBACK: Map answers with empty question_ids by position
  // AI typically returns answers in the same order as questions
  const emptyIdCount = parsed.filter((item: any) => !item.question_id || String(item.question_id).trim() === '').length;
  if (emptyIdCount > 0) {
    // Map by position for answers within bounds of the questions array
    const mappableCount = Math.min(parsed.length, questions.length);
    let mapped = 0;
    for (let idx = 0; idx < mappableCount; idx++) {
      const item = parsed[idx];
      if (!item.question_id || String(item.question_id).trim() === '') {
        item.question_id = questions[idx].id;
        mapped++;
      }
    }
    if (mapped > 0) {
      console.log(`[AI] Mapped ${mapped}/${emptyIdCount} empty question_ids by position (${parsed.length} answers, ${questions.length} questions)`);
    }
  }

  return parsed.map((item: any) => {
    const sourceDesc = (item.source_description || `${candidateParty} platform`).slice(0, 50);
    
    // For congressional members, try to extract bill info and build specific URL
    let sourceUrl = congressGovUrl;
    if (isCongressional) {
      const billInfo = extractBillInfo(sourceDesc);
      if (billInfo) {
        const matchingBill = votingRecord.find(
          v => v.type.toUpperCase() === billInfo.type && v.number === billInfo.number
        );
        const congress = matchingBill?.congress || 118;
        sourceUrl = buildBillUrl(billInfo.type, billInfo.number, congress);
      }
    }
    
    return {
      question_id: String(item.question_id || '').replace(/[\[\]]/g, ''),
      answer_value: snapToValidValue(item.answer_value),
      source_description: sourceDesc,
      source_url: sourceUrl,
      source_type: isCongressional ? 'voting_record' : 'other',
      confidence: item.confidence || 'medium',
    };
  });
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
): Promise<{ generated: number; failed: number }> {
  let totalGenerated = 0;
  let failedChunks = 0;
  
  // Use smaller chunks (10) for reliable structured output
  const CHUNK_SIZE = 10;
  const chunks: Question[][] = [];
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`Processing ${questions.length} questions in ${chunks.length} chunks for ${candidateName}`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Generating chunk ${i + 1}/${chunks.length} (${chunk.length} questions)...`);
    
    // Helper function to process a chunk and return valid deduplicated answers
    const processChunkAnswers = async (isRetry = false): Promise<any[]> => {
      const answers = await generateChunkAnswers(
        candidateName,
        candidateParty,
        candidateOffice,
        candidateState,
        candidateId,
        chunk,
        votingRecord
      );
      
      if (answers.length === 0) {
        return [];
      }
      
      const answersToInsert = answers.map(answer => ({
        candidate_id: candidateId,
        question_id: answer.question_id,
        answer_value: answer.answer_value,
        source_description: answer.source_description,
        source_url: answer.source_url,
        source_type: answer.source_type,
        confidence: answer.confidence,
      }));
      
      // Filter out answers with empty/invalid question_ids
      const chunkQuestionIds = chunk.map(q => q.id);
      const validAnswers = answersToInsert.filter(answer => {
        if (!answer.question_id || answer.question_id.trim() === '') {
          if (!isRetry) console.warn(`Filtered out answer with empty question_id in chunk ${i + 1}`);
          return false;
        }
        if (!chunkQuestionIds.includes(answer.question_id)) {
          if (!isRetry) console.warn(`Filtered out answer with unknown question_id: ${answer.question_id} in chunk ${i + 1}`);
          return false;
        }
        return true;
      });

      // Deduplicate by question_id - keep last occurrence (AI's final answer)
      return Array.from(
        validAnswers.reduce((map, answer) => {
          map.set(answer.question_id, answer);
          return map;
        }, new Map()).values()
      );
    };
    
    try {
      let deduplicatedAnswers = await processChunkAnswers(false);
      
      // Retry logic: if we got less than 50% valid answers, retry once
      if (deduplicatedAnswers.length < chunk.length * 0.5) {
        console.log(`Chunk ${i + 1}: Only ${deduplicatedAnswers.length}/${chunk.length} valid answers, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay before retry
        
        const retryAnswers = await processChunkAnswers(true);
        
        if (retryAnswers.length > deduplicatedAnswers.length) {
          console.log(`Chunk ${i + 1} retry: improved from ${deduplicatedAnswers.length} to ${retryAnswers.length} valid answers`);
          deduplicatedAnswers = retryAnswers;
        } else {
          console.log(`Chunk ${i + 1} retry: no improvement (${retryAnswers.length} answers)`);
        }
      }
      
      if (deduplicatedAnswers.length < chunk.length) {
        console.log(`Chunk ${i + 1}: saving ${deduplicatedAnswers.length}/${chunk.length} valid answers`);
      }
      
      if (deduplicatedAnswers.length === 0) {
        console.warn(`Chunk ${i + 1}: No valid answers to save after filtering and retry`);
        failedChunks++;
        continue;
      }

      const { error: insertError } = await supabase
        .from('candidate_answers')
        .upsert(deduplicatedAnswers, {
          onConflict: 'candidate_id,question_id',
          ignoreDuplicates: false,
        });
      
      if (insertError) {
        console.error(`Error saving chunk ${i + 1}:`, insertError);
        failedChunks++;
      } else {
        totalGenerated += deduplicatedAnswers.length;
        console.log(`Saved chunk ${i + 1}: ${deduplicatedAnswers.length} answers (total: ${totalGenerated})`);
      }
      
      // Longer delay between chunks to reduce resource pressure
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error(`Error processing chunk ${i + 1}:`, e);
      failedChunks++;
    }
  }
  
  return { generated: totalGenerated, failed: failedChunks };
}

async function updateCandidateScore(
  supabase: any,
  candidateId: string,
  candidateName: string
): Promise<void> {
  // Get all answers for this candidate to calculate score
  const { data: allAnswers } = await supabase
    .from('candidate_answers')
    .select('answer_value')
    .eq('candidate_id', candidateId);
  
  if (!allAnswers || allAnswers.length === 0) return;
  
  const totalScore = allAnswers.reduce((sum: number, a: any) => sum + a.answer_value, 0);
  const overallScore = Math.round((totalScore / allAnswers.length) * 100) / 100;
  
  // Check if candidate exists in candidates table
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .maybeSingle();
  
  if (existingCandidate) {
    const { error } = await supabase
      .from('candidates')
      .update({ 
        overall_score: overallScore,
        last_answers_sync: new Date().toISOString(),
        answers_source: 'ai_generated'
      })
      .eq('id', candidateId);
    
    if (!error) {
      console.log(`Updated candidates.overall_score to ${overallScore} for ${candidateName}`);
    }
  } else {
    const { error } = await supabase
      .from('candidate_overrides')
      .upsert({
        candidate_id: candidateId,
        overall_score: overallScore,
      }, {
        onConflict: 'candidate_id',
        ignoreDuplicates: false,
      });
    
    if (!error) {
      console.log(`Saved candidate_overrides.overall_score ${overallScore} for ${candidateName}`);
    }
  }
}

serve(async (req) => {
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

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get existing answers
    let existingAnswersQuery = supabase
      .from('candidate_answers')
      .select('*')
      .eq('candidate_id', candidateId);
    
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
      officialInfo = {
        id: candidateId,
        name: candidateName,
        party: candidateParty,
        office: candidateOffice,
        state: candidateState,
      };
      console.log(`Using provided candidate info for ${candidateName}`);
    } else {
      const { data: candidate } = await supabase
        .from('candidates')
        .select('id, name, party, office, state')
        .eq('id', candidateId)
        .maybeSingle();

      if (candidate) {
        officialInfo = candidate;
      } else {
        const { data: staticOfficial } = await supabase
          .from('static_officials')
          .select('id, name, party, office, state')
          .eq('id', candidateId)
          .maybeSingle();
        
        if (staticOfficial) {
          officialInfo = staticOfficial;
        }
      }
    }

    if (!officialInfo) {
      console.log(`Candidate ${candidateId} not found`);
      return new Response(JSON.stringify({ 
        error: 'Candidate not found',
        answers: existingAnswers || [],
        source: 'database',
        existing: existingCount,
        generated: 0,
        missingBefore: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all questions
    let questionsQuery = supabase
      .from('questions')
      .select('id, text, topic_id, question_options(value, text)');
    
    if (questionIds && questionIds.length > 0) {
      questionsQuery = questionsQuery.in('id', questionIds);
    }

    const { data: questions, error: questionsError } = await questionsQuery;
    if (questionsError) throw questionsError;

    const totalQuestions = questions?.length || 0;
    
    if (totalQuestions === 0) {
      return new Response(JSON.stringify({
        answers: [],
        source: 'none',
        existing: 0,
        generated: 0,
        missingBefore: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter out questions we already have answers for
    const existingQuestionIds = new Set((existingAnswers || []).map(a => a.question_id));
    const questionsToGenerate = forceRegenerate 
      ? questions 
      : questions.filter(q => !existingQuestionIds.has(q.id));

    const missingBefore = questionsToGenerate.length;
    
    // If nothing to generate, return early
    if (missingBefore === 0) {
      console.log(`All ${totalQuestions} questions already have answers for ${officialInfo.name}`);
      return new Response(JSON.stringify({
        answers: existingAnswers || [],
        source: 'database',
        existing: existingCount,
        generated: 0,
        missingBefore: 0,
        totalQuestions,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating ${missingBefore} missing answers for ${officialInfo.name}...`);

    // For congressional members, fetch their voting record first
    const isCongressional = isBioguideId(candidateId) && isCongressionalOffice(officialInfo.office);
    let votingRecord: LegislationRecord[] = [];
    
    if (isCongressional) {
      console.log(`Fetching voting record for congressional member ${candidateId}...`);
      votingRecord = await fetchMemberVotingRecord(candidateId);
      console.log(`Retrieved ${votingRecord.length} legislative records`);
    }

    // Generate answers in chunks
    const { generated, failed } = await generateAnswersInChunks(
      supabase,
      candidateId,
      officialInfo.name,
      officialInfo.party,
      officialInfo.office,
      officialInfo.state,
      questionsToGenerate,
      votingRecord
    );

    // Update overall score if we generated any answers
    if (generated > 0) {
      await updateCandidateScore(supabase, candidateId, officialInfo.name);
    }

    // Fetch final answer count
    const { data: finalAnswers } = await supabase
      .from('candidate_answers')
      .select('*')
      .eq('candidate_id', candidateId);

    return new Response(JSON.stringify({
      answers: finalAnswers || [],
      source: generated > 0 ? 'ai_generated' : 'database',
      generated,
      existing: existingCount,
      missingBefore,
      failedChunks: failed,
      totalQuestions,
      finalCount: finalAnswers?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in get-candidate-answers function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
