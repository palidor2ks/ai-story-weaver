// #3 backfill — enrich + CORROBORATE (2026-06-17). For a candidate's URL-less (demoted) answers,
// search for a real source AND judge whether it actually supports the recorded stance. Writes to
// the staging table public._answer_corroboration; does NOT touch candidate_answers (a gated SQL
// step applies verdict='supports' rows after human inspection — house pattern, cf. match-answer-
// citations). Anti-fabrication: a source URL is only accepted if it appears among the actually-
// retrieved search citations AND passes a HEAD/GET reachability check. Uses base `sonar` with
// search_context_size:'medium' (the per-request search fee is the dominant cost, so we keep it
// modest) over the open web — no federal-legislative domain allowlist, since most #3 targets are
// non-incumbents / state & local officials with no congress.gov footprint.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

// No federal-legislative domain allowlist: most #3 targets are non-incumbents / state & local
// officials with no congress.gov footprint, so we search the open web and lean on the prompt
// (prefer official/reputable), the blocked-domain list, the in-citations check, and URL validation.
const SEARCH_RECENCY = 'year';
const DEFAULT_LIMIT = 25;            // answers per invocation (bounds wall-clock + spend)

const BLOCKED_DOMAINS = [
  'republicanviews.org', 'democraticviews.org', 'conservapedia.com', 'rationalwiki.org',
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'tiktok.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
];

function isBlockedDomain(url: string): boolean {
  try { return BLOCKED_DOMAINS.some((d) => new URL(url).hostname.toLowerCase().includes(d)); }
  catch { return true; }
}

async function validateUrl(url: string, timeout = 3000): Promise<boolean> {
  if (!url || isBlockedDomain(url)) return false;
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeout);
      const r = await fetch(url, { method, signal: c.signal, redirect: 'follow' });
      clearTimeout(t);
      if (r.ok) return true;
    } catch { /* next */ }
  }
  return false;
}

async function requireCronAuth(req: Request): Promise<Response | null> {
  const provided = req.headers.get('x-cron-secret');
  if (SUPABASE_URL && SERVICE_KEY && provided) {
    try {
      const { data } = await createClient(SUPABASE_URL, SERVICE_KEY).rpc('get_cron_secret');
      if (typeof data === 'string' && data.length === provided.length) {
        let diff = 0;
        for (let i = 0; i < data.length; i++) diff |= data.charCodeAt(i) ^ provided.charCodeAt(i);
        if (diff === 0) return null;
      }
    } catch { /* fall through */ }
  }
  const auth = req.headers.get('authorization') ?? '';
  if (SERVICE_KEY && auth === `Bearer ${SERVICE_KEY}`) return null;
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface QRow { id: string; text: string; answer_value: number | null }

function stanceLine(v: number | null): string {
  if (v == null) return 'no recorded stance';
  const side = v < 0 ? 'progressive/left' : v > 0 ? 'conservative/right' : 'centrist';
  return `value ${v} on a -10..+10 scale (negative=left, positive=right) — the ${side} position`;
}

async function sonar(messages: unknown[]): Promise<{ content: string; citations: string[]; usage: any } | null> {
  if (!PERPLEXITY_API_KEY) return null;
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages,
      search_recency_filter: SEARCH_RECENCY,
      web_search_options: { search_context_size: 'medium' }, // 'low' under-retrieved; medium balances cost/recall
    }),
  });
  if (!r.ok) { console.warn('[sonar] status', r.status); return null; }
  const data = await r.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: Array.isArray(data.citations) ? data.citations : [],
    usage: data.usage || {},
  };
}

async function corroborateOne(ctx: string, q: QRow): Promise<any> {
  const t0 = Date.now();
  const res = await sonar([
    { role: 'system', content: `You verify whether public, citable evidence supports a candidate's recorded policy stance. Use ONLY sources you actually find via search (prefer .gov, official records, reputable news); never invent a URL or a quote.` },
    { role: 'user', content:
      `Candidate: ${ctx}.\nQuestion: "${q.text}"\nRecorded stance: ${stanceLine(q.answer_value)}.\n` +
      `Search for this candidate's ACTUAL documented position on this question. Then return ONLY JSON:\n` +
      `{"verdict":"supports|contradicts|insufficient","source_url":"<a URL you found, or empty>","source_title":"...","quote":"<short direct quote/finding>","source_value":<integer -10..10 reflecting what the source shows, or null>}\n` +
      `"supports" = a source documents the candidate holding this same-direction stance. "contradicts" = a source shows the opposite. "insufficient" = no clear source found.` },
  ]);
  const ms = Date.now() - t0;
  if (!res) return { verdict: 'error', call_ms: ms, total_tokens: null };

  let p: any = {};
  const m = res.content.match(/\{[\s\S]*\}/);
  try { p = m ? JSON.parse(m[0]) : {}; } catch { p = {}; }

  const verdict = ['supports', 'contradicts', 'insufficient'].includes(p.verdict) ? p.verdict : 'insufficient';
  const url: string = typeof p.source_url === 'string' ? p.source_url.trim() : '';
  // Anti-fabrication: only trust a URL the search actually retrieved.
  const inCitations = url !== '' && res.citations.some((c) => c === url || c.includes(url) || url.includes(c));
  const urlValid = url !== '' && !isBlockedDomain(url) && await validateUrl(url);
  const corroborated = verdict === 'supports' && inCitations && urlValid;

  return {
    verdict,
    source_value: Number.isInteger(p.source_value) ? p.source_value : null,
    source_url: url || null,
    source_title: (p.source_title || '').slice(0, 300) || null,
    quote: (p.quote || '').slice(0, 600) || null,
    in_citations: inCitations,
    url_valid: urlValid,
    corroborated,
    call_ms: ms,
    total_tokens: res.usage?.total_tokens ?? null,
  };
}

async function run(supabase: any, runLabel: string, candidate: any, questions: QRow[]): Promise<void> {
  const ctx = `${candidate.name} (${candidate.office}, ${candidate.state}, ${candidate.party})`;
  for (const q of questions) {
    try {
      const r = await corroborateOne(ctx, q);
      await supabase.from('_answer_corroboration').upsert({
        run_label: runLabel, candidate_id: candidate.id, question_id: q.id,
        recorded_value: q.answer_value, ...r,
      }, { onConflict: 'run_label,candidate_id,question_id' });
      await new Promise((res) => setTimeout(res, 700));
    } catch (e) { console.error('[corroborate] error', q.id, e); }
  }
  console.log(`[corroborate] ${runLabel} done: ${candidate.id} (${questions.length} q)`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authFail = await requireCronAuth(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => ({}));
  const { candidate_id, question_ids, run_label, limit } = body;
  if (!candidate_id) {
    return new Response(JSON.stringify({ error: 'candidate_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: candidate } = await supabase.from('candidates')
    .select('id, name, office, state, party').eq('id', candidate_id).maybeSingle();
  if (!candidate) {
    return new Response(JSON.stringify({ error: 'candidate not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Target questions: explicit list, else the candidate's URL-less answers (the demoted ones).
  let questions: QRow[];
  if (Array.isArray(question_ids) && question_ids.length) {
    const { data: qs } = await supabase.from('questions').select('id, text').in('id', question_ids);
    const { data: ans } = await supabase.from('candidate_answers')
      .select('question_id, answer_value').eq('candidate_id', candidate_id).in('question_id', question_ids);
    const av = new Map((ans || []).map((a: any) => [a.question_id, a.answer_value]));
    questions = (qs || []).map((q: any) => ({ id: q.id, text: q.text, answer_value: av.get(q.id) ?? null }));
  } else {
    const { data: ans } = await supabase.from('candidate_answers')
      .select('question_id, answer_value, source_url, source_urls')
      .eq('candidate_id', candidate_id).limit(2000);
    const urlless = (ans || []).filter((a: any) =>
      !(typeof a.source_url === 'string' && a.source_url.trim()) &&
      !(Array.isArray(a.source_urls) && a.source_urls.some((u: any) => typeof u === 'string' && u.trim())))
      .slice(0, limit || DEFAULT_LIMIT);
    const { data: qs } = await supabase.from('questions').select('id, text')
      .in('id', urlless.map((a: any) => a.question_id));
    const txt = new Map((qs || []).map((q: any) => [q.id, q.text]));
    questions = urlless.map((a: any) => ({ id: a.question_id, text: txt.get(a.question_id) || a.question_id, answer_value: a.answer_value }));
  }

  const label = run_label || `corr-${new Date().toISOString().slice(0, 10)}`;
  EdgeRuntime.waitUntil(run(supabase, label, candidate, questions));
  return new Response(JSON.stringify({ status: 'started', run_label: label, candidate: candidate.name, questions: questions.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
