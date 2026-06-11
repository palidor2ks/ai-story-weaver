// Returns the headline finance caption for a candidate + platform, WITHOUT
// needing a social_posts row — so the rep-profile share button can seed its
// caption editor with the same copy the auto-poster produces. Auth: any signed-in
// user (or a cron / service-role caller). Read-only; writes nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { composeAnalysisCaption, composeFinanceCaption } from '../_shared/finance-caption.ts';
import { researchControversy } from '../_shared/news-research.ts';
import { readCache } from '../_shared/ai-cache.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const aiKey = Deno.env.get('LOVABLE_API_KEY');
const youKey = Deno.env.get('YOU_API_KEY');

const BodySchema = z.object({
  candidate_id: z.string().min(1),
  platform: z.enum(['x', 'facebook', 'instagram', 'tiktok']).default('x'),
  // Caption angle the share UI lets the user pick between:
  //   finance  — money tied to the stat card (default; no news research)
  //   news     — lead with a real, cited, recent-news hook (falls back to finance)
  //   analysis — positions/goals/political activity, condensed to the platform limit
  style: z.enum(['finance', 'news', 'analysis']).default('finance'),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(supaUrl, serviceKey);

    // Any authenticated user may request a caption; cron/service-role bypasses.
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { candidate_id, platform, style } = parsed.data;

    const { data: cand } = await admin
      .from('candidates')
      .select('name, party, office, state, overall_score, is_incumbent, x_handle')
      .eq('id', candidate_id)
      .maybeSingle();
    if (!cand) return json({ caption: null, source: null, error: 'candidate_not_found' });

    const meta = {
      name: (cand.name as string) ?? 'This candidate',
      party: (cand.party as string) ?? '',
      office: (cand.office as string) ?? '',
      state: (cand.state as string) ?? '',
      score: cand.overall_score != null ? Number(cand.overall_score) : null,
      incumbent: (cand.is_incumbent as boolean | null) ?? null,
      handle: (cand.x_handle as string | null) ?? null,
    };

    // The candidate's cached, web-grounded record summary (the same one the AI-analysis
    // dialog shows) — the ingredient for the "analysis" style. Read lazily.
    const readRecord = async (): Promise<string | null> => {
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient', subject_id: `v2:candidate:${candidate_id}`, cycle: null,
      });
      return cached?.payload && !cached.payload.insufficient_information ? cached.payload.summary ?? null : null;
    };

    let result: { caption: string; source: string } | null = null;
    if (style === 'analysis') {
      // Positions/goals/activity, condensed to the platform limit; fall back to finance.
      result = await composeAnalysisCaption(admin, aiKey, candidate_id, platform, meta, await readRecord(), null, 'record')
        ?? await composeFinanceCaption(admin, aiKey, candidate_id, platform, meta, null);
    } else if (style === 'news') {
      // Lead with a real, recently-reported, attributed news hook (grounded + cited; null
      // when no key / nothing notable / error). Finance carries it; record is the no-finance fallback.
      const news = await researchControversy({
        candidateId: candidate_id, name: meta.name, office: meta.office, state: meta.state, youKey, aiKey,
      });
      result = await composeFinanceCaption(admin, aiKey, candidate_id, platform, meta, news)
        ?? await composeAnalysisCaption(admin, aiKey, candidate_id, platform, meta, await readRecord(), news, 'record');
    } else {
      // finance (default): money tied to the stat card, no news research.
      result = await composeFinanceCaption(admin, aiKey, candidate_id, platform, meta, null);
    }

    return json({ caption: result?.caption ?? null, source: result?.source ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return json({ error: message }, 500);
  }
});
