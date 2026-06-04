// Shared cron-auth helper for edge functions invoked exclusively by pg_cron.
//
// pg_cron sends an `x-cron-secret` header whose value matches the
// `cron_secret` row in Supabase Vault. We cache the vault value per cold
// start so we don't hit the DB on every invocation.
//
// Bypass: an `Authorization: Bearer <SERVICE_ROLE_KEY>` request is also
// accepted so admin tooling / local testing can still invoke the function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let cachedSecret: string | null = null;

async function loadCronSecret(): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  try {
    const admin = createClient(url, key);
    const { data, error } = await admin
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', 'cron_secret')
      .maybeSingle();
    if (error || !data?.decrypted_secret) return null;
    cachedSecret = data.decrypted_secret as string;
    return cachedSecret;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns true when the request carries a valid cron secret (or the
// service-role bearer escape hatch). Useful for functions that accept BOTH
// cron/service callers and normal admin users on the same route.
export async function isCronAuthorized(req: Request): Promise<boolean> {
  const provided = req.headers.get('x-cron-secret');
  const expected = await loadCronSecret();
  if (expected && provided && timingSafeEqual(provided, expected)) return true;

  // Allow service-role bearer as an admin/manual escape hatch.
  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  return false;
}

// Exposes the vault cron secret so one cron-invoked function can forward it
// when calling another cron-protected function over HTTP.
export async function getCronSecret(): Promise<string | null> {
  return loadCronSecret();
}

export async function requireCronAuth(req: Request): Promise<Response | null> {
  if (await isCronAuthorized(req)) return null;

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
