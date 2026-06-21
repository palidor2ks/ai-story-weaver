/**
 * call-edge: invoke a Supabase edge function from Railway with service-role auth.
 *
 * All edge functions accept `Authorization: Bearer <SERVICE_ROLE_KEY>` as a
 * bypass of the cron-secret vault check (see supabase/functions/_shared/cron-auth.ts).
 * The apikey header must match the bearer token to avoid UNAUTHORIZED_API_KEY_CONFLICTS.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

const EDGE_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
};

export async function callEdge<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
  timeoutMs = 120_000,
): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const signal = AbortSignal.timeout(timeoutMs);

  const res = await fetch(url, {
    method: "POST",
    headers: EDGE_HEADERS,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}
