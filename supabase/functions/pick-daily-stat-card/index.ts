// Cron-invoked. Picks a candidate not recently featured, drafts a social post.
// No JWT verification (called by pg_cron). Idempotent per UTC day per subject_type.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(supaUrl, serviceKey);
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

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

    // Pick a candidate with a non-null score and image, federal preferred
    const { data: pool } = await admin
      .from('candidates')
      .select('id, name, office, party, state, district, image_url, overall_score, coverage_tier, confidence, is_incumbent')
      .not('overall_score', 'is', null)
      .order('last_updated', { ascending: false })
      .limit(200);

    const eligible = (pool ?? []).filter((c) => !skipIds.has(c.id) && c.image_url);
    if (eligible.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_eligible_candidates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const picked = eligible[Math.floor(Math.random() * eligible.length)];

    // Insert draft
    const subjectLabel = `${picked.name} — ${picked.office}${picked.state ? `, ${picked.state}` : ''}`;
    const { data: post, error: insErr } = await admin
      .from('social_posts')
      .insert({
        subject_type: 'rep_profile',
        subject_id: picked.id,
        subject_label: subjectLabel,
        stat_key: 'overall_score',
        stat_payload: {
          overall_score: picked.overall_score,
          party: picked.party,
          office: picked.office,
          state: picked.state,
          district: picked.district,
          coverage_tier: picked.coverage_tier,
        },
        status: 'pending_review',
      })
      .select('id')
      .single();
    if (insErr) throw insErr;

    // Insert per-platform rows
    const platformRows = PLATFORMS.map((p) => ({
      post_id: post.id,
      platform: p,
      enabled: (settings as Record<string, boolean>)[`${p}_enabled`] ?? false,
      status: 'pending',
    }));
    await admin.from('social_post_platforms').insert(platformRows);

    return new Response(
      JSON.stringify({ ok: true, post_id: post.id, subject_id: picked.id, mode: settings.mode }),
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
