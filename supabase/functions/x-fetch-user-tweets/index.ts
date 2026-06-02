import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BEARER = Deno.env.get('X_BEARER_TOKEN');

const BodySchema = z.object({
  handle: z.string().min(1).max(50).regex(/^[A-Za-z0-9_]+$/, 'Invalid X handle'),
  max: z.number().int().min(5).max(100).optional(),
  since: z.string().datetime().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!BEARER) {
      return new Response(JSON.stringify({ error: 'X_BEARER_TOKEN not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { handle, max = 25, since } = parsed.data;

    const userRes = await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );

    if (userRes.status === 429) {
      const reset = userRes.headers.get('x-rate-limit-reset');
      return new Response(JSON.stringify({ error: 'rate_limited', reset }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'lookup_failed', status: userRes.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userJson = await userRes.json();
    const userId = userJson?.data?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams({
      max_results: String(max),
      'tweet.fields': 'created_at,public_metrics,entities',
    });
    if (since) params.set('start_time', since);

    const tweetsRes = await fetch(
      `https://api.x.com/2/users/${userId}/tweets?${params.toString()}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );

    if (tweetsRes.status === 429) {
      const reset = tweetsRes.headers.get('x-rate-limit-reset');
      return new Response(JSON.stringify({ error: 'rate_limited', reset }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!tweetsRes.ok) {
      return new Response(JSON.stringify({ error: 'tweets_failed', status: tweetsRes.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tweetsJson = await tweetsRes.json();
    const tweets = (tweetsJson?.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      url: `https://x.com/${handle}/status/${t.id}`,
      created_at: t.created_at,
      metrics: t.public_metrics ?? null,
    }));

    return new Response(
      JSON.stringify({ handle, user_id: userId, tweets }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
