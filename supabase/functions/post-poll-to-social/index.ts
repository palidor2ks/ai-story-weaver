import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ===== X (Twitter) — OAuth 1.0a =====
function percentEncode(s: string) {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function postToX(text: string): Promise<{ id: string; url: string }> {
  const ck = Deno.env.get('TWITTER_CONSUMER_KEY');
  const cs = Deno.env.get('TWITTER_CONSUMER_SECRET');
  const at = Deno.env.get('TWITTER_ACCESS_TOKEN');
  const ats = Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET');
  if (!ck || !cs || !at || !ats) throw new Error('not_configured: TWITTER_* secrets missing');

  const url = 'https://api.x.com/2/tweets';
  const method = 'POST';
  const oauth: Record<string, string> = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: at,
    oauth_version: '1.0',
  };
  // IMPORTANT: do NOT include JSON body params in the OAuth signature for /2/tweets
  const paramString = Object.keys(oauth).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(oauth[k])}`).join('&');
  const sigBase = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(cs)}&${percentEncode(ats)}`;
  oauth.oauth_signature = await hmacSha1(signingKey, sigBase);

  const authHeader = 'OAuth ' + Object.keys(oauth).sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauth[k])}"`).join(', ');

  const res = await fetch(url, {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`X error ${res.status}: ${JSON.stringify(json)}`);
  const id = json?.data?.id;
  return { id, url: `https://x.com/i/web/status/${id}` };
}

// ===== Facebook Page =====
async function postToFacebook(text: string, link: string, imageUrl?: string | null): Promise<{ id: string; url: string }> {
  const pageId = Deno.env.get('FACEBOOK_PAGE_ID');
  const token = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!pageId || !token) throw new Error('not_configured: FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN missing');

  const base = `https://graph.facebook.com/v21.0/${pageId}`;
  let endpoint: string;
  let body: Record<string, string>;
  if (imageUrl) {
    endpoint = `${base}/photos`;
    body = { url: imageUrl, caption: `${text}\n${link}`, access_token: token };
  } else {
    endpoint = `${base}/feed`;
    body = { message: text, link, access_token: token };
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`FB error ${res.status}: ${JSON.stringify(json)}`);
  // photos returns post_id (page_id_post_id); feed returns id (page_id_post_id)
  const postId: string = json.post_id || json.id;
  const urlPart = postId?.includes('_') ? postId.split('_')[1] : postId;
  return { id: postId, url: `https://facebook.com/${pageId}/posts/${urlPart}` };
}

async function postToLinkedIn(_text: string, _link: string): Promise<{ id: string; url: string }> {
  throw new Error('not_configured: LinkedIn credentials (LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_URN) not set');
}
async function postToInstagram(_text: string, _imageUrl: string): Promise<{ id: string; url: string }> {
  throw new Error('not_configured: Instagram requires FB Business + IG_USER_ID + access token');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('unauthorized');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('unauthorized');

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) throw new Error('forbidden: admin only');

    const { pollId, platforms } = await req.json();
    if (!pollId || !Array.isArray(platforms) || platforms.length === 0) {
      throw new Error('pollId and platforms[] are required');
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: poll, error: pollErr } = await admin
      .from('polls').select('*').eq('id', pollId).single();
    if (pollErr || !poll) throw new Error('poll not found');

    const origin = req.headers.get('origin') || 'https://polipulseapp.com';
    const link = `${origin}/p/${poll.slug}`;
    const caption = poll.share_caption?.trim() || `${poll.title} — Take the poll: ${link}`;

    const results: any[] = [];
    for (const platform of platforms) {
      try {
        let result: { id: string; url: string };
        if (platform === 'twitter' || platform === 'x') {
          // X has 280 char limit; trim caption if needed
          const tweetText = caption.length > 280 ? caption.slice(0, 277) + '…' : caption;
          result = await postToX(tweetText);
        } else if (platform === 'facebook') {
          result = await postToFacebook(caption, link, poll.og_image_url);
        } else if (platform === 'linkedin') {
          result = await postToLinkedIn(caption, link);
        } else if (platform === 'instagram') {
          result = await postToInstagram(caption, poll.og_image_url || '');
        } else {
          throw new Error(`unknown platform: ${platform}`);
        }
        await admin.from('poll_social_posts').insert({
          poll_id: pollId, platform, status: 'success',
          remote_post_id: result.id, remote_post_url: result.url, posted_at: new Date().toISOString(),
        });
        results.push({ platform, status: 'success', url: result.url });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from('poll_social_posts').insert({
          poll_id: pollId, platform, status: 'failed', error: msg, posted_at: new Date().toISOString(),
        });
        results.push({ platform, status: 'failed', error: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
