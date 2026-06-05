// Admin-only OR cron-invoked. Generates a punchy, headline-worthy caption for a
// social_posts row + platform. The headline copy is composed in the shared
// finance-caption module (verified DB facts + AI polish), shared with the
// rep-profile share button so both surfaces read identically. Falls back to the
// candidate's cached AI analysis summary, then a static line.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { readCache } from '../_shared/ai-cache.ts';
import { composeFinanceCaption, composeAnalysisCaption } from '../_shared/finance-caption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const aiKey = Deno.env.get('LOVABLE_API_KEY');

const BodySchema = z.object({
  post_id: z.string().uuid(),
  platform: z.enum(['x', 'facebook', 'instagram', 'tiktok']),
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
    const { post_id, platform } = parsed.data;

    const { data: post } = await admin.from('social_posts').select('*').eq('id', post_id).maybeSingle();
    if (!post) return new Response(JSON.stringify({ error: 'post_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const stat = post.stat_payload ?? {};

    const save = async (caption: string, source: string) => {
      await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
      return new Response(JSON.stringify({ caption, source }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    // AI-analysis rotation post: blend the candidate's cached record summary with their
    // verified finance facts. Short posts (X/TikTok) feature one angle (randomized);
    // long posts (FB/IG) cover both record + money, with a light grassroots-vs-PAC cue.
    // Falls through to the static line only if there's neither a record nor finance data.
    if (post.subject_type === 'ai_analysis' && post.subject_id) {
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient', subject_id: `v2:candidate:${post.subject_id}`, cycle: null,
      });
      const record = cached?.payload && !cached.payload.insufficient_information ? cached.payload.summary ?? null : null;

      const { data: cand } = await admin
        .from('candidates')
        .select('name, party, office, state, overall_score, is_incumbent, x_handle')
        .eq('id', post.subject_id)
        .maybeSingle();
      const meta = {
        name: (cand?.name as string) || String(post.subject_label ?? '').split('—')[0].trim() || 'This candidate',
        party: (cand?.party as string) ?? stat.party ?? '',
        office: (cand?.office as string) ?? stat.office ?? '',
        state: (cand?.state as string) ?? stat.state ?? '',
        score: cand?.overall_score != null ? Number(cand.overall_score) : (stat.overall_score != null ? Number(stat.overall_score) : null),
        incumbent: (cand?.is_incumbent as boolean | null) ?? null,
        handle: (cand?.x_handle as string | null) ?? null,
      };

      const analysis = await composeAnalysisCaption(admin, aiKey, post.subject_id, platform, meta, record);
      if (analysis) return await save(analysis.caption, analysis.source);
    }

    if (post.subject_type === 'rep_profile' && post.subject_id) {
      // Primary: the headline caption from VERIFIED finance/IE facts.
      const { data: cand } = await admin
        .from('candidates')
        .select('name, party, office, state, overall_score, is_incumbent, x_handle')
        .eq('id', post.subject_id)
        .maybeSingle();

      const meta = {
        name: (cand?.name as string) || String(post.subject_label ?? '').split('—')[0].trim() || 'This candidate',
        party: (cand?.party as string) ?? stat.party ?? '',
        office: (cand?.office as string) ?? stat.office ?? '',
        state: (cand?.state as string) ?? stat.state ?? '',
        score: cand?.overall_score != null ? Number(cand.overall_score) : (stat.overall_score != null ? Number(stat.overall_score) : null),
        incumbent: (cand?.is_incumbent as boolean | null) ?? null,
        handle: (cand?.x_handle as string | null) ?? null,
      };

      const headline = await composeFinanceCaption(admin, aiKey, post.subject_id, platform, meta);
      if (headline) return await save(headline.caption, headline.source);

      // Fallback (no finance data): blend in the cached record summary instead of dumping
      // it verbatim. composeAnalysisCaption degrades to a record-only post when finance is absent.
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient', subject_id: `v2:candidate:${post.subject_id}`, cycle: null,
      });
      const record = cached?.payload && !cached.payload.insufficient_information ? cached.payload.summary ?? null : null;
      const analysis = await composeAnalysisCaption(admin, aiKey, post.subject_id, platform, meta, record);
      if (analysis) return await save(analysis.caption, analysis.source);
    }

    // Last resort: a plain static caption.
    return await save(`${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`, 'static');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
