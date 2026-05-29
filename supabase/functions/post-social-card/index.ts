// Admin-only OR cron-invoked. Posts a social_posts row to all enabled platforms.
// X is fully wired; FB/IG/TikTok return "not_configured" until tokens added.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const X_CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const X_CLIENT_SECRET = Deno.env.get('X_CLIENT_SECRET');
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const BodySchema = z.object({
  post_id: z.string().uuid(),
});

async function refreshX(admin: ReturnType<typeof createClient>, row: any): Promise<string> {
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp - now > 60_000 && row.access_token) return row.access_token;
  if (!row.refresh_token || !X_CLIENT_ID) throw new Error('x_not_configured');
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (X_CLIENT_SECRET) headers.Authorization = `Basic ${btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`)}`;
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: X_CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`x_refresh_failed_${res.status}`);
  const j = await res.json();
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 7200) * 1000).toISOString();
  await admin.from('x_account_tokens').update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? row.refresh_token,
    expires_at: expiresAt,
    scope: j.scope ?? row.scope,
  }).eq('id', row.id);
  return j.access_token;
}

function buildXText(caption: string, shareUrl: string): string {
  const cap = (caption ?? '').trim();
  const link = ` ${shareUrl}`;
  const budget = 280 - link.length;
  const trimmed = cap.length > budget ? cap.slice(0, budget - 1).trimEnd() + '…' : cap;
  return `${trimmed}${link}`;
}

async function postToX(admin: ReturnType<typeof createClient>, caption: string, shareUrl: string) {
  const { data: rows } = await admin.from('x_account_tokens').select('*').limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, error: 'no_x_account_connected' };
  let accessToken: string;
  try { accessToken = await refreshX(admin, row); } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'refresh_failed' };
  }
  const text = buildXText(caption, shareUrl);
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `x_post_failed_${res.status}`, detail: t.slice(0, 400) };
  }
  const j = await res.json();
  const id = j?.data?.id;
  return {
    ok: true,
    external_post_id: id,
    external_url: id ? `https://x.com/${row.account_handle}/status/${id}` : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;

    const admin = createClient(supaUrl, serviceKey);

    if (!isCron) {
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
    const { post_id } = parsed.data;

    const { data: post } = await admin.from('social_posts').select('*').eq('id', post_id).maybeSingle();
    if (!post) return new Response(JSON.stringify({ error: 'post_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!post.share_url) return new Response(JSON.stringify({ error: 'share_url_missing', hint: 'render share card first' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: platforms } = await admin.from('social_post_platforms').select('*').eq('post_id', post_id);
    const enabled = (platforms ?? []).filter((p) => p.enabled && p.status !== 'posted');

    const results: Record<string, unknown> = {};
    for (const p of enabled) {
      const caption = p.caption ?? post.subject_label ?? '';
      let r: any;
      if (p.platform === 'x') {
        r = await postToX(admin, caption, post.share_url);
      } else {
        r = { ok: false, error: 'not_configured', detail: `${p.platform} posting requires API credentials.` };
      }
      const update: Record<string, unknown> = r.ok
        ? { status: 'posted', external_post_id: r.external_post_id, external_url: r.external_url, posted_at: new Date().toISOString(), error_message: null }
        : { status: 'failed', error_message: `${r.error}${r.detail ? ': ' + r.detail : ''}` };
      await admin.from('social_post_platforms').update(update).eq('id', p.id);
      results[p.platform] = r;
    }

    // Mark parent post: posted if any platform posted, failed otherwise
    const anyPosted = Object.values(results).some((r: any) => r.ok);
    await admin.from('social_posts').update({
      status: anyPosted ? 'posted' : 'failed',
      posted_at: anyPosted ? new Date().toISOString() : null,
    }).eq('id', post_id);

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
