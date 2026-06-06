// Admin-only OR cron-invoked. Posts a social_posts row to all enabled platforms.
// X, TikTok, and Facebook are wired; Instagram returns "not_configured" until tokens added.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const X_CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const X_CLIENT_SECRET = Deno.env.get('X_CLIENT_SECRET');
const TIKTOK_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? Deno.env.get('TIKTOK_CLIENT_ID') ?? Deno.env.get('TIKTOK_KEY');
const TIKTOK_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? Deno.env.get('TIKTOK_SECRET');
// Override only if your TikTok app is audited for public posting; unaudited apps
// are limited to SELF_ONLY. Left unset, we pick the safest level the account allows.
const TIKTOK_PRIVACY_LEVEL = Deno.env.get('TIKTOK_PRIVACY_LEVEL');
const PUBLIC_SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.polipulseapp.com').replace(/\/+$/, '');

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

// Upload the rendered card to X as native media and return its media id. Needs
// the `media.write` scope on the connected account.
async function uploadXMedia(accessToken: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`image_fetch_${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const form = new FormData();
  form.append('media', new Blob([bytes], { type: 'image/png' }), 'card.png');
  form.append('media_category', 'tweet_image');
  // Note: do NOT set Content-Type — fetch derives the multipart boundary from FormData.
  const up = await fetch('https://api.x.com/2/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const txt = await up.text();
  if (!up.ok) throw new Error(`media_upload_${up.status}: ${txt.slice(0, 200)}`);
  let j: any;
  try { j = JSON.parse(txt); } catch { j = {}; }
  const mediaId = j?.data?.id ?? j?.media_id_string ?? (j?.media_id != null ? String(j.media_id) : null);
  if (!mediaId) throw new Error('media_id_missing');
  return mediaId;
}

async function postToX(
  admin: ReturnType<typeof createClient>,
  caption: string,
  post: { image_url?: string | null; share_url?: string | null; subject_id?: string | null },
) {
  const { data: rows } = await admin.from('x_account_tokens').select('*').limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, error: 'no_x_account_connected' };
  let accessToken: string;
  try { accessToken = await refreshX(admin, row); } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'refresh_failed' };
  }

  // Prefer attaching the card as native media (shows the full 1:1 card in-feed
  // and links straight to the profile). If media upload isn't available yet
  // (e.g. the account hasn't been reconnected with media.write), fall back to
  // the link-unfurl card so posting still works.
  let mediaId: string | null = null;
  if (post.image_url) {
    try { mediaId = await uploadXMedia(accessToken, post.image_url); } catch { mediaId = null; }
  }

  const profileUrl = post.subject_id
    ? `${PUBLIC_SITE_URL}/candidate/${encodeURIComponent(post.subject_id)}`
    : (post.share_url ?? '');
  const text = buildXText(caption, mediaId ? profileUrl : (post.share_url ?? profileUrl));
  const body: Record<string, unknown> = mediaId ? { text, media: { media_ids: [mediaId] } } : { text };

  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    native_media: !!mediaId,
  };
}

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
const TIKTOK_CONTENT_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

async function refreshTikTok(admin: ReturnType<typeof createClient>, row: any): Promise<string> {
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp - now > 60_000 && row.access_token) return row.access_token;
  if (!row.refresh_token || !TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) throw new Error('tiktok_not_configured');
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.access_token) {
    throw new Error(`tiktok_refresh_failed: ${j.error_description || j.error || res.status}`);
  }
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 86400) * 1000).toISOString();
  const refreshExpiresAt = j.refresh_expires_in
    ? new Date(Date.now() + j.refresh_expires_in * 1000).toISOString()
    : row.refresh_expires_at;
  await admin.from('tiktok_account_tokens').update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? row.refresh_token,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    scope: j.scope ?? row.scope,
  }).eq('id', row.id);
  return j.access_token;
}

// Honor the operator's override when the account allows it; otherwise default to
// the safest level the creator permits (unaudited apps only allow SELF_ONLY).
function pickTikTokPrivacy(options: string[]): string {
  if (TIKTOK_PRIVACY_LEVEL && options.includes(TIKTOK_PRIVACY_LEVEL)) return TIKTOK_PRIVACY_LEVEL;
  if (options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
  return options[0] ?? 'SELF_ONLY';
}

// Posts the rendered card to TikTok as a single-photo DIRECT_POST via the
// Content Posting API. TikTok pulls the image from its public URL, so the host
// domain must be verified under the app's URL properties.
async function postToTikTok(
  admin: ReturnType<typeof createClient>,
  caption: string,
  post: { image_url?: string | null },
) {
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    return { ok: false, error: 'tiktok_not_configured', detail: 'Set TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET secrets and connect an account.' };
  }
  const imageUrl = post.image_url;
  if (!imageUrl) return { ok: false, error: 'tiktok_requires_image', detail: 'Render the card image before posting to TikTok.' };

  const { data: rows } = await admin
    .from('tiktok_account_tokens').select('*').order('updated_at', { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, error: 'no_tiktok_account_connected' };

  let accessToken: string;
  try { accessToken = await refreshTikTok(admin, row); } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'refresh_failed' };
  }
  const authH = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' };

  // 1. Query creator info: required before a direct post, and it returns both the
  //    allowed privacy levels and the username (for building the post URL).
  const ciRes = await fetch(TIKTOK_CREATOR_INFO_URL, { method: 'POST', headers: authH });
  const ciJson = await ciRes.json().catch(() => ({}));
  if (!ciRes.ok || (ciJson?.error && ciJson.error.code !== 'ok')) {
    return { ok: false, error: 'tiktok_creator_info_failed', detail: ciJson?.error?.message ?? `status_${ciRes.status}` };
  }
  const options: string[] = ciJson?.data?.privacy_level_options ?? [];
  const privacy = pickTikTokPrivacy(options);
  const username: string | null = ciJson?.data?.creator_username ?? row.username ?? null;

  // 2. Initialize the direct photo post.
  const description = (caption ?? '').trim();
  const initBody = {
    post_info: {
      title: description.slice(0, 90),
      description,
      privacy_level: privacy,
      disable_comment: false,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: [imageUrl],
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  };
  const initRes = await fetch(TIKTOK_CONTENT_INIT_URL, { method: 'POST', headers: authH, body: JSON.stringify(initBody) });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok || (initJson?.error && initJson.error.code !== 'ok') || !initJson?.data?.publish_id) {
    return { ok: false, error: 'tiktok_post_failed', detail: initJson?.error?.message ?? `status_${initRes.status}` };
  }
  const publishId: string = initJson.data.publish_id;

  // 3. Best-effort status poll: catch an immediate failure and try to grab the
  //    public post id. Photo posts often remain PROCESSING past this window —
  //    that's fine, they still publish; we just won't have the URL yet.
  let externalUrl: string | null = null;
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const stRes = await fetch(TIKTOK_STATUS_URL, { method: 'POST', headers: authH, body: JSON.stringify({ publish_id: publishId }) });
    const stJson = await stRes.json().catch(() => ({}));
    const status = stJson?.data?.status;
    if (status === 'FAILED') {
      return { ok: false, error: 'tiktok_publish_failed', detail: stJson?.data?.fail_reason ?? 'failed' };
    }
    const postIds: unknown[] = stJson?.data?.publicaly_available_post_id ?? [];
    if (postIds.length > 0) {
      externalUrl = username ? `https://www.tiktok.com/@${username}/photo/${String(postIds[0])}` : null;
      break;
    }
    if (status === 'PUBLISH_COMPLETE') break;
  }

  return { ok: true, external_post_id: publishId, external_url: externalUrl };
}

// ===== Facebook Page =====
// Posts to a Facebook Page using a long-lived Page access token kept as a
// function secret (the same FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN secrets
// post-poll-to-social uses). When the card image is rendered we post it as a Page
// photo with the share link in the caption; otherwise we fall back to a link post.
async function postToFacebook(
  caption: string,
  post: { image_url?: string | null; share_url?: string | null },
) {
  const pageId = Deno.env.get('FACEBOOK_PAGE_ID');
  const token = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!pageId || !token) {
    return { ok: false, error: 'facebook_not_configured', detail: 'Set FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN secrets.' };
  }

  const link = post.share_url ?? '';
  const base = `https://graph.facebook.com/v21.0/${pageId}`;
  let endpoint: string;
  const body: Record<string, string> = { access_token: token };
  if (post.image_url) {
    endpoint = `${base}/photos`;
    body.url = post.image_url;
    body.caption = link ? `${caption}\n${link}` : caption;
  } else {
    endpoint = `${base}/feed`;
    body.message = caption;
    if (link) body.link = link;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: `facebook_post_failed_${res.status}`, detail: JSON.stringify(json).slice(0, 400) };
  }
  // /photos returns { id, post_id }; /feed returns { id } shaped `${pageId}_${postId}`.
  const postId: string = json.post_id || json.id || '';
  const urlPart = postId.includes('_') ? postId.split('_')[1] : postId;
  return {
    ok: true,
    external_post_id: postId || null,
    external_url: postId ? `https://www.facebook.com/${pageId}/posts/${urlPart}` : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    // Accept the vault cron secret (x-cron-secret) or a service-role bearer,
    // consistent with the other cron-invoked functions.
    const isCron = await isCronAuthorized(req);

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
        r = await postToX(admin, caption, post);
      } else if (p.platform === 'tiktok') {
        r = await postToTikTok(admin, caption, post);
      } else if (p.platform === 'facebook') {
        r = await postToFacebook(caption, post);
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
