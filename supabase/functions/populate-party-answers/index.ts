import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Party platform reference data for context
const PARTY_CONTEXT = {
  democrat: {
    name: 'Democratic Party',
    philosophy: 'Generally supports progressive policies: government-funded healthcare, environmental protection, labor rights, civil liberties, gun control, social safety nets, and reproductive rights.',
    sources: ['2024 Democratic Party Platform', 'democrats.org', 'Congressional voting records'],
  },
  republican: {
    name: 'Republican Party',
    philosophy: 'Generally supports conservative policies: limited government, free markets, traditional values, strong national defense, Second Amendment rights, lower taxes, and deregulation.',
    sources: ['2024 Republican Party Platform', 'gop.com', 'Congressional voting records'],
  },
  green: {
    name: 'Green Party',
    philosophy: 'Focuses on environmentalism, nonviolence, social justice, and grassroots democracy. Advocates for bold climate action, universal healthcare, anti-war foreign policy, and systemic change.',
    sources: ['Green Party Platform', 'gp.org', 'Green New Deal proposals'],
  },
  libertarian: {
    name: 'Libertarian Party',
    philosophy: 'Advocates for civil liberties, free markets, and minimal government intervention in both personal and economic matters. Opposes government overreach, supports individual freedom.',
    sources: ['Libertarian Party Platform', 'lp.org', 'Policy statements'],
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

async function getPartyStances(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat
): Promise<PartyAnswer[]> {
  const questionsText = questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.text}`)
    .join('\n');

  const systemPrompt = `You are a non-partisan political analyst determining official party positions.
You must analyze each question and determine where the ${partyContext.name} would stand based on:
- Official party platforms and policy documents
- Voting records of party members in Congress
- Public statements from party leadership
- Historical party positions

Score each answer from -10 to +10:
- -10 = Strongly oppose / Very conservative position
- -5 = Oppose / Conservative position
- 0 = Neutral or no clear party position
- +5 = Support / Progressive position
- +10 = Strongly support / Very progressive position

Be accurate to the party's actual documented positions. Include confidence level (high/medium/low) based on how clearly documented the position is.`;

  const userPrompt = `Analyze the ${partyContext.name}'s official position on each of these questions.

Party Philosophy: ${partyContext.philosophy}
Reference Sources: ${partyContext.sources.join(', ')}

Questions:
${questionsText}

For each question, provide a JSON array with objects containing:
- question_id: the ID in brackets
- answer_value: integer from -10 to +10
- confidence: "high", "medium", or "low"
- source_description: brief description of where this position comes from (e.g., "2024 Party Platform", "Congressional voting pattern")
- notes: optional brief explanation of the position (null if not needed)

Return ONLY a valid JSON array, no other text.`;

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
      temperature: 0.3,
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

  // Parse JSON from response
  let answers: PartyAnswer[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      answers = parsed.map((item: any) => ({
        party_id: partyId,
        question_id: item.question_id,
        answer_value: Math.max(-10, Math.min(10, Math.round(item.answer_value))),
        source_description: item.source_description || `${partyContext.name} Platform`,
        source_url: getSourceUrl(partyId),
        confidence: item.confidence || 'medium',
        notes: item.notes || null,
      }));
    }
  } catch (e) {
    console.error(`Failed to parse AI response for ${partyId}:`, e);
    console.error('Raw content:', content.slice(0, 500));
  }

  console.log(`Parsed ${answers.length} answers for ${partyContext.name}`);
  return answers;
}

function getSourceUrl(partyId: string): string {
  switch (partyId) {
    case 'democrat': return 'https://democrats.org/where-we-stand/party-platform/';
    case 'republican': return 'https://gop.com/platform/';
    case 'green': return 'https://gp.org/platform/';
    case 'libertarian': return 'https://lp.org/platform/';
    default: return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, partyId, batchSize = 20 } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

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
    const formattedQuestions: Question[] = questions.map(q => ({
      id: q.id,
      text: q.text,
      topic_id: q.topic_id,
      topic_name: (q.topics as any)?.name || q.topic_id,
    }));

    console.log(`Found ${formattedQuestions.length} questions to process`);

    // Determine which parties to process
    const partiesToProcess = partyId 
      ? [partyId] 
      : ['democrat', 'republican', 'green', 'libertarian'];

    const results: { party: string; inserted: number; errors: number }[] = [];

    for (const party of partiesToProcess) {
      const partyContext = PARTY_CONTEXT[party as keyof typeof PARTY_CONTEXT];
      if (!partyContext) continue;

      console.log(`Processing ${partyContext.name}...`);

      // Process in batches
      let totalInserted = 0;
      let totalErrors = 0;

      for (let i = 0; i < formattedQuestions.length; i += batchSize) {
        const batch = formattedQuestions.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} questions)`);

        try {
          const answers = await getPartyStances(batch, party, partyContext);

          if (answers.length > 0) {
            // Upsert answers (update if exists, insert if not)
            const { error: upsertError } = await supabase
              .from('party_answers')
              .upsert(answers, { 
                onConflict: 'party_id,question_id',
                ignoreDuplicates: false 
              });

            if (upsertError) {
              console.error(`Upsert error for ${party}:`, upsertError);
              totalErrors += batch.length;
            } else {
              totalInserted += answers.length;
            }
          }
        } catch (batchError) {
          console.error(`Batch error for ${party}:`, batchError);
          totalErrors += batch.length;
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < formattedQuestions.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      results.push({
        party: partyContext.name,
        inserted: totalInserted,
        errors: totalErrors,
      });
    }

    console.log('Population complete:', results);

    return new Response(JSON.stringify({
      success: true,
      questionsProcessed: formattedQuestions.length,
      results,
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
