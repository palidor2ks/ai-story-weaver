// Admin-invoked: drafts ONE `race_comparison` social post for a specific election
// race the admin chose in the Settings tab (state + office + year + comparison mode).
//
// Unlike the daily rotation cards (pick-daily-stat-card), a race card is PARAMETERIZED,
// not randomly picked — so this is its own endpoint. It verifies the race resolves to a
// two-candidate head-to-head via get_race_card_facts, then inserts the social_posts row +
// the four platform rows, mirroring pick-daily-stat-card. The card itself is rendered
// server-side (render-social-card → renderAndStoreCard) and captioned by
// generate-social-caption, both keyed off the race params in stat_payload.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { fetchRaceCardFacts, raceTitle } from '../_shared/race-card.ts';
import { tidyName } from '../_shared/finance-caption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;
const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const BodySchema = z.object({
  state: z.string().min(1),
  office: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  mode: z.enum(['dvr', 'money', 'pick']).default('dvr'),
  // When mode is 'pick', the two candidate ids to compare head-to-head.
  candidate_a: z.string().min(1).optional(),
  candidate_b: z.string().min(1).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(supaUrl, serviceKey);

  // Auth: cron/service-role OR an authenticated admin (the Settings "Generate" button).
  if (!(await isCronAuthorized(req))) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!role) return json({ error: 'forbidden' }, 403);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { state, office, year, mode } = parsed.data;
  // Explicit candidate pick requires both ids; ignore a lone one.
  const candA = mode === 'pick' && parsed.data.candidate_a && parsed.data.candidate_b ? parsed.data.candidate_a : null;
  const candB = mode === 'pick' && parsed.data.candidate_a && parsed.data.candidate_b ? parsed.data.candidate_b : null;
  if (mode === 'pick' && (!candA || !candB)) {
    return json({ error: 'pick mode requires candidate_a and candidate_b' }, 400);
  }

  try {
    // Verify the race resolves to a two-candidate head-to-head before drafting.
    const facts = await fetchRaceCardFacts(admin, { state, office, year, mode, candA, candB });
    if (!facts || facts.candidates.length < 2) {
      return json({ ok: false, skipped: 'no_two_candidate_race' });
    }

    const [a, b] = facts.candidates;
    // Pin the resolved pair (for every mode) so a re-render reproduces the exact
    // match-up that was drafted, rather than re-running the auto-pick on newer data.
    const pinA = a.id;
    const pinB = b.id;
    const subjectId = `${state}|${office}|${year}|${mode}|${a.id}|${b.id}`;
    const subjectLabel = `${raceTitle(facts)}: ${tidyName(a.name)} vs ${tidyName(b.name)}`;

    const { data: settings } = await admin.from('social_post_settings').select('*').eq('id', 1).maybeSingle();

    const { data: post, error: insErr } = await admin.from('social_posts').insert({
      subject_type: 'race_comparison',
      subject_id: subjectId,
      subject_label: subjectLabel,
      stat_key: 'race_comparison',
      stat_payload: {
        state, office, year, mode,
        candidate_a: pinA, candidate_b: pinB,
        candidate_ids: [a.id, b.id],
        candidate_names: [tidyName(a.name), tidyName(b.name)],
      },
      status: 'pending_review',
    }).select('id').single();
    if (insErr) return json({ error: insErr.message }, 500);

    await admin.from('social_post_platforms').insert(PLATFORMS.map((p) => ({
      post_id: post.id, platform: p,
      enabled: (settings as Record<string, boolean> | null)?.[`${p}_enabled`] ?? false, status: 'pending',
    })));

    return json({ ok: true, created: { subject_type: 'race_comparison', subject_id: subjectId, post_id: post.id, label: subjectLabel } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500);
  }
});
