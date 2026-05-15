// Shared You.com Smart/Research API helper.
// Used by AI analysis edge functions as a grounded-search fallback after Perplexity.

export interface YouCitation {
  title: string;
  url: string;
}

export interface YouResult {
  content: string;
  citations: YouCitation[];
}

export class YouError extends Error {
  status: number;
  code: "YOU_AUTH" | "YOU_RATE_LIMIT" | "YOU_ERROR";
  constructor(status: number, code: YouError["code"], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const YOU_ENDPOINT = "https://chat-api.you.com/smart";

export async function callYouSmart(opts: {
  query: string;
  apiKey: string;
  systemPrompt?: string;
}): Promise<YouResult> {
  const { query, apiKey, systemPrompt } = opts;
  const composed = systemPrompt ? `${systemPrompt}\n\n${query}` : query;

  const resp = await fetch(YOU_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: composed }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("You.com error", resp.status, text);
    if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
      throw new YouError(resp.status, "YOU_AUTH", "You.com API key invalid or out of quota.");
    }
    if (resp.status === 429) {
      throw new YouError(resp.status, "YOU_RATE_LIMIT", "You.com rate limit reached.");
    }
    throw new YouError(resp.status, "YOU_ERROR", `You.com service error (${resp.status}).`);
  }

  const data = await resp.json().catch(() => ({} as any));

  // Defensive shape parsing — You.com has shipped slightly different shapes.
  const content: string =
    data?.answer ??
    data?.message ??
    data?.choices?.[0]?.message?.content ??
    "";

  const rawHits: any[] =
    (Array.isArray(data?.search_results) && data.search_results) ||
    (Array.isArray(data?.hits) && data.hits) ||
    (Array.isArray(data?.citations) && data.citations) ||
    [];

  const citations: YouCitation[] = [];
  const seen = new Set<string>();
  for (const h of rawHits) {
    const url: string | undefined =
      typeof h === "string" ? h : (h?.url ?? h?.link ?? h?.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let title: string =
      (typeof h === "object" && (h?.title || h?.name)) || "";
    if (!title) {
      try { title = new URL(url).hostname.replace(/^www\./, ""); }
      catch { title = url; }
    }
    citations.push({ title, url });
  }

  return { content, citations };
}
