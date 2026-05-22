import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function makeId(len = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const form = await req.formData();
    const file = form.get('file');
    const targetUrl = String(form.get('targetUrl') ?? '').slice(0, 2000);
    const ogTitle = String(form.get('ogTitle') ?? 'Pulse — Know Your Vote').slice(0, 200);
    const ogDescription = String(form.get('ogDescription') ?? '').slice(0, 300);

    if (!(file instanceof File)) return json({ error: 'file required' }, 400);
    if (file.type !== 'image/png') return json({ error: 'png only' }, 400);
    if (file.size > 3 * 1024 * 1024) return json({ error: 'file too large' }, 400);
    if (!/^https?:\/\//i.test(targetUrl)) return json({ error: 'invalid targetUrl' }, 400);
    if (/[<>"'`\s]/.test(targetUrl)) return json({ error: 'invalid targetUrl characters' }, 400);
    let parsedTarget: URL;
    try { parsedTarget = new URL(targetUrl); } catch { return json({ error: 'invalid targetUrl' }, 400); }
    const ALLOWED_HOSTS = ['polipulseapp.com', 'polipulse.lovable.app', 'id-preview--b4a499eb-c11a-4320-8adc-dfe50259459a.lovable.app'];
    const host = parsedTarget.hostname.toLowerCase();
    const hostAllowed = ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
    if (!hostAllowed) return json({ error: 'targetUrl must be on an allowed domain' }, 400);

    // Require authentication to prevent storage abuse by anonymous callers
    const authHeader = req.headers.get('Authorization') ?? '';
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Authentication required' }, 401);
    }

    let userId: string | null = null;
    try {
      const userClient = createClient(supaUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user?.id) {
        return json({ error: 'Invalid or expired session' }, 401);
      }
      userId = data.user.id;
    } catch {
      return json({ error: 'Invalid session' }, 401);
    }

    const admin = createClient(supaUrl, serviceKey);
    const id = makeId();
    const path = `${id}.png`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const up = await admin.storage.from('share-cards').upload(path, bytes, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
    if (up.error) return json({ error: up.error.message }, 500);

    const { error: insErr } = await admin.from('share_cards').insert({
      id,
      user_id: userId,
      image_path: path,
      target_url: targetUrl,
      og_title: ogTitle,
      og_description: ogDescription,
    });
    if (insErr) {
      await admin.storage.from('share-cards').remove([path]);
      return json({ error: insErr.message }, 500);
    }

    const shareUrl = `${supaUrl}/functions/v1/share-card-page?id=${id}`;
    return json({ id, shareUrl });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
