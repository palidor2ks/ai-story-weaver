import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Helper function to ensure score is calculated and saved from candidate_answers.
 * This is the PRIMARY source of truth for political scores.
 */
async function ensureScoreIsSaved(
  supabase: any,
  candidateId: string,
  answers: Array<{ answer_value: number }>
): Promise<void> {
  if (!answers || answers.length === 0) return;

  // Calculate score from answers
  const totalScore = answers.reduce((sum, a) => sum + a.answer_value, 0);
  const overallScore = Math.round((totalScore / answers.length) * 100) / 100;

  // Check if candidate exists in candidates table
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id, overall_score')
    .eq('id', candidateId)
    .maybeSingle();

  if (existingCandidate) {
    // Only update if score is different or missing
    if (existingCandidate.overall_score !== overallScore) {
      const { error: updateError } = await supabase
        .from('candidates')
        .update({
          overall_score: overallScore,
          last_answers_sync: new Date().toISOString(),
        })
        .eq('id', candidateId);

      if (updateError) {
        console.error('Error updating candidates score:', updateError);
      } else {
        console.log(`Updated candidates.overall_score to ${overallScore} for ${candidateId}`);
      }
    }
  } else {
    // Check if override exists and has correct score
    const { data: existingOverride } = await supabase
      .from('candidate_overrides')
      .select('candidate_id, overall_score')
      .eq('candidate_id', candidateId)
      .maybeSingle();

    if (!existingOverride || existingOverride.overall_score !== overallScore) {
      const { error: overrideError } = await supabase
        .from('candidate_overrides')
        .upsert({
          candidate_id: candidateId,
          overall_score: overallScore,
        }, {
          onConflict: 'candidate_id',
          ignoreDuplicates: false,
        });

      if (overrideError) {
        console.error('Error upserting candidate_overrides score:', overrideError);
      } else {
        console.log(`Saved candidate_overrides.overall_score ${overallScore} for ${candidateId}`);
      }
    }
  }
}

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
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

// Snap AI-generated values to the nearest valid discrete score
function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

async function generateAnswersWithAI(
  candidateName: string,
  candidateParty: string,
  candidateOffice: string,
  candidateState: string,
  questions: Question[]
): Promise<GeneratedAnswer[]> {
  // Format questions with their specific answer options
  const questionsText = questions
    .map((q, i) => {
      let questionStr = `${i + 1}. [${q.id}] ${q.text}`;
      if (q.question_options && q.question_options.length > 0) {
        const sortedOptions = [...q.question_options].sort((a, b) => a.value - b.value);
        const optionsStr = sortedOptions
          .map(opt => `   (${opt.value}) ${opt.text}`)
          .join('\n');
        questionStr += `\n   Options:\n${optionsStr}`;
      }
      return questionStr;
    })
    .join('\n\n');

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

CRITICAL: You MUST use ONLY these exact values: -10, -5, 0, +5, or +10.
NO intermediate values like -7, -3, +2, +8, etc. are allowed.

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
- answer_value: MUST be one of the exact option values provided for that question (e.g., -10, -5, 0, 5, or 10)
- confidence: "high" (verified from voting record), "medium" (inferred from party/statements), or "low" (estimated)
- source_description: brief source (e.g., "Inferred from ${candidateParty} Party platform", "Based on voting record", "State political context")
- notes: brief explanation if notable (null if standard party position)

IMPORTANT: Only use the exact numeric values shown in the Options for each question. Do not use intermediate values.

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
    
    // Handle rate limit and payment errors gracefully - return empty instead of throwing
    if (response.status === 402 || response.status === 429) {
      console.log(`AI Gateway ${response.status} - returning empty answers for ${candidateName}`);
      return []; // Return empty array so caller can use existing data
    }
    
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
        // Strip brackets from question_id (AI sometimes returns "[eco1]" instead of "eco1")
        question_id: String(item.question_id || '').replace(/[\[\]]/g, ''),
        answer_value: snapToValidValue(item.answer_value),
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
    const { 
      candidateId, 
      questionIds, 
      forceRegenerate = false,
      // Allow passing candidate info directly for reps not in DB
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

    // Log existing answers count (we'll filter and generate missing ones below)
    if (existingAnswers && existingAnswers.length > 0) {
      console.log(`Found ${existingAnswers.length} existing answers for ${candidateId}`);
    }

    // Get candidate info - first try from request params, then database
    let officialInfo: { id: string; name: string; party: string; office: string; state: string } | null = null;

    // If candidate info was passed directly, use it
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
      // Try to find in candidates table
      const { data: candidate } = await supabase
        .from('candidates')
        .select('id, name, party, office, state')
        .eq('id', candidateId)
        .maybeSingle();

      if (candidate) {
        officialInfo = candidate;
      } else {
        // Try static_officials table
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
      console.log(`Candidate ${candidateId} not found in DB and no info provided`);
      return new Response(JSON.stringify({ 
        error: 'Candidate not found. Provide candidateName, candidateParty, candidateOffice, and candidateState.',
        answers: existingAnswers || [],
        source: 'database',
        count: existingAnswers?.length || 0,
      }), {
        status: 200, // Return 200 with empty answers instead of 404
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get questions to generate answers for (including their options for the AI prompt)
    let questionsQuery = supabase
      .from('questions')
      .select('id, text, topic_id, question_options(value, text)');
    
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
        
        // Calculate and save the overall score based on ALL answers for this candidate
        const { data: allCandidateAnswers } = await supabase
          .from('candidate_answers')
          .select('answer_value')
          .eq('candidate_id', candidateId);
        
        if (allCandidateAnswers && allCandidateAnswers.length > 0) {
          const totalScore = allCandidateAnswers.reduce((sum, a) => sum + a.answer_value, 0);
          const overallScore = Math.round((totalScore / allCandidateAnswers.length) * 100) / 100;
          
          // Check if candidate exists in candidates table
          const { data: existingCandidate } = await supabase
            .from('candidates')
            .select('id')
            .eq('id', candidateId)
            .maybeSingle();
          
          if (existingCandidate) {
            // Update candidates table directly
            const { error: updateError } = await supabase
              .from('candidates')
              .update({ 
                overall_score: overallScore,
                last_answers_sync: new Date().toISOString(),
                answers_source: 'ai_generated'
              })
              .eq('id', candidateId);
            
            if (updateError) {
              console.error('Error updating candidates table:', updateError);
            } else {
              console.log(`Updated overall_score to ${overallScore} in candidates table for ${officialInfo.name}`);
            }
          } else {
            // For officials not in candidates table (civic officials, executives, etc.),
            // ALWAYS use candidate_overrides to persist the score
            const { error: overrideError } = await supabase
              .from('candidate_overrides')
              .upsert({
                candidate_id: candidateId,
                overall_score: overallScore,
              }, {
                onConflict: 'candidate_id',
                ignoreDuplicates: false,
              });
            
            if (overrideError) {
              console.error('Error upserting candidate_overrides:', overrideError);
            } else {
              console.log(`Saved overall_score ${overallScore} to candidate_overrides for ${officialInfo.name}`);
            }
          }
        }
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
