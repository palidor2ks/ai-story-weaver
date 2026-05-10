import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

type Official = {
  name: string | null;
  role: string; // "Mayor" | "City Council Member" | etc
  ward?: string | null;
  party: string;
  official_website?: string | null;
  photo_url?: string | null;
};

type RosterResult = {
  officials: Official[];
  source_urls: string[];
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function mayorId(state: string, city: string) {
  return `mayor_${state.toLowerCase()}_${slug(city)}`;
}

function officialId(state: string, city: string, role: string, name: string) {
  if (role.toLowerCase() === 'mayor') return mayorId(state, city);
  return `local_${state.toLowerCase()}_${slug(city)}_${slug(role)}_${slug(name)}`.slice(0, 200);
}

function normalizeParty(p: string | undefined | null): string {
  const v = (p || '').toLowerCase();
  if (v.includes('democrat')) return 'Democrat';
  if (v.includes('republican')) return 'Republican';
  if (v.includes('independent')) return 'Independent';
  return 'Other';
}

const PROMPT = (state: string, city: string) => `List the CURRENT sitting local elected officials for ${city}, ${state}, United States as of today.

Include:
- The Mayor (if the city has one)
- All City/Town Council Members (or Aldermen, Selectmen — whatever the local body is called)

For each official return:
- name: full legal name
- role: "Mayor", "City Council Member", "Town Council Member", "Alderman", "Selectman", or similar
- ward: ward/district/at-large designation if any, else null
- party: "Democrat", "Republican", "Independent", or "Other" (use "Other" for nonpartisan)
- official_website: their official city page URL, or null
- photo_url: direct URL to an official portrait photo, or null

Also return source_urls: 1-5 URLs you used (must include the city's official .gov site if available).

Only include officials you can verify from the city's official site or reputable news. Do not guess. If the city has no mayor, omit the mayor entry.`;

// ---------- Perplexity ----------
async function researchViaPerplexity(state: string, city: string): Promise<RosterResult> {
  if (!PERPLEXITY_KEY) throw new Error('PERPLEXITY_API_KEY not configured');

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'You are a precise civic-data researcher. Always reply with valid JSON only.' },
        { role: 'user', content: PROMPT(state, city) + '\n\nReturn ONLY a JSON object: { "officials": [...], "source_urls": [...] }' },
      ],
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'roster',
          schema: {
            type: 'object',
            properties: {
              officials: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: ['string', 'null'] },
                    role: { type: 'string' },
                    ward: { type: ['string', 'null'] },
                    party: { type: 'string' },
                    official_website: { type: ['string', 'null'] },
                    photo_url: { type: ['string', 'null'] },
                  },
                  required: ['name', 'role', 'party'],
                },
              },
              source_urls: { type: 'array', items: { type: 'string' } },
            },
            required: ['officials', 'source_urls'],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err: any = new Error(`Perplexity ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty Perplexity response');
  return parseRoster(content);
}

// ---------- Lovable AI (fallback) ----------
async function researchViaLovable(state: string, city: string): Promise<RosterResult> {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: 'You are a precise civic-data researcher with broad knowledge of US local government. Use tool calling to return structured data.' },
        { role: 'user', content: PROMPT(state, city) },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'return_roster',
          description: 'Return the local elected officials roster',
          parameters: {
            type: 'object',
            properties: {
              officials: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    role: { type: 'string' },
                    ward: { type: 'string' },
                    party: { type: 'string', enum: ['Democrat', 'Republican', 'Independent', 'Other'] },
                    official_website: { type: 'string' },
                    photo_url: { type: 'string' },
                  },
                  required: ['name', 'role', 'party'],
                  additionalProperties: false,
                },
              },
              source_urls: { type: 'array', items: { type: 'string' } },
            },
            required: ['officials', 'source_urls'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'return_roster' } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err: any = new Error(`Lovable AI ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  const args = toolCall?.function?.arguments;
  if (!args) throw new Error('Empty Lovable AI tool call');
  return parseRoster(args);
}

function parseRoster(content: string): RosterResult {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in AI response');
    parsed = JSON.parse(m[0]);
  }
  return {
    officials: Array.isArray(parsed?.officials) ? parsed.officials : [],
    source_urls: Array.isArray(parsed?.source_urls) ? parsed.source_urls : [],
  };
}

// ---------- Orchestration with fallback ----------
async function researchRoster(state: string, city: string): Promise<{ result: RosterResult; provider: string }> {
  // Try Perplexity first
  if (PERPLEXITY_KEY) {
    try {
      const result = await researchViaPerplexity(state, city);
      return { result, provider: 'perplexity' };
    } catch (err: any) {
      const status = err?.status;
      const fallbackable = !status || status === 401 || status === 402 || status === 429 || status >= 500;
      console.warn(`[fetch-mayor] Perplexity failed (status=${status}): ${err?.message?.slice(0, 200)}`);
      if (!fallbackable) throw err;
      console.log('[fetch-mayor] falling back to Lovable AI');
    }
  } else {
    console.log('[fetch-mayor] no Perplexity key — using Lovable AI');
  }

  const result = await researchViaLovable(state, city);
  return { result, provider: 'lovable-ai' };
}

async function processCity(supabase: ReturnType<typeof createClient>, state: string, city: string) {
  const stateUp = state.toUpperCase();
  const cityClean = city.trim();

  console.log(`[fetch-mayor] processing roster for ${cityClean}, ${stateUp}`);

  // Mark queue in_progress
  await supabase.from('mayor_fetch_queue').upsert({
    state: stateUp,
    city: cityClean,
    status: 'in_progress',
    last_attempted_at: new Date().toISOString(),
  }, { onConflict: 'state,city' });

  try {
    const { result, provider } = await researchRoster(stateUp, cityClean);
    console.log(`[fetch-mayor] provider=${provider} returned ${result.officials.length} officials`);

    const inserted: string[] = [];
    let mayorId_: string | null = null;

    for (const off of result.officials) {
      if (!off?.name || !off?.role) continue;
      const role = off.role.trim();
      const id = officialId(stateUp, cityClean, role, off.name);
      const wardSuffix = off.ward ? ` (${off.ward})` : '';
      const officeText = role.toLowerCase() === 'mayor'
        ? `Mayor of ${cityClean}`
        : `${role}, ${cityClean}${wardSuffix}`;

      const { error } = await supabase.from('static_officials').upsert({
        id,
        name: off.name.trim(),
        party: normalizeParty(off.party),
        office: officeText,
        level: 'local',
        state: stateUp,
        city: cityClean,
        district: off.ward || null,
        image_url: off.photo_url || null,
        website_url: off.official_website || null,
        is_active: true,
        coverage_tier: 'tier_3',
        confidence: 'medium',
      }, { onConflict: 'id' });
      if (error) {
        console.error(`[fetch-mayor] upsert error for ${id}: ${error.message}`);
        continue;
      }
      inserted.push(id);
      if (role.toLowerCase() === 'mayor') mayorId_ = id;
    }

    if (inserted.length === 0) {
      await supabase.from('mayor_fetch_queue').update({
        status: 'no_data',
        error: 'No officials returned',
        completed_at: new Date().toISOString(),
      }).eq('state', stateUp).eq('city', cityClean);
      return { skipped: true, reason: 'no_data', provider };
    }

    await supabase.from('mayor_fetch_queue').update({
      status: 'done',
      completed_at: new Date().toISOString(),
      resulting_candidate_id: mayorId_ || inserted[0],
      error: null,
    }).eq('state', stateUp).eq('city', cityClean);

    // Fire-and-forget AI answer research only for the mayor (cost control)
    if (mayorId_) {
      fetch(`${SUPABASE_URL}/functions/v1/populate-civic-answers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ candidateId: mayorId_ }),
      }).catch((e) => console.error('[fetch-mayor] populate-civic-answers invoke failed', e));
    }

    console.log(`[fetch-mayor] inserted ${inserted.length} officials via ${provider}: ${inserted.join(', ')}`);
    return { inserted: inserted.length, ids: inserted, mayorId: mayorId_, provider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetch-mayor] error:', msg);
    const { data: q } = await supabase.from('mayor_fetch_queue')
      .select('attempts').eq('state', stateUp).eq('city', cityClean).single();
    await supabase.from('mayor_fetch_queue').update({
      status: 'failed',
      error: msg.slice(0, 500),
      attempts: (q?.attempts ?? 0) + 1,
    }).eq('state', stateUp).eq('city', cityClean);
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Require admin auth — this endpoint triggers expensive AI calls and writes to civic data tables.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminCheck = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await adminCheck
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const state = (body.state || '').toString().trim();
    const city = (body.city || '').toString().trim();
    const background = body.background !== false;

    if (!state || !city || state.length > 2 || city.length > 100) {
      return new Response(JSON.stringify({ error: 'state (2 chars) and city (<=100 chars) required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (background && typeof EdgeRuntime !== 'undefined') {
      // @ts-ignore
      EdgeRuntime.waitUntil(processCity(supabase, state, city).catch((e) => console.error('[fetch-mayor] bg error', e)));
      return new Response(JSON.stringify({ queued: true, state: state.toUpperCase(), city }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await processCity(supabase, state, city);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[fetch-mayor] fatal', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
