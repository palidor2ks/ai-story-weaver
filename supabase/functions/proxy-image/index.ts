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
  // State-legislature + government photo hosts surfaced by OpenStates `person.image`
  // for state legislators (NJ + NC and future states). The response is still
  // validated as image/* and size-capped below, so these only widen the source list.
  'nj.gov',
  'ncleg.gov',
  'ncga.state.nc.us',
  'nc.gov',
  'naag.org',
  'texas.gov',
  'state.tx.us',
  'capitol.texas.gov',
  // Common image CDNs that OpenStates / official bios point at.
  'amazonaws.com',
  'googleapis.com',
  'gstatic.com',
  'wixstatic.com',
  'squarespace-cdn.com',
  'civicengine.com',
  // @unitedstates project — Congress member photos (congress.gov mirror)
  'unitedstates.github.io',
  // Executive portraits (President, VP)
  'whitehouse.gov',
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

    // Fail fast on unreachable or slow upstreams. Without this, a blocked host
    // (e.g. a state-legislature photo server that silently drops the connection)
    // hangs the fetch until the OS-level TCP connect timeout (~110s) and then
    // throws, which previously surfaced to the client as a 500 + blank share card.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // Wikimedia requires a descriptive UA with contact info or it returns 400.
          'User-Agent': 'PolipulseImageProxy/1.0 (https://polipulseapp.com; contact@polipulseapp.com)',
          'Accept': 'image/*,*/*;q=0.8',
          'Referer': parsed.origin + '/',
        },
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
    } catch (err) {
      // A network failure (DNS, connection refused, connect-timeout) or our own
      // abort lands here. That's an upstream/gateway problem, not an internal
      // fault of this proxy, so return 502/504 — never a 500 — so the failure is
      // logged honestly and the client degrades to the raw image URL instead of
      // treating it as a hard runtime error.
      const aborted = (err as Error)?.name === 'AbortError';
      return new Response(
        JSON.stringify({ error: aborted ? 'upstream_timeout' : 'upstream_unreachable' }),
        {
          status: aborted ? 504 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
