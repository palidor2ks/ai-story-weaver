import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BATCH_SIZE_PER_AI_CALL = 5; // Questions per AI scoring call
const PERPLEXITY_DELAY_MS = 1500;
const MAX_PERPLEXITY_CALLS = 15; // Per official

function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) return text.slice(0, sentenceEnd + 1);
  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) return text.slice(0, lastSpace) + '...';
  return text.slice(0, maxLength - 3) + '...';
}

interface Question {
  id: string;
  text: string;
  topic_id: string;
  topic_name: string;
}

interface PerplexityResult {
  found: boolean;
  researchText: string;
  citations: string[];
}

async function researchOfficialWithPerplexity(
  officialName: string,
  office: string,
  state: string,
  party: string,
  questionText: string,
  topicName: string
): Promise<PerplexityResult> {
  if (!PERPLEXITY_API_KEY) {
    return { found: false, researchText: '', citations: [] };
  }

  try {
    await new Promise(r => setTimeout(r, PERPLEXITY_DELAY_MS));

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `You are a political research analyst finding ${officialName}'s position on policy questions.
${officialName} is ${office} (${party}, ${state}).

LOOK FOR:
- Official voting records on state legislation
- Public statements, interviews, press releases
- Campaign positions and platform
- Official government website policy pages
- News coverage of their stance

OUTPUT: Provide factual evidence with specific citations. If no concrete evidence exists, clearly state "NO DOCUMENTED POSITION FOUND".`
          },
          {
            role: 'user',
            content: `Research ${officialName}'s position on: "${questionText}"

Topic area: ${topicName}
Context: ${officialName} is ${office} in ${state} (${party})`
          }
        ],
        search_recency_filter: 'year'
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[Perplexity] Rate limited');
      } else {
        console.error(`[Perplexity] API error: ${response.status}`);
      }
      return { found: false, researchText: '', citations: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    const hasEvidence = !content.toLowerCase().includes('no documented position') &&
                        !content.toLowerCase().includes('no evidence found') &&
                        content.length > 100;

    return {
      found: hasEvidence,
      researchText: hasEvidence ? smartTruncate(content, 2000) : '',
      citations: citations.slice(0, 5),
    };
  } catch (e) {
    console.error('[Perplexity] Research error:', e);
    return { found: false, researchText: '', citations: [] };
  }
}

async function scoreResearchBatch(
  officialName: string,
  office: string,
  party: string,
  questions: Question[],
  researchResults: Map<string, PerplexityResult>
): Promise<Map<string, { score: number; confidence: string; description: string }>> {
  const results = new Map();
  if (!LOVABLE_API_KEY || questions.length === 0) return results;

  const questionsWithResearch = questions.map((q, i) => {
    const research = researchResults.get(q.id);
    let ctx = '';
    if (research?.found && research.researchText) {
      ctx = `\n  RESEARCH: ${smartTruncate(research.researchText, 600)}`;
      if (research.citations.length > 0) {
        ctx += `\n  SOURCES: ${research.citations.join(', ')}`;
      }
    } else {
      ctx = '\n  RESEARCH: No documented position found.';
    }
    return `${i + 1}. [${q.id}] ${q.text}${ctx}`;
  }).join('\n\n');

  const systemPrompt = `You are a non-partisan political analyst scoring an elected official's positions based on RESEARCH FINDINGS.

Official: ${officialName} (${office}, ${party})

SCORING SCALE:
- -10 = Strong Progressive/Left position
- -5 = Moderate Progressive/Left lean
- 0 = Genuinely neutral, mixed, OR no documented position
- +5 = Moderate Conservative/Right lean
- +10 = Strong Conservative/Right position

You MUST use ONLY these exact values: -10, -5, 0, +5, or +10`;

  const userPrompt = `Score ${officialName}'s positions based on the RESEARCH FINDINGS provided.

Questions with Research:
${questionsWithResearch}

For each question, return a JSON array with objects containing:
- question_id: EXACTLY as shown in brackets
- answer_value: one of -10, -5, 0, 5, or 10
- confidence: "high" (explicit statement/vote), "medium" (inferred), "low" (no evidence)
- source_description: 50-80 word factual summary. Format with evidence type prefix (e.g. "VOTING RECORD:", "PUBLIC STATEMENT:", "CAMPAIGN POSITION:"). Use "No documented position found" when no evidence.

Return ONLY a valid JSON array.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error(`[ScoreBatch] AI Gateway error: ${response.status}`);
      return results;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const cleanedJson = jsonMatch[0]
        .replace(/:\s*\+(\d)/g, ': $1')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      const parsed = JSON.parse(cleanedJson);
      const validIds = new Set(questions.map(q => q.id));

      for (const item of parsed) {
        const qid = String(item.question_id).replace(/[\[\]]/g, '');
        if (!validIds.has(qid)) continue;

        const score = snapToValidValue(item.answer_value || 0);
        const desc = item.source_description || 'No documented position';
        const hasValidSource = desc && !desc.toLowerCase().includes('no documented') && desc.length > 10;

        results.set(qid, {
          score: hasValidSource ? score : 0,
          confidence: hasValidSource ? (item.confidence || 'medium') : 'low',
          description: hasValidSource ? desc : 'No documented position found',
        });
      }
    }
  } catch (e) {
    console.error('[ScoreBatch] Error:', e);
  }

  return results;
}

async function processOfficial(
  candidateId: string,
  officialName: string,
  office: string,
  state: string,
  party: string,
  questions: Question[],
  supabase: any
): Promise<{ answersCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let answersCreated = 0;
  let perplexityCalls = 0;

  // Check which questions already have answers
  const { data: existing } = await supabase
    .from('candidate_answers')
    .select('question_id')
    .eq('candidate_id', candidateId);

  const existingIds = new Set((existing || []).map((e: any) => e.question_id));
  const unanswered = questions.filter(q => !existingIds.has(q.id));

  if (unanswered.length === 0) {
    console.log(`[${officialName}] All questions already answered`);
    return { answersCreated: 0, errors: [] };
  }

  console.log(`[${officialName}] Processing ${unanswered.length} unanswered questions (${existingIds.size} already answered)`);

  // Research with Perplexity in batches
  const researchResults = new Map<string, PerplexityResult>();

  for (const q of unanswered) {
    if (perplexityCalls >= MAX_PERPLEXITY_CALLS) {
      console.log(`[${officialName}] Perplexity limit reached (${MAX_PERPLEXITY_CALLS})`);
      break;
    }

    const result = await researchOfficialWithPerplexity(
      officialName, office, state, party, q.text, q.topic_name
    );
    researchResults.set(q.id, result);
    perplexityCalls++;
  }

  // Score in batches
  const questionsToScore = unanswered.slice(0, MAX_PERPLEXITY_CALLS);
  for (let i = 0; i < questionsToScore.length; i += BATCH_SIZE_PER_AI_CALL) {
    const batch = questionsToScore.slice(i, i + BATCH_SIZE_PER_AI_CALL);
    const scores = await scoreResearchBatch(officialName, office, party, batch, researchResults);

    for (const q of batch) {
      const scored = scores.get(q.id);
      if (!scored) continue;

      const research = researchResults.get(q.id);
      const sourceUrl = research?.citations?.[0] || null;

      const { error } = await supabase
        .from('candidate_answers')
        .upsert({
          candidate_id: candidateId,
          question_id: q.id,
          answer_value: scored.score,
          source_type: scored.confidence === 'low' ? 'ai_inferred' : 'public_statement',
          source_url: sourceUrl,
          source_description: scored.description,
          confidence: scored.confidence,
        }, {
          onConflict: 'candidate_id,question_id',
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`${q.id}: ${error.message}`);
      } else {
        answersCreated++;
      }
    }
  }

  // Update overall score
  const { data: allAnswers } = await supabase
    .from('candidate_answers')
    .select('answer_value')
    .eq('candidate_id', candidateId);

  if (allAnswers && allAnswers.length > 0) {
    const avg = allAnswers.reduce((s: number, a: any) => s + a.answer_value, 0) / allAnswers.length;
    const snapped = snapToValidValue(Math.round(avg * 100) / 100);

    await supabase
      .from('candidate_overrides')
      .update({
        overall_score: snapped,
        updated_at: new Date().toISOString(),
      })
      .eq('candidate_id', candidateId);
  }

  return { answersCreated, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminCheckClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminCheckClient.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { candidateId, batchSize = 3 } = body;

    // Load questions with topics
    const { data: questions } = await supabase
      .from('questions')
      .select('id, text, topic_id, topics:topic_id(name)');

    const questionList: Question[] = (questions || []).map((q: any) => ({
      id: q.id,
      text: q.text,
      topic_id: q.topic_id,
      topic_name: q.topics?.name || 'General',
    }));

    if (candidateId) {
      // Process single official
      const { data: official } = await supabase
        .from('candidate_overrides')
        .select('candidate_id, name, office, party, state')
        .eq('candidate_id', candidateId)
        .single();

      if (!official) {
        return new Response(JSON.stringify({ error: 'Official not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`Processing single official: ${official.name} (${official.office})`);

      // Use background processing to avoid timeout
      const responsePromise = processOfficial(
        official.candidate_id,
        official.name || official.candidate_id,
        official.office || 'Unknown',
        official.state || 'Unknown',
        official.party || 'Unknown',
        questionList,
        supabase
      );

      // Return immediately, process in background
      EdgeRuntime.waitUntil(
        responsePromise.then(result => {
          console.log(`[${official.name}] Complete: ${result.answersCreated} answers, ${result.errors.length} errors`);
        }).catch(e => {
          console.error(`[${official.name}] Background error:`, e);
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Processing ${official.name} in background. Check logs for progress.`,
          candidateId: official.candidate_id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch mode: find civic officials with fewest answers
    const { data: officials } = await supabase
      .from('candidate_overrides')
      .select('candidate_id, name, office, party, state')
      .not('name', 'is', null)
      .or('candidate_id.like.openstates_%,candidate_id.like.nj_%,candidate_id.like.ny_%')
      .limit(batchSize);

    if (!officials || officials.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No civic officials found to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Batch processing ${officials.length} civic officials`);

    EdgeRuntime.waitUntil((async () => {
      for (const off of officials) {
        try {
          const result = await processOfficial(
            off.candidate_id,
            off.name || off.candidate_id,
            off.office || 'Unknown',
            off.state || 'Unknown',
            off.party || 'Unknown',
            questionList,
            supabase
          );
          console.log(`[Batch] ${off.name}: ${result.answersCreated} answers, ${result.errors.length} errors`);
        } catch (e) {
          console.error(`[Batch] ${off.name} error:`, e);
        }
      }
    })());

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processing ${officials.length} officials in background`,
        officials: officials.map(o => o.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in populate-civic-answers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
