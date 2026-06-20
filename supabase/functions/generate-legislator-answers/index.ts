// generate-legislator-answers
// Fills in missing candidate_answers for sub-federal candidates — state legislators,
// local officials (mayors, county commissioners, city council members, etc.) — using
// the Google Gemini API with Search Grounding. One Gemini call per candidate covers
// ALL missing questions vs one call per question in the existing get-candidate-answers path.
//
// Candidates already at their answer ceiling are skipped immediately (getMissingQuestions
// returns []), so including local officials that are already complete costs nothing.
//
// Cost: ~$0.038/candidate (grounding $0.035 + tokens ~$0.003) = ~$11 for all 286 visible-state legislators.
//
// Requires: GOOGLE_AI_API_KEY secret in Supabase Vault.
// Trigger:  POST /functions/v1/generate-legislator-answers  (admin auth)
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question { id: string; topic_id: string; text: string; }
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
    supabase.from('questions').select('id, topic_id, text').eq('include_in_politician_quiz', true),
    supabase.from('candidate_answers').select('question_id').eq('candidate_id', candidateId),
  ]);
  const answered = new Set((existing ?? []).map((a: { question_id: string }) => a.question_id));
  return (all ?? []).filter((q: Question) => !answered.has(q.id));
}

async function callGemini(candidate: Candidate, questions: Question[]): Promise<RawAnswer[] | null> {
  const list = questions.map((q, i) => `${i + 1}. [${q.id}] ${q.text}`).join('\n');

  const prompt =
`Research ${candidate.name}, a ${candidate.party} ${candidate.office} from ${candidate.state}.

Using web search, find their positions based on voting record, public statements, campaign website, interviews, and news.

Answer ALL ${questions.length} policy questions below on a scale from -10 (strongly oppose) to +10 (strongly support).
Preferred values: -10, -7, -5, -3, 0, 3, 5, 7, 10.

${list}

Return ONLY a JSON object with this exact structure — include an entry for EVERY question above:
{
  "answers": [
    {
      "question_id": "<the bracketed id from above>",
      "stance": "<support | oppose | neutral>",
      "answer_value": <integer>,
      "evidence_type": "<voting_record | public_statement | campaign_position | inferred>",
      "confidence": "<high | medium | low>",
      "source_description": "<evidence summary, or party-alignment reasoning if inferred>",
      "source_url": "<URL string or null>"
    }
  ]
}

Rules:
- "stance" is whether the candidate SUPPORTS or OPPOSES what the question asks.
- The SIGN of answer_value MUST match stance: stance "support" => POSITIVE answer_value (+3..+10);
  stance "oppose" => NEGATIVE answer_value (-3..-10); stance "neutral" => 0. Double-check the sign
  before answering: if your evidence shows the candidate sponsored, voted for, or favors the
  position, answer_value is POSITIVE — never negative.
- Use "voting_record" only for a direct vote or bill sponsorship
- Use "public_statement" for a quote, interview, or press release
- Use "campaign_position" for campaign website or official platform
- Use "inferred" when inferring from ${candidate.party} party norms (no specific evidence found)
- Set source_url to null when no specific URL is available
- Never leave out a question — return exactly ${questions.length} answers`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
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
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = extractJson(text);

  if (!parsed || !Array.isArray(parsed.answers)) {
    console.error('[Gemini] Unparseable response:', text.slice(0, 600));
    return null;
  }
  return parsed.answers as RawAnswer[];
}

async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  candidate: Candidate,
  dryRun: boolean,
): Promise<{ answered: number; missing: number; skipped?: boolean; error?: string }> {
  const missing = await getMissingQuestions(supabase, candidate.id);
  if (missing.length === 0) return { answered: 0, missing: 0, skipped: true };

  console.log(`[research] ${candidate.name} (${candidate.state} ${candidate.office}) — ${missing.length} missing`);

  if (dryRun) return { answered: 0, missing: missing.length };

  const rawAnswers = await callGemini(candidate, missing);
  if (!rawAnswers) return { answered: 0, missing: missing.length, error: 'parse failed' };

  const missingIds = new Set(missing.map(q => q.id));
  // Build candidate-answer objects, carrying `stance` (not a DB column) so the integrity guards
  // can run before we strip it for the insert.
  const parsedRows = [];

  for (const raw of rawAnswers) {
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
      stance: typeof raw.stance === 'string' ? raw.stance : null,
    });
  }

  // ── Integrity guards (shared with get-candidate-answers) ──────────────────────
  // 1. Drop answers whose stated stance contradicts the sign of answer_value. This is the
  //    fix for the 2026-06-20 inverted-score bug: the model emitted "supports X" prose with a
  //    strongly-negative value, which (URL-cited + high confidence) passed isTrustedForScoring
  //    and flipped the candidate's overall_score. A self-contradictory answer is untrustworthy.
  // 2. Demote uncited "voting_record" labels when we hold no real votes for this candidate, and
  //    uncited "web_research" labels — these self-asserted provenance badges have nothing behind
  //    them. (See _shared/answer-label-guard.ts.)
  const { kept, dropped } = dropStanceInconsistent(parsedRows);
  if (dropped.length > 0) {
    console.log(`[guard] ${candidate.name}: dropped ${dropped.length} stance-inconsistent answer(s)`);
  }

  const { count: voteRowCount } = await supabase
    .from('candidate_votes')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidate.id);

  const guarded = demoteUncitedWebResearch(
    demoteUnverifiableVoteClaims(kept, (voteRowCount ?? 0) > 0),
  );

  // Strip the transient `stance` field — it is not a candidate_answers column.
  const rows = guarded.map(({ stance: _stance, ...row }) => row);

  if (rows.length === 0) return { answered: 0, missing: missing.length, error: 'no valid rows parsed' };

  // ignoreDuplicates: true — never overwrite higher-quality existing answers.
  // (getMissingQuestions pre-filters so conflicts only happen on race conditions.)
  const { error: upsertErr } = await supabase
    .from('candidate_answers')
    .upsert(rows, { onConflict: 'candidate_id,question_id', ignoreDuplicates: true });

  if (upsertErr) throw new Error(upsertErr.message);

  // Re-derive the persisted overall_score from TRUSTED answers (matches get-candidate-answers
  // and the live alignment match in src/lib/scoring.ts), so a candidate's headline score reflects
  // the guard-filtered data rather than a stale value.
  await updateCandidateScore(supabase, candidate.id, candidate.name);

  console.log(`[done] ${candidate.name}: wrote ${rows.length}/${missing.length}`);
  return { answered: rows.length, missing: missing.length };
}

// Re-derive candidates.overall_score from TRUSTED answers only (vote-derived or carrying a real
// source URL), mirroring updateCandidateScore in get-candidate-answers and isTrustedForScoring in
// src/lib/scoring.ts. Leaves the stored score untouched when there are no trusted answers yet.
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

  // Self-chain: if this batch was full, there may be more
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
    // Auth: trusted server (service-role bearer or vault x-cron-secret, via the shared
    // cron-auth helper) OR an admin user profile. The cron/service path lets this remediation
    // run be triggered server-side (pg_net / cron) the same way the other ingestion functions are.
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
    // candidateIds: targeted remediation — regenerate exactly these candidates and nothing else
    // (the score-inversion runbook's "scope to reviewed ids" step). When set, the office/state/
    // offset batch filter and self-chaining are bypassed so spend is bounded to the listed ids.
    const candidateIds = Array.isArray(body.candidateIds)
      ? (body.candidateIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : null;
    const targeted = candidateIds !== null && candidateIds.length > 0;
    const selfChain = !targeted && body.selfChain !== false;

    if (!GOOGLE_AI_KEY && !dryRun) return json({ error: 'GOOGLE_AI_API_KEY not configured' }, 500);

    // Resolve hidden states
    const { data: hiddenRows } = await supabase.from('hidden_states').select('state_code');
    const hidden = new Set((hiddenRows ?? []).map((r: { state_code: string }) => r.state_code));

    // Fetch this batch of sub-federal candidates: state legislators, local officials,
    // mayors, county commissioners, etc. — everyone who is NOT a federal or
    // presidential candidate. getMissingQuestions returns [] for already-complete
    // candidates so they are skipped without any API spend.
    // Exclusion list matches what get-candidate-answers treats as "federal":
    //   U.S. House*, U.S. Senate*, President*, plain Representative/Senator
    let query = supabase
      .from('candidates')
      .select('id, name, party, office, state');
    if (targeted) {
      // Exact-id remediation: take the operator's reviewed list as-is, no batch windowing.
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

    // A targeted run honours the operator's explicit id list even for hidden states;
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
