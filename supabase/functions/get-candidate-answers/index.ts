import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Question {
  id: string;
  text: string;
  topic_id: string;
}

interface GeneratedAnswer {
  question_id: string;
  answer_value: number;
  source_description: string;
  source_url: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

async function generateAnswersWithAI(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[]
): Promise<GeneratedAnswer[]> {
  const questionsText = questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.text}`)
    .join('\n');

  const systemPrompt = `You are a non-partisan political analyst determining likely positions for elected officials based on:
- Their party's official platform
- Their voting record (if available)
- Public statements and campaign positions
- Their state/district's political leanings
- Common positions for officials in similar roles

CRITICAL - Use the LEFT-RIGHT political spectrum for scoring:
- -10 = Far LEFT / Very progressive position (typical Democrat/Green positions)
- -5 = Left-leaning / Progressive position
- 0 = Neutral, centrist, or no clear position
- +5 = Right-leaning / Conservative position  
- +10 = Far RIGHT / Very conservative position (typical Republican positions)

IMPORTANT: Democrats should generally have NEGATIVE scores (left-leaning).
Republicans should generally have POSITIVE scores (right-leaning).

Be as accurate as possible based on available public information. If uncertain, use party platform as baseline with medium confidence.`;

  const userPrompt = `Determine the likely positions of this elected official on each question:

Official: ${candidateName}
Party: ${candidateParty}
Office: ${candidateOffice}
State: ${candidateState}

Questions:
${questionsText}

For each question, provide a JSON array with objects containing:
- question_id: the ID in brackets
- answer_value: integer from -10 to +10
- confidence: "high" (verified from voting record), "medium" (inferred from party/statements), or "low" (estimated)
- source_description: brief source (e.g., "Inferred from ${candidateParty} Party platform", "Based on voting record", "State political context")
- notes: brief explanation if notable (null if standard party position)

Return ONLY a valid JSON array, no other text.`;

  console.log(`Generating AI answers for ${candidateName} on ${questions.length} questions...`);

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
    console.error('AI Gateway error:', response.status, errorText);
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  let answers: GeneratedAnswer[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      answers = parsed.map((item: any) => ({
        question_id: item.question_id,
        answer_value: Math.max(-10, Math.min(10, Math.round(item.answer_value))),
        source_description: item.source_description || `Inferred from ${candidateParty} Party platform`,
        source_url: null,
        confidence: item.confidence || 'low',
        notes: item.notes || null,
      }));
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    console.error('Raw content:', content.slice(0, 500));
  }

  console.log(`Generated ${answers.length} answers for ${candidateName}`);
  return answers;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateId, questionIds, forceRegenerate = false } = await req.json();

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

    // First, check for existing answers in the database
    let existingAnswersQuery = supabase
      .from('candidate_answers')
      .select('*')
      .eq('candidate_id', candidateId);
    
    if (questionIds && questionIds.length > 0) {
      existingAnswersQuery = existingAnswersQuery.in('question_id', questionIds);
    }

    const { data: existingAnswers, error: existingError } = await existingAnswersQuery;
    if (existingError) throw existingError;

    // If we have answers and not forcing regeneration, return them
    if (existingAnswers && existingAnswers.length > 0 && !forceRegenerate) {
      console.log(`Found ${existingAnswers.length} existing answers for ${candidateId}`);
      return new Response(JSON.stringify({
        answers: existingAnswers,
        source: 'database',
        count: existingAnswers.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get candidate info for AI generation
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('id, name, party, office, state')
      .eq('id', candidateId)
      .maybeSingle();

    // Also check static_officials if not in candidates
    let officialInfo = candidate;
    if (!officialInfo) {
      const { data: staticOfficial } = await supabase
        .from('static_officials')
        .select('id, name, party, office, state')
        .eq('id', candidateId)
        .maybeSingle();
      officialInfo = staticOfficial;
    }

    if (!officialInfo) {
      return new Response(JSON.stringify({ 
        error: 'Candidate not found',
        answers: [],
        source: 'none',
        count: 0,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get questions to generate answers for
    let questionsQuery = supabase
      .from('questions')
      .select('id, text, topic_id');
    
    if (questionIds && questionIds.length > 0) {
      questionsQuery = questionsQuery.in('id', questionIds);
    }

    const { data: questions, error: questionsError } = await questionsQuery;
    if (questionsError) throw questionsError;

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({
        answers: [],
        source: 'none',
        count: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter out questions we already have answers for (unless forceRegenerate)
    const existingQuestionIds = new Set((existingAnswers || []).map(a => a.question_id));
    const questionsToGenerate = forceRegenerate 
      ? questions 
      : questions.filter(q => !existingQuestionIds.has(q.id));

    if (questionsToGenerate.length === 0) {
      console.log('All questions already have answers');
      return new Response(JSON.stringify({
        answers: existingAnswers || [],
        source: 'database',
        count: existingAnswers?.length || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate answers with AI
    console.log(`Generating AI answers for ${officialInfo.name}...`);
    const generatedAnswers = await generateAnswersWithAI(
      officialInfo.name,
      officialInfo.party,
      officialInfo.office,
      officialInfo.state,
      questionsToGenerate
    );

    // Save generated answers to database
    const answersToInsert = generatedAnswers.map(answer => ({
      candidate_id: candidateId,
      question_id: answer.question_id,
      answer_value: answer.answer_value,
      source_description: answer.source_description,
      source_url: answer.source_url,
      source_type: 'other', // AI-generated
      confidence: answer.confidence,
    }));

    if (answersToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('candidate_answers')
        .upsert(answersToInsert, {
          onConflict: 'candidate_id,question_id',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('Error inserting AI-generated answers:', insertError);
        // Still return the generated answers even if save fails
      } else {
        console.log(`Saved ${answersToInsert.length} AI-generated answers for ${officialInfo.name}`);
      }
    }

    // Return combined existing + generated answers
    const allAnswers = [
      ...(existingAnswers || []).filter(a => 
        !generatedAnswers.some(g => g.question_id === a.question_id)
      ),
      ...answersToInsert,
    ];

    return new Response(JSON.stringify({
      answers: allAnswers,
      source: generatedAnswers.length > 0 ? 'ai_generated' : 'database',
      generated: generatedAnswers.length,
      existing: (existingAnswers || []).length,
      count: allAnswers.length,
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
