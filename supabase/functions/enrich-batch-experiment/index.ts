// THROWAWAY EXPERIMENT (2026-06-17): A/B test batched vs unbatched Perplexity `sonar` source
// enrichment to measure the cost/quality tradeoff of batching N questions per call before we
// build the real #3 backfill. Reads candidate + questions, runs BOTH arms on the SAME questions
// (identical model/domain-filter/recency — batching is the only variable), validates every URL,
// and writes per-question + per-call metrics to public._enrich_batch_experiment. Does NOT write
// to candidate_answers. Safe to delete after the experiment.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

// Same search scope the production enrich function uses, so batching is the only variable.
const SEARCH_DOMAIN_FILTER = ['congress.gov', 'senate.gov', 'house.gov', 'c-span.org', 'govtrack.us'];
const SEARCH_RECENCY = 'year';

const BLOCKED_DOMAINS = [
  'republicanviews.org', 'democraticviews.org', 'conservapedia.com', 'rationalwiki.org',
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'tiktok.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
];

function isBlockedDomain(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => h.includes(d));
  } catch {
    return true;
  }
}

async function validateUrl(url: string, timeout = 3000): Promise<boolean> {
  if (isBlockedDomain(url)) return false;
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeout);
      const r = await fetch(url, { method, signal: c.signal, redirect: 'follow' });
      clearTimeout(t);
      if (r.ok) return true;
    } catch { /* try next */ }
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

function stance(v: number | null): string {
  if (v == null) return 'unknown stance';
  return v <= -7 ? 'strongly progressive' : v <= -3 ? 'leans progressive'
    : v >= 7 ? 'strongly conservative' : v >= 3 ? 'leans conservative' : 'centrist';
}

async function perplexity(messages: unknown[]): Promise<{ content: string; citations: string[]; usage: any } | null> {
  if (!PERPLEXITY_API_KEY) return null;
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages,
      search_domain_filter: SEARCH_DOMAIN_FILTER,
      search_recency_filter: SEARCH_RECENCY,
    }),
  });
  if (!r.ok) { console.warn('[pplx] status', r.status); return null; }
  const data = await r.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: Array.isArray(data.citations) ? data.citations : [],
    usage: data.usage || {},
  };
}

async function countValid(urls: string[]): Promise<{ valid: number; sample: string | null }> {
  const checked = await Promise.all(urls.slice(0, 4).map((u) => validateUrl(u)));
  const validUrls = urls.slice(0, 4).filter((_, i) => checked[i]);
  return { valid: validUrls.length, sample: validUrls[0] ?? null };
}

async function runExperiment(
  supabase: any, runLabel: string, candidate: any, questions: QRow[],
): Promise<void> {
  const ctx = `${candidate.name} (${candidate.office}, ${candidate.state}, ${candidate.party})`;

  // ---- BATCHED: one call, all N questions, ask for per-question citations ----
  try {
    const callId = crypto.randomUUID();
    const t0 = Date.now();
    const list = questions.map((q, i) =>
      `${i + 1}. [${q.id}] "${q.text}" (recorded stance: ${stance(q.answer_value)})`).join('\n');
    const res = await perplexity([
      { role: 'system', content: `You find official, verifiable sources documenting a candidate's policy positions. For EACH question return the single best primary source URL you actually found (prefer .gov / official records / reputable news). Only cite URLs from your search; never invent one. If none found for a question, return an empty array for it.` },
      { role: 'user', content: `Candidate: ${ctx}.\nReturn ONLY valid JSON of the form {"results":[{"question_id":"...","source_urls":["..."],"source_description":"..."}]} with one entry per question.\nQuestions:\n${list}` },
    ]);
    const ms = Date.now() - t0;
    let parsed: any = {};
    if (res) {
      const m = res.content.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : {}; } catch { parsed = {}; }
    }
    const byId = new Map<string, any>();
    for (const r of (parsed.results || [])) if (r?.question_id) byId.set(String(r.question_id), r);
    for (const q of questions) {
      const r = byId.get(q.id) || {};
      const urls: string[] = Array.isArray(r.source_urls) ? r.source_urls.filter((u: any) => typeof u === 'string') : [];
      const { valid, sample } = await countValid(urls);
      await supabase.from('_enrich_batch_experiment').insert({
        run_label: runLabel, run_type: 'batched', call_id: callId,
        candidate_id: candidate.id, question_id: q.id,
        success: valid > 0, num_citations: urls.length, num_valid_urls: valid, sample_url: sample,
        desc_len: (r.source_description || '').length, questions_in_call: questions.length,
        call_prompt_tokens: res?.usage?.prompt_tokens ?? null,
        call_completion_tokens: res?.usage?.completion_tokens ?? null,
        call_total_tokens: res?.usage?.total_tokens ?? null, call_ms: ms,
      });
    }
  } catch (e) { console.error('[batched] error', e); }

  // ---- UNBATCHED: one call per question (mirrors researchSourcesWithPerplexity) ----
  for (const q of questions) {
    try {
      const callId = crypto.randomUUID();
      const t0 = Date.now();
      const res = await perplexity([
        { role: 'system', content: `Find official sources documenting ${candidate.name}'s position on specific policy questions. The candidate ${stance(q.answer_value)} on this issue. Find direct quotes and voting records.` },
        { role: 'user', content: `Find sources for ${ctx} on: "${q.text}"` },
      ]);
      const ms = Date.now() - t0;
      const citations = res?.citations ?? [];
      const hasEvidence = (res?.content?.length ?? 0) > 50
        && !(res?.content || '').toLowerCase().includes('no documented position') && citations.length > 0;
      const { valid, sample } = await countValid(hasEvidence ? citations : []);
      await supabase.from('_enrich_batch_experiment').insert({
        run_label: runLabel, run_type: 'unbatched', call_id: callId,
        candidate_id: candidate.id, question_id: q.id,
        success: valid > 0, num_citations: citations.length, num_valid_urls: valid, sample_url: sample,
        desc_len: (res?.content || '').length, questions_in_call: 1,
        call_prompt_tokens: res?.usage?.prompt_tokens ?? null,
        call_completion_tokens: res?.usage?.completion_tokens ?? null,
        call_total_tokens: res?.usage?.total_tokens ?? null, call_ms: ms,
      });
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) { console.error('[unbatched] error', q.id, e); }
  }
  console.log(`[experiment] ${runLabel} done for ${candidate.id}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authFail = await requireCronAuth(req);
  if (authFail) return authFail;

  const { candidate_id, question_ids, run_label } = await req.json();
  if (!candidate_id || !Array.isArray(question_ids) || question_ids.length === 0) {
    return new Response(JSON.stringify({ error: 'candidate_id and question_ids[] required' }), {
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
  const { data: qs } = await supabase.from('questions').select('id, text').in('id', question_ids);
  const { data: ans } = await supabase.from('candidate_answers')
    .select('question_id, answer_value').eq('candidate_id', candidate_id).in('question_id', question_ids);
  const avMap = new Map((ans || []).map((a: any) => [a.question_id, a.answer_value]));
  const questions: QRow[] = (qs || []).map((q: any) => ({ id: q.id, text: q.text, answer_value: avMap.get(q.id) ?? null }));

  const label = run_label || `exp-${new Date().toISOString()}`;
  EdgeRuntime.waitUntil(runExperiment(supabase, label, candidate, questions));
  return new Response(JSON.stringify({ status: 'started', run_label: label, candidate: candidate.name, questions: questions.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
