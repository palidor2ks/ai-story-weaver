import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const REDIRECT_URI = Deno.env.get('X_REDIRECT_URI');
const SCOPES = 'tweet.read tweet.write users.read offline.access';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !REDIRECT_URI) {
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

    const stateBytes = new Uint8Array(32);
    const verifierBytes = new Uint8Array(48);
    crypto.getRandomValues(stateBytes);
    crypto.getRandomValues(verifierBytes);
    const state = b64url(stateBytes);
    const codeVerifier = b64url(verifierBytes);
    const codeChallenge = b64url(await sha256(codeVerifier));

    // Cleanup old pending rows (best effort)
    await admin.from('x_oauth_pending')
      .delete()
      .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    const { error: insErr } = await admin.from('x_oauth_pending').insert({
      state, code_verifier: codeVerifier, user_id: userId,
    });
    if (insErr) throw insErr;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const authorize_url = `https://x.com/i/oauth2/authorize?${params.toString()}`;

    return new Response(JSON.stringify({ authorize_url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('x-oauth-start error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
