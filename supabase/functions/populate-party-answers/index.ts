import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  callGeminiGrounded,
  extractJson,
  GeminiQuotaError,
  getGoogleAIKey,
  resolveGroundedSources,
} from '../_shared/gemini-research.ts';

// Declare EdgeRuntime for background processing
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  evidence_type?: 'platform' | 'inferred_from_reps' | 'ai_inferred' | 'mixed';
  rep_voting_summary?: string;
  has_discrepancy?: boolean;
  discrepancy_note?: string;
}

interface RepConsensus {
  avgScore: number;
  count: number;
  confidence: string;
  highConfidenceCount: number;
}

/**
 * Smart truncation that preserves sentence/word boundaries
 */
function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) return text.slice(0, sentenceEnd + 1);
  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) return text.slice(0, lastSpace) + '...';
  return text.slice(0, maxLength - 3) + '...';
}

function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

/**
 * PHASE 1: Query representative voting consensus for a given question and party.
 * This is the PRIMARY source — actions speak louder than words.
 */
async function getRepresentativeConsensus(
  questionId: string,
  partyId: string,
  supabase: any,
): Promise<RepConsensus | null> {
  const partyName =
    partyId === 'democrat' ? 'Democrat' : partyId === 'republican' ? 'Republican' : null;

  if (!partyName) {
    console.log(`[RepConsensus] No rep aggregation for party: ${partyId}`);
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('candidate_answers')
      .select(`
        answer_value,
        confidence,
        candidate_id,
        candidates!inner(party)
      `)
      .eq('question_id', questionId)
      .eq('candidates.party', partyName)
      .in('confidence', ['high', 'medium']);

    if (error) {
      console.error(`[RepConsensus] Query error for ${questionId}:`, error);
      return null;
    }

    if (!data || data.length < 10) {
      console.log(
        `[RepConsensus] Insufficient data for ${questionId}: ${data?.length || 0} reps (need 10+)`,
      );
      return null;
    }

    const avgScore =
      data.reduce((sum: number, d: any) => sum + d.answer_value, 0) / data.length;
    const highConfidenceCount = data.filter((d: any) => d.confidence === 'high').length;

    const snappedScore = [-10, -5, 0, 5, 10].reduce((prev, curr) =>
      Math.abs(curr - avgScore) < Math.abs(prev - avgScore) ? curr : prev,
    );

    // Strong consensus = HIGH confidence (>30% high confidence answers)
    const confidence = highConfidenceCount > data.length * 0.3 ? 'high' : 'medium';

    console.log(
      `[RepConsensus] ${partyName} on ${questionId}: ${data.length} reps, avg=${avgScore.toFixed(2)}, snapped=${snappedScore}, confidence=${confidence}`,
    );

    return { avgScore: snappedScore, count: data.length, confidence, highConfidenceCount };
  } catch (e) {
    console.error(`[RepConsensus] Error for ${questionId}:`, e);
    return null;
  }
}

/**
 * PHASE 2: Research AND score a batch of questions using Gemini with Google Search grounding.
 * Returns scored results plus raw grounding metadata for URL resolution.
 */
async function researchAndScorePartyBatch(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
): Promise<{
  scores: Map<string, { score: number; confidence: string; description: string; keyQuote: string }>;
  rawSources: import('../_shared/gemini-research.ts').RawSource[];
}> {
  const scores = new Map<
    string,
    { score: number; confidence: string; description: string; keyQuote: string }
  >();

  const questionList = questions
    .map((q, i) => `${i + 1}. [${q.id}] ${q.text} (topic: ${q.topic_name})`)
    .join('\n');

  const prompt = `You are a non-partisan political research analyst. Research the ${partyContext.name}'s OFFICIAL position on each question below.

PRIORITY SOURCES (in order):
1. Official 2024 party platform document (${partyContext.officialPlatformUrl})
2. Recent policy statements from party leadership (2023-2025)
3. Party voting patterns in Congress
4. Official party website policy pages

RECENCY: Use ONLY the latest official platform. Do NOT reference outdated platforms from previous election cycles.

SOURCE SPECIFICITY: Each cited source MUST explicitly discuss the specific issue in the question.

QUESTIONS:
${questionList}

SCORING SCALE:
-10 = Strong Progressive/Left  |  -5 = Moderate Progressive/Left
 0  = Genuinely neutral, mixed, OR no documented position
+5  = Moderate Conservative/Right  |  +10 = Strong Conservative/Right
Only use these exact values.

REQUIRED OUTPUT — respond with ONLY a valid JSON array, no prose:
[
  {
    "question_id": "<exact id from brackets>",
    "answer_value": <-10|-5|0|5|10>,
    "confidence": "<high|medium|low>",
    "source_description": "<Affirmative position statement: '[Party Name] [supports/opposes] [policy], per [source].' Use 'No documented position found' when no evidence. NO URLs in this field.>",
    "key_quote": "<verbatim short quote from the best source that proves this position, or empty string>",
    "source_url": "<most specific URL to the exact page/section — never a homepage — or empty string>"
  }
]`;

  const systemInstruction = `You research US political party positions from authoritative sources. Output only valid JSON arrays.`;

  const { rawSources, text } = await callGeminiGrounded({
    prompt,
    systemInstruction,
    temperature: 0.2,
    maxOutputTokens: 4096,
    timeoutMs: 90_000,
  });

  const parsed = extractJson<Array<Record<string, unknown>>>(text);
  if (!Array.isArray(parsed)) {
    console.warn('[PartyResearch] Could not parse JSON from Gemini response');
    return { scores, rawSources };
  }

  const validIds = new Set(questions.map(q => q.id));

  for (const item of parsed) {
    const qid = String(item.question_id ?? '').replace(/[\[\]]/g, '');
    if (!validIds.has(qid)) continue;

    const rawScore = typeof item.answer_value === 'number' ? item.answer_value : 0;
    const score = snapToValidValue(rawScore);
    const desc = String(item.source_description ?? 'No documented position');
    const hasValidSource =
      desc.length > 10 && !desc.toLowerCase().includes('no documented');

    scores.set(qid, {
      score: hasValidSource ? score : 0,
      confidence: hasValidSource ? String(item.confidence || 'medium') : 'low',
      description: hasValidSource ? desc : 'No documented position found',
      keyQuote: String(item.key_quote ?? ''),
    });
  }

  return { scores, rawSources };
}

/**
 * PHASE 3: AI inference as final fallback using Gemini (no grounding — pure reasoning).
 * Used when no rep data or platform evidence exists.
 */
async function inferPartyPosition(
  question: Question,
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  relatedAnswers: PartyAnswer[],
): Promise<{ score: number; reasoning: string } | null> {
  const relatedContext =
    relatedAnswers.length > 0
      ? `\nRelated documented positions from the same topic:\n${relatedAnswers
          .map(a => `- Score ${a.answer_value}: ${smartTruncate(a.source_description, 200)}`)
          .join('\n')}`
      : '';

  const prompt = `You are a political analyst inferring a party's likely position where no explicit documentation exists.

IMPORTANT: This is an INFERENCE based on general party ideology — NOT a documented fact.

Party ideology reference:
- Democrats typically favour: government programmes, regulations, progressive social policies, environmental protection, worker protections
- Republicans typically favour: smaller government, deregulation, traditional values, free markets, states' rights
- Libertarians typically favour: minimal government, individual liberty, free markets, non-intervention
- Greens typically favour: environmental protection, social justice, grassroots democracy, peace

SCORING:
-10 = Strong Progressive/Left  |  -5 = Moderate Progressive/Left
 0  = Cannot reasonably infer (truly novel or genuinely bipartisan)
+5  = Moderate Conservative/Right  |  +10 = Strong Conservative/Right

Question: "${question.text}"
${relatedContext}

Infer ${partyContext.name}'s likely position. Return ONLY a JSON object:
{"score": <-10|-5|0|5|10>, "reasoning": "<2-3 sentence explanation referencing core party values or related known positions>"}`;

  try {
    const { text } = await callGeminiGrounded({
      prompt,
      temperature: 0.3,
      maxOutputTokens: 300,
      grounding: false, // Pure reasoning — no web search needed for ideological inference
      timeoutMs: 30_000,
    });

    const parsed = extractJson<{ score: number; reasoning: string }>(text);
    if (parsed && typeof parsed.score === 'number') {
      const score = snapToValidValue(parsed.score);
      const reasoning = parsed.reasoning || 'Inferred from general party ideology.';
      console.log(`[AIInference] ${partyId} on ${question.id}: score=${score}`);
      return { score, reasoning };
    }
  } catch (e) {
    console.error(`[AIInference] Error for ${question.id}:`, e);
  }

  return null;
}

/**
 * Main processing function with evidence hierarchy:
 * 1. Rep Consensus (HIGH confidence) — actions speak louder than words
 * 2. Gemini grounded research (MEDIUM confidence) — official platform + web
 * 3. Gemini inference (LOW confidence) — educated guess from party ideology
 */
async function processQuestionsWithHierarchy(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  supabase: any,
): Promise<{ answers: PartyAnswer[]; researched: number }> {
  const answers: PartyAnswer[] = [];
  const questionsNeedingResearch: Question[] = [];
  let totalResearched = 0;

  // ============================================
  // PHASE 1: Check rep consensus for ALL questions FIRST
  // ============================================
  console.log(`[Phase1] Checking rep consensus for ${questions.length} questions...`);

  for (const q of questions) {
    const consensus = await getRepresentativeConsensus(q.id, partyId, supabase);

    if (consensus && Math.abs(consensus.avgScore) >= 3) {
      answers.push({
        party_id: partyId,
        question_id: q.id,
        answer_value: consensus.avgScore,
        source_description: `${partyContext.name} position based on voting patterns of ${consensus.count} party representatives.`,
        source_url: null,
        source_urls: [],
        source_titles: [],
        confidence: consensus.confidence,
        notes: `Position derived from how ${consensus.count} ${partyContext.name} representatives (${consensus.highConfidenceCount} with high confidence) voted on this issue. Actions speak louder than words.`,
        evidence_type: 'inferred_from_reps',
        rep_voting_summary: `${consensus.count} reps averaged ${consensus.avgScore > 0 ? 'Conservative' : 'Progressive'} position (${consensus.avgScore}/10).`,
        has_discrepancy: false,
        discrepancy_note: undefined,
      });

      console.log(
        `[Phase1] ${q.id}: Used rep consensus (${consensus.count} reps, score=${consensus.avgScore})`,
      );
    } else {
      questionsNeedingResearch.push(q);
    }
  }

  console.log(
    `[Phase1] Complete: ${answers.length} from rep consensus, ${questionsNeedingResearch.length} need research`,
  );

  // ============================================
  // PHASE 2: Gemini grounded research for questions WITHOUT strong rep consensus
  // ============================================
  if (questionsNeedingResearch.length > 0) {
    console.log(
      `[Phase2] Gemini research for ${questionsNeedingResearch.length} questions...`,
    );

    // Process in batches of 5 to keep prompts manageable
    const RESEARCH_BATCH = 5;
    const researchScores = new Map<
      string,
      { score: number; confidence: string; description: string; keyQuote: string }
    >();
    const researchSourcesByQ = new Map<string, { url: string; title: string }[]>();

    for (let i = 0; i < questionsNeedingResearch.length; i += RESEARCH_BATCH) {
      const batch = questionsNeedingResearch.slice(i, i + RESEARCH_BATCH);

      try {
        const { scores, rawSources } = await researchAndScorePartyBatch(
          batch,
          partyId,
          partyContext,
        );

        // Resolve sources once per batch; use per-question key_quote for the best one
        // We take the first scored question's key_quote as the batch anchor
        const firstScoredQ = batch.find(q => scores.get(q.id)?.keyQuote);
        const anchorQuote = firstScoredQ ? (scores.get(firstScoredQ.id)?.keyQuote ?? '') : '';

        const resolvedSources = await resolveGroundedSources(rawSources, {
          keyQuote: anchorQuote,
          limit: 5,
        });

        for (const q of batch) {
          const s = scores.get(q.id);
          if (s) {
            researchScores.set(q.id, s);
            if (s.score !== 0 && s.confidence !== 'low') {
              totalResearched++;
            }
          }
          researchSourcesByQ.set(q.id, resolvedSources);
        }
      } catch (e) {
        console.error(
          `[Phase2] Gemini error on batch ${Math.floor(i / RESEARCH_BATCH) + 1}:`,
          e,
        );
        // Leave batch questions without scores → they fall to Phase 3
      }

      // Small delay between batches
      if (i + RESEARCH_BATCH < questionsNeedingResearch.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const questionsNeedingInference: Question[] = [];

    for (const q of questionsNeedingResearch) {
      const scored = researchScores.get(q.id);
      const resolvedSources = researchSourcesByQ.get(q.id) ?? [];

      if (scored && scored.score !== 0 && scored.confidence !== 'low') {
        // Check for discrepancy with any weak rep data
        const weakConsensus = await getRepresentativeConsensus(q.id, partyId, supabase);

        let hasDiscrepancy = false;
        let discrepancyNote: string | undefined;
        let repVotingSummary: string | undefined;

        if (weakConsensus && weakConsensus.count >= 5) {
          const platformDirection = scored.score > 0 ? 1 : -1;
          const repDirection = weakConsensus.avgScore > 0 ? 1 : -1;

          if (platformDirection !== repDirection) {
            hasDiscrepancy = true;
            repVotingSummary = `${weakConsensus.count} reps averaged ${weakConsensus.avgScore > 0 ? 'Conservative' : 'Progressive'} (${weakConsensus.avgScore}/10).`;
            discrepancyNote = `Platform indicates ${scored.score > 0 ? 'conservative' : 'progressive'} stance, but ${weakConsensus.count} representatives vote ${weakConsensus.avgScore > 0 ? 'conservatively' : 'progressively'}.`;
            console.log(
              `[Phase2] Discrepancy detected for ${q.id}: platform=${scored.score}, reps=${weakConsensus.avgScore}`,
            );
          }
        }

        answers.push({
          party_id: partyId,
          question_id: q.id,
          answer_value: scored.score,
          source_description: scored.description,
          source_url: resolvedSources[0]?.url ?? partyContext.officialPlatformUrl,
          source_urls: resolvedSources.map(s => s.url),
          source_titles: resolvedSources.map(s => s.title),
          confidence: 'medium',
          notes: null,
          evidence_type: hasDiscrepancy ? 'mixed' : 'platform',
          rep_voting_summary: repVotingSummary,
          has_discrepancy: hasDiscrepancy,
          discrepancy_note: discrepancyNote,
        });

        console.log(`[Phase2] ${q.id}: Used Gemini research (score=${scored.score})`);
      } else {
        questionsNeedingInference.push(q);
      }
    }

    // ============================================
    // PHASE 3: AI inference for remaining questions
    // ============================================
    if (questionsNeedingInference.length > 0) {
      console.log(
        `[Phase3] AI inference for ${questionsNeedingInference.length} questions...`,
      );

      const answeredByTopic = new Map<string, PartyAnswer[]>();
      for (const a of answers) {
        const q = questions.find(q => q.id === a.question_id);
        if (q && a.answer_value !== 0) {
          const existing = answeredByTopic.get(q.topic_id) || [];
          existing.push(a);
          answeredByTopic.set(q.topic_id, existing);
        }
      }

      for (const q of questionsNeedingInference) {
        const relatedAnswers = answeredByTopic.get(q.topic_id) || [];
        const inference = await inferPartyPosition(q, partyId, partyContext, relatedAnswers);

        if (inference && inference.score !== 0) {
          answers.push({
            party_id: partyId,
            question_id: q.id,
            answer_value: inference.score,
            source_description: `${partyContext.name} position inferred from general party ideology. ${inference.reasoning}`,
            source_url: null,
            source_urls: [],
            source_titles: [],
            confidence: 'low',
            notes: 'No official documentation or voting record found. Position estimated from general party ideology and related stances.',
            evidence_type: 'ai_inferred',
            rep_voting_summary: undefined,
            has_discrepancy: false,
            discrepancy_note: undefined,
          });

          console.log(`[Phase3] ${q.id}: AI inferred (score=${inference.score})`);
        } else {
          answers.push({
            party_id: partyId,
            question_id: q.id,
            answer_value: 0,
            source_description: 'No documented position found',
            source_url: null,
            source_urls: [],
            source_titles: [],
            confidence: 'low',
            notes: 'No official documentation, voting record, or reasonable ideological inference available.',
            evidence_type: undefined,
            rep_voting_summary: undefined,
            has_discrepancy: false,
            discrepancy_note: undefined,
          });

          console.log(`[Phase3] ${q.id}: No position determinable`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(
    `Processing complete: ${answers.length} total answers, ${totalResearched} researched`,
  );
  return { answers, researched: totalResearched };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const adminCheckClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
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

  try {
    if (!getGoogleAIKey()) {
      throw new Error('GOOGLE_AI_API_KEY (or GOOGLE_GEMINI_API_KEY) not configured');
    }

    const { topicId, partyId, questionId, batchSize = 10, skipExisting = true } =
      await req.json();

    if (!partyId) {
      return new Response(
        JSON.stringify({
          error: 'partyId is required. Process one party at a time to avoid timeouts.',
          validParties: ['democrat', 'republican', 'green', 'libertarian'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const partyContext = PARTY_CONTEXT[partyId as keyof typeof PARTY_CONTEXT];
    if (!partyContext) {
      return new Response(
        JSON.stringify({
          error: `Invalid partyId: ${partyId}`,
          validParties: ['democrat', 'republican', 'green', 'libertarian'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(
      `Starting party answers generation for ${partyContext.name}, skipExisting=${skipExisting}`,
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from('questions')
      .select('id, text, topic_id, topics(name)')
      .order('topic_id')
      .order('id');

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

    let formattedQuestions: Question[] = questions.map((q: any) => ({
      id: q.id,
      text: q.text,
      topic_id: q.topic_id,
      topic_name: (q.topics as any)?.name || q.topic_id,
    }));

    console.log(`Found ${formattedQuestions.length} total questions`);

    if (skipExisting) {
      const { data: existingAnswers, error: existingError } = await supabase
        .from('party_answers')
        .select('question_id')
        .eq('party_id', partyId);

      if (existingError) {
        console.error('Error fetching existing answers:', existingError);
      } else if (existingAnswers && existingAnswers.length > 0) {
        const existingQuestionIds = new Set(existingAnswers.map((a: any) => a.question_id));
        const originalCount = formattedQuestions.length;
        formattedQuestions = formattedQuestions.filter(
          (q: Question) => !existingQuestionIds.has(q.id),
        );
        console.log(
          `Skipping ${originalCount - formattedQuestions.length} questions with existing answers`,
        );
      }
    }

    if (formattedQuestions.length === 0) {
      console.log(`All questions already have answers for ${partyContext.name}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `All questions already have answers for ${partyContext.name}`,
          questionsProcessed: 0,
          party: partyContext.name,
          skipped: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Processing ${formattedQuestions.length} questions for ${partyContext.name}...`);

    // Run processing in background to avoid 150s idle timeout
    const backgroundWork = async () => {
      let totalInserted = 0;
      let totalErrors = 0;
      let totalResearched = 0;

      for (let i = 0; i < formattedQuestions.length; i += batchSize) {
        const batch = formattedQuestions.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(formattedQuestions.length / batchSize);
        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} questions)`);

        try {
          const { answers, researched } = await processQuestionsWithHierarchy(
            batch,
            partyId,
            partyContext,
            supabase,
          );

          totalResearched += researched;

          if (answers.length > 0) {
            const { error: upsertError } = await supabase
              .from('party_answers')
              .upsert(answers, { onConflict: 'party_id,question_id', ignoreDuplicates: false });

            if (upsertError) {
              console.error(`Upsert error:`, upsertError);
              totalErrors += batch.length;
            } else {
              totalInserted += answers.length;
              console.log(`Inserted ${answers.length} answers (total: ${totalInserted})`);
            }
          }
        } catch (batchError) {
          if (batchError instanceof GeminiQuotaError) {
            console.warn(`Google AI quota exceeded — stopping early.`);
            break;
          }
          console.error(`Batch error:`, batchError);
          totalErrors += batch.length;
        }

        if (i + batchSize < formattedQuestions.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(
        `Population complete for ${partyContext.name}: ${totalInserted} inserted, ${totalErrors} errors, ${totalResearched} researched`,
      );
    };

    EdgeRuntime.waitUntil(backgroundWork());

    return new Response(
      JSON.stringify({
        success: true,
        party: partyContext.name,
        partyId,
        questionsToProcess: formattedQuestions.length,
        status: 'processing_in_background',
        message: `Started background processing of ${formattedQuestions.length} questions for ${partyContext.name}. Check logs for progress.`,
        evidenceHierarchy: ['inferred_from_reps (HIGH)', 'platform (MEDIUM)', 'ai_inferred (LOW)'],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
