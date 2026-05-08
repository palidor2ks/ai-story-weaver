import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY');

function citySlug(city: string) {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function mayorId(state: string, city: string) {
  return `mayor_${state.toLowerCase()}_${citySlug(city)}`;
}

async function researchMayor(state: string, city: string) {
  if (!PERPLEXITY_KEY) throw new Error('PERPLEXITY_API_KEY not configured');

  const prompt = `Who is the current sitting mayor of ${city}, ${state}, United States, as of today? Provide ONLY a JSON object with these exact fields:
- name: full legal name of the current mayor
- party: one of "Democrat", "Republican", "Independent", "Other" (use "Other" if unknown or nonpartisan)
- took_office_date: ISO date YYYY-MM-DD when they took office, or null
- official_website: URL of the city's official mayor page, or null
- photo_url: a direct URL to an official portrait photo, or null
- source_urls: array of 1-5 URLs you used (must include city's official .gov site if available)

If the city has no mayor (e.g. uses a city manager or council) or you cannot confirm the current mayor with confidence, return name as null. Do not guess.`;

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
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mayor',
          schema: {
            type: 'object',
            properties: {
              name: { type: ['string', 'null'] },
              party: { type: 'string', enum: ['Democrat', 'Republican', 'Independent', 'Other'] },
              took_office_date: { type: ['string', 'null'] },
              official_website: { type: ['string', 'null'] },
              photo_url: { type: ['string', 'null'] },
              source_urls: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'party', 'source_urls'],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perplexity ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty Perplexity response');
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in Perplexity response');
    return JSON.parse(m[0]);
  }
}

async function processCity(supabase: ReturnType<typeof createClient>, state: string, city: string) {
  const stateUp = state.toUpperCase();
  const cityClean = city.trim();
  const id = mayorId(stateUp, cityClean);

  console.log(`[fetch-mayor] processing ${cityClean}, ${stateUp} → ${id}`);

  // Skip if already exists
  const { data: existing } = await supabase
    .from('static_officials')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    console.log('[fetch-mayor] already exists, skipping');
    return { skipped: true, candidateId: id };
  }

  // Mark queue as in progress
  await supabase.from('mayor_fetch_queue').upsert({
    state: stateUp,
    city: cityClean,
    status: 'in_progress',
    last_attempted_at: new Date().toISOString(),
  }, { onConflict: 'state,city' });

  try {
    const result = await researchMayor(stateUp, cityClean);
    if (!result?.name) {
      await supabase.from('mayor_fetch_queue').update({
        status: 'no_data',
        error: 'No confirmed mayor found',
        completed_at: new Date().toISOString(),
      }).eq('state', stateUp).eq('city', cityClean);
      return { skipped: true, reason: 'no_data' };
    }

    const partyEnum = ['Democrat', 'Republican', 'Independent', 'Other'].includes(result.party)
      ? result.party : 'Other';

    const { error: insertErr } = await supabase.from('static_officials').insert({
      id,
      name: result.name,
      party: partyEnum,
      office: `Mayor of ${cityClean}`,
      level: 'local',
      state: stateUp,
      city: cityClean,
      district: null,
      image_url: result.photo_url || null,
      website_url: result.official_website || null,
      is_active: true,
      coverage_tier: 'tier_3',
      confidence: 'medium',
    });
    if (insertErr) throw insertErr;

    await supabase.from('mayor_fetch_queue').update({
      status: 'done',
      completed_at: new Date().toISOString(),
      resulting_candidate_id: id,
      error: null,
    }).eq('state', stateUp).eq('city', cityClean);

    // Fire-and-forget AI answer research for this new mayor
    fetch(`${SUPABASE_URL}/functions/v1/populate-civic-answers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ candidateId: id }),
    }).catch((e) => console.error('[fetch-mayor] populate-civic-answers invoke failed', e));

    console.log(`[fetch-mayor] inserted ${id}: ${result.name} (${partyEnum})`);
    return { candidateId: id, name: result.name, party: partyEnum };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetch-mayor] error:', msg);
    await supabase.from('mayor_fetch_queue').update({
      status: 'failed',
      error: msg.slice(0, 500),
      attempts: (await supabase.from('mayor_fetch_queue').select('attempts').eq('state', stateUp).eq('city', cityClean).single()).data?.attempts ?? 0,
    }).eq('state', stateUp).eq('city', cityClean);
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const state = (body.state || '').toString().trim();
    const city = (body.city || '').toString().trim();
    const background = body.background !== false; // default true

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
