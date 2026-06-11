// Admin-only OR cron-invoked. Generates a punchy, headline-worthy caption for a
// social_posts row + platform. The headline copy is composed in the shared
// finance-caption module (verified DB facts + AI polish), shared with the
// rep-profile share button so both surfaces read identically. Falls back to the
// candidate's cached AI analysis summary, then a static line.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { readCache } from '../_shared/ai-cache.ts';
import {
  composeFinanceCaption,
  composeAnalysisCaption,
  composeNewsCaption,
  composeRecordCaption,
  type CandidateMeta,
} from '../_shared/finance-caption.ts';
import { composeDonorEntityCaption } from '../_shared/donor-card.ts';
import { composeCommitteeSpenderCaption } from '../_shared/committee-card.ts';
import { composeRaceComparisonCaption } from '../_shared/race-card.ts';
import { researchControversy } from '../_shared/news-research.ts';
import { getCandidateRecord } from '../_shared/candidate-record.ts';

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
  post_id: z.string().uuid(),
  platform: z.enum(['x', 'facebook', 'instagram', 'tiktok']),
  // Optional caption angle from the admin UI: finance | news | analysis. When omitted
  // (the auto-poster), behavior is unchanged — research news and auto-pick the angle.
  style: z.enum(['finance', 'news', 'analysis']).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(supaUrl, serviceKey);

    // Cron / service-role callers (the auto-post pipeline) bypass the user check;
    // everyone else must be an authenticated admin.
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { post_id, platform, style } = parsed.data;

    const { data: post } = await admin.from('social_posts').select('*').eq('id', post_id).maybeSingle();
    if (!post) return new Response(JSON.stringify({ error: 'post_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const stat = post.stat_payload ?? {};

    const save = async (caption: string, source: string) => {
      await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
      return new Response(JSON.stringify({ caption, source }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    // Donor-ENTITY card: anchored on a donor, not a candidate. Compose its
    // "follow the money" caption from the donor facts and return early — never
    // build candidate meta (the subject_id is a donor primary_id, not a candidate).
    if (post.subject_type === 'top_donor' && post.subject_id) {
      const d = await composeDonorEntityCaption(admin, aiKey, post.subject_id, platform, post.subject_label ?? null);
      if (d) return await save(d.caption, d.source);
      return await save(`${post.subject_label ?? 'This donor'} on PoliPulse. Follow the money.`, 'static_donor');
    }

    // Committee/PAC OUTSIDE-SPENDER card: anchored on a Super PAC, not a candidate.
    // Compose its "follow the money" caption from the committee facts and return
    // early — never build candidate meta (subject_id is an fec_committee_id).
    if (post.subject_type === 'committee_spender' && post.subject_id) {
      const c = await composeCommitteeSpenderCaption(admin, aiKey, post.subject_id, platform, post.subject_label ?? null);
      if (c) return await save(c.caption, c.source);
      return await save(`${post.subject_label ?? 'This committee'} on PoliPulse. Follow the money.`, 'static_committee');
    }

    // Race-comparison card: NOT candidate-anchored. The race (state/office/year/mode)
    // lives in stat_payload; compose a "follow the money" comparison caption and
    // return early (subject_id is a synthetic race key, not a candidate id).
    if (post.subject_type === 'race_comparison') {
      const r = await composeRaceComparisonCaption(admin, aiKey, {
        state: String(stat.state ?? ''),
        office: String(stat.office ?? ''),
        year: Number(stat.year ?? 0),
        mode: String(stat.mode ?? 'dvr'),
        candA: stat.candidate_a != null ? String(stat.candidate_a) : null,
        candB: stat.candidate_b != null ? String(stat.candidate_b) : null,
      }, platform);
      if (r) return await save(r.caption, r.source);
      return await save(`${post.subject_label ?? 'This race'} on PoliPulse. Follow the money.`, 'static_race');
    }

    // The remaining rotation types are candidate-anchored, so build the shared meta once.
    let meta: CandidateMeta | null = null;
    let fecId: string | null = null;
    if (post.subject_id) {
      const { data: cand } = await admin
        .from('candidates')
        .select('name, party, office, state, overall_score, is_incumbent, x_handle, fec_candidate_id')
        .eq('id', post.subject_id)
        .maybeSingle();
      meta = {
        name: (cand?.name as string) || String(post.subject_label ?? '').split('—')[0].trim() || 'This candidate',
        party: (cand?.party as string) ?? stat.party ?? '',
        office: (cand?.office as string) ?? stat.office ?? '',
        state: (cand?.state as string) ?? stat.state ?? '',
        score: cand?.overall_score != null ? Number(cand.overall_score) : (stat.overall_score != null ? Number(stat.overall_score) : null),
        incumbent: (cand?.is_incumbent as boolean | null) ?? null,
        handle: (cand?.x_handle as string | null) ?? null,
      };
      fecId = (cand?.fec_candidate_id as string | null) ?? null;
    }

    // The candidate's cached, web-grounded record summary (used by ai_analysis, the
    // "analysis" style, and as the no-finance fallback). Read lazily + memoized so we
    // hit the cache at most once even when several branches ask for it.
    let recordMemo: string | null | undefined;
    const readRecord = async (): Promise<string | null> => {
      if (recordMemo !== undefined) return recordMemo;
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient', subject_id: `v2:candidate:${post.subject_id}`, cycle: null,
      });
      recordMemo = cached?.payload && !cached.payload.insufficient_information ? cached.payload.summary ?? null : null;
      return recordMemo;
    };

    // A pinned style from the admin UI produces EXACTLY that angle (each is distinct), or
    // a clean static — it never silently produces a different angle. The auto-poster (no
    // style) keeps the original behavior below.
    if (style && meta && post.subject_id) {
      let r: { caption: string; source: string } | null = null;
      if (style === 'finance') {
        // Money: donors + outside spending. No news research.
        r = await composeFinanceCaption(admin, aiKey, post.subject_id, platform, meta, null);
      } else if (style === 'news') {
        // ONLY the top recent, cited news about the rep — no finance.
        const news = await researchControversy({
          candidateId: post.subject_id, name: meta.name, office: meta.office, state: meta.state, youKey, aiKey,
        });
        r = await composeNewsCaption(aiKey, meta, platform, news);
      } else {
        // analysis: ONLY positions & goals (the AI-analysis record), generated on a cold cache.
        const record = await getCandidateRecord({
          candidateId: post.subject_id, generate: true,
          meta: { name: meta.name, party: meta.party, office: meta.office, state: meta.state, fecId },
        });
        r = await composeRecordCaption(aiKey, meta, platform, record);
      }
      if (r) return await save(r.caption, r.source);
      return await save(`${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`, `${style}_unavailable`);
    }

    if (meta && post.subject_id) {
      // Auto-poster (no pinned style): research a news hook and auto-pick the angle —
      // unchanged from before the style picker existed.
      const news = await researchControversy({
        candidateId: post.subject_id, name: meta.name, office: meta.office, state: meta.state, youKey, aiKey,
      });

      // Type-specific composer first; each returns null when its data is missing.
      if (post.subject_type === 'ai_analysis') {
        const analysis = await composeAnalysisCaption(admin, aiKey, post.subject_id, platform, meta, await readRecord(), news);
        if (analysis) return await save(analysis.caption, analysis.source);
      }

      // Shared money-driven fallback for rep_profile (and any other candidate-anchored
      // type) when its specific data is absent — every candidate-anchored post still
      // gets a verified-finance caption, then a record-blended one, before the static line.
      const headline = await composeFinanceCaption(admin, aiKey, post.subject_id, platform, meta, news);
      if (headline) return await save(headline.caption, headline.source);
      const analysis = await composeAnalysisCaption(admin, aiKey, post.subject_id, platform, meta, await readRecord(), news);
      if (analysis) return await save(analysis.caption, analysis.source);
    }

    // Last resort: a plain static caption.
    return await save(`${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`, 'static');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
