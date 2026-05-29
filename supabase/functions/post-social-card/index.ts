import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  cardId: z.string().uuid(),
  platforms: z.array(z.enum(['x', 'facebook', 'instagram', 'linkedin', 'tiktok'])).min(1),
  caption: z.string().min(1).max(1000).optional(),
  account_handle: z.string().min(1).max(50).optional(),
});

const CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('X_CLIENT_SECRET');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('unauthorized');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error('unauthorized');

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin, error } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error) throw error;
  if (!isAdmin) throw new Error('forbidden');
  return { admin, userId: user.id };
}

async function refreshXTokenIfNeeded(supabase: any, row: any): Promise<string> {
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp - now > 60_000 && row.access_token) return row.access_token;

  if (!row.refresh_token) throw new Error('no_refresh_token');
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('oauth_not_configured');

  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`refresh_failed_${res.status}`);
  const j = await res.json();
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 7200) * 1000).toISOString();
  await supabase
    .from('x_account_tokens')
    .update({
      access_token: j.access_token,
      refresh_token: j.refresh_token ?? row.refresh_token,
      expires_at: expiresAt,
      scope: j.scope ?? row.scope,
    })
    .eq('id', row.id);
  return j.access_token;
}

async function postToX(admin: any, text: string, accountHandle?: string) {
  let query = admin.from('x_account_tokens').select('*').limit(1);
  if (accountHandle) query = query.eq('account_handle', accountHandle.replace(/^@/, ''));
  const { data: rows, error } = await query;
  if (error) throw error;
  const row = rows?.[0];
  if (!row) throw new Error('no_x_account_connected');

  const accessToken = await refreshXTokenIfNeeded(admin, row);
  const tweetText = text.length > 280 ? `${text.slice(0, 277)}…` : text;
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: tweetText }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X error ${res.status}: ${JSON.stringify(payload)}`);
  const id = payload?.data?.id;
  return { id, url: id ? `https://x.com/${row.account_handle}/status/${id}` : null };
}

async function postToFacebook(text: string, link: string, imageUrl?: string | null) {
  const pageId = Deno.env.get('FACEBOOK_PAGE_ID');
  const token = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!pageId || !token) throw new Error('not_configured: FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN missing');

  const base = `https://graph.facebook.com/v21.0/${pageId}`;
  const endpoint = imageUrl ? `${base}/photos` : `${base}/feed`;
  const body = imageUrl
    ? { url: imageUrl, caption: `${text}\n${link}`, access_token: token }
    : { message: text, link, access_token: token };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Facebook error ${res.status}: ${JSON.stringify(payload)}`);
  const id = payload.post_id || payload.id;
  const urlPart = id?.includes('_') ? id.split('_')[1] : id;
  return { id, url: id ? `https://facebook.com/${pageId}/posts/${urlPart}` : null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { admin, userId } = await requireAdmin(req);
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { cardId, platforms, account_handle } = parsed.data;
    const { data: card, error: cardErr } = await admin
      .from('social_stat_cards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (cardErr || !card) throw new Error('card_not_found');
    if (!card.share_url && !card.source_url) throw new Error('card_missing_share_url');

    const shareUrl = card.share_url || card.source_url;
    const imageUrl = card.image_url || null;
    const caption = (parsed.data.caption ?? card.caption ?? '').trim();
    if (!caption) throw new Error('caption_required');
    const textWithLink = `${caption}\n\n${shareUrl}`;

    await admin
      .from('social_stat_cards')
      .update({ status: 'approved', approved_by: userId, caption })
      .eq('id', cardId);

    const results: Array<Record<string, unknown>> = [];
    for (const platform of platforms) {
      try {
        let result: { id: string | null; url: string | null };
        if (platform === 'x') {
          result = await postToX(admin, textWithLink, account_handle);
        } else if (platform === 'facebook') {
          result = await postToFacebook(caption, shareUrl, imageUrl);
        } else if (platform === 'instagram') {
          throw new Error('not_configured: Instagram Content Publishing API is not configured yet');
        } else if (platform === 'linkedin') {
          throw new Error('not_configured: LinkedIn credentials are not configured yet');
        } else {
          throw new Error('not_configured: TikTok posting is not configured yet');
        }

        await admin.from('social_stat_card_posts').insert({
          card_id: cardId,
          platform,
          status: 'success',
          remote_post_id: result.id,
          remote_post_url: result.url,
        });
        results.push({ platform, status: 'success', url: result.url });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await admin.from('social_stat_card_posts').insert({
          card_id: cardId,
          platform,
          status: 'failed',
          error: message,
        });
        results.push({ platform, status: 'failed', error: message });
      }
    }

    const anySuccess = results.some((r) => r.status === 'success');
    await admin
      .from('social_stat_cards')
      .update({ status: anySuccess ? 'posted' : 'failed', posted_at: anySuccess ? new Date().toISOString() : null })
      .eq('id', cardId);

    return json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500;
    return json({ error: message }, status);
  }
});
