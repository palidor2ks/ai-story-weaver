// Resolves which municipal ward / city-council district a coordinate falls in,
// so the app can surface only the user's OWN ward/district council member
// instead of every seat in the municipality. Works in any state.
//
// Resolution order (highest trust first):
//   1. Overrides — admin-curated authoritative sources in
//      `district_boundary_overrides` (this is where a vetted official list is
//      uploaded). Per-city, or statewide via city='*'. Confidence: high.
//   2. Registry  — curated authoritative statewide services in code, keyed by
//      state (e.g. NJ's statewide ward layer). Confidence: high.
//   3. Discovery — search ArcGIS Online for the city's "ward"/"council district"
//      polygon service. Each candidate is scored for authority (government-hosted
//      or on the trusted-owner allowlist ⇒ "gov"/medium; anything else ⇒
//      "community"/low) and validated by point-in-polygon + a district attribute.
//      A community source is only trusted when its number matches a seat we
//      actually have an official for (cross-check). The winning source is cached
//      in `district_boundary_sources` (with confidence + owner) so later lookups
//      are one query; confirmed misses are cached too, and an admin can flag a
//      cached source approved=true (always trust) or approved=false (never use).
//
// Everything fails safe: any miss/error returns null and the caller falls back
// to showing all seats with a note. Matching to an official is by a normalized
// key (see seatDivisionKey) that handles numbers ("9"), letters ("D") and
// directional/named wards ("Northeast", "Delaware"), so a council member's
// `district` just has to carry the same identifier the boundary layer reports.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

export type Confidence = 'high' | 'medium' | 'low';

export interface ResolvedDistrict {
  key: string;               // normalized: "9", "d", "northeast" …
  kind: 'Ward' | 'District'; // inferred from the boundary layer's field name
  label: string;             // "Ward 9", "District D", "Northeast Ward"
  source: string;            // query URL used (logging/debug)
  confidence: Confidence;    // how much to trust this attribution
}

interface RegistrySource {
  queryUrl: string;          // full ArcGIS query endpoint (…/FeatureServer/<layer>/query)
  muniField?: string;        // attribute used to confirm the polygon's municipality
}

// Authoritative, vetted statewide sources by USPS state code. Add an entry here
// as each state's statewide ward/district layer is confirmed (DB overrides can
// also do this without a code change).
const STATE_REGISTRY: Record<string, RegistrySource> = {
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

// --- Attribute → division-KEY extraction -----------------------------------
// Field names vary wildly across services (WARD_CODE, ward, District, DistrictID,
// COUNCIL_DIST, CD…) and values may be numbers ("9"), letters ("D") or names
// ("Northeast", "Delaware"). Score field names to pick the real ward/district
// field and avoid look-alikes (Shape__Area, District_Enrollment, the "Districts"
// count, MEMBER/PHONE/YEAR…).
const STRONG_KEY = /^(ward|ward_?code|ward_?no|ward_?num|ward_?id|district|district_?id|district_?no|district_?num|council_?district|councildist|coun_?dist|cd)$/i;
const WEAK_KEY = /(ward|council.?dist|^district$|district_?id|district_?name)/i;
const BAD_KEY = /(objectid|globalid|^fid$|shape|area|length|perimeter|acre|enroll|population|^pop|count|districts|year|term|phone|zip|geoid|member|email|website|url)/i;

// Directional names are canonicalized (symmetrically on both the seat label and
// the boundary value) so "NE" and "Northeast" compare equal.
const DIRECTION: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  c: 'central', ctr: 'central',
};

// Normalize a ward/district token (from a seat label OR a boundary value) to a
// comparable key: numbers → "9", single letters → "d", names/directions →
// "northeast" / "delaware". Returns null when there's nothing identifying.
function normalizeDivisionToken(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // Drop structural words so "ward 3", "district d", "delaware district",
  // "super district 8", "1st voter district" reduce to their identifying token.
  s = s.replace(/\b(wards?|districts?|councils?|divisions?|seats?|positions?|places?|super|voter|councilmember|member|of|the)\b/g, ' ')
       .replace(/[^a-z0-9 ]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  const first = s.split(' ')[0];
  const ord = first.match(/^(\d+)(st|nd|rd|th)$/);
  if (ord) return String(parseInt(ord[1], 10));
  if (/^\d+$/.test(first)) return String(parseInt(first, 10));
  const compact = s.replace(/ /g, '');
  return DIRECTION[compact] ?? DIRECTION[first] ?? first;
}

// Human label for a division key: "Ward 9", "District D", "Northeast Ward".
function keyLabel(key: string, kind: 'Ward' | 'District'): string {
  if (/^\d+$/.test(key)) return `${kind} ${key}`;
  if (/^[a-z]$/.test(key)) return `${kind} ${key.toUpperCase()}`;
  const titled = key.charAt(0).toUpperCase() + key.slice(1);
  return kind === 'Ward' ? `${titled} Ward` : `${titled} District`;
}

export function extractDivision(
  attrs: Record<string, unknown> | null | undefined,
): { key: string; kind: 'Ward' | 'District' } | null {
  if (!attrs) return null;
  let best: { key: string; kind: 'Ward' | 'District'; score: number } | null = null;
  for (const [field, val] of Object.entries(attrs)) {
    if (BAD_KEY.test(field)) continue;
    const score = STRONG_KEY.test(field) ? 3 : WEAK_KEY.test(field) ? 1 : 0;
    if (score === 0) continue;
    const key = normalizeDivisionToken(val);
    if (key == null || key.length > 24) continue;
    if (!best || score > best.score) {
      best = { key, kind: /ward/i.test(field) ? 'Ward' : 'District', score };
    }
  }
  return best ? { key: best.key, kind: best.kind } : null;
}

// Pull the ward/district KEY out of a council member's seat label.
// "Ward 4" → "4", "District D" → "d", "Northeast Ward" → "northeast".
// City-wide seats ("At-Large", "N/A", null/empty) → null (never ward-filtered).
export function seatDivisionKey(district?: string | null): string | null {
  if (!district) return null;
  const s = String(district).trim();
  if (!s || /at[-\s]?large/i.test(s) || /^n\/?a$/i.test(s)) return null;
  return normalizeDivisionToken(s);
}

function muniMatches(munName: string, city: string): boolean {
  if (!city) return true;
  const a = (munName || '').toLowerCase();
  const b = city.toLowerCase();
  return !!a && (a.includes(b) || b.includes(a));
}

// Query one boundary source for the point and (optionally) confirm municipality.
async function queryDivision(
  queryUrl: string, lat: number, lng: number, muniField: string | null, city: string,
): Promise<{ key: string; kind: 'Ward' | 'District' } | null> {
  const data = await getJson(buildPointQuery(queryUrl, lat, lng));
  const attrs = data?.features?.[0]?.attributes;
  if (!attrs) return null;
  if (muniField && !muniMatches(String(attrs[muniField] ?? ''), city)) return null;
  return extractDivision(attrs);
}

// --- Authority scoring ------------------------------------------------------
// A source is "gov" (authoritative) when it's hosted on a government server or
// its ArcGIS Online owner / org id is on the trusted allowlist; otherwise
// "community" (treated with low confidence and seat cross-checked).
function authorityOf(url: string, owner: string | undefined, trusted: Set<string>): 'gov' | 'community' {
  try {
    const host = new URL(url).host.toLowerCase();
    if (/\.(gov|mil)$/.test(host)) return 'gov';
    if (/\.us$/.test(host) && !host.endsWith('arcgis.com')) return 'gov';
  } catch (_e) { /* ignore */ }
  const orgHash = url.match(/services\d*\.arcgis\.com\/([^/]+)/i)?.[1];
  if (owner && trusted.has(owner.toLowerCase())) return 'gov';
  if (orgHash && trusted.has(orgHash.toLowerCase())) return 'gov';
  return 'community';
}

// Accept a resolved key given its confidence + the seats we actually have.
// Community/low sources must name a ward/district we hold an official for;
// admin-approved sources are always trusted.
function accept(conf: Confidence, key: string, knownKeys: Set<string>, approved?: boolean | null): boolean {
  if (approved === true) return true;
  if (conf === 'high' || conf === 'medium') return true;
  return knownKeys.size > 0 && knownKeys.has(key);
}

// --- Discovery -------------------------------------------------------------
async function discoverSource(
  lat: number, lng: number, state: string, city: string,
  trusted: Set<string>, knownKeys: Set<string>,
): Promise<{ key: string; kind: 'Ward' | 'District'; queryUrl: string; confidence: Confidence; owner: string | null } | null> {
  const deadline = Date.now() + DISCOVERY_BUDGET_MS;
  const queries = [
    `${city} ${state} ward boundaries`,
    `${city} ${state} city council district`,
  ];

  const seen = new Set<string>();
  const candidates: { url: string; owner: string | undefined }[] = [];
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
      if (!/ward|district|council/i.test(String(r.title ?? ''))) continue;
      candidates.push({ url, owner: r.owner ? String(r.owner) : undefined });
    }
  }

  // Try government / trusted sources before community ones.
  candidates.sort((a, b) =>
    Number(authorityOf(b.url, b.owner, trusted) === 'gov') -
    Number(authorityOf(a.url, a.owner, trusted) === 'gov'));

  let communityFallback: { key: string; kind: 'Ward' | 'District'; queryUrl: string; confidence: Confidence; owner: string | null } | null = null;

  for (const cand of candidates.slice(0, 5)) {
    if (Date.now() > deadline) break;
    const svc = await getJson(`${cand.url}?f=json`);
    const polygonLayers = (svc?.layers ?? []).filter(
      (l: any) => l?.geometryType === 'esriGeometryPolygon',
    );
    for (const layer of polygonLayers.slice(0, 2)) {
      if (Date.now() > deadline) break;
      const queryUrl = `${cand.url}/${layer.id}/query`;
      const div = await queryDivision(queryUrl, lat, lng, null, city);
      if (!div) continue;
      const auth = authorityOf(cand.url, cand.owner, trusted);
      if (auth === 'gov') {
        console.log(`[District] Discovered ${div.kind} ${div.key} for ${city}, ${state} (gov: ${cand.owner ?? cand.url})`);
        return { ...div, queryUrl, confidence: 'medium', owner: cand.owner ?? null };
      }
      // Community: only trust if it names a seat we hold an official for.
      if (!communityFallback && knownKeys.has(div.key)) {
        communityFallback = { ...div, queryUrl, confidence: 'low', owner: cand.owner ?? null };
      }
    }
  }

  if (communityFallback) {
    console.log(`[District] Discovered ${communityFallback.kind} ${communityFallback.key} for ${city}, ${state} (community, cross-checked)`);
  }
  return communityFallback;
}

// --- Trusted-owner allowlist (cached per cold start) -----------------------
let trustedOwnersCache: { at: number; set: Set<string> } | null = null;
async function loadTrustedOwners(supabase: SupabaseClient): Promise<Set<string>> {
  if (trustedOwnersCache && Date.now() - trustedOwnersCache.at < 10 * 60_000) {
    return trustedOwnersCache.set;
  }
  const set = new Set<string>();
  try {
    const { data } = await supabase.from('trusted_gis_owners').select('owner_key');
    for (const r of data ?? []) {
      if (r?.owner_key) set.add(String(r.owner_key).toLowerCase());
    }
  } catch (_e) { /* allowlist optional */ }
  trustedOwnersCache = { at: Date.now(), set };
  return set;
}

// --- Admin override table --------------------------------------------------
async function readOverride(supabase: SupabaseClient, state: string, city: string) {
  try {
    const { data } = await supabase
      .from('district_boundary_overrides')
      .select('city, query_url, muni_field')
      .eq('state', state)
      .eq('is_active', true)
      .in('city', [city, '*']);
    if (!data?.length) return null;
    return data.find((r: any) => String(r.city).toLowerCase() === city.toLowerCase())
      ?? data.find((r: any) => r.city === '*')
      ?? null;
  } catch (_e) {
    return null;
  }
}

// --- Source cache (district_boundary_sources) ------------------------------
async function readSourceCache(supabase: SupabaseClient, state: string, city: string) {
  try {
    const { data } = await supabase
      .from('district_boundary_sources')
      .select('status, query_url, confidence, approved, checked_at')
      .eq('state', state)
      .eq('city', city)
      .maybeSingle();
    if (!data) return null;
    if (data.approved === true || data.approved === false) return data; // sticky admin decision
    const ageDays = (Date.now() - new Date(data.checked_at as string).getTime()) / 86_400_000;
    const ttl = data.status === 'found' ? FOUND_TTL_DAYS : NONE_TTL_DAYS;
    return ageDays > ttl ? null : data;
  } catch (_e) {
    return null;
  }
}

async function writeSourceCache(
  supabase: SupabaseClient, state: string, city: string,
  status: 'found' | 'none', queryUrl: string | null, confidence: Confidence, owner: string | null,
) {
  try {
    await supabase.from('district_boundary_sources').upsert({
      state, city, status, query_url: queryUrl, confidence, source_owner: owner,
      checked_at: new Date().toISOString(),
    }, { onConflict: 'state,city' });
  } catch (_e) {
    /* best-effort cache; ignore */
  }
}

// --- Pre-seeding (coordinate-free) -----------------------------------------
// Used at roster-import time to find & vet a city's ward/council-district
// boundary service WITHOUT needing a specific address: we sample one record
// (where=1=1) and confirm it carries a district-style field. Government /
// trusted-owner sources come back high confidence (→ store as an authoritative
// override); community sources come back low (→ park in the review cache).
const MUNI_KEY = /^(city|muni|municipality|mun_?name|place|place_?name|jurisdiction|town|township|locality)$/i;

function detectMuniField(attrs: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (MUNI_KEY.test(k) && typeof v === 'string' && v.trim() && !/^\d+$/.test(v.trim())) return k;
  }
  return null;
}

export async function prefindBoundarySource(opts: {
  supabase: SupabaseClient; state: string; city: string;
}): Promise<{ queryUrl: string; confidence: Confidence; owner: string | null; muniField: string | null } | null> {
  const state = (opts.state || '').trim().toUpperCase();
  const city = (opts.city || '').trim();
  if (!state || !city) return null;

  const trusted = await loadTrustedOwners(opts.supabase);
  const deadline = Date.now() + DISCOVERY_BUDGET_MS;

  const seen = new Set<string>();
  const candidates: { url: string; owner: string | undefined }[] = [];
  for (const q of [`${city} ${state} ward boundaries`, `${city} ${state} city council district`]) {
    if (Date.now() > deadline) break;
    const res = await getJson(`https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&f=json&num=6`);
    for (const r of res?.results ?? []) {
      if (r?.type !== 'Feature Service' || !r?.url) continue;
      const url = String(r.url);
      if (seen.has(url)) continue;
      seen.add(url);
      if (!/ward|district|council/i.test(String(r.title ?? ''))) continue;
      candidates.push({ url, owner: r.owner ? String(r.owner) : undefined });
    }
  }
  candidates.sort((a, b) =>
    Number(authorityOf(b.url, b.owner, trusted) === 'gov') -
    Number(authorityOf(a.url, a.owner, trusted) === 'gov'));

  let communityFallback: { queryUrl: string; confidence: Confidence; owner: string | null; muniField: string | null } | null = null;
  for (const cand of candidates.slice(0, 5)) {
    if (Date.now() > deadline) break;
    const svc = await getJson(`${cand.url}?f=json`);
    const polygonLayers = (svc?.layers ?? []).filter((l: any) => l?.geometryType === 'esriGeometryPolygon');
    for (const layer of polygonLayers.slice(0, 2)) {
      if (Date.now() > deadline) break;
      const queryUrl = `${cand.url}/${layer.id}/query`;
      const data = await getJson(
        `${queryUrl}?where=1%3D1&outFields=*&resultRecordCount=1&returnGeometry=false&f=json`,
      );
      const attrs = data?.features?.[0]?.attributes;
      if (!attrs || !extractDivision(attrs)) continue;
      const muniField = detectMuniField(attrs);
      if (authorityOf(cand.url, cand.owner, trusted) === 'gov') {
        return { queryUrl, confidence: 'high', owner: cand.owner ?? null, muniField };
      }
      if (!communityFallback) {
        communityFallback = { queryUrl, confidence: 'low', owner: cand.owner ?? null, muniField };
      }
    }
  }
  return communityFallback;
}

// --- Public entry point ----------------------------------------------------
export async function resolveDistrict(opts: {
  supabase: SupabaseClient;
  lat: number;
  lng: number;
  state: string;
  city: string;
  /** Ward/district keys we actually have an official for (cross-check). */
  knownKeys?: string[];
}): Promise<ResolvedDistrict | null> {
  const { supabase, lat, lng } = opts;
  const state = (opts.state || '').trim().toUpperCase();
  const city = (opts.city || '').trim();
  if (!state || lat == null || lng == null) return null;
  const knownKeys = new Set((opts.knownKeys ?? []).filter((k): k is string => !!k));

  const finish = (
    d: { key: string; kind: 'Ward' | 'District' }, source: string, confidence: Confidence,
  ): ResolvedDistrict => ({ ...d, label: keyLabel(d.key, d.kind), source, confidence });

  // 1) Admin overrides (per-city, then statewide '*') — authoritative.
  const override = await readOverride(supabase, state, city);
  if (override) {
    const div = await queryDivision(override.query_url as string, lat, lng, (override.muni_field as string) ?? null, city);
    return div ? finish(div, override.query_url as string, 'high') : null;
  }

  // 2) Code registry — authoritative statewide source.
  const reg = STATE_REGISTRY[state];
  if (reg) {
    const div = await queryDivision(reg.queryUrl, lat, lng, reg.muniField ?? null, city);
    // A registry covers the whole state, so "no polygon here" means the address
    // simply isn't in a warded municipality — don't fall through to discovery.
    return div ? finish(div, reg.queryUrl, 'high') : null;
  }

  // 3) Discovery (cached by state + city), authority-scored + seat cross-checked.
  if (!city) return null;
  const trusted = await loadTrustedOwners(supabase);
  const cached = await readSourceCache(supabase, state, city);
  if (cached) {
    if (cached.approved === false) return null;                 // admin-blocked
    if (cached.status === 'none' && cached.approved !== true) return null;
    if (cached.status === 'found' && cached.query_url) {
      const div = await queryDivision(cached.query_url as string, lat, lng, null, city);
      const conf = (cached.confidence as Confidence) ?? 'low';
      if (div && accept(conf, div.key, knownKeys, cached.approved as boolean | null)) {
        return finish(div, cached.query_url as string, conf);
      }
      // Cached source stopped resolving / failed cross-check — re-discover.
    }
  }

  const discovered = await discoverSource(lat, lng, state, city, trusted, knownKeys);
  if (discovered) {
    await writeSourceCache(supabase, state, city, 'found', discovered.queryUrl, discovered.confidence, discovered.owner);
    return finish({ key: discovered.key, kind: discovered.kind }, discovered.queryUrl, discovered.confidence);
  }
  await writeSourceCache(supabase, state, city, 'none', null, 'low', null);
  return null;
}
