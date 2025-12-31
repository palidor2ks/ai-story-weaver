import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Party platform reference data - sources only, no assumed positions
const PARTY_CONTEXT = {
  democrat: {
    name: 'Democratic Party',
    officialPlatformUrl: 'https://democrats.org/where-we-stand/party-platform/',
    sources: ['2024 Democratic Party Platform document', 'Official DNC policy statements', 'Congressional Democratic Caucus voting records'],
  },
  republican: {
    name: 'Republican Party',
    officialPlatformUrl: 'https://gop.com/platform/',
    sources: ['2024 Republican Party Platform document', 'Official RNC policy statements', 'Congressional Republican Conference voting records'],
  },
  green: {
    name: 'Green Party',
    officialPlatformUrl: 'https://gp.org/platform/',
    sources: ['Green Party Platform document', 'Official Green Party policy statements', 'Green New Deal proposals'],
  },
  libertarian: {
    name: 'Libertarian Party',
    officialPlatformUrl: 'https://lp.org/platform/',
    sources: ['Libertarian Party Platform document', 'Official LP policy statements', 'Libertarian position papers'],
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
  confidence: string;
  notes: string | null;
}

// Snap AI-generated values to the nearest valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

async function getPartyStances(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat
): Promise<PartyAnswer[]> {
  const questionsText = questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.text}`)
    .join('\n');

  // NEUTRAL, EVIDENCE-ONLY PROMPT
  const systemPrompt = `You are a non-partisan political analyst researching official party positions from documented sources.

EVIDENCE-BASED SCORING RULES:
- ONLY assign non-zero scores when you find SPECIFIC EVIDENCE in official party documents:
  * Official party platform documents (with specific section/page reference)
  * Official policy statements from party leadership
  * Aggregate Congressional voting patterns (with bill references if possible)
- If the party has NO documented position on a topic: answer_value = 0, confidence = "low"
- Source MUST be specific and verifiable (cite document section, not just "party platform")

SCORING SCALE:
- -10 = Far Left/Progressive position (documented in official sources)
- -5 = Left-leaning position (documented in official sources)
- 0 = Neutral, no clear position, OR NOT DOCUMENTED (use when no evidence exists)
- +5 = Right-leaning position (documented in official sources)
- +10 = Far Right/Conservative position (documented in official sources)

CRITICAL: 
- Do NOT assume positions based on general ideology
- Only score based on what is EXPLICITLY stated in official party documents
- When in doubt, return 0 with confidence "low"
- You MUST use ONLY these exact values: -10, -5, 0, +5, or +10`;

  const userPrompt = `Research the ${partyContext.name}'s DOCUMENTED positions on each question.

Reference Sources to check: ${partyContext.sources.join(', ')}
Official Platform URL: ${partyContext.officialPlatformUrl}

Questions:
${questionsText}

For each question, provide a JSON array with objects containing:
- question_id: EXACTLY as shown in brackets (e.g., "gun1", "cr2") - do NOT include the brackets
- answer_value: MUST be exactly one of these integers: -10, -5, 0, 5, or 10
  * Use 0 if the party has no documented position on this specific topic
- confidence: "high" (explicit platform statement), "medium" (inferred from voting patterns), "low" (no documented position - must be 0)
- source_description: SPECIFIC citation (e.g., "2024 Platform, Section 3.2" or "No documented position")
- notes: Brief explanation if needed, null otherwise

IMPORTANT: Do NOT infer positions from general party ideology. Only cite what is explicitly documented.
If you cannot find a specific position, return answer_value: 0 with source_description: "No documented position".

Return ONLY a valid JSON array, no other text. Example:
[{"question_id": "gun1", "answer_value": 0, "confidence": "low", "source_description": "No documented position", "notes": null}]`;

  console.log(`Querying AI for ${partyContext.name} stances on ${questions.length} questions...`);

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
      temperature: 0.2, // Lower temperature for more factual responses
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

  // Build a set of valid question IDs from this batch for validation
  const validQuestionIds = new Set(questions.map(q => q.id));

  // Parse JSON from response
  let answers: PartyAnswer[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      // Sanitize common AI JSON issues before parsing
      let cleanedJson = jsonMatch[0]
        .replace(/:\s*\+(\d)/g, ': $1')  // Fix +5 -> 5
        .replace(/,\s*}/g, '}')          // Remove trailing commas before }
        .replace(/,\s*]/g, ']');         // Remove trailing commas before ]
      
      const parsed = JSON.parse(cleanedJson);
      
      // Filter and validate each answer
      answers = parsed
        .filter((item: any) => {
          // Clean the question_id (remove brackets if present)
          const cleanId = String(item.question_id).replace(/[\[\]]/g, '');
          // Only include if it's a valid question ID from our batch
          if (!validQuestionIds.has(cleanId)) {
            console.warn(`Skipping invalid question_id: ${item.question_id} (cleaned: ${cleanId})`);
            return false;
          }
          return true;
        })
        .map((item: any) => {
          const hasValidSource = item.source_description && 
            !item.source_description.toLowerCase().includes('no documented') &&
            item.source_description.length > 10;
          
          // Enforce evidence-only: if no valid source, must be 0
          let answerValue = snapToValidValue(item.answer_value);
          let confidence = item.confidence || 'medium';
          let sourceDesc = item.source_description || 'No documented position';
          
          if (!hasValidSource && answerValue !== 0) {
            console.log(`Resetting unsourced answer for ${item.question_id}: ${answerValue} -> 0`);
            answerValue = 0;
            confidence = 'low';
            sourceDesc = 'No documented position';
          }
          
          return {
            party_id: partyId,
            question_id: String(item.question_id).replace(/[\[\]]/g, ''),
            answer_value: answerValue,
            source_description: sourceDesc,
            source_url: partyContext.officialPlatformUrl,
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
    const { topicId, partyId, batchSize = 15, skipExisting = true } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Require partyId to process one party at a time (prevents timeout)
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

    console.log(`Starting party answers generation for ${partyContext.name}, skipExisting=${skipExisting}`);

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

    // If skipExisting, filter out questions that already have answers for this party
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

    // Process in batches
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < formattedQuestions.length; i += batchSize) {
      const batch = formattedQuestions.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(formattedQuestions.length / batchSize);
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} questions)`);

      try {
        const answers = await getPartyStances(batch, partyId, partyContext);

        if (answers.length > 0) {
          // Upsert answers (update if exists, insert if not)
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

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < formattedQuestions.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Population complete for ${partyContext.name}: ${totalInserted} inserted, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      party: partyContext.name,
      partyId,
      questionsProcessed: formattedQuestions.length,
      inserted: totalInserted,
      errors: totalErrors,
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
