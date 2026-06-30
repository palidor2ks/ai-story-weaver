// Shared Gemini research helper — the single front door for AI answer/position/source
// research across edge functions. Replaces the per-function Perplexity (sonar) calls so
// ALL generation runs on Google Gemini with Google Search Grounding.
//
// Why this exists
// ---------------
// 1. One provider, one place. Functions used to each embed their own Perplexity + Gemini
//    code. Now they call `callGeminiGrounded` / `resolveGroundedSources` here.
// 2. Good URLs, everywhere. Gemini's grounding metadata returns OPAQUE redirect links
//    (vertexaisearch.cloud.google.com/grounding-api-redirect/...), not real sources. This
//    module resolves them to the real destination, validates reachability, drops junk
//    domains, and — when given a verbatim quote — appends a `#:~:text=` fragment so the
//    link lands on the EXACT spot on the page (deep link, not a homepage).
//
// Tooling: we enable Google Search grounding (`googleSearch`) — the web-research tool that
// gives Gemini live results + citations. Callers that want the model to read specific URLs
// can pass `urlContext: true` to add the URL-context tool.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-2.5-flash supports Google Search grounding and is fast/cheap enough for batch
// research. Callers can override per call (e.g. a heavier model for deep synthesis).
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Read the Google AI key. Both names exist across the project's secrets; prefer the
 * canonical GOOGLE_AI_API_KEY, fall back to GOOGLE_GEMINI_API_KEY.
 */
export function getGoogleAIKey(): string | undefined {
  return Deno.env.get('GOOGLE_AI_API_KEY') ?? Deno.env.get('GOOGLE_GEMINI_API_KEY');
}

export interface RawSource {
  uri: string;
  title?: string;
}

export interface ResolvedSource {
  url: string;
  title: string;
}

export interface GroundedResult {
  /** First non-"thinking" text part emitted by the model. */
  text: string;
  /** Gemini finishReason (STOP / MAX_TOKENS / SAFETY / ...), for diagnostics. */
  finishReason: string;
  /** Raw (unresolved, possibly redirect) grounding citations from the response. */
  rawSources: RawSource[];
  /** The full parsed response, for callers that need more. */
  data: unknown;
}

// =============================================================================
// JSON EXTRACTION
// =============================================================================

/**
 * Pull a JSON object/array out of a model response that may wrap it in ```json fences,
 * prose, or thinking preamble. Returns null if nothing parses.
 */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;

  // 1. fenced ```json ... ``` block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // 2. first balanced {...} or [...] span
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start !== -1) {
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    const end = text.lastIndexOf(close);
    if (end > start) candidates.push(text.slice(start, end + 1));
  }

  // 3. the whole thing
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// =============================================================================
// GROUNDED GEMINI CALL
// =============================================================================

export interface GeminiCallOptions {
  prompt: string;
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Add the URL-context tool alongside Google Search grounding. */
  urlContext?: boolean;
  /** Disable grounding entirely (rare — only for pure transforms with no web need). */
  grounding?: boolean;
  timeoutMs?: number;
}

/**
 * Thrown when the Google AI quota is exhausted or the API is rate-limiting (HTTP 429/503).
 * Callers can catch this specifically to skip/defer work without treating it as a bug.
 */
export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiQuotaError';
  }
}

/**
 * Like `callGeminiGrounded` but returns `null` on quota/rate-limit errors instead of throwing.
 * Use this when hitting the budget limit should silently skip the work rather than crash.
 */
export async function callGeminiGroundedSafe(
  opts: GeminiCallOptions,
  onQuota?: (err: GeminiQuotaError) => void,
): Promise<GroundedResult | null> {
  try {
    return await callGeminiGrounded(opts);
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      onQuota?.(err);
      return null;
    }
    throw err;
  }
}

/**
 * Call Gemini with Google Search grounding and return the text + raw citations.
 * Throws on HTTP error or missing key so callers can fall back / retry.
 */
export async function callGeminiGrounded(opts: GeminiCallOptions): Promise<GroundedResult> {
  const key = getGoogleAIKey();
  if (!key) throw new Error('GOOGLE_AI_API_KEY (or GOOGLE_GEMINI_API_KEY) not configured');

  const {
    prompt,
    model = DEFAULT_GEMINI_MODEL,
    systemInstruction,
    temperature = 0.2,
    maxOutputTokens = 8192,
    urlContext = false,
    grounding = true,
    timeoutMs = 60_000,
  } = opts;

  const tools: Record<string, unknown>[] = [];
  if (grounding) tools.push({ googleSearch: {} });
  if (urlContext) tools.push({ urlContext: {} });

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens },
  };
  if (tools.length) body.tools = tools;
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    // 429 = quota exhausted / rate limited; 503 = service overloaded.
    // Surface as a typed error so callers can degrade gracefully instead of crashing.
    if (res.status === 429 || res.status === 503) {
      throw new GeminiQuotaError(`Gemini ${res.status}: ${msg.slice(0, 300)}`);
    }
    throw new Error(`Gemini ${res.status}: ${msg.slice(0, 300)}`);
  }

  const data = await res.json();
  // Gemini 2.5 emits thinking parts (thought: true) before the real output; pick the
  // first non-thinking text part.
  const parts: Array<{ thought?: boolean; text?: string }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  const outputPart = parts.find((p) => !p.thought && p.text) ?? parts[0];
  const text: string = outputPart?.text ?? '';
  const finishReason: string = data?.candidates?.[0]?.finishReason ?? 'unknown';

  return { text, finishReason, rawSources: extractGroundingSources(data), data };
}

/** Pull citation URIs from a Gemini response's groundingMetadata. */
export function extractGroundingSources(data: any): RawSource[] {
  const gm = data?.candidates?.[0]?.groundingMetadata;
  const out: RawSource[] = [];
  for (const chunk of gm?.groundingChunks ?? []) {
    if (chunk?.web?.uri) out.push({ uri: chunk.web.uri, title: chunk.web.title });
  }
  for (const support of gm?.groundingSupports ?? []) {
    if (support?.web?.uri) out.push({ uri: support.web.uri, title: support.web.title });
  }
  return out;
}

// =============================================================================
// URL QUALITY: resolve redirects, validate, deep-link to the exact spot
// =============================================================================

const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'democraticviews.org',
  'conservapedia.com',
  'rationalwiki.org',
  // Video platforms (block embedding, hard to cite a specific quote)
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'tiktok.com',
  // Social platforms (often block embedding, ephemeral)
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
];

export function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return true; // unparseable → block
  }
}

export function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return 'Source';
  }
}

/** Check a URL is reachable (HEAD, then GET fallback for servers that reject HEAD). */
export async function validateUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), timeout);
    const head = await fetch(url, { method: 'HEAD', signal: c1.signal, redirect: 'follow' });
    clearTimeout(t1);
    if (head.ok) return true;

    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), timeout);
    const get = await fetch(url, { method: 'GET', signal: c2.signal, redirect: 'follow' });
    clearTimeout(t2);
    return get.ok && (get.headers.get('content-type')?.includes('text/html') ?? true);
  } catch {
    return false;
  }
}

const REDIRECT_STUB = 'grounding-api-redirect';
// A browser UA is required: Gemini's grounding redirect 403s a bare/HEAD fetch, which left
// the opaque stub unresolved in production. GET + UA resolves it to the real destination.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function isUnresolvedRedirectStub(url: string): boolean {
  return url.includes(REDIRECT_STUB);
}

/** Follow Gemini's grounding redirect to the real destination URL (deep link, not redirect). */
export async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) return url;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA },
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Normal case: the HTTP redirect chain resolved to the real page.
    if (res.url && !res.url.includes(REDIRECT_STUB)) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      return res.url;
    }
    // Some redirects are delivered as a meta-refresh / anchor inside a 200 body rather than
    // a 3xx — dig the destination out of the HTML.
    const html = await res.text();
    const m = html.match(/(?:url=|href=["'])(https?:\/\/[^"'\s>]+)/i);
    return m?.[1] ?? url;
  } catch {
    return url;
  }
}

/**
 * Deep-link to the exact spot: append a Text Fragment (`#:~:text=`) built from a verbatim
 * quote so a supporting browser scrolls to and highlights it. https://web.dev/text-fragments/
 */
export function createTextFragmentUrl(baseUrl: string, quote: string): string {
  if (!quote || quote.length < 10) return baseUrl;
  const urlWithoutFragment = baseUrl.split('#')[0];
  const cleanQuote = quote
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${urlWithoutFragment}#:~:text=${encodeURIComponent(cleanQuote)}`;
}

export interface ResolveOptions {
  /** Verbatim quote → text-fragment anchor applied to the first (best) source. */
  keyQuote?: string;
  /** Max sources to resolve+validate (each does a network round-trip). */
  limit?: number;
  /** Skip the reachability check (faster, but may keep dead links). */
  skipValidation?: boolean;
}

/**
 * Turn raw grounding citations into clean, deep, validated source URLs:
 * dedupe → resolve redirects → drop blocked/dead → deep-link the best one to the exact quote.
 */
export async function resolveGroundedSources(
  rawSources: RawSource[],
  opts: ResolveOptions = {},
): Promise<ResolvedSource[]> {
  const { keyQuote, limit = 5, skipValidation = false } = opts;
  const seen = new Set<string>();
  const resolved: ResolvedSource[] = [];

  for (const src of rawSources.slice(0, Math.max(limit * 2, limit))) {
    if (resolved.length >= limit) break;
    if (!src?.uri || seen.has(src.uri)) continue;
    seen.add(src.uri);

    const real = await resolveRedirectUrl(src.uri);
    // Never store an opaque, unresolved grounding-redirect stub — it's a useless citation.
    // Better to drop it and rely on the model's stated deep URLs.
    if (isUnresolvedRedirectStub(real)) continue;
    if (isBlockedDomain(real)) continue;
    if (!skipValidation && !(await validateUrl(real))) continue;

    resolved.push({ url: real, title: src.title || extractDomainName(real) });
  }

  // Deep-link the best (first) source to the exact spot on the page.
  if (keyQuote && resolved.length) {
    resolved[0] = { ...resolved[0], url: createTextFragmentUrl(resolved[0].url, keyQuote) };
  }
  return resolved;
}
