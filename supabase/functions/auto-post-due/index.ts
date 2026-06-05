// Cron-invoked. When social_post_settings.mode = 'auto', this finds drafts that
// have been awaiting review longer than `auto_approve_after_hours`, makes sure
// each is caption'd + rendered, then posts them via post-social-card.
//
// Pipeline per due draft:
//   1. fill any blank captions on enabled platforms (generate-social-caption)
//   2. render the stat card server-side if share_url is missing (renderAndStoreCard)
//   3. post (post-social-card), which flips status to posted/failed
//
// A draft whose render keeps failing simply ages out of the 48h window, so we
// never retry a broken card forever. Manual mode is a no-op here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronAuth, getCronSecret } from '../_shared/cron-auth.ts';
import { renderAndStoreCard } from '../_shared/social-card.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const MAX_PER_RUN = 3;
const RETRY_WINDOW_HOURS = 48;
const PLATFORM_COLS = ['x', 'facebook', 'instagram', 'tiktok'] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function invokeFn(name: string, body: unknown, cronSecret: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  if (cronSecret) headers['x-cron-secret'] = cronSecret;
  const res = await fetch(`${supaUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* ignore non-JSON */ }
  return { ok: res.ok, status: res.status, payload };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const admin = createClient(supaUrl, serviceKey);
    const cronSecret = await getCronSecret();

    const { data: settings } = await admin
      .from('social_post_settings').select('*').eq('id', 1).maybeSingle();
    if (!settings) return json({ error: 'settings_missing' }, 500);
    if (settings.mode !== 'auto') return json({ ok: true, skipped: 'manual_mode' });

    const delayHours = Number(settings.auto_approve_after_hours ?? 2);
    const now = Date.now();
    const dueBefore = new Date(now - delayHours * 3_600_000).toISOString();
    const windowStart = new Date(now - RETRY_WINDOW_HOURS * 3_600_000).toISOString();

    const { data: due, error: dueErr } = await admin
      .from('social_posts')
      .select('id, subject_id, subject_label, subject_type, share_url')
      .eq('status', 'pending_review')
      .lte('created_at', dueBefore)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN);
    if (dueErr) throw dueErr;
    if (!due || due.length === 0) return json({ ok: true, processed: 0, due: 0 });

    const results: Record<string, unknown> = {};

    for (const post of due) {
      // Atomically claim the row so an overlapping run can't post it twice:
      // only one caller can flip pending_review -> posting.
      const { data: claimed } = await admin
        .from('social_posts')
        .update({ status: 'posting' })
        .eq('id', post.id)
        .eq('status', 'pending_review')
        .select('id');
      if (!claimed || claimed.length === 0) {
        results[post.id] = { subject: post.subject_label, skipped: 'already_claimed' };
        continue;
      }

      try {
        // 1. Captions — only enabled, not-yet-posted platforms with a blank caption.
        const { data: platforms } = await admin
          .from('social_post_platforms')
          .select('platform, caption, enabled, status')
          .eq('post_id', post.id);
        for (const p of platforms ?? []) {
          if (!(PLATFORM_COLS as readonly string[]).includes(p.platform)) continue;
          if (!p.enabled || p.status === 'posted') continue;
          if ((p.caption ?? '').trim().length > 0) continue;
          await invokeFn('generate-social-caption', { post_id: post.id, platform: p.platform }, cronSecret);
        }

        // 2. Render the card server-side if it hasn't been rendered yet.
        if (!post.share_url) {
          await renderAndStoreCard(admin, post);
        }

        // 3. Post. post-social-card re-reads the row + platforms and writes the
        //    terminal status (posted/failed) itself, overwriting 'posting'.
        const posted = await invokeFn('post-social-card', { post_id: post.id }, cronSecret);
        if (!posted.ok) throw new Error(`post_social_card_${posted.status}`);
        results[post.id] = { subject: post.subject_label, posted: posted.payload };
      } catch (e) {
        // Release the claim so the draft is retried on a later run (until it
        // ages out of the 48h retry window). The guard avoids clobbering a
        // terminal status post-social-card may already have written.
        await admin
          .from('social_posts')
          .update({ status: 'pending_review' })
          .eq('id', post.id)
          .eq('status', 'posting');
        results[post.id] = { subject: post.subject_label, error: e instanceof Error ? e.message : 'failed' };
      }
    }

    return json({ ok: true, processed: due.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return json({ error: message }, 500);
  }
});
