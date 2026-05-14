// AI-drafts poll questions + options using Lovable AI Gateway
// Returns JSON: { title, description, questions: [{text, options: [{text, value}]}] }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  prompt: string;
  type: 'mc' | 'scored' | 'mini_quiz';
  topic?: string;
}

const SCORED_VALUES = [-10, -5, 0, 5, 10];

function systemPrompt(type: Body['type'], topic?: string) {
  const topicLine = topic ? `Topic focus: ${topic}.` : '';
  if (type === 'mc') {
    return `You draft viral, neutral-toned single-question social-media polls about US politics. ${topicLine}
Return JSON only with this exact shape:
{ "title": "short catchy title", "description": "one sentence framing", "questions": [
  { "text": "the poll question", "options": [
    { "text": "option text", "value": 0 }
  ] }
] }
Use 2-4 options. value MUST be 0 for every option (this is an opinion poll, not scored).`;
  }
  if (type === 'scored') {
    return `You draft a single political-position question for a left/right scoring quiz. ${topicLine}
Return JSON only with this shape:
{ "title": "short title", "description": "one sentence", "questions": [
  { "text": "the question", "options": [
    { "text": "Strongly progressive option", "value": -10 },
    { "text": "Lean progressive option", "value": -5 },
    { "text": "Centrist / mixed option", "value": 0 },
    { "text": "Lean conservative option", "value": 5 },
    { "text": "Strongly conservative option", "value": 10 }
  ] }
] }
Exactly 5 options with values exactly -10, -5, 0, 5, 10 in that order. Option text should sound natural — not "strongly agree" — and reflect actual policy stances.`;
  }
  return `You draft a 3-question mini political quiz. ${topicLine}
Return JSON only with this shape:
{ "title": "short title", "description": "one sentence", "questions": [
  { "text": "question 1", "options": [ {"text":"...","value":-10},{"text":"...","value":-5},{"text":"...","value":0},{"text":"...","value":5},{"text":"...","value":10} ] },
  { "text": "question 2", "options": [...same shape...] },
  { "text": "question 3", "options": [...same shape...] }
] }
Each question MUST have exactly 5 options with values -10,-5,0,5,10 in order.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: require valid JWT + admin role (poll creation is admin-only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin, error: roleErr } = await userClient.rpc('has_role', {
      _user_id: userData.user.id, _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const body = (await req.json()) as Body;
    if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.length > 1000) {
      return new Response(JSON.stringify({ error: 'Invalid prompt' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['mc', 'scored', 'mini_quiz'].includes(body.type)) {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt(body.type, body.topic) },
          { role: 'user', content: body.prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error('AI error', aiResp.status, text);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit, try again shortly' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI ${aiResp.status}: ${text}`);
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content) throw new Error('No AI content');

    const parsed = JSON.parse(content);

    // Validate & sanitize
    if (!parsed?.questions?.length) throw new Error('No questions');
    const questions = parsed.questions.map((q: any) => {
      const opts = (q.options || []).map((o: any) => ({
        text: String(o.text || '').slice(0, 200),
        value: body.type === 'mc' ? 0 : (SCORED_VALUES.includes(Number(o.value)) ? Number(o.value) : 0),
      }));
      return { text: String(q.text || '').slice(0, 500), options: opts };
    });

    return new Response(JSON.stringify({
      title: String(parsed.title || '').slice(0, 200),
      description: String(parsed.description || '').slice(0, 500),
      questions,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('generate-poll-questions error:', e);
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
