import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { z } from 'npm:zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// candidates.id is TEXT (e.g. S001150, P000197, P80001571) — NOT uuid.
const BodySchema = z.object({
  candidate_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  overwrite: z.boolean().optional(),
});

interface CandidateRow {
  id: string;
  name: string;
  state: string | null;
  office: string | null;
  x_handle: string | null;
}

type ResultEntry = {
  candidate_id: string;
  status: 'updated' | 'not_found' | 'update_failed' | 'skipped_existing' | 'rate_limited' | 'skipped_use_press_gallery';
  handle?: string;
  reason?: string;
  error?: string;
};

const HANDLE_REGEX = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?=["'/?#]|$)/g;
const RESERVED = new Set([
  'home', 'explore', 'i', 'intent', 'search', 'messages', 'notifications',
  'settings', 'compose', 'login', 'signup', 'about', 'tos', 'privacy',
  'share', 'hashtag', 'help', 'jobs', 'download', 'developers',
]);

const UA = 'Mozilla/5.0 (compatible; PolipulseHandleBot/1.0; +https://polipulseapp.com)';

function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  if (RESERVED.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function buildSearchTerms(c: CandidateRow): string[] {
  const parts = [c.name, c.state, c.office].filter(Boolean).join(' ');
  return [
    `${c.name} ${c.state ?? ''} ${c.office ?? ''}`.trim(),
    `${c.name} for ${c.office ?? 'office'} ${c.state ?? ''}`.trim(),
    `${c.name} official`,
  ].filter((t) => t.length > c.name.length);
}

async function fetchHtml(url: string): Promise<{ html: string | null; status: number }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: 0 };
  }
}

function extractHandles(html: string): string[] {
  const found = new Set<string>();
  HANDLE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HANDLE_REGEX.exec(html)) !== null) {
    const n = normalizeHandle(m[1]);
    if (n) found.add(n);
  }
  return [...found];
}

async function scoreHandle(c: CandidateRow, handle: string): Promise<{ score: number; status: number }> {
  const { html, status } = await fetchHtml(`https://x.com/${handle}`);
  if (!html) return { score: -1, status };
  const lower = html.toLowerCase();
  const nameTokens = c.name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  const lastName = nameTokens[nameTokens.length - 1] ?? '';
  // Hard requirement: last name must appear on the profile page.
  if (lastName && !lower.includes(lastName)) return { score: 0, status };

  let score = 0;
  for (const part of nameTokens) if (lower.includes(part)) score += 2;
  if (c.state && lower.includes(c.state.toLowerCase())) score += 1;
  if (c.office && lower.includes(c.office.toLowerCase())) score += 1;
  if (nameTokens[0] && handle.toLowerCase().includes(nameTokens[0])) score += 1;
  return { score, status };
}

async function discoverHandle(c: CandidateRow): Promise<{ handle: string | null; reason: string; rateLimited?: boolean }> {
  const collected: string[] = [];
  for (const term of buildSearchTerms(c)) {
    const url = `https://x.com/search?q=${encodeURIComponent(term)}&src=typed_query&f=user`;
    const { html, status } = await fetchHtml(url);
    if (status === 429) return { handle: null, reason: 'search_rate_limited', rateLimited: true };
    if (!html) continue;
    collected.push(...extractHandles(html));
    if (collected.length >= 12) break;
  }
  const unique = [...new Set(collected)].slice(0, 12);
  if (unique.length === 0) return { handle: null, reason: 'no_match_in_search' };

  let best: { handle: string; score: number } | null = null;
  for (const h of unique) {
    const { score, status } = await scoreHandle(c, h);
    if (status === 429) return { handle: null, reason: 'profile_rate_limited', rateLimited: true };
    if (!best || score > best.score) best = { handle: h, score };
  }
  if (!best || best.score < 3) return { handle: null, reason: 'low_confidence_match' };
  return { handle: best.handle, reason: 'matched' };
}

async function processBatch(admin: ReturnType<typeof createClient>, rows: CandidateRow[], overwrite: boolean) {
  const results: ResultEntry[] = [];
  for (const row of rows) {
    const existing = normalizeHandle(row.x_handle ?? '');
    if (existing && !overwrite) {
      results.push({ candidate_id: row.id, status: 'skipped_existing', handle: existing });
      continue;
    }
    const found = await discoverHandle(row);
    if (found.rateLimited) {
      results.push({ candidate_id: row.id, status: 'rate_limited', reason: found.reason });
      console.warn('[discover-x] rate limited, stopping batch', { remaining: rows.length - results.length });
      break;
    }
    if (!found.handle) {
      results.push({ candidate_id: row.id, status: 'not_found', reason: found.reason });
      continue;
    }
    const { error: updateError } = await admin
      .from('candidates')
      .update({ x_handle: found.handle })
      .eq('id', row.id);
    if (updateError) {
      results.push({ candidate_id: row.id, status: 'update_failed', error: updateError.message });
    } else {
      results.push({ candidate_id: row.id, status: 'updated', handle: found.handle });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const updated = results.filter((r) => r.status === 'updated').length;
  console.log('[discover-x] batch done', { scanned: rows.length, processed: results.length, updated });
  return results;
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
    const { candidate_id, limit = 50, overwrite = false } = parsed.data;

    let query = admin.from('candidates').select('id,name,state,office,x_handle').limit(limit);
    if (candidate_id) query = query.eq('id', candidate_id);
    if (!overwrite) query = query.is('x_handle', null);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as CandidateRow[];

    // Single-candidate runs are synchronous so the UI can react immediately.
    if (candidate_id) {
      const results = await processBatch(admin, rows, overwrite);
      return new Response(JSON.stringify({
        ok: true, mode: 'sync', scanned: rows.length,
        updated: results.filter((r) => r.status === 'updated').length, results,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Batch runs go to the background to avoid request timeouts.
    // @ts-ignore - EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(processBatch(admin, rows, overwrite));
    return new Response(JSON.stringify({
      ok: true, mode: 'background', scanned: rows.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[discover-x] error', message);
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
