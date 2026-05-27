import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { z } from 'npm:zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  candidate_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  overwrite: z.boolean().optional(),
});

interface CandidateRow {
  id: string;
  name: string;
  state: string;
  office: string;
  x_handle: string | null;
}

const HANDLE_REGEX = /https:\/\/x\.com\/([A-Za-z0-9_]{1,50})(?:["'/?#]|$)/g;
const RESERVED = new Set(['home', 'explore', 'i', 'intent', 'search', 'messages', 'notifications', 'settings']);

function normalizeHandle(raw: string): string | null {
  const cleaned = raw.replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,50}$/.test(cleaned)) return null;
  if (RESERVED.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function buildSearchTerms(candidate: CandidateRow): string[] {
  return [
    `${candidate.name} ${candidate.state} ${candidate.office}`,
    `${candidate.name} for ${candidate.office} ${candidate.state}`,
    `${candidate.name} official`,
  ];
}

async function fetchSearchHtml(term: string): Promise<string | null> {
  const q = encodeURIComponent(term);
  const url = `https://x.com/search?q=${q}&src=typed_query&f=user`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ai-story-weaver-handle-bot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) return null;
  return await res.text();
}

function extractHandlesFromHtml(html: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HANDLE_REGEX.exec(html)) !== null) {
    const normalized = normalizeHandle(m[1]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

async function scoreHandle(candidate: CandidateRow, handle: string): Promise<number> {
  const url = `https://x.com/${handle}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ai-story-weaver-handle-bot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) return -1;
  const html = (await res.text()).toLowerCase();
  const nameParts = candidate.name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);

  let score = 0;
  for (const part of nameParts) if (html.includes(part)) score += 2;
  if (html.includes(candidate.state.toLowerCase())) score += 1;
  if (html.includes(candidate.office.toLowerCase())) score += 1;
  if (handle.toLowerCase().includes(nameParts[0] ?? '')) score += 1;
  return score;
}

async function discoverHandle(candidate: CandidateRow): Promise<{ handle: string | null; reason: string }> {
  const candidates: string[] = [];
  for (const term of buildSearchTerms(candidate)) {
    const html = await fetchSearchHtml(term);
    if (!html) continue;
    candidates.push(...extractHandlesFromHtml(html));
    if (candidates.length >= 12) break;
  }

  const unique = [...new Set(candidates)].slice(0, 12);
  if (unique.length === 0) return { handle: null, reason: 'no_match_in_search' };

  let best: { handle: string; score: number } | null = null;
  for (const handle of unique) {
    const score = await scoreHandle(candidate, handle);
    if (!best || score > best.score) best = { handle, score };
  }

  if (!best || best.score < 3) return { handle: null, reason: 'low_confidence_match' };
  return { handle: best.handle, reason: 'matched' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', uid)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = req.body ? await req.json().catch(() => ({})) : {};
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { candidate_id, limit = 50, overwrite = false } = parsed.data;

    let query = admin.from('candidates').select('id,name,state,office,x_handle').limit(limit);
    if (candidate_id) query = query.eq('id', candidate_id);
    if (!overwrite) query = query.is('x_handle', null);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as CandidateRow[];

    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const existing = normalizeHandle(row.x_handle ?? '');
      if (existing && !overwrite) {
        results.push({ candidate_id: row.id, status: 'skipped_existing', handle: existing });
        continue;
      }

      const found = await discoverHandle(row);
      if (!found.handle) {
        results.push({ candidate_id: row.id, status: 'not_found', reason: found.reason });
        continue;
      }

      const { error: updateError } = await admin.from('candidates').update({ x_handle: found.handle }).eq('id', row.id);

      if (updateError) {
        results.push({ candidate_id: row.id, status: 'update_failed', error: updateError.message });
      } else {
        results.push({ candidate_id: row.id, status: 'updated', handle: found.handle });
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: rows.length,
        updated: results.filter((r) => r.status === 'updated').length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
