// Returns the headline finance caption for a candidate + platform, WITHOUT
// needing a social_posts row — so the rep-profile share button can seed its
// caption editor with the same copy the auto-poster produces. Auth: any signed-in
// user (or a cron / service-role caller). Read-only; writes nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { composeFinanceCaption } from '../_shared/finance-caption.ts';
import { researchControversy } from '../_shared/news-research.ts';

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
    const { candidate_id, platform } = parsed.data;

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

    // Research a real, recently-reported, attributed news hook for an attention-grabbing
    // angle (grounded + cited; null when no key / nothing notable / error — then the
    // verified-finance caption stands on its own). Cached per-candidate for a day.
    const news = await researchControversy({
      candidateId: candidate_id,
      name: meta.name,
      office: meta.office,
      state: meta.state,
      youKey,
      aiKey,
    });

    const headline = await composeFinanceCaption(admin, aiKey, candidate_id, platform, meta, news);
    return json({ caption: headline?.caption ?? null, source: headline?.source ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return json({ error: message }, 500);
  }
});
