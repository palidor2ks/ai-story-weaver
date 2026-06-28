// Per-topic deep analysis of a rep's position, for the profile "Positions & your match" list.
// The "+" button on each topic row calls this. Grounded ONLY in the candidate's real topic
// score, their documented answers, AND their actual votes/sponsorships on bills mapped to that
// topic — so the analysis cites concrete legislative evidence instead of restating the score.
// Cached per (candidate, topic, evidence fingerprint) so it generates once and refreshes only
// when new evidence lands. Mirrors ai-policy-card-positions / ai-candidate-explanation.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache, fingerprint } from "../_shared/ai-cache.ts";

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

    const { candidateId, topicId, topicName, force_refresh } = await req.json();
    if (!candidateId || !topicId) {
      return new Response(JSON.stringify({ error: 'Missing candidateId or topicId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // The rep's documented answers for this topic (the evidence). Fetch all and filter in JS
    // to avoid PostgREST embedded-filter pitfalls.
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
        // Surface evidence strength so the model weights sourced/vote data over inferred answers.
        const tag = r.evidence_type
          ? ` [${r.evidence_type}${r.source_url ? ', sourced' : ''}]`
          : (r.source_url ? ' [sourced]' : ' [inferred]');
        return `- ${q}: leans ${lean} (${r.answer_value})${tag}`;
      })
      .join('\n');

    // The rep's actual legislative record on this topic — votes & sponsorships joined to the
    // bill's topic. This is the strongest, most concrete evidence and is what makes the
    // analysis specific rather than a restatement of the score. Filter the bill topic strings
    // down to the one consolidated topic the user asked about.
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

    const evidence = [answerEvidence, voteEvidence].filter(Boolean).join('\n');
    const evidenceCount = topicAnswers.length + topicVotes.length;

    // Cache per (candidate, topic) AND per evidence fingerprint, so the analysis regenerates
    // once when new answers/votes land (or when this function's evidence shape changes) instead
    // of serving a stale, thinner write forever.
    const evidenceFingerprint = await fingerprint({ v: 2, topicScore, evidence });
    const cacheKey = {
      kind: 'candidate' as const,
      subject_id: String(candidateId),
      cycle: `topic-deep:${topicId}`,
      user_id: null,
      input_fingerprint: evidenceFingerprint,
    };

    if (!force_refresh) {
      const cached = await readCache<{ analysis: string }>(cacheKey);
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached.payload, cached: true, updated_at: cached.updated_at }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY || (topicScore === null && evidenceCount === 0)) {
      const result = {
        analysis: `We don't yet have enough sourced data to analyze ${candidateName}'s position on ${resolvedTopicName}.`,
      };
      await writeCache(cacheKey, result, null);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leanLabel =
      topicScore === null ? 'unknown'
      : topicScore < -1.5 ? 'progressive'
      : topicScore > 1.5 ? 'conservative'
      : 'mixed / moderate';

    const systemPrompt = `You are a non-partisan political analyst. Write a detailed, factual analysis of a candidate's position on ONE topic, for a reader deciding how well the candidate aligns with them.

Structure (2–3 short paragraphs, roughly 130–180 words):
1. Open with what the candidate's overall lean on this topic is, and what that means in plain terms for this issue area (translate the −10…+10 score into concrete left/right policy direction for THIS topic).
2. Then walk through the specific evidence below — name the actual votes, sponsorships, or documented positions and what each one shows. Prefer the legislative record (votes/sponsorships) over inferred answers, and say when a position is sourced vs. inferred.
3. Close with an honest note on how complete or thin the documented record is.

Rules:
- Ground EVERYTHING strictly in the provided lean and evidence. Do NOT invent bills, votes, vote counts, dates, quotes, or facts not present below. Use only the bill names and details given.
- If the only evidence is the overall score with no documented votes or positions, do not pad — explain what the score reflects (a modeled lean, not a documented vote-by-vote record) and state plainly that the specific record is limited. A shorter, honest answer is better than an embellished one.
- Neutral, descriptive tone. Never tell the reader how to vote.
- Plain prose, no markdown headers, no bullet lists.`;

    const userPrompt = `Candidate: ${candidateName}, ${candidateOffice}${candidateState ? ', ' + candidateState : ''}, ${candidateParty}
Topic: ${resolvedTopicName}
Overall lean on this topic: ${topicScore === null ? 'unknown' : topicScore.toFixed(1)} (${leanLabel}) on a −10 (progressive) to +10 (conservative) scale.

Evidence (${evidenceCount} item${evidenceCount === 1 ? '' : 's'}${topicVotes.length ? `, including ${topicVotes.length} from the legislative record` : ''}):
${evidence || '(no individually documented positions or votes; rely on the overall lean above and say the specific record is limited)'}

Write the analysis.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    });

    if (!aiResp.ok) {
      console.error('AI error', aiResp.status, await aiResp.text());
      // Fallback: a plain, data-only summary (no AI embellishment) that still reflects the
      // evidence we have. Never cached, so a later call can retry the AI path.
      const basis: string[] = [];
      if (topicVotes.length) basis.push(`${topicVotes.length} vote${topicVotes.length === 1 ? '' : 's'}/sponsorship${topicVotes.length === 1 ? '' : 's'} on record`);
      if (topicAnswers.length) basis.push(`${topicAnswers.length} documented position${topicAnswers.length === 1 ? '' : 's'}`);
      const result = {
        analysis: `${candidateName} has a ${leanLabel} record on ${resolvedTopicName}`
          + (topicScore === null ? '.' : ` (score ${topicScore.toFixed(1)} on a −10 to +10 scale).`)
          + (basis.length ? ` Based on ${basis.join(' and ')}.` : ' The documented record on this topic is limited; the lean above is a modeled estimate.'),
      };
      // Do not cache the fallback permanently — leave it uncached so a later call can try AI again.
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const analysis = (aiData.choices?.[0]?.message?.content ?? '').trim()
      || `${candidateName} has a ${leanLabel} record on ${resolvedTopicName}.`;

    const result = { analysis };
    await writeCache(cacheKey, result, 'google/gemini-3-flash-preview');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('ai-topic-analysis error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
