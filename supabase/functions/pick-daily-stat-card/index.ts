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
import { fetchCandidateFacts, hasCommitteeData, hasDonorData, topOutsideSpender } from '../_shared/finance-caption.ts';

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
    const skipped: Array<{ subject_type: string; reason: string }> = [];
    const pickedThisRun = new Set<string>();

    for (const type of requestedTypes) {
      if (!manual && draftedToday.has(type)) { skipped.push({ subject_type: type, reason: 'already_drafted_today' }); continue; }

      // Avoid featuring the same candidate twice in one run.
      const avail = basePool.filter((c) => !pickedThisRun.has(c.id));
      if (avail.length === 0) { skipped.push({ subject_type: type, reason: 'no_eligible_candidates' }); continue; }

      let picked = avail[Math.floor(Math.random() * avail.length)];
      let statKey = type === 'ai_analysis' ? 'ai_summary' : 'overall_score';
      let statExtra: Record<string, unknown> = {};

      // Money-angle types need a candidate that actually HAS that data. Search the
      // pool for one; if none qualifies, skip this type (don't substitute another).
      if (type === 'committee_spender' || type === 'top_donor') {
        const shuffled = [...avail].sort(() => Math.random() - 0.5).slice(0, 30);
        let found: { c: Candidate; f: Awaited<ReturnType<typeof fetchCandidateFacts>> } | null = null;
        for (const c of shuffled) {
          const f = await fetchCandidateFacts(admin, c.id);
          if (type === 'committee_spender' ? hasCommitteeData(f) : hasDonorData(f)) { found = { c, f }; break; }
        }
        if (!found || !found.f) { skipped.push({ subject_type: type, reason: 'no_candidate_with_data' }); continue; }
        picked = found.c;
        if (type === 'committee_spender') {
          const top = topOutsideSpender(found.f)!;
          statKey = 'top_committee_spender';
          statExtra = { committee_name: top.name, committee_amount: top.amount, committee_dir: top.dir, ie_support: found.f.ie_support, ie_oppose: found.f.ie_oppose };
        } else {
          const d = found.f.top_donor!;
          statKey = 'top_donor';
          statExtra = { top_donor_name: d.name, top_donor_amount: d.amount, top_donor_type: d.type ?? null };
        }
      }

      const subjectLabel = `${picked.name} — ${picked.office}${picked.state ? `, ${picked.state}` : ''}`;
      const { data: post, error: insErr } = await admin.from('social_posts').insert({
        subject_type: type,
        subject_id: picked.id,
        subject_label: subjectLabel,
        stat_key: statKey,
        stat_payload: {
          overall_score: picked.overall_score, party: picked.party, office: picked.office,
          state: picked.state, district: picked.district, coverage_tier: picked.coverage_tier, ...statExtra,
        },
        status: 'pending_review',
      }).select('id').single();
      if (insErr) { skipped.push({ subject_type: type, reason: insErr.message }); continue; }

      await admin.from('social_post_platforms').insert(PLATFORMS.map((p) => ({
        post_id: post.id, platform: p,
        enabled: (settings as Record<string, boolean>)[`${p}_enabled`] ?? false, status: 'pending',
      })));

      created.push({ subject_type: type, subject_id: picked.id, post_id: post.id, cand: picked });
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

    return json({ ok: created.length > 0, created: created.map(({ cand: _c, ...rest }) => rest), skipped, mode: settings.mode, analyses_warmed: warmed });
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
