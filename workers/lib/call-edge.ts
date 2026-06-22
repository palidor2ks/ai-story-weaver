/**
 * call-edge: invoke a Supabase edge function from Railway.
 *
 * Default auth: Authorization: Bearer <SERVICE_ROLE_KEY> + matching apikey header.
 * This bypasses the cron-secret vault check in cron-auth.ts for functions that
 * support the service-role escape hatch.
 *
 * For functions with per-function x-sync-secret auth (NJ/FL/NY/TX/vote sync),
 * pass extraHeaders: { "x-sync-secret": process.env.XYZ_SYNC_SECRET }.
 *
 * For schedule-congress-donor-sync (checks apikey === SUPABASE_ANON_KEY),
 * pass extraHeaders: { "apikey": process.env.SUPABASE_ANON_KEY }.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
};

export async function callEdge<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
  options: { timeoutMs?: number; extraHeaders?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 120_000, extraHeaders = {} } = options;
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const signal = AbortSignal.timeout(timeoutMs);

  const res = await fetch(url, {
    method: "POST",
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}
