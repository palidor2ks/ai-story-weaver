// generate-legislator-answers
// Fills in missing candidate_answers for sub-federal candidates — state legislators,
// local officials (mayors, county commissioners, city council members, etc.) — using
// the Google Gemini API with Search Grounding. One Gemini call per candidate covers
// ALL missing questions vs one call per question in the existing get-candidate-answers path.
//
// Candidates already at their answer ceiling are skipped immediately (getMissingQuestions
// returns []), so including local officials that are already complete costs nothing.
//
// Sign convention: in this system -10 = far LEFT (liberal/progressive) and +10 = far RIGHT
// (conservative). Each question shows its two labeled option texts so Gemini can pick the
// correct value without ambiguity — "support/oppose" framing is NOT used because for most
// questions the left-leaning option is to SUPPORT a policy (e.g. raise minimum wage = -10).
//
// Cost: ~$0.038/candidate (grounding $0.035 + tokens ~$0.003)
//
// Requires: GOOGLE_AI_API_KEY secret in Supabase Vault.
// Trigger:  POST /functions/v1/generate-legislator-answers  (admin auth or cron-secret)
// Body:     { offset?, limit?, state?, dryRun?, selfChain?, candidateIds? }
//           candidateIds: regenerate exactly these candidates (targeted remediation); bypasses
//           the office/state/offset batch filter and self-chaining.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  demoteUnverifiableVoteClaims,
  demoteUncitedWebResearch,
  dropStanceInconsistent,
} from "../_shared/answer-label-guard.ts";
import { isCronAuthorized } from "../_shared/cron-auth.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const GOOGLE_AI_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_BATCH_SIZE = 10;
const DELAY_MS = 2000;
// Chunk questions so each Gemini call's JSON output stays within maxOutputTokens.
// Asking for all 344 questions in one call can overflow → unparseable response → 0 answers.
// Each chunk is accumulated and written immediately (idempotent resume on re-run).
const QUESTION_CHUNK_SIZE = 50;

// Match the valid answer values used everywhere else in the app.
const VALID_VALUES = [-10, -7, -5, -3, 0, 3, 5, 7, 10];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapToValid(v: unknown): number {
  const n = typeof v === 'number' ? Math.round(v) : 0;
  return VALID_VALUES.reduce((best, val) =>
    Math.abs(val - n) < Math.abs(best - n) ? val : best, 0);
}

function extractJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const brace = text.match(/(\{[\s\S]*\})/);
  if (brace) { try { return JSON.parse(brace[1]); } catch { /* fall through */ } }
  return null;
}

function validEvidenceType(raw: unknown): string {
  const allowed = ['voting_record', 'public_statement', 'campaign_position', 'inferred'];
  return allowed.includes(String(raw)) ? String(raw) : 'inferred';
}

function evidenceToSourceType(e: string): string {
  if (e === 'voting_record') return 'voting_record';
  if (e === 'public_statement') return 'public_statement';
  if (e === 'campaign_position') return 'campaign_website';
  return 'other';
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionOption { value: number; text: string; }
interface Question { id: string; topic_id: string; text: string; question_options: QuestionOption[]; }
interface Candidate { id: string; name: string; party: string; office: string; state: string; }

interface RawAnswer {
  question_id?: unknown;
  answer_value?: unknown;
  evidence_type?: unknown;
  confidence?: unknown;
  source_description?: unknown;
  source_url?: unknown;
  stance?: unknown;
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function getMissingQuestions(
  supabase: ReturnType<typeof createClient>,
  candidateId: string,
): Promise<Question[]> {
  const [{ data: all }, { data: existing }] = await Promise.all([
    supabase.from('questions').select('id, topic_id, text, question_options(value, text)').eq('include_in_politician_quiz', true),
    supabase.from('candidate_answers').select('question_id').eq('candidate_id', candidateId),
  ]);
  const answered = new Set((existing ?? []).map((a: { question_id: string }) => a.question_id));
  return (all ?? []).filter((q: Question) => !answered.has(q.id));
}

async function callGemini(candidate: Candidate, questions: Question[]): Promise<RawAnswer[] | null> {
  // Show Gemini the actual labeled option texts for each question so it picks the
  // correct value rather than mapping "support" → positive (which is wrong for 87% of
  // questions where the LEFT-leaning action is to support a policy, e.g. raise minimum
  // wage = -10, not +10). The two extremes are shown; Gemini interpolates within the range.
  const list = questions.map((q, i) => {
    const opts = (q.question_options ?? []).sort((a, b) => a.value - b.value);
    const libOpt  = opts.find(o => o.value <= -5);
    const consOpt = opts.find(o => o.value >= 5);
    const optLines = [
      libOpt  ? `   ${libOpt.value}: ${libOpt.text}` : '   -10: (liberal / progressive position)',
      consOpt ? `   +${consOpt.value}: ${consOpt.text}` : '   +10: (conservative position)',
    ].join('\n');
    return `${i + 1}. [${q.id}] ${q.text}\n${optLines}`;
  }).join('\n\n');

  const prompt =
`Research ${candidate.name}, a ${candidate.party} ${candidate.office} from ${candidate.state}.

Using web search, find their positions based on voting record, public statements, campaign website, interviews, and news.

For EACH policy question below, choose the answer_value whose labeled option BEST matches this politician's known or inferred position. Each question shows two labeled options:
  Negative values (-10 to -3) = the left-leaning / progressive option
  Positive values (+3 to +10) = the right-leaning / conservative option
  0 = neutral / no clear position

Preferred values: -10, -7, -5, -3, 0, 3, 5, 7, 10.

${list}

Return ONLY a JSON object with this exact structure — include an entry for EVERY question above:
{
  "answers": [
    {
      "question_id": "<the bracketed id from above>",
      "answer_value": <integer matching the chosen option value, or 0>,
      "evidence_type": "<voting_record | public_statement | campaign_position | inferred>",
      "confidence": "<high | medium | low>",
      "source_description": "<evidence summary, or party-alignment reasoning if inferred>",
      "source_url": "<URL string or null>"
    }
  ]
}

Rules:
- Use "voting_record" only for a direct vote or bill sponsorship
- Use "public_statement" for a quote, interview, or press release
- Use "campaign_position" for campaign website or official platform
- Use "inferred" when inferring from ${candidate.party} party norms (no specific evidence found)
- Set source_url to null when no specific URL is available
- Never leave out a question — return exactly ${questions.length} answers`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 65536 },
  };

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_AI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Gemini ${res.status}: ${msg.slice(0, 300)}`);
  }

  const data = await res.json();
  // Gemini 2.5 Flash emits thinking parts (thought: true) before the actual output;
  // find the first non-thinking part that contains text.
  const parts: Array<{ thought?: boolean; text?: string }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  const outputPart = parts.find(p => !p.thought && p.text) ?? parts[0];
  const text: string = outputPart?.text ?? '';
  const parsed = extractJson(text);

  if (!parsed || !Array.isArray(parsed.answers)) {
    const finishReason = data?.candidates?.[0]?.finishReason ?? 'unknown';
    const snippet = text.slice(0, 400);
    console.error('[Gemini] Unparseable response. finishReason:', finishReason, 'text:', snippet);
    throw new Error(`parse_failed[${finishReason}]: ${snippet}`);
  }
  return parsed.answers as RawAnswer[];
}

async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  candidate: Candidate,
  dryRun: boolean,
): Promise<{ answered: number; missing: number; skipped?: boolean; error?: string; failedChunks?: number }> {
  const missing = await getMissingQuestions(supabase, candidate.id);
  if (missing.length === 0) return { answered: 0, missing: 0, skipped: true };

  console.log(`[research] ${candidate.name} (${candidate.state} ${candidate.office}) — ${missing.length} missing`);

  if (dryRun) return { answered: 0, missing: missing.length };

  const missingIds = new Set(missing.map(q => q.id));

  // Whether we hold real votes for this candidate — needed by demoteUnverifiableVoteClaims.
  const { count: voteRowCount } = await supabase
    .from('candidate_votes')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidate.id);
  const hasVotes = (voteRowCount ?? 0) > 0;

  // Chunk questions so each Gemini call's JSON stays within the output token budget.
  // Write each chunk immediately (idempotent — re-runs resume via getMissingQuestions).
  const questionChunks = chunk(missing, QUESTION_CHUNK_SIZE);
  let answered = 0;
  let totalDropped = 0;
  let failedChunks = 0;

  for (let i = 0; i < questionChunks.length; i++) {
    let part: RawAnswer[] | null;
    try {
      part = await callGemini(candidate, questionChunks[i]);
    } catch (e) {
      failedChunks++;
      console.error(`[chunk] ${candidate.name}: chunk ${i + 1}/${questionChunks.length} failed:`, e);
      continue;
    }
    if (!part) {
      failedChunks++;
      console.error(`[chunk] ${candidate.name}: chunk ${i + 1}/${questionChunks.length} parse failed`);
      continue;
    }

    const parsedRows = [];
    for (const raw of part) {
      const qid = String(raw.question_id ?? '');
      if (!missingIds.has(qid)) continue;
      if (typeof raw.answer_value !== 'number' && typeof raw.answer_value !== 'string') continue;

      const evidenceType = validEvidenceType(raw.evidence_type);
      const sourceUrl = typeof raw.source_url === 'string' && raw.source_url.startsWith('http')
        ? raw.source_url : null;

      parsedRows.push({
        candidate_id: candidate.id,
        question_id: qid,
        answer_value: snapToValid(typeof raw.answer_value === 'string'
          ? Number(raw.answer_value) : raw.answer_value),
        evidence_type: evidenceType,
        source_type: evidenceToSourceType(evidenceType),
        confidence: ['high', 'medium', 'low'].includes(String(raw.confidence))
          ? String(raw.confidence) : 'low',
        source_description: String(raw.source_description ?? '').slice(0, 1000),
        source_url: sourceUrl,
        source_urls: sourceUrl ? [sourceUrl] : [],
        source_titles: [],
        // `stance` is not in the labeled-option prompt but is kept as an optional safety
        // net for the dropStanceInconsistent guard (null stance → guard is a no-op).
        stance: typeof raw.stance === 'string' ? raw.stance : null,
      });
    }

    // Integrity guards (shared with get-candidate-answers):
    // 1. Drop any answer where stated stance contradicts sign of answer_value.
    // 2. Demote uncited voting_record claims for candidates with no vote data.
    // 3. Demote web_research labels with no citation.
    const { kept, dropped } = dropStanceInconsistent(parsedRows);
    totalDropped += dropped.length;

    const guarded = demoteUncitedWebResearch(demoteUnverifiableVoteClaims(kept, hasVotes));
    // Strip the transient `stance` field — not a candidate_answers column.
    const rows = guarded.map(({ stance: _stance, ...row }) => row);
    if (rows.length === 0) continue;

    // ignoreDuplicates: true — never overwrite higher-quality existing answers.
    // (getMissingQuestions pre-filters so conflicts only happen on race conditions.)
    const { error: upsertErr } = await supabase
      .from('candidate_answers')
      .upsert(rows, { onConflict: 'candidate_id,question_id', ignoreDuplicates: true });
    if (upsertErr) throw new Error(upsertErr.message);
    answered += rows.length;
  }

  if (totalDropped > 0) {
    console.log(`[guard] ${candidate.name}: dropped ${totalDropped} stance-inconsistent answer(s)`);
  }

  if (answered === 0) {
    return { answered: 0, missing: missing.length, error: 'no valid rows parsed', ...(failedChunks ? { failedChunks } : {}) };
  }

  // Re-derive persisted overall_score from TRUSTED answers only, so the headline score
  // always reflects the guard-filtered data (mirrors isTrustedForScoring in src/lib/scoring.ts).
  await updateCandidateScore(supabase, candidate.id, candidate.name);

  console.log(`[done] ${candidate.name}: wrote ${answered}/${missing.length}${failedChunks ? ` (${failedChunks} chunk(s) failed)` : ''}`);
  return { answered, missing: missing.length, ...(failedChunks ? { failedChunks } : {}) };
}

// Re-derive candidates.overall_score from TRUSTED answers only (vote-derived or carrying
// a real source URL), mirroring isTrustedForScoring in src/lib/scoring.ts.
async function updateCandidateScore(
  supabase: ReturnType<typeof createClient>,
  candidateId: string,
  candidateName: string,
): Promise<void> {
  const { data: allAnswers } = await supabase
    .from('candidate_answers')
    .select('answer_value, evidence_type, source_type, source_url, source_urls')
    .eq('candidate_id', candidateId);

  if (!allAnswers || allAnswers.length === 0) return;

  const isTrusted = (a: Record<string, unknown>): boolean =>
    a.evidence_type === 'voting_record' || a.source_type === 'voting_record' ||
    (typeof a.source_url === 'string' && a.source_url.trim().length > 0) ||
    (Array.isArray(a.source_urls) && a.source_urls.some((u) => typeof u === 'string' && u.trim().length > 0));

  const trusted = (allAnswers as Array<Record<string, unknown>>).filter(isTrusted);
  if (trusted.length === 0) {
    console.log(`[score] No trusted answers for ${candidateName}; leaving overall_score unchanged`);
    return;
  }

  const totalScore = trusted.reduce((sum, a) => sum + Number(a.answer_value), 0);
  const overallScore = Math.round((totalScore / trusted.length) * 100) / 100;

  const { error } = await supabase.from('candidates').update({
    overall_score: overallScore,
    last_answers_sync: new Date().toISOString(),
    answers_source: 'ai_generated',
  }).eq('id', candidateId);

  if (error) {
    console.error(`[score] failed to update overall_score for ${candidateName}:`, error.message);
    return;
  }
  console.log(`[score] ${candidateName}: overall_score = ${overallScore} (${trusted.length} trusted)`);
}

// ── Background batch processor ────────────────────────────────────────────────

async function runBatch(params: {
  offset: number;
  limit: number;
  state: string | null;
  dryRun: boolean;
  selfChain: boolean;
  supabase: ReturnType<typeof createClient>;
  candidates: Candidate[];
}) {
  const { offset, limit, dryRun, selfChain, supabase, candidates } = params;

  const results: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    const cancelCheck = await supabase
      .from('admin_stats_cache')
      .select('stat_value')
      .eq('stat_key', 'legislator_answers_cancel')
      .maybeSingle();
    if ((cancelCheck.data?.stat_value as { cancel?: boolean } | null)?.cancel) {
      console.log('[cancel] cancellation requested — stopping');
      break;
    }

    try {
      const result = await processCandidate(supabase, candidate, dryRun);
      results.push({ name: candidate.name, id: candidate.id, ...result });
    } catch (e) {
      console.error(`[error] ${candidate.name}:`, e);
      results.push({ name: candidate.name, id: candidate.id, error: String(e) });
    }

    await delay(DELAY_MS);
  }

  // Write progress snapshot
  await supabase.from('admin_stats_cache').upsert({
    stat_key: 'legislator_answers_progress',
    stat_value: {
      offset,
      limit,
      processedBatch: results.length,
      dryRun,
      completedAt: new Date().toISOString(),
      results: results.slice(-20),
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stat_key' });

  // Self-chain: if this batch was full, there may be more candidates
  if (selfChain && !dryRun && candidates.length === limit) {
    const nextOffset = offset + limit;
    console.log(`[chain] continuing from offset ${nextOffset}`);
    await fetch(`${SUPABASE_URL}/functions/v1/generate-legislator-answers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offset: nextOffset, limit, selfChain: true }),
    });
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Auth: service-role bearer or cron-secret (via shared helper) OR admin user profile.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (!(await isCronAuthorized(req))) {
      const { data: { user }, error: authErr } =
        await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token);
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const offset = Number(body.offset ?? 0);
    const limit = Number(body.limit ?? DEFAULT_BATCH_SIZE);
    const state = typeof body.state === 'string' ? body.state.toUpperCase() : null;
    const dryRun = body.dryRun === true;
    // candidateIds: targeted remediation — regenerate exactly these candidates (bounded spend,
    // bypasses office/state/offset filter and self-chaining).
    const candidateIds = Array.isArray(body.candidateIds)
      ? (body.candidateIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : null;
    const targeted = candidateIds !== null && candidateIds.length > 0;
    const selfChain = !targeted && body.selfChain !== false;

    if (!GOOGLE_AI_KEY && !dryRun) return json({ error: 'GOOGLE_AI_API_KEY not configured' }, 500);

    // Resolve hidden states
    const { data: hiddenRows } = await supabase.from('hidden_states').select('state_code');
    const hidden = new Set((hiddenRows ?? []).map((r: { state_code: string }) => r.state_code));

    // Fetch this batch of sub-federal candidates. getMissingQuestions returns [] for
    // already-complete candidates so they are skipped without any API spend.
    let query = supabase
      .from('candidates')
      .select('id, name, party, office, state');
    if (targeted) {
      query = query.in('id', candidateIds!);
    } else {
      query = query
        .not('office', 'ilike', '%U.S. House%')
        .not('office', 'ilike', '%U.S. Senate%')
        .not('office', 'ilike', '%President%')
        .not('office', 'ilike', 'Representative')
        .not('office', 'ilike', 'Senator')
        .order('state,name')
        .range(offset, offset + limit - 1);
      if (state) query = query.eq('state', state);
    }

    const { data: raw, error: qErr } = await query;
    if (qErr) return json({ error: qErr.message }, 500);

    // Targeted runs honour the operator's explicit list even for hidden states;
    // the batch sweep still skips hidden states.
    const candidates: Candidate[] = targeted
      ? (raw ?? [])
      : (raw ?? []).filter((c: Candidate) => !hidden.has(c.state));

    if (candidates.length === 0) return json({ done: true, offset });

    // Fire background work; return immediately so the HTTP response doesn't time out
    EdgeRuntime.waitUntil(runBatch({ offset, limit, state, dryRun, selfChain, supabase, candidates }));

    return json({ started: true, offset, limit, batchSize: candidates.length, dryRun, targeted });

  } catch (e) {
    console.error('[generate-legislator-answers]', e);
    return json({ error: String(e) }, 500);
  }
});
