// Completes the TikTok OAuth handshake: exchanges the authorization code for
// tokens, looks up the account's open_id/display_name, and upserts it into
// tiktok_account_tokens. Mirrors x-oauth-callback.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? Deno.env.get('TIKTOK_CLIENT_ID') ?? Deno.env.get('TIKTOK_KEY');
const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? Deno.env.get('TIKTOK_SECRET');
const REDIRECT_URI_ENV = Deno.env.get('TIKTOK_REDIRECT_URI');

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url';

const BodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!CLIENT_KEY || !CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'oauth_not_configured', detail: 'Set the TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET Edge Function secrets.' }), {
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
    const jwt = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(jwt);
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

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { code, state } = parsed.data;

    const { data: pending, error: pendErr } = await admin
      .from('tiktok_oauth_pending')
      .select('*')
      .eq('state', state)
      .eq('user_id', userId)
      .maybeSingle();
    if (pendErr || !pending) {
      return new Response(JSON.stringify({ error: 'invalid_state' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Delete after lookup
    await admin.from('tiktok_oauth_pending').delete().eq('state', state);

    const effectiveRedirect: string = pending.redirect_uri || REDIRECT_URI_ENV || '';
    if (!effectiveRedirect) {
      return new Response(JSON.stringify({ error: 'missing_redirect_uri' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: effectiveRedirect,
        code_verifier: pending.code_verifier,
      }).toString(),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    // TikTok returns OAuth errors with a flat { error, error_description } shape.
    if (!tokenRes.ok || tokenJson.error || !tokenJson.access_token) {
      const detail = tokenJson.error_description || tokenJson.error || `status_${tokenRes.status}`;
      console.error('tiktok token exchange failed', tokenRes.status, tokenJson);
      return new Response(JSON.stringify({ error: 'token_exchange_failed', detail }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken: string = tokenJson.access_token;
    const refreshToken: string | null = tokenJson.refresh_token ?? null;
    const scope: string | null = tokenJson.scope ?? null;
    const openIdFromToken: string | null = tokenJson.open_id ?? null;
    const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 86400) * 1000).toISOString();
    const refreshExpiresAt = tokenJson.refresh_expires_in
      ? new Date(Date.now() + tokenJson.refresh_expires_in * 1000).toISOString()
      : null;

    // Look up the display name (and confirm open_id) for a friendly label.
    let openId = openIdFromToken;
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    const meRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meJson = await meRes.json().catch(() => ({}));
    if (meRes.ok && meJson?.data?.user) {
      openId = meJson.data.user.open_id ?? openId;
      displayName = meJson.data.user.display_name ?? null;
      avatarUrl = meJson.data.user.avatar_url ?? null;
    }
    if (!openId) {
      return new Response(JSON.stringify({ error: 'no_open_id', detail: meJson?.error?.message ?? null }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upErr } = await admin
      .from('tiktok_account_tokens')
      .upsert({
        open_id: openId,
        display_name: displayName,
        avatar_url: avatarUrl,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        scope,
      }, { onConflict: 'open_id' });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ open_id: openId, display_name: displayName }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('tiktok-oauth-callback error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
