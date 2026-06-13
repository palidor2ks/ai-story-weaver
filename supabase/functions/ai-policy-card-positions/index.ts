import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache } from "../_shared/ai-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_CYCLE = 'policy-card-v2'; // v2: includes per-topic score

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

    const { candidateId, force_refresh } = await req.json();
    if (!candidateId) {
      return new Response(JSON.stringify({ error: 'Missing candidateId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = {
      kind: 'candidate' as const,
      subject_id: String(candidateId),
      cycle: CACHE_CYCLE,
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

    if (topicScores.length === 0) {
      const result = { positions: [] };
      await writeCache(cacheKey, result, null);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const topicList = topicScores
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .map((t) => {
        const dir = t.score < -1.5 ? 'Progressive' : t.score > 1.5 ? 'Conservative' : 'Mixed/Moderate';
        return `- ${t.topic}: ${t.score.toFixed(2)} (${dir})`;
      })
      .join('\n');

    const systemPrompt = `You are a non-partisan political analyst generating concise position summaries for a social media card.

Rules:
- Only include a topic if |score| > 2.0 (clear stance)
- stance must be exactly: "Supports", "Opposes", or "Mixed record on"
- detail must be one sentence, max 55 characters, factual, does NOT start with the candidate name
- Pick the 4 topics with the highest |score| (most decisive positions)
- If fewer than 4 topics qualify, return fewer — never pad with weak positions
- Return valid JSON only, no explanation`;

    const userPrompt = `Candidate: ${candidateName}, ${candidateOffice}${candidateState ? ', ' + candidateState : ''}, ${candidateParty}

Topic scores (−10 = Far Progressive, +10 = Far Conservative):
${topicList}

Return up to 4 positions as JSON:
{
  "positions": [
    { "topic": "Healthcare", "stance": "Opposes", "detail": "Opposes government-run healthcare mandates" },
    { "topic": "Gun Rights", "stance": "Supports", "detail": "Supports expanded concealed carry access" }
  ]
}`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResp.ok) {
      console.error('AI error', aiResp.status, await aiResp.text());
      const result = { positions: [] };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content ?? '';

    let parsed: { positions?: unknown[] } = {};
    try {
      let s = raw.trim();
      const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fence) s = fence[1].trim();
      parsed = JSON.parse(s);
    } catch {
      const f = raw.indexOf('{'), l = raw.lastIndexOf('}');
      if (f !== -1 && l > f) { try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { /* ignore */ } }
    }

    // Build a lookup so we can attach the actual numeric score to each position
    const scoreByTopic = new Map(topicScores.map((t) => [t.topic.toLowerCase(), t.score]));

    const positions = (Array.isArray(parsed.positions) ? parsed.positions : [])
      .slice(0, 4)
      .filter((p: any) => p && typeof p.topic === 'string' && typeof p.stance === 'string' && typeof p.detail === 'string')
      .map((p: any) => ({
        topic: p.topic as string,
        stance: p.stance as string,
        detail: p.detail as string,
        score: scoreByTopic.get((p.topic as string).toLowerCase()) ?? undefined,
      }));

    const result = { positions };
    await writeCache(cacheKey, result, 'google/gemini-3-flash-preview');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('ai-policy-card-positions error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', positions: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
