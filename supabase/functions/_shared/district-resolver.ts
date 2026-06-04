// Resolves which municipal ward / city-council district a coordinate falls in,
// so the app can surface only the user's OWN ward/district council member
// instead of every seat in the municipality. Works in any state.
//
// Two strategies, tried in order:
//   1. Registry  — curated, authoritative statewide boundary services keyed by
//                  state (e.g. NJ's statewide ward layer). Most reliable; used
//                  first whenever the state is covered.
//   2. Discovery — search ArcGIS Online for a "{city} ward / council district"
//                  polygon service, validate a candidate by point-in-polygon +
//                  a district-style attribute, then cache the winning source in
//                  `district_boundary_sources` so later lookups are one call.
//
// Everything fails safe: any miss/error returns null and the caller falls back
// to showing all seats with a note. Municipal ward/district schemes are integer
// based; matching to an official happens on that integer (see seatDivisionNumber),
// so a council member's `district` ("Ward 1", "District 9", "At-Large") just has
// to carry the same number the boundary layer reports.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

export interface ResolvedDistrict {
  number: number;            // 1, 9, 42 …
  kind: 'Ward' | 'District'; // inferred from the boundary layer's field name
  label: string;             // "Ward 1", "District 9"
  source: string;            // query URL used (logging/debug)
}

interface RegistrySource {
  // Full ArcGIS query endpoint (…/FeatureServer/<layer>/query)
  queryUrl: string;
  // Optional attribute used to confirm the polygon belongs to the user's city
  // (statewide layers cover many municipalities, so we verify the match).
  muniField?: string;
}

// Authoritative, vetted sources by USPS state code. Add an entry here as each
// state's statewide ward/district layer is confirmed.
const STATE_REGISTRY: Record<string, RegistrySource> = {
  // NJ Dept. of State / NJ Office of GIS — statewide municipal ward boundaries.
  NJ: {
    queryUrl:
      'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Ward_Boundaries_for_New_Jersey/FeatureServer/0/query',
    muniField: 'MUN_NAME',
  },
};

const FETCH_TIMEOUT_MS = 6000;
const DISCOVERY_BUDGET_MS = 12000;
const FOUND_TTL_DAYS = 30;
const NONE_TTL_DAYS = 7;

async function getJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function buildPointQuery(queryUrl: string, lat: number, lng: number): string {
  const geometry = encodeURIComponent(
    JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
  );
  const sep = queryUrl.includes('?') ? '&' : '?';
  return `${queryUrl}${sep}geometry=${geometry}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=*&returnGeometry=false&f=json`;
}

// --- Attribute → division-number extraction --------------------------------
// Field names vary wildly across services (WARD_CODE, ward, District, DistrictID,
// COUNCIL_DIST, CD…). Score keys so we pick the real ward/district id and avoid
// look-alikes (Shape__Area, District_Enrollment, the "Districts" count, etc.).
const STRONG_KEY = /^(ward|ward_?code|ward_?no|ward_?num|ward_?id|district|district_?id|district_?no|district_?num|council_?district|councildist|coun_?dist|cd)$/i;
const WEAK_KEY = /(ward|council.?dist|^district$|district_?id)/i;
const BAD_KEY = /(objectid|globalid|^fid$|shape|area|length|perimeter|acre|enroll|population|^pop|count|districts|year|term|phone|zip|geoid)/i;

function parseSmallInt(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

export function extractDivision(
  attrs: Record<string, unknown> | null | undefined,
): { number: number; kind: 'Ward' | 'District' } | null {
  if (!attrs) return null;
  let best: { number: number; kind: 'Ward' | 'District'; score: number } | null = null;
  for (const [key, val] of Object.entries(attrs)) {
    if (BAD_KEY.test(key)) continue;
    const n = parseSmallInt(val);
    if (n == null) continue;
    const score = STRONG_KEY.test(key) ? 3 : WEAK_KEY.test(key) ? 1 : 0;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { number: n, kind: /ward/i.test(key) ? 'Ward' : 'District', score };
    }
  }
  return best ? { number: best.number, kind: best.kind } : null;
}

// Pull the ward/district number out of a council member's seat label.
// "Ward 4" → 4, "District 9" → 9, "Council District 3" → 3, "01" → 1.
// City-wide seats ("At-Large", "N/A", null/empty) → null (never ward-filtered).
export function seatDivisionNumber(district?: string | null): number | null {
  if (!district) return null;
  const s = String(district).trim();
  if (!s || /at[-\s]?large/i.test(s) || /^n\/?a$/i.test(s)) return null;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function muniMatches(munName: string, city: string): boolean {
  if (!city) return true;
  const a = (munName || '').toLowerCase();
  const b = city.toLowerCase();
  return !!a && (a.includes(b) || b.includes(a));
}

// --- Discovery -------------------------------------------------------------
async function discoverSource(
  lat: number, lng: number, state: string, city: string,
): Promise<{ number: number; kind: 'Ward' | 'District'; queryUrl: string } | null> {
  const deadline = Date.now() + DISCOVERY_BUDGET_MS;
  const queries = [
    `${city} ${state} ward boundaries`,
    `${city} ${state} city council district`,
  ];

  const seen = new Set<string>();
  const candidates: string[] = []; // FeatureServer base URLs
  for (const q of queries) {
    if (Date.now() > deadline) break;
    const res = await getJson(
      `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&f=json&num=6`,
    );
    for (const r of res?.results ?? []) {
      if (r?.type !== 'Feature Service' || !r?.url) continue;
      const url = String(r.url);
      if (seen.has(url)) continue;
      seen.add(url);
      // Relevance guard: the service title must look like a ward/district layer.
      if (!/ward|district|council/i.test(String(r.title ?? ''))) continue;
      candidates.push(url);
    }
  }

  for (const base of candidates.slice(0, 5)) {
    if (Date.now() > deadline) break;
    const svc = await getJson(`${base}?f=json`);
    const polygonLayers = (svc?.layers ?? []).filter(
      (l: any) => l?.geometryType === 'esriGeometryPolygon',
    );
    for (const layer of polygonLayers.slice(0, 2)) {
      if (Date.now() > deadline) break;
      const queryUrl = `${base}/${layer.id}/query`;
      const data = await getJson(buildPointQuery(queryUrl, lat, lng));
      const div = extractDivision(data?.features?.[0]?.attributes);
      if (div) {
        console.log(`[District] Discovered ${div.kind} ${div.number} for ${city}, ${state} via ${queryUrl}`);
        return { ...div, queryUrl };
      }
    }
  }
  return null;
}

// --- Source cache (district_boundary_sources) ------------------------------
async function readSourceCache(supabase: SupabaseClient, state: string, city: string) {
  try {
    const { data } = await supabase
      .from('district_boundary_sources')
      .select('status, query_url, checked_at')
      .eq('state', state)
      .eq('city', city)
      .maybeSingle();
    if (!data) return null;
    const ageDays = (Date.now() - new Date(data.checked_at as string).getTime()) / 86_400_000;
    const ttl = data.status === 'found' ? FOUND_TTL_DAYS : NONE_TTL_DAYS;
    return ageDays > ttl ? null : data;
  } catch (_e) {
    return null;
  }
}

async function writeSourceCache(
  supabase: SupabaseClient, state: string, city: string,
  status: 'found' | 'none', queryUrl: string | null,
) {
  try {
    await supabase.from('district_boundary_sources').upsert({
      state, city, status, query_url: queryUrl, checked_at: new Date().toISOString(),
    }, { onConflict: 'state,city' });
  } catch (_e) {
    /* best-effort cache; ignore */
  }
}

// --- Public entry point ----------------------------------------------------
export async function resolveDistrict(opts: {
  supabase: SupabaseClient;
  lat: number;
  lng: number;
  state: string;
  city: string;
}): Promise<ResolvedDistrict | null> {
  const { supabase, lat, lng } = opts;
  const state = (opts.state || '').trim().toUpperCase();
  const city = (opts.city || '').trim();
  if (!state || lat == null || lng == null) return null;

  const finish = (
    d: { number: number; kind: 'Ward' | 'District' }, source: string,
  ): ResolvedDistrict => ({ ...d, label: `${d.kind} ${d.number}`, source });

  // 1) Registry — authoritative statewide source.
  const reg = STATE_REGISTRY[state];
  if (reg) {
    const data = await getJson(buildPointQuery(reg.queryUrl, lat, lng));
    const attrs = data?.features?.[0]?.attributes;
    if (attrs && (!reg.muniField || muniMatches(String(attrs[reg.muniField] ?? ''), city))) {
      const div = extractDivision(attrs);
      if (div) return finish(div, reg.queryUrl);
    }
    // A registry covers the whole state, so "no polygon here" means the address
    // simply isn't in a warded municipality — don't fall through to discovery.
    return null;
  }

  // 2) Discovery (cached by state + city).
  if (!city) return null;
  const cached = await readSourceCache(supabase, state, city);
  if (cached?.status === 'none') return null;
  if (cached?.status === 'found' && cached.query_url) {
    const data = await getJson(buildPointQuery(cached.query_url as string, lat, lng));
    const div = extractDivision(data?.features?.[0]?.attributes);
    if (div) return finish(div, cached.query_url as string);
    // Cached source stopped resolving — re-discover below.
  }

  const discovered = await discoverSource(lat, lng, state, city);
  if (discovered) {
    await writeSourceCache(supabase, state, city, 'found', discovered.queryUrl);
    return finish({ number: discovered.number, kind: discovered.kind }, discovered.queryUrl);
  }
  await writeSourceCache(supabase, state, city, 'none', null);
  return null;
}
