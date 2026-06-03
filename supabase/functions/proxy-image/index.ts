// Public CORS-safe image proxy. Fetches an allowlisted external image and
// re-serves it from our origin so html-to-image / canvas rasterization works.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOWED_HOST_SUFFIXES = [
  'bioguide.congress.gov',
  'house.gov',
  'senate.gov',
  'supabase.co',
  'supabase.in',
  'openstates.org',
  'githubusercontent.com',
  'wikimedia.org',
  'wikipedia.org',
  'nj.us',
  'state.nj.us',
  'njleg.state.nj.us',
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: URL;
    try { parsed = new URL(target); } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return new Response(JSON.stringify({ error: 'invalid protocol' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!hostAllowed(parsed.hostname)) {
      return new Response(JSON.stringify({ error: 'host not allowed', host: parsed.hostname }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'PolipulseImageProxy/1.0' },
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'upstream_failed', status: upstream.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ct = upstream.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'not_an_image', contentType: ct }), {
        status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'too_large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
