// Per-topic deep analysis of a rep's position, for the profile "Positions & your match" list.
// The "+" button on each topic row calls this. Grounded in the candidate's REAL evidence:
//   • their topic lean score,
//   • their documented answers for the topic,
//   • their actual votes/sponsorships on bills mapped to the topic,
//   • their public statements (member_statements) tagged to the topic, and
//   • live Google Search grounding (official campaign sites, news) for current positions.
// When the viewer has taken the quiz we also pass their own topic lean so the analysis can
// explain WHY the candidate aligns with or differs from them.
//
// Runs on Google Gemini directly (generativelanguage.googleapis.com) via the shared
// callGeminiGrounded front door — NOT the Lovable gateway — so it uses Google Search
// grounding and returns real source citations. Cached per (candidate, topic, evidence +
// viewer-stance fingerprint) so it generates once and refreshes only when inputs change.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache, fingerprint } from "../_shared/ai-cache.ts";
import { callGeminiGrounded, GeminiQuotaError, resolveGroundedSources, getGoogleAIKey } from "../_shared/gemini-research.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map the free-text bill/vote topic strings onto the 6 consolidated federal topic IDs,
// so we can surface a candidate's real legislative record for the requested topic.
// Mirrors topicNameToId in src/components/VotingRecordSection.tsx — keep in sync.
const BILL_TOPIC_TO_ID: Record<string, string> = {
  'Economy & Work': 'economy-work',
  'Economy': 'economy-work',
  'Technology': 'economy-work',
  'Health, Education & Welfare': 'health-safety-net',
  'Healthcare': 'health-safety-net',
  'Education': 'health-safety-net',
  'Social Programs': 'health-safety-net',
  'Environment & Energy': 'environment-energy',
  'Environment': 'environment-energy',
  'National Security & Borders': 'national-security-borders',
  'Defense': 'national-security-borders',
  'Immigration': 'national-security-borders',
  'Foreign Affairs': 'national-security-borders',
  'Foreign Policy': 'national-security-borders',
  'Rights & Justice': 'rights-justice',
  'Civil Rights': 'rights-justice',
  'Judicial': 'rights-justice',
  'Criminal Justice': 'rights-justice',
  'Gun Policy': 'rights-justice',
  'Government & Democracy': 'government-democracy',
  'Government Reform': 'government-democracy',
  'Electoral Reform': 'government-democracy',
};

// −10 (progressive) … +10 (conservative). Mirrors src/lib/stance.ts compareStances + leanLabel.
function leanWord(score: number | null): string {
  if (score === null) return 'unknown';
  if (score < -1.5) return 'progressive';
  if (score > 1.5) return 'conservative';
  return 'mixed / moderate';
}
function stanceVerdict(candidate: number | null, user: number | null): 'ALIGN' | 'DIFFER' | 'PARTIAL' | null {
  if (candidate === null || user === null) return null;
  const a = Math.sign(candidate), b = Math.sign(user);
  if (a === 0 || b === 0) return 'PARTIAL';
  return a === b ? 'ALIGN' : 'DIFFER';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // userScore: the viewer's own lean on this topic (−10..+10), passed when they've taken the
    // quiz, so the analysis can explain alignment. Optional.
    const { candidateId, topicId, topicName, userScore, force_refresh } = await req.json();
    if (!candidateId || !topicId) {
      return new Response(JSON.stringify({ error: 'Missing candidateId or topicId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const viewerScore = typeof userScore === 'number' && Number.isFinite(userScore) ? userScore : null;

    // Candidate identity (with override support)
    const [{ data: cRow }, { data: oRow }] = await Promise.all([
      supabase.from('candidates').select('name, office, state, party').eq('id', candidateId).maybeSingle(),
      supabase.from('candidate_overrides').select('name, office, state, party').eq('candidate_id', candidateId).eq('is_active', true).maybeSingle(),
    ]);
    const candidateName = oRow?.name || cRow?.name || 'This candidate';
    const candidateOffice = oRow?.office || cRow?.office || '';
    const candidateState = oRow?.state || cRow?.state || '';
    const candidateParty = oRow?.party || cRow?.party || '';

    // The numeric lean for this topic (−10 Progressive … +10 Conservative)
    const { data: scoreRows } = await supabase
      .from('candidate_topic_scores')
      .select('score, topic_id, topics(name)')
      .eq('candidate_id', candidateId);
    const topicScoreRow = (scoreRows ?? []).find((r: any) => r.topic_id === topicId);
    const topicScore = topicScoreRow ? Number(topicScoreRow.score) : null;
    const resolvedTopicName =
      topicName || (topicScoreRow as any)?.topics?.name || String(topicId).replace(/-/g, ' ');

    // The rep's documented answers for this topic. Fetch all and filter in JS to avoid
    // PostgREST embedded-filter pitfalls.
    const { data: answerRows } = await supabase
      .from('candidate_answers')
      .select('answer_value, source_url, evidence_type, question:questions(topic_id, question_text)')
      .eq('candidate_id', candidateId);
    const topicAnswers = (answerRows ?? [])
      .filter((r: any) => r.question?.topic_id === topicId)
      .slice(0, 12);

    const answerEvidence = topicAnswers
      .map((r: any) => {
        const q = r.question?.question_text ?? 'Position';
        const lean = r.answer_value < 0 ? 'progressive' : r.answer_value > 0 ? 'conservative' : 'mixed';
        const tag = r.evidence_type
          ? ` [${r.evidence_type}${r.source_url ? ', sourced' : ''}]`
          : (r.source_url ? ' [sourced]' : ' [inferred]');
        return `- ${q}: leans ${lean} (${r.answer_value})${tag}`;
      })
      .join('\n');

    // The rep's actual legislative record on this topic — votes & sponsorships joined to the
    // bill's topic. The strongest, most concrete evidence.
    const { data: voteRows } = await supabase
      .from('candidate_votes')
      .select('position, action_type, action_date, bills!inner(name, topic, description)')
      .eq('candidate_id', candidateId)
      .order('action_date', { ascending: false });
    const topicVotes = (voteRows ?? [])
      .filter((r: any) => BILL_TOPIC_TO_ID[r.bills?.topic] === topicId)
      .slice(0, 10);

    const voteEvidence = topicVotes
      .map((r: any) => {
        const name = r.bills?.name || 'Unnamed measure';
        const pos = r.position || r.action_type || 'voted';
        const yr = r.action_date ? ` (${new Date(r.action_date).getFullYear()})` : '';
        const desc = (r.bills?.description || '').trim();
        const blurb = desc ? ` — ${desc.slice(0, 140)}${desc.length > 140 ? '…' : ''}` : '';
        return `- ${pos} on "${name}"${yr}${blurb} [legislative record, sourced]`;
      })
      .join('\n');

    // The rep's public statements on this topic (press releases, official site, news), tagged
    // with the same consolidated topic IDs. These carry real URLs we surface as citations.
    const { data: stmtRows } = await supabase
      .from('member_statements')
      .select('title, url, body_text, published_at, topic_tags')
      .eq('candidate_id', String(candidateId))
      .contains('topic_tags', [topicId])
      .order('published_at', { ascending: false })
      .limit(6);
    const topicStatements = stmtRows ?? [];

    const statementEvidence = topicStatements
      .map((r: any) => {
        const title = (r.title || 'Statement').trim();
        const yr = r.published_at ? ` (${new Date(r.published_at).getFullYear()})` : '';
        const snippet = (r.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        return `- "${title}"${yr}${snippet ? ` — ${snippet}…` : ''} [public statement] ${r.url || ''}`.trim();
      })
      .join('\n');

    const evidence = [
      answerEvidence && `Documented quiz positions:\n${answerEvidence}`,
      voteEvidence && `Legislative record (votes & sponsorships):\n${voteEvidence}`,
      statementEvidence && `Public statements:\n${statementEvidence}`,
    ].filter(Boolean).join('\n\n');
    const evidenceCount = topicAnswers.length + topicVotes.length + topicStatements.length;

    // Viewer comparison context (coarse stance bucket keeps the cache from exploding per-user).
    const viewerLean = leanWord(viewerScore);
    const verdict = stanceVerdict(topicScore, viewerScore);
    const viewerBucket = viewerScore === null ? 'none' : Math.sign(viewerScore) < 0 ? 'prog' : Math.sign(viewerScore) > 0 ? 'cons' : 'mod';

    // Cache per (candidate, topic) AND per (evidence + viewer-stance) fingerprint, so the
    // analysis regenerates once when new evidence lands or for a different viewer stance.
    const evidenceFingerprint = await fingerprint({ v: 5, topicScore, evidence, viewerBucket });
    const cacheKey = {
      kind: 'candidate' as const,
      subject_id: String(candidateId),
      cycle: `topic-deep:${topicId}`,
      user_id: null,
      input_fingerprint: evidenceFingerprint,
    };

    if (!force_refresh) {
      const cached = await readCache<{ analysis: string; sources?: unknown }>(cacheKey);
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached.payload, cached: true, updated_at: cached.updated_at }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const leanLabel = leanWord(topicScore);

    // No Google key or nothing at all to say → honest data-only line.
    if (!getGoogleAIKey() || (topicScore === null && evidenceCount === 0)) {
      const result = {
        analysis: `We don't yet have enough sourced data to analyze ${candidateName}'s position on ${resolvedTopicName}.`,
        sources: [],
      };
      await writeCache(cacheKey, result, null);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Each bullet ties the candidate's action back to the reader's own lean (when known).
    const relationClause = viewerScore === null
      ? `After naming the action, add a short clause on what it shows about the candidate's approach to this issue.`
      : `After naming the action, explain in the SAME sentence how it relates to YOU (the reader leans ${viewerScore.toFixed(1)}, ${viewerLean}): say plainly whether you'd likely SUPPORT or OPPOSE that action and the concrete reason why, given your lean.`;

    const matchBulletSpec = viewerScore === null
      ? ''
      : `\n- A FINAL bullet starting with "- Your match:" that states ${verdict} and sums up in one sentence the main reason you and the candidate align or differ on this topic.`;

    const systemInstruction = `You are a non-partisan political analyst writing a SHORT, scannable brief that helps a voter see how a candidate's record on ONE issue lines up with THEIR OWN views.

Use ONLY: (a) the structured evidence in the prompt, and (b) facts you can confirm via Google Search about THIS candidate's record or public statements on THIS topic — prioritise the official campaign site, government pages, and reputable news.

Output EXACTLY this, nothing else:
- One short lead line (≤ 16 words) stating the candidate's lean on this topic in plain terms. Do NOT start this first line with "-".
- Then 3 to 4 bullets, each on its own line starting with "- " (≤ 30 words). Each names ONE specific action (a vote, sponsorship, or public statement), THEN connects it to the reader. ${relationClause}${matchBulletSpec}

Hard rules:
- Do NOT invent or guess bills, votes, dates, or quotes. If you cannot verify a specific, describe the documented lean instead.
- Do NOT output any source tags, bracketed labels, or citation numbers — never write "[legislative record, sourced]", "[sourced]", or "[1, 2]". Write clean sentences only.
- Keep the whole brief under ~140 words. No intro or outro paragraphs, no headers, no bold/markdown.
- Neutral, descriptive tone. Never tell the reader how to vote.`;

    const prompt = `Candidate: ${candidateName}, ${candidateOffice}${candidateState ? ', ' + candidateState : ''}, ${candidateParty}
Topic: ${resolvedTopicName}
Candidate's overall lean on this topic: ${topicScore === null ? 'unknown' : topicScore.toFixed(1)} (${leanLabel}) on a −10 (progressive) to +10 (conservative) scale.

Structured evidence (${evidenceCount} item${evidenceCount === 1 ? '' : 's'}):
${evidence || '(no individually documented positions, votes, or statements — rely on the overall lean and on what Google Search confirms about this candidate; if little is verifiable, say the record is limited.)'}
${viewerScore === null
  ? '\nWrite the brief now in the required format (one lead line + 3–5 evidence bullets).'
  : `\nThe viewer's own lean on this topic is ${viewerScore.toFixed(1)} (${viewerLean}); the match verdict vs. this candidate is ${verdict}. Write the brief now in the required format, ending with the "Your match:" bullet.`}`;

    let analysis = '';
    let sources: { url: string; title: string }[] = [];
    try {
      const grounded = await callGeminiGrounded({
        prompt,
        systemInstruction,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        // gemini-2.5-flash spends a large, variable "thinking" budget BEFORE any visible text.
        // At 2048 the thinking alone exhausted the budget (finishReason MAX_TOKENS) and the
        // answer came back empty → every call fell to the fallback. Match the proven default
        // (8192) used by the other grounded callers so thinking + the ~220-word answer both fit.
        maxOutputTokens: 8192,
        grounding: true,   // Google Search grounding → live, cited record
        urlContext: true,  // URL-context tool → let it read the candidate's own statement/site URLs
        timeoutMs: 55_000,
      });
      analysis = (grounded.text || '').trim();
      // Resolve the grounding citations to real, reachable URLs (deep links, no junk).
      sources = await resolveGroundedSources(grounded.rawSources, { limit: 4 });
    } catch (e) {
      console.error('ai-topic-analysis Gemini error', e);
    }

    if (!analysis) {
      // Data-only fallback (not cached, so a later call can retry the AI path).
      const basis: string[] = [];
      if (topicVotes.length) basis.push(`${topicVotes.length} vote${topicVotes.length === 1 ? '' : 's'}/sponsorship${topicVotes.length === 1 ? '' : 's'}`);
      if (topicStatements.length) basis.push(`${topicStatements.length} public statement${topicStatements.length === 1 ? '' : 's'}`);
      if (topicAnswers.length) basis.push(`${topicAnswers.length} documented position${topicAnswers.length === 1 ? '' : 's'}`);
      const result = {
        analysis: `${candidateName} has a ${leanLabel} record on ${resolvedTopicName}`
          + (topicScore === null ? '.' : ` (score ${topicScore.toFixed(1)} on a −10 to +10 scale).`)
          + (basis.length ? ` Based on ${basis.join(', ')} on record.` : ' The documented record on this topic is limited; the lean above is a modeled estimate.')
          + (verdict ? ` You ${verdict === 'ALIGN' ? 'broadly align' : verdict === 'DIFFER' ? 'differ' : 'partially align'} with this candidate here.` : ''),
        sources: [],
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = { analysis, sources };
    await writeCache(cacheKey, result, 'gemini-2.5-flash');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    if (error instanceof GeminiQuotaError) {
      console.warn('ai-topic-analysis: Google AI quota exceeded');
      return new Response(
        JSON.stringify({ error: 'AI analysis temporarily unavailable (quota limit). Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.error('ai-topic-analysis error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
