import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('X_CLIENT_SECRET');
const REDIRECT_URI = Deno.env.get('X_REDIRECT_URI');

const BodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return new Response(JSON.stringify({ error: 'oauth_not_configured' }), {
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
      .from('x_oauth_pending')
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
    await admin.from('x_oauth_pending').delete().eq('state', state);

    const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: pending.code_verifier,
        client_id: CLIENT_ID,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error('token exchange failed', tokenRes.status, t);
      return new Response(JSON.stringify({ error: 'token_exchange_failed', detail: t }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tokenJson = await tokenRes.json();
    const accessToken: string = tokenJson.access_token;
    const refreshToken: string | null = tokenJson.refresh_token ?? null;
    const scope: string | null = tokenJson.scope ?? null;
    const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 7200) * 1000).toISOString();

    // Look up the X username
    const meRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      const t = await meRes.text();
      return new Response(JSON.stringify({ error: 'users_me_failed', detail: t }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const meJson = await meRes.json();
    const handle: string = meJson?.data?.username;
    if (!handle) {
      return new Response(JSON.stringify({ error: 'no_username' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upErr } = await admin
      .from('x_account_tokens')
      .upsert({
        account_handle: handle,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope,
      }, { onConflict: 'account_handle' });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ account_handle: handle }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('x-oauth-callback error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
