import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callGeminiGrounded,
  extractJson,
  getGoogleAIKey,
  resolveGroundedSources,
} from '../_shared/gemini-research.ts';

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BATCH_SIZE_PER_AI_CALL = 5; // Questions per Gemini scoring call
const MAX_QUESTIONS_PER_OFFICIAL = 15;

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

/**
 * Research and score a batch of questions for one official using a single
 * Gemini grounded call. Returns scored results and the raw grounding sources
 * so URLs can be resolved and stored.
 */
async function researchAndScoreBatch(
  officialName: string,
  office: string,
  state: string,
  party: string,
  questions: Question[],
): Promise<{
  scores: Map<string, { score: number; confidence: string; description: string }>;
  keyQuote: string;
  rawSources: import('../_shared/gemini-research.ts').RawSource[];
}> {
  const scores = new Map<string, { score: number; confidence: string; description: string }>();

  const questionList = questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.text} (topic: ${q.topic_name})`)
    .join('\n');

  const prompt = `You are a non-partisan political research analyst. Research ${officialName}'s positions on the following questions.

${officialName} serves as ${office} (${party}, ${state}).

RESEARCH SOURCES (prioritise in this order):
1. Official voting records on state legislation
2. Public statements, press releases, interviews
3. Campaign positions and platform
4. Official government website policy pages
5. News coverage of their documented stance

QUESTIONS:
${questionList}

SCORING SCALE:
-10 = Strong Progressive/Left  |  -5 = Moderate Progressive/Left
 0  = Neutral / no documented position
+5  = Moderate Conservative/Right  |  +10 = Strong Conservative/Right
Only use these exact values.

REQUIRED OUTPUT — respond with ONLY a valid JSON array, no prose:
[
  {
    "question_id": "<exact id from brackets>",
    "answer_value": <-10|-5|0|5|10>,
    "confidence": "<high|medium|low>",
    "source_description": "<50-80 words. Prefix with evidence type: VOTING RECORD:, PUBLIC STATEMENT:, or CAMPAIGN POSITION:. Use 'No documented position found' when no evidence.>",
    "key_quote": "<verbatim short quote from the best source, or empty string>",
    "source_url": "<most specific URL that directly supports this answer — exact page/section, never a homepage — or empty string>"
  }
]`;

  const systemInstruction = `You research and score US civic officials' policy positions. Output only valid JSON arrays.`;

  const { rawSources, text } = await callGeminiGrounded({
    prompt,
    systemInstruction,
    temperature: 0.2,
    maxOutputTokens: 4096,
    timeoutMs: 90_000,
  });

  const parsed = extractJson<Array<Record<string, unknown>>>(text);
  if (!Array.isArray(parsed)) {
    console.warn('[ResearchScore] Could not parse JSON from Gemini response');
    return { scores, keyQuote: '', rawSources };
  }

  const validIds = new Set(questions.map(q => q.id));
  let firstKeyQuote = '';

  for (const item of parsed) {
    const qid = String(item.question_id ?? '').replace(/[\[\]]/g, '');
    if (!validIds.has(qid)) continue;

    const rawScore = typeof item.answer_value === 'number' ? item.answer_value : 0;
    const score = snapToValidValue(rawScore);
    const desc = String(item.source_description ?? 'No documented position');
    const hasValidSource =
      desc.length > 10 && !desc.toLowerCase().includes('no documented');

    if (!firstKeyQuote && item.key_quote) {
      firstKeyQuote = String(item.key_quote);
    }

    scores.set(qid, {
      score: hasValidSource ? score : 0,
      confidence: hasValidSource ? String(item.confidence || 'medium') : 'low',
      description: hasValidSource ? desc : 'No documented position found',
    });
  }

  return { scores, keyQuote: firstKeyQuote, rawSources };
}

async function processOfficial(
  candidateId: string,
  officialName: string,
  office: string,
  state: string,
  party: string,
  questions: Question[],
  supabase: any,
): Promise<{ answersCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let answersCreated = 0;

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

  console.log(
    `[${officialName}] Processing ${unanswered.length} unanswered questions (${existingIds.size} already answered)`,
  );

  const toProcess = unanswered.slice(0, MAX_QUESTIONS_PER_OFFICIAL);

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE_PER_AI_CALL) {
    const batch = toProcess.slice(i, i + BATCH_SIZE_PER_AI_CALL);

    let scores: Map<string, { score: number; confidence: string; description: string }>;
    let keyQuote: string;
    let rawSources: import('../_shared/gemini-research.ts').RawSource[];

    try {
      ({ scores, keyQuote, rawSources } = await researchAndScoreBatch(
        officialName, office, state, party, batch,
      ));
    } catch (e) {
      console.error(`[${officialName}] Gemini error on batch ${i / BATCH_SIZE_PER_AI_CALL + 1}:`, e);
      errors.push(`batch_${i}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    // Resolve grounding sources to real, validated, deep-linked URLs.
    const resolvedSources = await resolveGroundedSources(rawSources, { keyQuote, limit: 3 });
    const primarySourceUrl = resolvedSources[0]?.url ?? null;

    for (const q of batch) {
      const scored = scores.get(q.id);
      if (!scored) continue;

      const { error } = await supabase
        .from('candidate_answers')
        .upsert(
          {
            candidate_id: candidateId,
            question_id: q.id,
            answer_value: scored.score,
            source_type: scored.confidence === 'low' ? 'ai_inferred' : 'public_statement',
            source_url: primarySourceUrl,
            source_description: scored.description,
            confidence: scored.confidence,
          },
          { onConflict: 'candidate_id,question_id', ignoreDuplicates: false },
        );

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
    const avg =
      allAnswers.reduce((s: number, a: any) => s + a.answer_value, 0) / allAnswers.length;
    const snapped = snapToValidValue(Math.round(avg * 100) / 100);

    await supabase
      .from('candidate_overrides')
      .update({ overall_score: snapped, updated_at: new Date().toISOString() })
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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminCheckClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminCheckClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!getGoogleAIKey()) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_AI_API_KEY (or GOOGLE_GEMINI_API_KEY) not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { candidateId, batchSize = 3 } = body;

    // Load only local-scope questions (civic officials answer local topics only)
    const { data: localTopics } = await supabase
      .from('topics')
      .select('id')
      .eq('scope', 'local');
    const localTopicIds = (localTopics || []).map((t: any) => t.id);

    const { data: questions } = await supabase
      .from('questions')
      .select('id, text, topic_id, topics:topic_id(name)')
      .in('topic_id', localTopicIds);

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
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Processing single official: ${official.name} (${official.office})`);

      const responsePromise = processOfficial(
        official.candidate_id,
        official.name || official.candidate_id,
        official.office || 'Unknown',
        official.state || 'Unknown',
        official.party || 'Unknown',
        questionList,
        supabase,
      );

      // Return immediately, process in background
      EdgeRuntime.waitUntil(
        responsePromise
          .then(result => {
            console.log(
              `[${official.name}] Complete: ${result.answersCreated} answers, ${result.errors.length} errors`,
            );
          })
          .catch(e => {
            console.error(`[${official.name}] Background error:`, e);
          }),
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Processing ${official.name} in background. Check logs for progress.`,
          candidateId: official.candidate_id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
        JSON.stringify({
          success: true,
          message: 'No civic officials found to process',
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Batch processing ${officials.length} civic officials`);

    EdgeRuntime.waitUntil(
      (async () => {
        for (const off of officials) {
          try {
            const result = await processOfficial(
              off.candidate_id,
              off.name || off.candidate_id,
              off.office || 'Unknown',
              off.state || 'Unknown',
              off.party || 'Unknown',
              questionList,
              supabase,
            );
            console.log(
              `[Batch] ${off.name}: ${result.answersCreated} answers, ${result.errors.length} errors`,
            );
          } catch (e) {
            console.error(`[Batch] ${off.name} error:`, e);
          }
        }
      })(),
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processing ${officials.length} officials in background`,
        officials: officials.map((o: any) => o.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in populate-civic-answers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
