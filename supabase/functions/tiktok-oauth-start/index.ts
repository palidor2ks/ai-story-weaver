// Starts the TikTok OAuth (Login Kit) PKCE handshake for an admin. Mirrors
// x-oauth-start. Returns an authorize_url the browser redirects to; TikTok then
// calls back to redirect_to, which the SPA forwards to tiktok-oauth-callback.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TikTok labels these "Client key" / "Client secret". Accept a couple of common
// env names so whichever the operator stored in Supabase secrets just works.
const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? Deno.env.get('TIKTOK_CLIENT_ID') ?? Deno.env.get('TIKTOK_KEY');
const REDIRECT_URI_ENV = Deno.env.get('TIKTOK_REDIRECT_URI');
// Comma-separated per TikTok. user.info.basic identifies the account;
// video.publish authorizes the Content Posting API (photo direct-post).
const SCOPES = 'user.info.basic,video.publish';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

function isValidRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!CLIENT_KEY) {
      return new Response(JSON.stringify({ error: 'oauth_not_configured', detail: 'Set the TIKTOK_CLIENT_KEY (and TIKTOK_CLIENT_SECRET) Edge Function secrets.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve effective redirect URI: body.redirect_to → env → error
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const requested = typeof body.redirect_to === 'string' ? body.redirect_to.trim() : '';
    const redirectUri = requested || REDIRECT_URI_ENV || '';
    if (!redirectUri || !isValidRedirect(redirectUri)) {
      return new Response(JSON.stringify({ error: 'invalid_redirect_uri' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stateBytes = new Uint8Array(32);
    const verifierBytes = new Uint8Array(48);
    crypto.getRandomValues(stateBytes);
    crypto.getRandomValues(verifierBytes);
    const state = b64url(stateBytes);
    const codeVerifier = b64url(verifierBytes);
    const codeChallenge = b64url(await sha256(codeVerifier));

    // Cleanup old pending rows (best effort)
    await admin.from('tiktok_oauth_pending')
      .delete()
      .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    const { error: insErr } = await admin.from('tiktok_oauth_pending').insert({
      state, code_verifier: codeVerifier, user_id: userId, redirect_uri: redirectUri,
    });
    if (insErr) throw insErr;

    const params = new URLSearchParams({
      client_key: CLIENT_KEY,
      response_type: 'code',
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const authorize_url = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

    return new Response(JSON.stringify({ authorize_url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('tiktok-oauth-start error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
