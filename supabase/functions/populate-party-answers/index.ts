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
  confidence: string;
  notes: string | null;
}

interface GroundingResult {
  researchText: string;
  sourceUrls: string[];
  success: boolean;
}

// Snap AI-generated values to the nearest valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Phase 1: Research party position using Gemini with Google Search grounding
 */
async function researchPartyPosition(
  partyName: string,
  questionText: string,
  topicName: string
): Promise<GroundingResult> {
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('GOOGLE_GEMINI_API_KEY not configured, skipping web research');
    return { researchText: '', sourceUrls: [], success: false };
  }

  const searchQuery = `${partyName} official position on ${topicName}: ${questionText} 2024 platform policy`;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Research the ${partyName}'s official documented position on: "${questionText}"
              
Look for:
- Official party platform documents
- Policy statements from party leadership
- Recent legislative positions

Summarize what you find with specific citations. If you cannot find a documented position, say "No documented position found."`
            }] 
          }],
          tools: [{
            google_search_retrieval: {
              dynamic_retrieval_config: { mode: "MODE_DYNAMIC" }
            }
          }]
        })
      }
    );

    if (!response.ok) {
      console.error(`Gemini grounding error: ${response.status}`);
      return { researchText: '', sourceUrls: [], success: false };
    }

    const data = await response.json();
    
    // Extract text content
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract source URLs from grounding metadata
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sourceUrls: string[] = [];
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sourceUrls.push(chunk.web.uri);
        }
      }
    }
    
    // Also check groundingSupports for additional URLs
    if (groundingMetadata?.groundingSupports) {
      for (const support of groundingMetadata.groundingSupports) {
        if (support.groundingChunkIndices) {
          // URLs already captured above
        }
      }
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(sourceUrls)].slice(0, 5); // Limit to 5 URLs

    console.log(`Grounding research for "${questionText.slice(0, 40)}...": ${researchText.length} chars, ${uniqueUrls.length} sources`);
    
    return {
      researchText: researchText.slice(0, 2000), // Limit research text
      sourceUrls: uniqueUrls,
      success: researchText.length > 50
    };
  } catch (e) {
    console.error('Gemini grounding error:', e);
    return { researchText: '', sourceUrls: [], success: false };
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

  // NEUTRAL, EVIDENCE-ONLY PROMPT
  const systemPrompt = `You are a non-partisan political analyst scoring party positions based on RESEARCH FINDINGS provided.

EVIDENCE-BASED SCORING RULES:
- ONLY assign non-zero scores when RESEARCH FINDINGS contain SPECIFIC EVIDENCE:
  * Official party platform statements with citations
  * Policy positions from party leadership
  * Congressional voting patterns
- If RESEARCH FINDINGS say "No documented position" or lack evidence: answer_value = 0, confidence = "low"
- Source MUST be from the research, not assumed

SCORING SCALE:
- -10 = Far Left/Progressive position (documented in research)
- -5 = Left-leaning position (documented in research)
- 0 = Neutral, no clear position, OR NOT DOCUMENTED (use when research lacks evidence)
- +5 = Right-leaning position (documented in research)
- +10 = Far Right/Conservative position (documented in research)

CRITICAL: 
- Only score what the RESEARCH FINDINGS explicitly document
- When research is empty or says "no documented position", return 0 with confidence "low"
- You MUST use ONLY these exact values: -10, -5, 0, +5, or +10`;

  const userPrompt = `Score the ${partyContext.name}'s positions based on the RESEARCH FINDINGS provided for each question.

Questions with Research:
${questionsWithResearch}

For each question, provide a JSON array with objects containing:
- question_id: EXACTLY as shown in brackets (e.g., "gun1", "cr2") - do NOT include the brackets
- answer_value: MUST be exactly one of these integers: -10, -5, 0, 5, or 10
  * Use 0 if research shows no documented position
- confidence: "high" (explicit documented statement), "medium" (inferred from evidence), "low" (no documented position - must be 0)
- source_description: Brief citation from research (e.g., "2024 Platform, healthcare section") or "No documented position"
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
          
          // Use primary source URL from research, fallback to party platform
          const primaryUrl = research?.sourceUrls?.[0] || partyContext.officialPlatformUrl;
          const allSourceUrls = research?.sourceUrls || [];
          
          return {
            party_id: partyId,
            question_id: questionId,
            answer_value: answerValue,
            source_description: sourceDesc,
            source_url: primaryUrl,
            source_urls: allSourceUrls,
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
    const { topicId, partyId, batchSize = 10, skipExisting = true } = await req.json();

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

    if (topicId) {
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
            
            // Rate limiting: 1.5 second delay between grounding calls
            await new Promise(resolve => setTimeout(resolve, 1500));
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
