import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Party platform reference data - sources only, no assumed positions
const PARTY_CONTEXT = {
  democrat: {
    name: 'Democratic Party',
    officialPlatformUrl: 'https://democrats.org/where-we-stand/party-platform/',
    searchTerms: ['Democratic Party', 'DNC', 'Democrat platform'],
  },
  republican: {
    name: 'Republican Party',
    officialPlatformUrl: 'https://gop.com/platform/',
    searchTerms: ['Republican Party', 'RNC', 'GOP platform'],
  },
  green: {
    name: 'Green Party',
    officialPlatformUrl: 'https://gp.org/platform/',
    searchTerms: ['Green Party USA', 'Green Party platform'],
  },
  libertarian: {
    name: 'Libertarian Party',
    officialPlatformUrl: 'https://lp.org/platform/',
    searchTerms: ['Libertarian Party', 'LP platform'],
  },
};

interface Question {
  id: string;
  text: string;
  topic_id: string;
  topic_name: string;
}

interface PartyAnswer {
  party_id: string;
  question_id: string;
  answer_value: number;
  source_description: string;
  source_url: string | null;
  source_urls: string[];
  source_titles: string[];
  confidence: string;
  notes: string | null;
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
  // Video platforms (block iframe embedding, hard to cite specific quotes)
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
  // Social media platforms (often block embedding, ephemeral content)
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
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
    // Try to extract URL from the redirect path
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
    
    // Try HEAD first
    let response = await fetch(url, { 
      method: 'HEAD', 
      redirect: 'follow',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (response.ok) return true;
    
    // Fallback to GET for servers that reject HEAD
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

// Snap AI-generated values to the nearest valid discrete score
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
  sourceDescription: string,
  partyId: string
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
    'more likely than republicans to support',
    // Evidence-informed indicators
    'generally supports',
    'typically supports',
    'party supports',
    'democrats support',
    'democratic party supports',
    'democrats favor',
    'democratic party favors',
    'democrats generally',
    'has advocated for',
    'party platform supports',
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
    'more likely than democrats to support',
    // Evidence-informed indicators
    'generally opposes',
    'typically opposes',
    'party opposes',
    'republicans support',
    'republican party supports',
    'republicans favor',
    'republican party favors',
    'republicans generally',
    'has advocated against',
    'party platform opposes',
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
    console.log(`[Consistency] Adjusting ${partyId} score: Progressive evidence with neutral score -> -5`);
    return -5;
  }
  
  if (hasConservativeEvidence && !hasProgressiveEvidence) {
    console.log(`[Consistency] Adjusting ${partyId} score: Conservative evidence with neutral score -> 5`);
    return 5;
  }
  
  return answerValue;
}

/**
 * Phase 1: Research party position using Gemini with Google Search grounding
 */
async function researchPartyPosition(
  partyName: string,
  questionText: string,
  topicName: string,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;
  
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('GOOGLE_GEMINI_API_KEY not configured, skipping web research');
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
              text: `Research the ${partyName}'s CURRENT position on this SPECIFIC question: "${questionText}"

CRITICAL: Only cite sources that DIRECTLY address this specific question.
Do NOT include sources that are about the general topic but don't discuss the specific issue.

RECENCY REQUIREMENTS:
- Use ONLY the LATEST official party platform (2024 or most recent available)
- Do NOT reference outdated platforms from previous election cycles (2020, 2016, etc.)
- Prioritize recent statements from party leadership (2023-2025 first)
- Work backwards chronologically only if recent evidence is unavailable

SOURCE RELEVANCE REQUIREMENTS:
- The source MUST explicitly discuss the specific issue in the question
- General topic pages that don't mention the specific issue are NOT valid sources
- If no sources directly address this question, say "No relevant sources found"

Look for (in order of priority):
1. Official 2024 party platform document sections addressing THIS question
2. Recent policy statements specifically about THIS issue (2023-2025)
3. Recent voting patterns on bills related to THIS specific issue
4. Current party positions in discourse about THIS specific question

Summarize the party's CURRENT position based on evidence that DIRECTLY addresses this question. If no sources discuss this specific issue, clearly state that.`
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
        return researchPartyPosition(partyName, questionText, topicName, retryCount + 1);
      }
      
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
    }

    const data = await response.json();
    
    // Extract text content
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

    console.log(`Grounding research for "${questionText.slice(0, 40)}...": ${researchText.length} chars, ${resolvedSources.length} valid sources`);
    
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
      return researchPartyPosition(partyName, questionText, topicName, retryCount + 1);
    }
    
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
  }
}

/**
 * Phase 2: Score party position based on grounded research
 */
async function getPartyStances(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  researchResults: Map<string, GroundingResult>
): Promise<PartyAnswer[]> {
  // Build questions with research context
  const questionsWithResearch = questions.map((q, i) => {
    const research = researchResults.get(q.id);
    let researchContext = '';
    if (research?.success && research.researchText) {
      researchContext = `\n  RESEARCH FINDINGS: ${research.researchText.slice(0, 500)}`;
      if (research.sourceUrls.length > 0) {
        researchContext += `\n  SOURCES: ${research.sourceUrls.join(', ')}`;
      }
    } else {
      researchContext = '\n  RESEARCH FINDINGS: No documented position found via web search.';
    }
    return `${i + 1}. [${q.id}] ${q.text}${researchContext}`;
  }).join('\n\n');

  // EVIDENCE-INFORMED SCORING PROMPT
  const systemPrompt = `You are a non-partisan political analyst scoring party positions based on RESEARCH FINDINGS provided.

EVIDENCE-INFORMED SCORING APPROACH:
- Score based on ALL evidence in RESEARCH FINDINGS including:
  * Official party platform statements
  * How party representatives typically vote
  * Well-established party positions in political discourse
  * Patterns of support/opposition among party members
- If research shows a clear directional lean (even without explicit official documentation), assign a score reflecting that lean
- Use 0 (neutral) ONLY when research shows genuine bipartisan agreement, mixed positions within the party, or truly novel/unaddressed topics

SCORING SCALE:
- -10 = Strong Progressive/Left position
- -5 = Moderate Progressive/Left lean
- 0 = Genuinely neutral, mixed, OR topic not applicable to party ideology
- +5 = Moderate Conservative/Right lean
- +10 = Strong Conservative/Right position

ASSIGNMENT LOGIC:
- "Democrats support X" / "Republicans oppose X" -> Assign appropriate directional score
- "Party generally favors" / "Party typically opposes" -> Assign -5 or +5
- "Party has advocated for" / "Many party members support" -> Assign -5 or +5
- "Representatives typically vote for/against" -> Use voting pattern to determine score
- Only use 0 when evidence shows genuine ambiguity or cross-party consensus

You MUST use ONLY these exact values: -10, -5, 0, +5, or +10`;

  const userPrompt = `Score the ${partyContext.name}'s positions based on the RESEARCH FINDINGS provided for each question.

Questions with Research:
${questionsWithResearch}

For each question, provide a JSON array with objects containing:
- question_id: EXACTLY as shown in brackets (e.g., "gun1", "cr2") - do NOT include the brackets
- answer_value: MUST be exactly one of these integers: -10, -5, 0, 5, or 10
  * Use 0 if research shows no documented position
- confidence: "high" (explicit documented statement), "medium" (inferred from evidence), "low" (no documented position - must be 0)
- source_description: Affirmative position statement explicitly stating what the party supports or opposes. Format: "[Party Name] [explicitly supports/opposes] [specific policy], per [document/source name]." DO NOT include URLs, domain names, or website addresses in this field - links are displayed separately in the UI. Example: "Democratic Party explicitly supports enacting federal laws to prohibit discrimination, including the Equality Act, per 2024 party platform." Use "No documented position found" only when research shows no evidence.
- notes: Brief explanation if needed, null otherwise

Return ONLY a valid JSON array, no other text. Example:
[{"question_id": "gun1", "answer_value": 0, "confidence": "low", "source_description": "No documented position", "notes": null}]`;

  console.log(`Scoring ${partyContext.name} stances on ${questions.length} questions with research context...`);

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
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI Gateway error for ${partyId}:`, response.status, errorText);
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || '';

  // Build a set of valid question IDs for validation
  const validQuestionIds = new Set(questions.map(q => q.id));

  // Parse JSON from response
  let answers: PartyAnswer[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let cleanedJson = jsonMatch[0]
        .replace(/:\s*\+(\d)/g, ': $1')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      
      const parsed = JSON.parse(cleanedJson);
      
      answers = parsed
        .filter((item: any) => {
          const cleanId = String(item.question_id).replace(/[\[\]]/g, '');
          if (!validQuestionIds.has(cleanId)) {
            console.warn(`Skipping invalid question_id: ${item.question_id}`);
            return false;
          }
          return true;
        })
        .map((item: any) => {
          const questionId = String(item.question_id).replace(/[\[\]]/g, '');
          const research = researchResults.get(questionId);
          
          const hasValidSource = item.source_description && 
            !item.source_description.toLowerCase().includes('no documented') &&
            item.source_description.length > 10;
          
          let answerValue = snapToValidValue(item.answer_value);
          let confidence = item.confidence || 'medium';
          let sourceDesc = item.source_description || 'No documented position';
          
          // Enforce evidence-only: if no valid source, must be 0
          if (!hasValidSource && answerValue !== 0) {
            console.log(`Resetting unsourced answer for ${questionId}: ${answerValue} -> 0`);
            answerValue = 0;
            confidence = 'low';
            sourceDesc = 'No documented position';
          }
          
          // Apply score consistency validation - adjust 0 scores if evidence suggests otherwise
          if (hasValidSource) {
            answerValue = validateScoreConsistency(answerValue, sourceDesc, partyId);
          }
          
          // CRITICAL: Clear sources when no position was found to avoid showing irrelevant links
          const noPositionFound = sourceDesc.toLowerCase().includes('no documented position') || 
                                   confidence === 'low';
          
          // Use primary source URL from research, fallback to party platform (only if position found)
          const primaryUrl = noPositionFound ? null : (research?.sourceUrls?.[0] || partyContext.officialPlatformUrl);
          const allSourceUrls = noPositionFound ? [] : (research?.sourceUrls || []);
          const allSourceTitles = noPositionFound ? [] : (research?.sourceTitles || []);
          
          if (noPositionFound && research?.sourceUrls?.length) {
            console.log(`[Source Cleanup] Clearing ${research.sourceUrls.length} irrelevant sources for ${questionId} (no position found)`);
          }
          
          return {
            party_id: partyId,
            question_id: questionId,
            answer_value: answerValue,
            source_description: sourceDesc,
            source_url: primaryUrl,
            source_urls: allSourceUrls,
            source_titles: allSourceTitles,
            confidence: confidence,
            notes: item.notes || null,
          };
        });
    }
  } catch (e) {
    console.error(`Failed to parse AI response for ${partyId}:`, e);
    console.error('Raw content:', content.slice(0, 500));
  }

  console.log(`Parsed ${answers.length} valid answers for ${partyContext.name}`);
  return answers;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, partyId, questionId, batchSize = 10, skipExisting = true } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!partyId) {
      return new Response(JSON.stringify({ 
        error: 'partyId is required. Process one party at a time to avoid timeouts.',
        validParties: ['democrat', 'republican', 'green', 'libertarian']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const partyContext = PARTY_CONTEXT[partyId as keyof typeof PARTY_CONTEXT];
    if (!partyContext) {
      return new Response(JSON.stringify({ 
        error: `Invalid partyId: ${partyId}`,
        validParties: ['democrat', 'republican', 'green', 'libertarian']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hasGrounding = !!GOOGLE_GEMINI_API_KEY;
    console.log(`Starting party answers generation for ${partyContext.name}, skipExisting=${skipExisting}, grounding=${hasGrounding}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build query for questions
    let query = supabase
      .from('questions')
      .select('id, text, topic_id, topics(name)')
      .order('topic_id')
      .order('id');

    // Filter by single question, topic, or get all
    if (questionId) {
      query = query.eq('id', questionId);
    } else if (topicId) {
      query = query.eq('topic_id', topicId);
    }

    const { data: questions, error: questionsError } = await query;
    if (questionsError) throw questionsError;

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: 'No questions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format questions
    let formattedQuestions: Question[] = questions.map(q => ({
      id: q.id,
      text: q.text,
      topic_id: q.topic_id,
      topic_name: (q.topics as any)?.name || q.topic_id,
    }));

    console.log(`Found ${formattedQuestions.length} total questions`);

    // If skipExisting, filter out questions with answers
    if (skipExisting) {
      const { data: existingAnswers, error: existingError } = await supabase
        .from('party_answers')
        .select('question_id')
        .eq('party_id', partyId);

      if (existingError) {
        console.error('Error fetching existing answers:', existingError);
      } else if (existingAnswers && existingAnswers.length > 0) {
        const existingQuestionIds = new Set(existingAnswers.map(a => a.question_id));
        const originalCount = formattedQuestions.length;
        formattedQuestions = formattedQuestions.filter(q => !existingQuestionIds.has(q.id));
        console.log(`Skipping ${originalCount - formattedQuestions.length} questions with existing answers`);
      }
    }

    if (formattedQuestions.length === 0) {
      console.log(`All questions already have answers for ${partyContext.name}`);
      return new Response(JSON.stringify({
        success: true,
        message: `All questions already have answers for ${partyContext.name}`,
        questionsProcessed: 0,
        party: partyContext.name,
        skipped: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${formattedQuestions.length} questions for ${partyContext.name}...`);

    // Process in batches (smaller batch size for grounding to manage rate limits)
    let totalInserted = 0;
    let totalErrors = 0;
    let totalResearched = 0;

    for (let i = 0; i < formattedQuestions.length; i += batchSize) {
      const batch = formattedQuestions.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(formattedQuestions.length / batchSize);
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} questions)`);

      try {
        // Phase 1: Research each question with Gemini grounding
        const researchResults = new Map<string, GroundingResult>();
        
        if (hasGrounding) {
          for (const q of batch) {
            const research = await researchPartyPosition(partyContext.name, q.text, q.topic_name);
            researchResults.set(q.id, research);
            if (research.success) totalResearched++;
            
            // Rate limiting: 2 second delay between grounding calls for reliability
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          console.log(`Researched ${batch.length} questions, ${researchResults.size} with results`);
        }

        // Phase 2: Score based on research
        const answers = await getPartyStances(batch, partyId, partyContext, researchResults);

        if (answers.length > 0) {
          const { error: upsertError } = await supabase
            .from('party_answers')
            .upsert(answers, { 
              onConflict: 'party_id,question_id',
              ignoreDuplicates: false 
            });

          if (upsertError) {
            console.error(`Upsert error:`, upsertError);
            totalErrors += batch.length;
          } else {
            totalInserted += answers.length;
            console.log(`Inserted ${answers.length} answers (total: ${totalInserted})`);
          }
        }
      } catch (batchError) {
        console.error(`Batch error:`, batchError);
        totalErrors += batch.length;
      }

      // Delay between batches
      if (i + batchSize < formattedQuestions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Population complete for ${partyContext.name}: ${totalInserted} inserted, ${totalErrors} errors, ${totalResearched} researched`);

    return new Response(JSON.stringify({
      success: true,
      party: partyContext.name,
      partyId,
      questionsProcessed: formattedQuestions.length,
      inserted: totalInserted,
      errors: totalErrors,
      researched: totalResearched,
      groundingEnabled: hasGrounding,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in populate-party-answers function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
