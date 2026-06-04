// Admin importer for municipal council rosters. Takes a normalized list of
// council members (and mayors) and upserts them into `static_officials` with the
// right id / city / district so the civic lookup can attribute and ward-filter
// them. As a best-effort follow-up it pre-seeds each new city's ward/council
// boundary source (gov-authoritative → district_boundary_overrides; community →
// district_boundary_sources for review).
//
// Body: { rows: RosterRow[], dryRun?: boolean }
//   RosterRow = { state, city, name, seat, party?, office?, websiteUrl?, imageUrl? }
//   seat examples: "Ward 3" | "District 9" | "At-Large" | "Mayor"
//
// See docs/local-officials-import.md for the full format.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { prefindBoundarySource, seatDivisionKey } from "../_shared/district-resolver.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RosterRow {
  state?: string;
  city?: string;
  name?: string;
  seat?: string;
  party?: string;
  office?: string;
  websiteUrl?: string;
  imageUrl?: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normParty(p?: string): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  const s = (p || '').toLowerCase();
  if (s.startsWith('d')) return 'Democrat';
  if (s.startsWith('r')) return 'Republican';
  if (s.startsWith('i') || s.includes('nonpartisan') || s.includes('non-partisan')) return 'Independent';
  return 'Other';
}

// Turn a free-form seat label into a canonical office + district string.
function mapSeat(seat: string, city: string): { office: string; district: string | null } {
  const s = (seat || '').trim();
  if (/^mayor\b/i.test(s)) return { office: `Mayor of ${city}`, district: null };
  if (/at[-\s]?large/i.test(s)) return { office: `Council Member, ${city} (At-Large)`, district: 'At-Large' };
  const m = s.match(/\d+/);
  if (/ward/i.test(s) && m) {
    const n = parseInt(m[0], 10);
    return { office: `Council Member, ${city} (Ward ${n})`, district: `Ward ${n}` };
  }
  if (m) {
    const n = parseInt(m[0], 10);
    return { office: `Council Member, ${city} (District ${n})`, district: `District ${n}` };
  }
  return { office: `Council Member, ${city}`, district: null };
}

interface MappedOfficial {
  record: Record<string, unknown>;
  city: string;
  state: string;
}

function mapRow(row: RosterRow): { ok: true; value: MappedOfficial } | { ok: false; error: string } {
  const state = (row.state || '').trim().toUpperCase();
  const city = (row.city || '').trim();
  const name = (row.name || '').trim();
  if (!state || state.length !== 2) return { ok: false, error: 'state must be a 2-letter code' };
  if (!city) return { ok: false, error: 'city is required' };
  if (!name) return { ok: false, error: 'name is required' };

  const seatInfo = mapSeat(row.seat || row.office || '', city);
  const isMayor = /^Mayor of /i.test(seatInfo.office);
  const id = isMayor
    ? `mayor_${slug(state)}_${slug(city)}`
    : `local_${slug(state)}_${slug(city)}_council_member_${slug(name)}`;

  return {
    ok: true,
    value: {
      record: {
        id,
        name,
        party: normParty(row.party),
        office: (row.office || '').trim() || seatInfo.office,
        level: 'local',
        state,
        district: seatInfo.district,
        city,
        image_url: (row.imageUrl || '').trim() || null,
        website_url: (row.websiteUrl || '').trim() || null,
        coverage_tier: 'tier_3',
        confidence: 'medium',
        is_active: true,
      },
      city,
      state,
    },
  };
}

// Best-effort: find & store a boundary source for each (state, city) we imported.
async function preseedBoundaries(
  supabase: ReturnType<typeof createClient>,
  cities: { state: string; city: string }[],
) {
  for (const { state, city } of cities) {
    try {
      // Skip if an authoritative override already exists for this city.
      const { data: existing } = await supabase
        .from('district_boundary_overrides')
        .select('city')
        .eq('state', state)
        .in('city', [city, '*'])
        .limit(1);
      if (existing && existing.length) continue;

      const found = await prefindBoundarySource({ supabase, state, city });
      if (!found) continue;

      if (found.confidence === 'high') {
        // Government / trusted source → authoritative override.
        await supabase.from('district_boundary_overrides').upsert({
          state, city, query_url: found.queryUrl, muni_field: found.muniField,
          label: `auto-discovered (${found.owner ?? 'gov'})`, is_active: true,
        }, { onConflict: 'state,city' });
        console.log(`[Import] Pinned gov boundary source for ${city}, ${state}`);
      } else {
        // Community source → park in the review cache (unapproved, low confidence).
        await supabase.from('district_boundary_sources').upsert({
          state, city, status: 'found', query_url: found.queryUrl,
          confidence: 'low', source_owner: found.owner, checked_at: new Date().toISOString(),
        }, { onConflict: 'state,city' });
        console.log(`[Import] Parked community boundary source for ${city}, ${state} (needs review)`);
      }
    } catch (e) {
      console.error(`[Import] preseed failed for ${city}, ${state}:`, e);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: admin only.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401);
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const rows: RosterRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const dryRun = body?.dryRun === true;
    if (!rows.length) return json({ error: 'rows[] is required' }, 400);
    if (rows.length > 5000) return json({ error: 'too many rows (max 5000)' }, 400);

    const records: Record<string, unknown>[] = [];
    const errors: { index: number; error: string; row: RosterRow }[] = [];
    const cityKeys = new Set<string>();
    const cities: { state: string; city: string }[] = [];

    rows.forEach((row, index) => {
      const mapped = mapRow(row);
      if (!mapped.ok) {
        errors.push({ index, error: mapped.error, row });
        return;
      }
      records.push(mapped.value.record);
      const key = `${mapped.value.state}::${mapped.value.city.toLowerCase()}`;
      if (!cityKeys.has(key)) {
        cityKeys.add(key);
        cities.push({ state: mapped.value.state, city: mapped.value.city });
      }
    });

    // Per-city seat summary (helps spot gaps before/after import).
    const seatSummary = cities.map(({ state, city }) => {
      const cityRecords = records.filter(r => r.state === state && (r.city as string).toLowerCase() === city.toLowerCase());
      const wards = cityRecords
        .map(r => seatDivisionKey(r.district as string | null))
        .filter((k): k is string => k != null)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return {
        state, city,
        total: cityRecords.length,
        wardSeats: wards,
        atLargeOrMayor: cityRecords.length - wards.length,
      };
    });

    if (dryRun) {
      return json({ dryRun: true, willUpsert: records.length, errors, seatSummary, sample: records.slice(0, 10) });
    }

    // Upsert in chunks.
    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase.from('static_officials').upsert(chunk, { onConflict: 'id' });
      if (error) return json({ error: `upsert failed: ${error.message}`, upserted }, 500);
      upserted += chunk.length;
    }

    // Pre-seed boundary sources for imported cities in the background.
    EdgeRuntime.waitUntil(preseedBoundaries(supabase, cities));

    return json({ success: true, upserted, cities: cities.length, errors, seatSummary });
  } catch (err) {
    console.error('[import-local-officials] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
