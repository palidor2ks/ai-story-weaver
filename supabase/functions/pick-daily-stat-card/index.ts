// Cron-invoked (daily) OR admin-invoked (the Settings "Generate now" buttons).
// No JWT verification for cron callers; admins are authorized by role.
//
// Two modes:
//   - Daily cron (no force, no subject_type): gated to the post hour, drafts ONE
//     of EACH configured rotation type (rep_profile + committee_spender + top_donor),
//     idempotent per type per UTC day.
//   - Manual (force and/or an explicit subject_type from the admin buttons): drafts
//     exactly the requested type(s) immediately, bypassing the hour + daily guards.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;
const ALLOWED_TYPES = new Set(['rep_profile', 'committee_spender', 'top_donor', 'ai_analysis']);

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function nowInTimezone(tz: string): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

import { isCronAuthorized, getCronSecret } from '../_shared/cron-auth.ts';
import { fetchTopDonorEntities, fetchDonorCardFacts } from '../_shared/donor-card.ts';
import { fetchTopCommitteeSpenders, fetchCommitteeCardFacts } from '../_shared/committee-card.ts';

type Candidate = {
  id: string; name: string; office: string | null; party: string | null; state: string | null;
  district: string | null; image_url: string | null; overall_score: number | null;
  coverage_tier: string | null; fec_candidate_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(supaUrl, serviceKey);

  // Auth: accept cron/service-role callers (the daily pg_cron run) OR an
  // authenticated admin using a "Generate now" button in the admin UI.
  if (!(await isCronAuthorized(req))) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!role) return json({ error: 'forbidden' }, 403);
  }

  // `force` / `subject_type` may arrive as query params (raw fetch) or a JSON body
  // (functions.invoke). A specific subject_type is what the per-type buttons send.
  const url = new URL(req.url);
  let force = url.searchParams.get('force') === '1';
  let requestedType: string | null = url.searchParams.get('subject_type');
  try {
    const body = await req.json() as { force?: unknown; subject_type?: unknown } | null;
    const f = body?.force;
    if (f === true || f === '1' || f === 1) force = true;
    if (typeof body?.subject_type === 'string' && body.subject_type) requestedType = body.subject_type;
  } catch { /* no/invalid body */ }

  if (requestedType && !ALLOWED_TYPES.has(requestedType)) {
    return json({ error: `unknown subject_type: ${requestedType}` }, 400);
  }

  try {
    const { data: settings } = await admin.from('social_post_settings').select('*').eq('id', 1).maybeSingle();
    if (!settings) throw new Error('settings_missing');

    // Manual admin requests (the Settings buttons) pass force and/or an explicit
    // subject_type; the daily cron passes neither and is gated to the post hour.
    const manual = force || !!requestedType;
    if (!manual) {
      const [targetHour] = (settings.post_time_local ?? '19:00').split(':').map(Number);
      const now = nowInTimezone(settings.timezone ?? 'America/New_York');
      if (now.hour !== targetHour) return json({ skipped: 'not_post_hour', now, target: { targetHour } });
    }

    // What to draft on this run: a single explicit type for the per-type buttons,
    // or one of EACH configured type for the daily cron.
    const rotationTypes: string[] =
      Array.isArray(settings.rotation_types) && settings.rotation_types.length > 0
        ? settings.rotation_types : ['rep_profile'];
    const requestedTypes = requestedType ? [requestedType] : rotationTypes;

    // Types already drafted today (UTC), so the cron is idempotent per type and won't
    // double up if it fires several times within the post hour. Manual runs bypass this.
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todays } = await admin.from('social_posts').select('subject_type').gte('created_at', todayStart.toISOString());
    const draftedToday = new Set((todays ?? []).map((r) => r.subject_type));

    // Recently-featured subjects to skip (shared across every type this run).
    const skipDays = settings.recent_skip_days ?? 30;
    const skipSince = new Date(Date.now() - skipDays * 86400_000).toISOString();
    const { data: recent } = await admin.from('social_posts').select('subject_id').gte('created_at', skipSince);
    const skipIds = new Set((recent ?? []).map((r) => r.subject_id));

    const { data: pool } = await admin
      .from('candidates')
      .select('id, name, office, party, state, district, image_url, overall_score, coverage_tier, confidence, is_incumbent, fec_candidate_id')
      .not('overall_score', 'is', null)
      .not('image_url', 'is', null)
      .order('last_updated', { ascending: false })
      .limit(200);
    const basePool = ((pool ?? []) as Candidate[]).filter((c) => c.image_url && !skipIds.has(c.id));

    const created: Array<{ subject_type: string; subject_id: string; post_id: string; cand: Candidate }> = [];
    // Donor-entity posts have no candidate to warm, so they're tracked separately
    // from `created` (which drives the AI-analysis warm step) but still reported.
    const createdMeta: Array<{ subject_type: string; subject_id: string; post_id: string }> = [];
    const skipped: Array<{ subject_type: string; reason: string }> = [];
    const pickedThisRun = new Set<string>();

    // Helper: attach the four platform rows to a freshly-drafted post.
    const insertPlatforms = (postId: string) =>
      admin.from('social_post_platforms').insert(PLATFORMS.map((p) => ({
        post_id: postId, platform: p,
        enabled: (settings as Record<string, boolean>)[`${p}_enabled`] ?? false, status: 'pending',
      })));

    for (const type of requestedTypes) {
      if (!manual && draftedToday.has(type)) { skipped.push({ subject_type: type, reason: 'already_drafted_today' }); continue; }

      // Donor-ENTITY card: pick a notable donor at random from the top ~100 by
      // total $, excluding recently-featured donor ids. NOT candidate-anchored.
      if (type === 'top_donor') {
        const donorSkip = [...skipIds, ...pickedThisRun];
        const donorPool = await fetchTopDonorEntities(admin, 100, donorSkip);
        if (donorPool.length === 0) { skipped.push({ subject_type: type, reason: 'no_eligible_donors' }); continue; }
        const donor = donorPool[Math.floor(Math.random() * donorPool.length)];

        // Snapshot a few facts for the admin card / payload (cause is optional).
        const facts = await fetchDonorCardFacts(admin, donor.primary_id);
        const { data: post, error: insErr } = await admin.from('social_posts').insert({
          subject_type: type,
          subject_id: donor.primary_id,
          subject_label: donor.display_name,
          stat_key: 'top_donor',
          stat_payload: {
            donor_type: donor.type,
            total_amount: facts?.total_given ?? donor.total_amount,
            ...(facts?.cause ? { cause_label: facts.cause.label } : {}),
          },
          status: 'pending_review',
        }).select('id').single();
        if (insErr) { skipped.push({ subject_type: type, reason: insErr.message }); continue; }

        await insertPlatforms(post.id);

        // Cache an AI-classified cause for this donor BEFORE the card renders /
        // caption runs, so more donor cards show a cause. Awaited (this is a
        // daily/manual job, not latency-critical) so the cause is ready when an
        // admin clicks Render right after. The classifier is itself cached/no-ops
        // if the donor is already classified, and abstains when unsure. Best-effort
        // — never fail the pick if classification fails.
        try {
          const cronSecret = await getCronSecret();
          const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${serviceKey}` };
          if (cronSecret) headers['x-cron-secret'] = cronSecret;
          await fetch(`${supaUrl}/functions/v1/classify-donor-cause`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ donor_id: donor.primary_id }),
          });
        } catch (e) {
          console.warn('donor cause classify failed', e);
        }

        createdMeta.push({ subject_type: type, subject_id: donor.primary_id, post_id: post.id });
        pickedThisRun.add(donor.primary_id);
        continue;
      }

      // Committee/PAC OUTSIDE-SPENDER card: pick a notable Super PAC at random from
      // the top ~100 by total independent-expenditure $, excluding recently-featured
      // committee fec ids. NOT candidate-anchored.
      if (type === 'committee_spender') {
        const cmteSkip = [...skipIds, ...pickedThisRun];
        const cmtePool = await fetchTopCommitteeSpenders(admin, 100, cmteSkip);
        if (cmtePool.length === 0) { skipped.push({ subject_type: type, reason: 'no_eligible_committees' }); continue; }
        const cmte = cmtePool[Math.floor(Math.random() * cmtePool.length)];

        // Snapshot a few facts for the admin card / payload (cause is optional).
        const facts = await fetchCommitteeCardFacts(admin, cmte.fec_committee_id);
        const { data: post, error: insErr } = await admin.from('social_posts').insert({
          subject_type: type,
          subject_id: cmte.fec_committee_id,
          subject_label: cmte.name,
          stat_key: 'top_committee_spender',
          stat_payload: {
            total_spent: facts?.total_spent ?? cmte.total_spent,
            ...(facts?.cause ? { cause_label: facts.cause.label } : {}),
          },
          status: 'pending_review',
        }).select('id').single();
        if (insErr) { skipped.push({ subject_type: type, reason: insErr.message }); continue; }

        await insertPlatforms(post.id);
        createdMeta.push({ subject_type: type, subject_id: cmte.fec_committee_id, post_id: post.id });
        pickedThisRun.add(cmte.fec_committee_id);
        continue;
      }

      // Avoid featuring the same candidate twice in one run.
      const avail = basePool.filter((c) => !pickedThisRun.has(c.id));
      if (avail.length === 0) { skipped.push({ subject_type: type, reason: 'no_eligible_candidates' }); continue; }

      const picked = avail[Math.floor(Math.random() * avail.length)];
      const statKey = type === 'ai_analysis' ? 'ai_summary' : 'overall_score';

      const subjectLabel = `${picked.name} — ${picked.office}${picked.state ? `, ${picked.state}` : ''}`;
      const { data: post, error: insErr } = await admin.from('social_posts').insert({
        subject_type: type,
        subject_id: picked.id,
        subject_label: subjectLabel,
        stat_key: statKey,
        stat_payload: {
          overall_score: picked.overall_score, party: picked.party, office: picked.office,
          state: picked.state, district: picked.district, coverage_tier: picked.coverage_tier,
        },
        status: 'pending_review',
      }).select('id').single();
      if (insErr) { skipped.push({ subject_type: type, reason: insErr.message }); continue; }

      await insertPlatforms(post.id);

      created.push({ subject_type: type, subject_id: picked.id, post_id: post.id, cand: picked });
      createdMeta.push({ subject_type: type, subject_id: picked.id, post_id: post.id });
      pickedThisRun.add(picked.id);
    }

    // Warm each featured candidate's AI analysis cache (best-effort, in parallel) so
    // a caption's no-finance fallback can reuse the same web-grounded summary.
    let warmed = 0;
    if (created.length > 0) {
      const cronSecret = await getCronSecret();
      const results = await Promise.allSettled(created.map((c) => warmAnalysis(c.cand, cronSecret)));
      warmed = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    }

    return json({ ok: createdMeta.length > 0, created: createdMeta, skipped, mode: settings.mode, analyses_warmed: warmed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500);
  }
});

async function warmAnalysis(c: Candidate, cronSecret: string | null): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${serviceKey}` };
    if (cronSecret) headers['x-cron-secret'] = cronSecret;
    const res = await fetch(`${supaUrl}/functions/v1/ai-recipient-analysis`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entity_kind: 'candidate', entity_id: c.id, entity_name: c.name,
        fec_id: c.fec_candidate_id ?? null, party: c.party ?? null, office: c.office ?? null,
        state: c.state ?? null, cycle: null, force_refresh: false,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('ai analysis warm failed', e);
    return false;
  }
}
