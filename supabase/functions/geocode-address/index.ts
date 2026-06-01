import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_DAYS = 30;
const GOOGLE_CIVIC_API_KEY = Deno.env.get('GOOGLE_CIVIC_API_KEY') ?? '';

// Pull every OCD division id returned by Google Civic for an address.
// Used to derive municipal subdivisions (ward, council district, school board)
// that the Census geocoder doesn't expose.
async function fetchCivicDivisions(address: string): Promise<string[]> {
  if (!GOOGLE_CIVIC_API_KEY || !address) return [];
  try {
    const url = `https://www.googleapis.com/civicinfo/v2/representatives?key=${GOOGLE_CIVIC_API_KEY}&address=${encodeURIComponent(address)}&includeOffices=false`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const divisions = data?.divisions ?? {};
    return Object.keys(divisions);
  } catch (e) {
    console.warn('[Geocode] Civic divisions fetch failed:', e);
    return [];
  }
}

// Parse a single segment like `ward:1` or `sldl:nj-006` from any matching division.
function extractDivisionSegment(divisions: string[], segment: string): string | null {
  const needle = `/${segment}:`;
  for (const id of divisions) {
    const idx = id.indexOf(needle);
    if (idx === -1) continue;
    const rest = id.slice(idx + needle.length);
    const end = rest.indexOf('/');
    const value = end === -1 ? rest : rest.slice(0, end);
    const numeric = value.match(/(\d+)/);
    return numeric ? numeric[1] : value;
  }
  return null;
}

// Normalize an address for cache keying. Uppercase, collapse whitespace,
// strip ZIP+4 suffix, and remove most punctuation except commas.
function normalizeAddress(s: string): string {
  return s
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/-\d{4}\b/g, '')        // drop ZIP+4 suffix
    .replace(/[^A-Z0-9, ]/g, '')     // drop most punctuation
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // No auth required — public geocoding endpoint, abuse mitigated by upstream API quota.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { address } = await req.json();

    if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 200) {
      return new Response(JSON.stringify({ error: 'Address is required (5-200 characters)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmed = address.trim();
    const addressPattern = /^[a-zA-Z0-9\s.,#'\-\/]+$/;
    const hasAlphanumeric = /[a-zA-Z0-9]/.test(trimmed);
    if (!addressPattern.test(trimmed) || !hasAlphanumeric) {
      return new Response(JSON.stringify({ error: 'Address contains invalid characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalized = normalizeAddress(trimmed);
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // 1. Try cache first
    const { data: cached } = await serviceClient
      .from('civic_lookup_cache')
      .select('lat, lng, state, district, city, matched_address, cached_at')
      .eq('normalized_address', normalized)
      .maybeSingle();

    if (cached) {
      const ageDays = (Date.now() - new Date(cached.cached_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < CACHE_TTL_DAYS && (cached.lat !== null || cached.state !== null)) {
        console.log(`[Geocode] Cache HIT for "${normalized}" (age ${ageDays.toFixed(1)}d)`);
        return new Response(JSON.stringify({
          district: cached.district,
          state: cached.state,
          city: cached.city,
          lat: cached.lat,
          lng: cached.lng,
          matchedAddress: cached.matched_address,
          cached: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    console.log('[Geocode] Cache MISS — calling Census for:', normalized);

    const encodedAddress = encodeURIComponent(trimmed);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('Census geocoder request failed with status:', response.status);
      return new Response(JSON.stringify({
        district: null, state: null,
        error: `Census API error: ${response.status}`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const addressMatch = data?.result?.addressMatches?.[0];

    if (!addressMatch) {
      return new Response(JSON.stringify({
        district: null, state: null,
        error: 'Address not found'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const geographies = addressMatch.geographies;
    const matchedAddress = addressMatch.matchedAddress;
    const coords = addressMatch.coordinates;
    const lat = coords?.y ?? null;
    const lng = coords?.x ?? null;

    let state: string | null = null;
    let city: string | null = null;
    if (matchedAddress) {
      const parts = matchedAddress.split(',').map((p: string) => p.trim());
      if (parts.length >= 3) {
        state = parts[parts.length - 2];
        city = parts[parts.length - 3];
      }
    }
    if (!state && geographies?.['States']?.[0]) {
      state = geographies['States'][0].STUSAB || geographies['States'][0].STATE;
    }
    if (!city) {
      const placeLayers = ['Incorporated Places', 'Census Designated Places', '2020 Census Designated Places'];
      for (const layer of placeLayers) {
        const place = geographies?.[layer]?.[0];
        if (place?.NAME || place?.BASENAME) {
          city = place.BASENAME || place.NAME;
          break;
        }
      }
    }

    const possibleLayers = [
      '119th Congressional Districts',
      '118th Congressional Districts',
      'Congressional Districts',
      '2024 Congressional Districts',
      '2022 Congressional Districts'
    ];
    let district: string | null = null;
    for (const layer of possibleLayers) {
      const cd = geographies?.[layer]?.[0];
      if (cd) {
        const districtNum = cd.CD119 || cd.CD118 || cd.CD || cd.BASENAME || cd.NAME || cd.GEOID;
        if (districtNum) {
          const numMatch = String(districtNum).match(/\d+$/);
          district = numMatch ? numMatch[0] : String(districtNum);
          break;
        }
      }
    }

    console.log(`[Geocode] State: ${state}, City: ${city}, District: ${district}, lat/lng: ${lat}/${lng}`);

    // Write back to cache (best-effort, don't block the response on errors)
    try {
      await serviceClient
        .from('civic_lookup_cache')
        .upsert({
          normalized_address: normalized,
          lat, lng, state, district, city,
          matched_address: matchedAddress,
          cached_at: new Date().toISOString(),
        }, { onConflict: 'normalized_address' });
    } catch (e) {
      console.error('[Geocode] Cache write failed:', e);
    }

    return new Response(JSON.stringify({
      district, state, city, lat, lng, matchedAddress, cached: false,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in geocode-address function:', errorMessage);
    return new Response(JSON.stringify({
      district: null, state: null, error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
