import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface Person {
  name: string;
  office?: string;
  state?: string;
  district?: string;
}

interface RequestBody {
  people: Person[];
  topics?: string[];
  district?: string;
  state?: string;
  limit?: number;
}

interface FeedNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet?: string;
  matchedPeople: string[];
  matchedTopics: string[];
  relevanceScore: number;
  isTopTopicHit: boolean;
  isNew: boolean;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
   .replace(/&nbsp;/g, ' ')
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
   .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const stripTags = (s: string) => s.replace(/<\/?[a-z][^>]*>/gis, '').replace(/<[^>]*>/g, '').trim();

const cleanText = (s: string) =>
  decodeEntities(stripTags(s.replace(/<!\[CDATA\[|\]\]>/g, ''))).replace(/\s+/g, ' ').trim();

const cleanSnippet = (s: string): string => {
  let t = cleanText(s);
  // Strip leftover URLs / href fragments
  t = t.replace(/https?:\/\/\S+/g, '').replace(/href\s*=\s*["'][^"']*["']/gi, '').trim();
  if (t.length < 20) return '';
  if (t.startsWith('<') || t.startsWith('http')) return '';
  return t.slice(0, 200);
};

const isGoogleHost = (u: string): boolean => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === 'news.google.com' || h.endsWith('.google.com') || h === 'google.com';
  } catch { return false; }
};

const googleNewsSearchUrl = (title: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(title)}&tbm=nws`;

const decodeGoogleNewsUrl = (googleUrl: string): string | null => {
  try {
    const url = new URL(googleUrl);
    if (!isGoogleHost(url.toString())) return null;
    const token = url.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/)?.[1];
    if (!token) return null;

    const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const matches = decoded.match(/https?:\/\/[^\u0000-\u001f\u007f\s<>"'\\]+/gi) || [];

    for (const candidate of matches) {
      const cleaned = candidate.replace(/[),.;]+$/g, '');
      const parsed = new URL(cleaned);
      if (!isGoogleHost(parsed.toString())) return parsed.toString();
    }
  } catch { /* ignore malformed Google News tokens */ }
  return null;
};

const resolveCache = new Map<string, string>();

async function resolveGoogleNewsUrl(googleUrl: string): Promise<string> {
  if (resolveCache.has(googleUrl)) return resolveCache.get(googleUrl)!;
  const decoded = decodeGoogleNewsUrl(googleUrl);
  if (decoded) {
    resolveCache.set(googleUrl, decoded);
    return decoded;
  }
  let current = googleUrl;
  for (let i = 0; i < 3; i++) {
    if (!isGoogleHost(current)) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0)' },
      });
      await res.body?.cancel();
      const loc = res.headers.get('location');
      if (loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      // Try parsing HTML for a meta refresh / canonical link as last resort
      break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  resolveCache.set(googleUrl, current);
  return current;
}

const cleanTitle = (raw: string, source: string) => {
  let t = cleanText(raw);
  if (source) {
    const src = source.trim();
    // Remove trailing " - Source" (Google News pattern)
    const re = new RegExp('\\s+[-–—]\\s+' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    t = t.replace(re, '');
  }
  // Generic fallback: trailing " - Something" (only if dash present and tail is short-ish)
  const m = t.match(/^(.*?)\s+[-–—]\s+([^-–—]{2,60})$/);
  if (m && !source) t = m[1].trim();
  return t;
};

const extractPublisherUrl = (description: string, fallback: string): string => {
  // Google News descriptions embed <a href="https://publisher..."> to the article
  const matches = [...description.matchAll(/href=["']([^"']+)["']/gi)];
  for (const m of matches) {
    const href = decodeEntities(m[1]);
    try {
      const u = new URL(href);
      if (!/news\.google\.com$/i.test(u.hostname) && !/google\.com$/i.test(u.hostname)) {
        return href;
      }
    } catch { /* ignore */ }
  }
  return fallback;
};

const lastNameOf = (name: string): string => {
  const cleaned = name.replace(/[.,]/g, ' ').trim();
  if (name.includes(',')) return cleaned.split(/\s+/)[0];
  const parts = cleaned.split(/\s+/).filter(p => !/^(jr|sr|ii|iii|iv)$/i.test(p));
  return parts[parts.length - 1] || cleaned;
};

const fullNameOf = (name: string): string => {
  if (name.includes(',')) {
    const [last, rest] = name.split(',');
    return `${rest.trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
  }
  return name.trim();
};

const chamberKeyword = (office?: string): string | null => {
  const o = (office || '').toLowerCase();
  if (/senate|senator/.test(o)) return 'senator';
  if (/house|representative|congress/.test(o)) return 'representative';
  if (/governor/.test(o)) return 'governor';
  if (/mayor/.test(o)) return 'mayor';
  if (/president/.test(o)) return 'president';
  return null;
};

function buildQueries(people: Person[], state?: string, district?: string): string[] {
  const qs = new Set<string>();
  for (const p of people) {
    const full = fullNameOf(p.name);
    const ch = chamberKeyword(p.office);
    qs.add(ch ? `"${full}" ${ch}` : `"${full}"`);
  }
  if (state && district) {
    const stName = STATE_NAMES[state.toUpperCase()] || state;
    const dNum = String(parseInt(String(district).replace(/\D/g, ''), 10) || '');
    if (dNum) {
      qs.add(`"${state.toUpperCase()}-${dNum.padStart(2, '0')}"`);
      qs.add(`"${stName}" "${dNum}th district"`);
    }
  }
  return Array.from(qs).slice(0, 8);
}

interface ParsedItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
}

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const pickRaw = (tag: string) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const r = block.match(re);
      return r ? r[1] : '';
    };
    items.push({
      title: pickRaw('title'),
      link: cleanText(pickRaw('link')),
      pubDate: cleanText(pickRaw('pubDate')),
      source: cleanText(pickRaw('source')) || 'Google News',
      description: pickRaw('description'),
    });
  }
  return items;
}

async function fetchRss(query: string): Promise<ParsedItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0)' },
    });
    if (!res.ok) {
      await res.text();
      return [];
    }
    const xml = await res.text();
    return parseRss(xml);
  } catch (e) {
    console.error('rss fetch failed', query, e);
    return [];
  }
}

function urlKey(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname + x.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return u.toLowerCase();
  }
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body: RequestBody = await req.json();
    const people = Array.isArray(body.people) ? body.people.slice(0, 12) : [];
    const topics = (body.topics || []).map(t => t.toLowerCase()).filter(Boolean);
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

    if (people.length === 0) {
      return new Response(JSON.stringify({ items: [], window: 'none' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queries = buildQueries(people, body.state, body.district);
    const results = await Promise.all(queries.map(fetchRss));
    const allItems = results.flat();

    const now = Date.now();
    const dedup = new Map<string, FeedNewsItem & { ageHours: number }>();
    const fallbackDedup = new Map<string, FeedNewsItem & { ageHours: number }>();

    for (const it of allItems) {
      if (!it.link || !it.title) continue;
      const cleanedTitle = cleanTitle(it.title, it.source);
      const cleanedSnippet = cleanSnippet(it.description);
      const finalUrl = extractPublisherUrl(it.description, it.link);
      const key = urlKey(finalUrl);
      const text = `${cleanedTitle} ${cleanedSnippet}`.toLowerCase();
      const publishedMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
      const ageHours = isNaN(publishedMs) ? 999999 : (now - publishedMs) / 36e5;

      const matchedPeople: string[] = [];
      for (const p of people) {
        const full = fullNameOf(p.name).toLowerCase();
        const last = lastNameOf(p.name).toLowerCase();
        const ch = chamberKeyword(p.office);
        if (full && text.includes(full)) matchedPeople.push(p.name);
        else if (last && last.length > 3 && text.includes(last) && ch && text.includes(ch)) {
          matchedPeople.push(p.name);
        }
      }

      const matchedTopics: string[] = [];
      for (const t of topics) {
        if (t.length > 2 && text.includes(t)) matchedTopics.push(t);
      }

      let score = 0;
      score += Math.min(matchedPeople.length, 3) * 3;
      score += Math.min(matchedTopics.length, 3);
      if (body.state && body.district) {
        const dNum = String(parseInt(String(body.district).replace(/\D/g, ''), 10) || '');
        const dPat = `${body.state.toLowerCase()}-${dNum.padStart(2, '0')}`;
        if (text.includes(dPat)) score += 2;
      }
      if (ageHours <= 24) score += 2;
      else if (ageHours <= 72) score += 1;

      const item: FeedNewsItem & { ageHours: number } = {
        id: hashId(key),
        title: cleanedTitle,
        url: finalUrl,
        source: it.source,
        publishedAt: !isNaN(publishedMs) ? new Date(publishedMs).toISOString() : new Date().toISOString(),
        snippet: cleanedSnippet,
        matchedPeople,
        matchedTopics,
        relevanceScore: score,
        isTopTopicHit: matchedTopics.length > 0,
        isNew: ageHours <= 48,
        ageHours,
      };

      if (matchedPeople.length === 0) continue;
      if (score < 3) {
        if (score >= 1) {
          const existingFallback = fallbackDedup.get(key);
          if (!existingFallback || existingFallback.relevanceScore < score) fallbackDedup.set(key, item);
        }
        continue;
      }

      const existing = dedup.get(key);
      if (!existing || existing.relevanceScore < score) dedup.set(key, item);
    }

    const sourceMap = dedup.size > 0 ? dedup : fallbackDedup;
    const all = Array.from(sourceMap.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore || +new Date(b.publishedAt) - +new Date(a.publishedAt),
    );

    const today = all.filter(i => i.ageHours <= 24);
    const week = all.filter(i => i.ageHours <= 24 * 7);
    const month = all.filter(i => i.ageHours <= 24 * 30);

    let chosen: typeof all = [];
    let windowLabel: 'today' | 'week' | 'month' | 'none' = 'none';
    if (today.length > 0) { chosen = today; windowLabel = 'today'; }
    else if (week.length > 0) { chosen = week; windowLabel = 'week'; }
    else if (month.length > 0) { chosen = month; windowLabel = 'month'; }

    // Resolve Google News redirect URLs to publisher URLs (only for chosen items)
    const sliced = chosen.slice(0, limit);
    await Promise.all(sliced.map(async (it) => {
      if (isGoogleHost(it.url)) {
        const resolved = await resolveGoogleNewsUrl(it.url);
        if (!isGoogleHost(resolved)) it.url = resolved;
        else if (it.title) it.url = googleNewsSearchUrl(it.title);
      }
    }));
    const items = sliced
      .filter(it => it.title || !isGoogleHost(it.url))
      .map(({ ageHours: _a, ...rest }) => rest);

    return new Response(JSON.stringify({ items, window: windowLabel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message, items: [], window: 'none' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
