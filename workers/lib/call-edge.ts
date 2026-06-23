/**
 * call-edge: invoke a Supabase edge function from Railway.
 *
 * Default auth: Authorization: Bearer <SERVICE_ROLE_KEY> + matching apikey header,
 * plus an x-cron-secret header (from CRON_SECRET). x-cron-secret is the PRIMARY
 * credential for edge functions gated by cron-auth.ts — the service-role bearer is
 * only a fallback escape hatch, and it no longer matches under the project's new
 * API-key system (the function's SUPABASE_SERVICE_ROLE_KEY is the new secret key, not
 * the legacy JWT the worker holds), so x-cron-secret is what actually authorizes them.
 *
 * For functions with per-function x-sync-secret auth (NJ/FL/NY/TX/vote sync),
 * pass extraHeaders: { "x-sync-secret": process.env.XYZ_SYNC_SECRET }.
 *
 * For schedule-congress-donor-sync (checks apikey === SUPABASE_ANON_KEY, has
 * verify_jwt=false in config.toml — gateway skips JWT check), pass an empty string
 * to remove the service-role bearer so the keys don't conflict:
 *   extraHeaders: { "apikey": ANON_KEY, "Authorization": "" }
 * Empty-string values are stripped before the request is sent.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
  // Primary auth for cron-auth.ts-gated functions (drain-fec-finance, drain-research-queue,
  // nightly-finance-reconciliation). Empty when CRON_SECRET is unset — stripped before the
  // request below — and harmless for functions that don't read it.
  "x-cron-secret": CRON_SECRET,
};

export async function callEdge<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
  options: { timeoutMs?: number; extraHeaders?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 120_000, extraHeaders = {} } = options;
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const signal = AbortSignal.timeout(timeoutMs);

  // Merge then strip empty-string entries so callers can clear a default header.
  const merged = { ...DEFAULT_HEADERS, ...extraHeaders };
  const headers = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== ""),
  );

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}
