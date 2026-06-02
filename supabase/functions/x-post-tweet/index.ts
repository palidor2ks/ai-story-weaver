import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLIENT_ID = Deno.env.get('X_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('X_CLIENT_SECRET');

const BodySchema = z.object({
  text: z.string().min(1).max(280),
  account_handle: z.string().min(1).max(50).optional(),
});

async function refreshIfNeeded(supabase: any, row: any): Promise<string> {
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp - now > 60_000 && row.access_token) return row.access_token;

  if (!row.refresh_token) throw new Error('no_refresh_token');
  if (!CLIENT_ID) throw new Error('oauth_not_configured');

  const tokenHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (CLIENT_SECRET) {
    tokenHeaders.Authorization = `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
  }
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: tokenHeaders,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { text, account_handle } = parsed.data;

    let query = admin.from('x_account_tokens').select('*').limit(1);
    if (account_handle) query = query.eq('account_handle', account_handle);
    const { data: rows, error: rowErr } = await query;
    if (rowErr) throw rowErr;
    const row = rows?.[0];
    if (!row) {
      return new Response(JSON.stringify({ error: 'no_x_account_connected' }), {
        status: 412,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await refreshIfNeeded(admin, row);

    const postRes = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      return new Response(JSON.stringify({ error: 'post_failed', status: postRes.status, detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const j = await postRes.json();
    const id = j?.data?.id;
    return new Response(
      JSON.stringify({
        success: true,
        tweet_id: id,
        url: id ? `https://x.com/${row.account_handle}/status/${id}` : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
