// Per-topic deep analysis of a rep's position, for the profile "Positions & your match" list.
// The "+" button on each topic row calls this. Grounded ONLY in the candidate's real
// topic score + their documented answers for that topic, and cached per (candidate, topic)
// so it generates once (no per-view cost). Mirrors ai-policy-card-positions / ai-candidate-explanation.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache } from "../_shared/ai-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const cacheKey = {
      kind: 'candidate' as const,
      subject_id: String(candidateId),
      cycle: `topic-deep:${topicId}`,
      user_id: null,
      input_fingerprint: null,
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

    const evidence = topicAnswers
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY || (topicScore === null && topicAnswers.length === 0)) {
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

    const systemPrompt = `You are a non-partisan political analyst. Write a short, factual analysis (2 short paragraphs, ~90 words total) of a candidate's position on ONE topic.

Rules:
- Ground EVERYTHING strictly in the provided topic lean and documented positions. Do NOT invent specific bills, votes, quotes, or facts not present in the data.
- If the evidence is thin, say so plainly rather than embellishing.
- Neutral, descriptive tone. Do not advise the reader how to vote.
- Plain prose, no markdown headers.`;

    const userPrompt = `Candidate: ${candidateName}, ${candidateOffice}${candidateState ? ', ' + candidateState : ''}, ${candidateParty}
Topic: ${resolvedTopicName}
Overall lean on this topic: ${topicScore === null ? 'unknown' : topicScore.toFixed(1)} (${leanLabel}) on a −10 (progressive) to +10 (conservative) scale.

Documented positions:
${evidence || '(no individually documented positions; rely on the overall lean above and say the record is limited)'}

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
      // Fallback: a plain, data-only sentence (no AI embellishment).
      const result = {
        analysis: `${candidateName} has a ${leanLabel} record on ${resolvedTopicName}`
          + (topicScore === null ? '.' : ` (score ${topicScore.toFixed(1)} on a −10 to +10 scale).`)
          + (topicAnswers.length ? ` Based on ${topicAnswers.length} documented position(s).` : ' Documented record is limited.'),
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
