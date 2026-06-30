import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache } from "../_shared/ai-cache.ts";
import { callGeminiGrounded, extractJson, GeminiQuotaError, getGoogleAIKey } from "../_shared/gemini-research.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v4 / v2: bumped when this function moved off the failing Lovable gateway to direct Google
// Gemini — old cycles had cached the gateway's empty/detail-less fallback, so they must rotate
// to force one clean regeneration on the working path.
const CACHE_CYCLE = 'policy-card-v4';
// Profile "Positions & your match" list wants ALL of a candidate's topics (not just the top 4
// the social card shows), so it caches under a separate cycle to avoid clobbering the card.
const CACHE_CYCLE_FULL = 'profile-positions-v2';

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

    const { candidateId, force_refresh, full } = await req.json();
    // full=true → one position per topic for the profile list; default → top-4 social card.
    const isFull = full === true;
    if (!candidateId) {
      return new Response(JSON.stringify({ error: 'Missing candidateId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = {
      kind: 'candidate' as const,
      subject_id: String(candidateId),
      cycle: isFull ? CACHE_CYCLE_FULL : CACHE_CYCLE,
      user_id: null,
      input_fingerprint: null,
    };

    if (!force_refresh) {
      const cached = await readCache<{ positions: unknown[] }>(cacheKey);
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached.payload, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch candidate identity (with override support)
    const [{ data: cRow }, { data: oRow }] = await Promise.all([
      supabase.from('candidates').select('name, office, state, party').eq('id', candidateId).maybeSingle(),
      supabase.from('candidate_overrides').select('name, office, state, party').eq('candidate_id', candidateId).eq('is_active', true).maybeSingle(),
    ]);
    const candidateName = oRow?.name || cRow?.name || 'Unknown';
    const candidateOffice = oRow?.office || cRow?.office || '';
    const candidateState = oRow?.state || cRow?.state || '';
    const candidateParty = oRow?.party || cRow?.party || '';

    // Fetch topic scores
    const { data: topicRows } = await supabase
      .from('candidate_topic_scores')
      .select('score, topics(name)')
      .eq('candidate_id', candidateId);

    const topicScores = (topicRows ?? [])
      .map((r: any) => ({ topic: r.topics?.name as string | undefined, score: Number(r.score) }))
      .filter((t): t is { topic: string; score: number } => !!t.topic && Number.isFinite(t.score));

    if (!getGoogleAIKey() || topicScores.length === 0) {
      const result = { positions: [] };
      await writeCache(cacheKey, result, null);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const topicList = topicScores
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .map((t) => {
        const dir = t.score < -1.5 ? 'Progressive' : t.score > 1.5 ? 'Conservative' : 'Mixed/Moderate';
        return `- ${t.topic}: ${t.score.toFixed(2)} (${dir})`;
      })
      .join('\n');

    const systemPrompt = isFull
      ? `You are a non-partisan political analyst generating concise position summaries for a candidate profile.

Rules:
- Return exactly ONE position for EVERY topic listed in the user message — do not drop or add topics
- stance must be exactly: "Supports", "Opposes", or "Mixed record on" (use "Mixed record on" when the lean is weak)
- detail: one short phrase (max 55 chars) describing the GENERAL lean on this topic in plain language (e.g. "Consistently progressive record", "Moderate, mixed record"). You are given ONLY a directional score — do NOT name specific bills, programs, votes, or policy sub-positions you cannot see. Never start with the candidate name.
- Return valid JSON only, no explanation`
      : `You are a non-partisan political analyst generating concise position summaries for a social media card.

Rules:
- Only include a topic if |score| > 1.0 (any lean counts)
- stance must be exactly: "Supports", "Opposes", or "Mixed record on"
- detail must be one sentence, max 55 characters, factual, does NOT start with the candidate name
- Pick the 4 topics with the highest |score| (most decisive positions)
- If fewer than 4 topics qualify, return fewer — never pad with weak positions
- Return valid JSON only, no explanation`;

    const userPrompt = `Candidate: ${candidateName}, ${candidateOffice}${candidateState ? ', ' + candidateState : ''}, ${candidateParty}

Topic scores (−10 = Far Progressive, +10 = Far Conservative):
${topicList}

Return ${isFull ? 'one position for every topic above' : 'up to 4 positions'} as JSON:
{
  "positions": [
    { "topic": "Healthcare", "stance": "Opposes", "detail": "Opposes government-run healthcare mandates" },
    { "topic": "Gun Rights", "stance": "Supports", "detail": "Supports expanded concealed carry access" }
  ]
}`;

    // Pure score→JSON transform: run on Google Gemini directly (no web grounding needed — the
    // model is told NOT to name specifics beyond the directional score). Mirrors the move off
    // the (failing) Lovable gateway / gemini-3-flash-preview that left this returning [].
    let parsed: { positions?: unknown[] } = {};
    try {
      const { text } = await callGeminiGrounded({
        prompt: `${userPrompt}\n\nReturn ONLY the raw JSON object, no markdown fences.`,
        systemInstruction: systemPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 8192, // headroom for gemini-2.5-flash "thinking" before the JSON
        grounding: false,
      });
      parsed = extractJson<{ positions?: unknown[] }>(text) ?? {};
    } catch (e) {
      console.error('ai-policy-card-positions Gemini error', e);
      // Fallback: synthesize positions directly from topic scores (all topics in full mode,
      // top-4 highest-|score| for the social card). Not cached, so a later call can retry AI.
      const fallbackPositions = topicScores
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, isFull ? topicScores.length : 4)
        .map((t) => ({
          topic: t.topic,
          stance: t.score < -1 ? 'Opposes' : t.score > 1 ? 'Supports' : 'Mixed record on',
          detail: '',
          score: t.score,
        }));
      return new Response(JSON.stringify({ positions: fallbackPositions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build a lookup so we can attach the actual numeric score to each position
    const scoreByTopic = new Map(topicScores.map((t) => [t.topic.toLowerCase(), t.score]));

    const positions = (Array.isArray(parsed.positions) ? parsed.positions : [])
      .slice(0, isFull ? topicScores.length : 4)
      .filter((p: any) => p && typeof p.topic === 'string' && typeof p.stance === 'string' && typeof p.detail === 'string')
      .map((p: any) => ({
        topic: p.topic as string,
        stance: p.stance as string,
        detail: p.detail as string,
        score: scoreByTopic.get((p.topic as string).toLowerCase()) ?? undefined,
      }));

    const result = { positions };
    await writeCache(cacheKey, result, 'gemini-2.5-flash');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    if (error instanceof GeminiQuotaError) {
      console.warn('ai-policy-card-positions: Google AI quota exceeded');
      return new Response(
        JSON.stringify({ error: 'AI analysis temporarily unavailable (quota limit). Please try again later.', positions: [] }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.error('ai-policy-card-positions error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', positions: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
