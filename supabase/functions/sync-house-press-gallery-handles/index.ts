import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { z } from 'npm:zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SOURCE_URL = 'https://pressgallery.house.gov/member-data/members-official-x-handles-119th-congress';
const HANDLE_REGEX = /^[A-Za-z0-9_]{1,15}$/;
const STDIS_REGEX = /^([A-Z]{2})(\d{1,2})$/;

const BodySchema = z.object({
  overwrite: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

type ParsedRow = {
  firstName: string;
  lastName: string;
  handle: string;
  state: string;
  district: string; // normalized: '0' for at-large, no leading zero otherwise
  party: string | null;
};

type UpdateResult = {
  status: 'updated' | 'would_update' | 'skipped_existing' | 'skipped_same' | 'unmatched' | 'multiple_matches' | 'update_failed' | 'invalid_handle';
  handle?: string;
  candidate_id?: string;
  candidate_name?: string;
  press_gallery: { firstName: string; lastName: string; state: string; district: string };
  error?: string;
};

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function normalizeName(s: string): string {
  return decodeEntities(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseTable(html: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  // Match each <tr>...</tr>
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = tdRegex.exec(m[1])) !== null) {
      cells.push(stripTags(c[1]));
    }
    if (cells.length < 5) continue;
    const [firstName, lastName, handleRaw, stdis, party] = cells.map((s) => decodeEntities(s).trim());
    if (!firstName || !lastName || !handleRaw || !stdis) continue;
    if (firstName.toLowerCase() === 'firstname') continue; // header
    const handle = handleRaw.replace(/^@/, '').trim();
    if (!HANDLE_REGEX.test(handle)) continue;
    const sd = STDIS_REGEX.exec(stdis.trim());
    if (!sd) continue;
    const state = sd[1];
    const district = String(parseInt(sd[2], 10)); // '00' -> '0', '12' -> '12'
    rows.push({ firstName, lastName, handle, state, district, party: party || null });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles').select('role')
      .eq('user_id', uid).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = req.body ? await req.json().catch(() => ({})) : {};
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { overwrite = false, dry_run = false } = parsed.data;

    // 1. Fetch press gallery
    const res = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PolipulseHandleBot/1.0)' },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'fetch_failed', status: res.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const html = await res.text();
    const pgRows = parseTable(html);
    if (pgRows.length < 100) {
      console.error('[press-gallery] suspiciously few rows parsed', pgRows.length);
      return new Response(JSON.stringify({
        error: 'parse_failed',
        message: `Only parsed ${pgRows.length} rows; the press gallery HTML may have changed.`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Load House candidates
    const { data: candidates, error: cErr } = await admin
      .from('candidates')
      .select('id, name, state, district, office, x_handle')
      .eq('office', 'Representative')
      .limit(2000);
    if (cErr) throw cErr;

    // Index by state + district -> candidates[]
    const byKey = new Map<string, Array<typeof candidates[number]>>();
    for (const c of candidates ?? []) {
      if (!c.state || c.district == null) continue;
      const key = `${c.state.toUpperCase()}:${String(parseInt(String(c.district), 10) || 0)}`;
      const arr = byKey.get(key) ?? [];
      arr.push(c);
      byKey.set(key, arr);
    }

    const results: UpdateResult[] = [];
    let updated = 0, skipped = 0, unmatched = 0;

    for (const row of pgRows) {
      const key = `${row.state}:${row.district}`;
      const matches = byKey.get(key) ?? [];
      const lnNorm = normalizeName(row.lastName);
      const candidate = matches.find((c) => normalizeName(c.name).includes(lnNorm))
        ?? (matches.length === 1 ? matches[0] : null);

      const base = { press_gallery: { firstName: row.firstName, lastName: row.lastName, state: row.state, district: row.district } };

      if (!candidate) {
        unmatched++;
        results.push({ ...base, status: matches.length > 1 ? 'multiple_matches' : 'unmatched', handle: row.handle });
        continue;
      }

      const existing = (candidate.x_handle ?? '').replace(/^@/, '');
      if (existing && !overwrite) {
        skipped++;
        results.push({ ...base, status: 'skipped_existing', candidate_id: candidate.id, candidate_name: candidate.name, handle: existing });
        continue;
      }
      if (existing && existing.toLowerCase() === row.handle.toLowerCase()) {
        skipped++;
        results.push({ ...base, status: 'skipped_same', candidate_id: candidate.id, candidate_name: candidate.name, handle: existing });
        continue;
      }

      if (dry_run) {
        results.push({ ...base, status: 'would_update', candidate_id: candidate.id, candidate_name: candidate.name, handle: row.handle });
        continue;
      }

      const { error: uErr } = await admin
        .from('candidates')
        .update({ x_handle: row.handle })
        .eq('id', candidate.id);
      if (uErr) {
        results.push({ ...base, status: 'update_failed', candidate_id: candidate.id, candidate_name: candidate.name, handle: row.handle, error: uErr.message });
      } else {
        updated++;
        results.push({ ...base, status: 'updated', candidate_id: candidate.id, candidate_name: candidate.name, handle: row.handle });
      }
    }

    const summary = {
      ok: true,
      dry_run,
      scanned: pgRows.length,
      candidates_loaded: candidates?.length ?? 0,
      updated,
      skipped,
      unmatched,
      results,
    };
    console.log('[press-gallery] done', { scanned: summary.scanned, updated, skipped, unmatched });
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[press-gallery] error', message);
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
