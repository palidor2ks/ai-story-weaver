// Shared You.com Research API helper.
// Endpoint: POST https://api.you.com/v1/research
// Returns { output: { content, content_type, sources: [{title, url, ...}] } }

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

const YOU_ENDPOINT = "https://api.you.com/v1/research";

export async function callYouSmart(opts: {
  query: string;
  apiKey: string;
  systemPrompt?: string;
  researchEffort?: "lite" | "standard" | "deep" | "exhaustive";
}): Promise<YouResult> {
  const { query, apiKey, systemPrompt, researchEffort = "lite" } = opts;
  const composed = systemPrompt ? `${systemPrompt}\n\n${query}` : query;

  const resp = await fetch(YOU_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: composed.slice(0, 39000),
      research_effort: researchEffort,
    }),
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

  // Primary shape: { output: { content, sources } }
  // Defensive: also accept top-level/legacy shapes.
  const output = data?.output ?? {};
  const rawContent = output?.content ?? data?.answer ?? data?.message ?? "";
  const content: string =
    typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  const rawHits: any[] =
    (Array.isArray(output?.sources) && output.sources) ||
    (Array.isArray(data?.sources) && data.sources) ||
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
