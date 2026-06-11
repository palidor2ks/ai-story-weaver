// Pure helpers for the statement evidence index (option 2 — see
// docs/answers-enrichment-part1b-plan.md §"Where this goes next"). Dependency-free so bun
// can unit-test them; the spike ingester and the eventual production drain share them.

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string | null; // raw pubDate text; normalizeFeedDate() for ISO
  bodyHtml?: string | null;   // RSS content:encoded/description payload — preferred body
                              // source: many member feeds carry the full release, which
                              // sidesteps the house.gov bot-wall the spike hit on page fetches
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“',
  '&mdash;': '—', '&ndash;': '–',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ');
}

function tagText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>(?:\\s*<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>\\s*)?</${tag}>`, 'i'));
  return m ? decodeEntities(m[1].trim()) : null;
}

// RSS 2.0 <item> parser (the dominant format on congressional newsrooms). Atom entries
// (<entry> + <link href>) are handled as a fallback shape.
export function parseFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const rssBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const b of rssBlocks) {
    const url = tagText(b, 'link') ?? tagText(b, 'guid');
    const title = tagText(b, 'title');
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const bodyHtml = tagText(b, 'content:encoded') ?? tagText(b, 'description');
    items.push({ title: title ?? url, url, publishedAt: tagText(b, 'pubDate'), bodyHtml });
  }
  if (items.length > 0) return items;

  const atomBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of atomBlocks) {
    const href = b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    if (!href || !/^https?:\/\//i.test(href)) continue;
    items.push({
      title: tagText(b, 'title') ?? href,
      url: decodeEntities(href),
      publishedAt: tagText(b, 'updated') ?? tagText(b, 'published'),
    });
  }
  return items;
}

// Crude-but-honest text extraction for spike purposes: drop non-content blocks, strip
// tags, decode entities, squeeze whitespace. Production can revisit with a real parser.
export function stripHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s>][\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>(?=.)/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Raw feed dates ("Tue, 09 Jul 2024 12:00:00 GMT", ISO, etc.) → ISO timestamp or null.
export function normalizeFeedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function absolutizeUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// <link rel="alternate" type="application/rss+xml" href="..."> discovery on a homepage.
export function extractRssLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0];
    if (!/application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href="([^"]+)"/i)?.[1];
    const abs = href ? absolutizeUrl(baseUrl, decodeEntities(href)) : null;
    if (abs) out.push(abs);
  }
  return out;
}

// Common newsroom feed locations on house.gov / senate.gov member sites — probed in
// order when the homepage advertises no feed. The spike measures which ones actually hit.
export function candidateFeedPaths(siteUrl: string): string[] {
  const base = siteUrl.replace(/\/+$/, '');
  return [
    `${base}/rss.xml`,
    `${base}/feed`,
    `${base}/feed/`,
    `${base}/media/press-releases/feed`,
    `${base}/press-releases/feed`,
    `${base}/news/feed`,
    `${base}/rss/feeds`,
  ];
}

// HTML-listing fallback: collect same-host links that look like individual press
// releases from a newsroom listing page.
export function extractPressLinks(html: string, baseUrl: string, cap = 20): FeedItem[] {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const abs = absolutizeUrl(baseUrl, decodeEntities(m[1]));
    if (!abs) continue;
    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      continue;
    }
    if (u.hostname !== host) continue;
    if (!/(press|news|release|statement|media)/i.test(u.pathname)) continue;
    // listing/landing pages, not individual items — EXCEPT query-string item URLs:
    // several Senate CMSes serve releases as /news/press-releases?ID=… (the Lee pattern
    // the 2026-06-11 spike missed), where the pathname alone looks like a listing
    if (/\/(press(-releases?)?|news|media|newsroom|statements?)\/?$/i.test(u.pathname) && !u.search) continue;
    const text = stripHtmlToText(m[2]);
    if (text.length < 15) continue; // nav crumbs / "Read more"
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ title: text.slice(0, 300), url: abs, publishedAt: null });
    if (out.length >= cap) break;
  }
  return out;
}
