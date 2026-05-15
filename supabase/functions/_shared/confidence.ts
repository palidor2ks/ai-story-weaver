// Deterministic confidence scoring for AI analysis edge functions.
// Based on verified provider citations only (Perplexity / You.com search results),
// never on model-emitted `parsed.sources`, to prevent self-inflated scores.

const RELIABILITY: Array<[string[], number]> = [
  [["fec.gov", "congress.gov", "senate.gov", "house.gov", "supremecourt.gov", "sec.gov"], 1.0],
  [["opensecrets.org", "propublica.org", "followthemoney.org", "ballotpedia.org", "votesmart.org"], 0.9],
  [["reuters.com", "apnews.com", "nytimes.com", "washingtonpost.com", "wsj.com", "bloomberg.com"], 0.8],
  [["politico.com", "thehill.com", "axios.com", "npr.org", "bbc.com", "theguardian.com", "cnn.com", "foxnews.com"], 0.65],
];

export function getDomainReliability(input: string | undefined | null): number {
  if (!input) return 0;
  let host = "";
  try {
    host = new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = String(input).toLowerCase().replace(/^www\./, "");
  }
  if (!host) return 0;
  for (const [domains, score] of RELIABILITY) {
    if (domains.some((d) => host === d || host.endsWith("." + d))) return score;
  }
  return 0.4;
}

export function computeDeterministicConfidence(
  verifiedSources: Array<{ url?: string | null }> | null | undefined,
): number {
  const list = Array.isArray(verifiedSources) ? verifiedSources : [];
  if (list.length === 0) return 0;

  const sourceCountScore = Math.min(list.length / 6, 1);
  const reliabilities = list.map((s) => getDomainReliability(s?.url ?? ""));
  const avgReliability = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;

  const score = 100 * (0.55 * sourceCountScore + 0.45 * avgReliability);
  return Math.max(0, Math.min(100, Math.floor(score)));
}
