// Cron-invoked. Picks a candidate not recently featured, drafts a social post.
// No JWT verification (called by pg_cron). Idempotent per UTC day per subject_type.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

function nowInTimezone(tz: string): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

import { isCronAuthorized, getCronSecret } from '../_shared/cron-auth.ts';
import { fetchCandidateFacts, hasCommitteeData, hasDonorData, topOutsideSpender } from '../_shared/finance-caption.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(supaUrl, serviceKey);

  // Auth: accept cron/service-role callers (the daily pg_cron run) OR an
  // authenticated admin using the "Generate draft now" button in the admin UI.
  if (!(await isCronAuthorized(req))) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // `force` may arrive as a query param (raw fetch) or a JSON body (functions.invoke).
  const url = new URL(req.url);
  let force = url.searchParams.get('force') === '1';
  if (!force) {
    try {
      const body = await req.json();
      const f = (body as { force?: unknown } | null)?.force;
      if (f === true || f === '1' || f === 1) force = true;
    } catch { /* no/invalid body — leave force as-is */ }
  }

  try {
    // Load settings
    const { data: settings } = await admin
      .from('social_post_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!settings) throw new Error('settings_missing');

    // Time-of-day gate (unless forced)
    if (!force) {
      const [targetHour, targetMinute] = (settings.post_time_local ?? '19:00').split(':').map(Number);
      const now = nowInTimezone(settings.timezone ?? 'America/New_York');
      if (now.hour !== targetHour) {
        return new Response(JSON.stringify({ skipped: 'not_post_hour', now, target: { targetHour, targetMinute } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Avoid duplicate draft today (UTC date check)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: existingToday } = await admin
      .from('social_posts')
      .select('id, subject_id')
      .gte('created_at', todayStart.toISOString())
      .limit(1);
    if (!force && existingToday && existingToday.length > 0) {
      return new Response(JSON.stringify({ skipped: 'already_drafted_today', existing: existingToday[0] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Recently-featured subject IDs to skip
    const skipDays = settings.recent_skip_days ?? 30;
    const skipSince = new Date(Date.now() - skipDays * 86400_000).toISOString();
    const { data: recent } = await admin
      .from('social_posts')
      .select('subject_id')
      .gte('created_at', skipSince);
    const skipIds = new Set((recent ?? []).map((r) => r.subject_id));

    // Pick a candidate with a non-null score and image, federal preferred.
    // Filter image_url in the query (not just in JS): ordering by last_updated and
    // capping at 200 can otherwise return a window of freshly-synced, image-less
    // candidates and skip every candidate that actually has a photo.
    const { data: pool } = await admin
      .from('candidates')
      .select('id, name, office, party, state, district, image_url, overall_score, coverage_tier, confidence, is_incumbent, fec_candidate_id')
      .not('overall_score', 'is', null)
      .not('image_url', 'is', null)
      .order('last_updated', { ascending: false })
      .limit(200);

    const eligible = (pool ?? []).filter((c) => !skipIds.has(c.id) && c.image_url);
    if (eligible.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_eligible_candidates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let picked = eligible[Math.floor(Math.random() * eligible.length)];

    // Decide the content type for today by cycling through the configured rotation
    // (e.g. rep_profile → committee_spender → top_donor). Every type is candidate-
    // anchored; they differ in which money angle the caption + card highlight.
    const rotationTypes: string[] =
      Array.isArray(settings.rotation_types) && settings.rotation_types.length > 0
        ? settings.rotation_types
        : ['rep_profile'];
    const rotationIndex = Number(settings.rotation_index ?? 0);
    let subjectType = rotationTypes[((rotationIndex % rotationTypes.length) + rotationTypes.length) % rotationTypes.length];

    // The money-angle types need a candidate that actually HAS that data, so search the
    // eligible pool for one and snapshot the headline fact (for the admin UI). If none in
    // the pool has it, degrade to a rep profile so the daily post still goes out.
    let statKey = subjectType === 'ai_analysis' ? 'ai_summary' : 'overall_score';
    let statExtra: Record<string, unknown> = {};
    if (subjectType === 'committee_spender' || subjectType === 'top_donor') {
      const shuffled = [...eligible].sort(() => Math.random() - 0.5).slice(0, 30);
      let found: { c: typeof picked; f: Awaited<ReturnType<typeof fetchCandidateFacts>> } | null = null;
      for (const c of shuffled) {
        const f = await fetchCandidateFacts(admin, c.id);
        if (subjectType === 'committee_spender' ? hasCommitteeData(f) : hasDonorData(f)) { found = { c, f }; break; }
      }
      if (found && found.f) {
        picked = found.c;
        if (subjectType === 'committee_spender') {
          const top = topOutsideSpender(found.f)!;
          statKey = 'top_committee_spender';
          statExtra = { committee_name: top.name, committee_amount: top.amount, committee_dir: top.dir, ie_support: found.f.ie_support, ie_oppose: found.f.ie_oppose };
        } else {
          const d = found.f.top_donor!;
          statKey = 'top_donor';
          statExtra = { top_donor_name: d.name, top_donor_amount: d.amount, top_donor_type: d.type ?? null };
        }
      } else {
        subjectType = 'rep_profile';
        statKey = 'overall_score';
      }
    }

    // Insert draft
    const subjectLabel = `${picked.name} — ${picked.office}${picked.state ? `, ${picked.state}` : ''}`;
    const { data: post, error: insErr } = await admin
      .from('social_posts')
      .insert({
        subject_type: subjectType,
        subject_id: picked.id,
        subject_label: subjectLabel,
        stat_key: statKey,
        stat_payload: {
          overall_score: picked.overall_score,
          party: picked.party,
          office: picked.office,
          state: picked.state,
          district: picked.district,
          coverage_tier: picked.coverage_tier,
          ...statExtra,
        },
        status: 'pending_review',
      })
      .select('id')
      .single();
    if (insErr) throw insErr;

    // Advance the rotation pointer so the next draft uses the following type.
    await admin
      .from('social_post_settings')
      .update({ rotation_index: rotationIndex + 1 })
      .eq('id', 1);

    // Insert per-platform rows
    const platformRows = PLATFORMS.map((p) => ({
      post_id: post.id,
      platform: p,
      enabled: (settings as Record<string, boolean>)[`${p}_enabled`] ?? false,
      status: 'pending',
    }));
    await admin.from('social_post_platforms').insert(platformRows);

    // Warm the candidate's AI analysis so the auto-post caption can reuse the
    // same web-grounded summary shown on the profile (generate-social-caption
    // reads it from cache). Best-effort and idempotent: the draft already exists,
    // and the caption falls back to a generated summary if this misses. Awaited
    // so the cache is populated before auto-post-due runs (hours later).
    let warmed = false;
    try {
      const cronSecret = await getCronSecret();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${serviceKey}`,
      };
      if (cronSecret) headers['x-cron-secret'] = cronSecret;
      const warmRes = await fetch(`${supaUrl}/functions/v1/ai-recipient-analysis`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entity_kind: 'candidate',
          entity_id: picked.id,
          entity_name: picked.name,
          fec_id: picked.fec_candidate_id ?? null,
          party: picked.party ?? null,
          office: picked.office ?? null,
          state: picked.state ?? null,
          cycle: null,
          force_refresh: false,
        }),
      });
      warmed = warmRes.ok;
    } catch (e) {
      console.warn('ai analysis warm failed', e);
    }

    return new Response(
      JSON.stringify({ ok: true, post_id: post.id, subject_id: picked.id, subject_type: subjectType, mode: settings.mode, analysis_warmed: warmed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
