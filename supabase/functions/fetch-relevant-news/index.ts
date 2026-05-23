import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

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
  questionIds?: string[];
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
  topicLabel?: string;
  relatedQuestion?: string;
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

const googleNewsToken = (googleUrl: string): string | null => {
  try {
    const url = new URL(googleUrl);
    if (!isGoogleHost(url.toString())) return null;
    return url.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/)?.[1] || null;
  } catch { return null; }
};

async function decodeGoogleNewsWithBatch(token: string): Promise<string | null> {
  const paramsCtrl = new AbortController();
  const paramsTimer = setTimeout(() => paramsCtrl.abort(), 5000);
  let signature = '';
  let timestamp = '';
  try {
    const page = await fetch(`https://news.google.com/rss/articles/${token}`, {
      signal: paramsCtrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)' },
    });
    const html = await page.text();
    signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1] || '';
    timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1] || '';
  } catch { return null; }
  finally { clearTimeout(paramsTimer); }

  if (!signature || !timestamp) return null;

  const payload = [[[
    'Fbv4je',
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${token}",${timestamp},"${signature}"]`,
  ]]];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)',
        'Referer': 'https://news.google.com/',
      },
      body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
    });
    const text = await res.text();
    const parsed = JSON.parse(text.split('\n\n')[1] || '[]');
    const responsePayload = JSON.parse(parsed?.[0]?.[2] || '[]');
    const decoded = responsePayload?.[1];
    if (!decoded || typeof decoded !== 'string') return null;
    return isGoogleHost(decoded) ? null : decoded;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

const resolveCache = new Map<string, string>();

async function resolveGoogleNewsUrl(googleUrl: string): Promise<string> {
  if (resolveCache.has(googleUrl)) return resolveCache.get(googleUrl)!;
  const decoded = decodeGoogleNewsUrl(googleUrl);
  if (decoded) {
    resolveCache.set(googleUrl, decoded);
    return decoded;
  }
  const token = googleNewsToken(googleUrl);
  if (token) {
    const batchDecoded = await decodeGoogleNewsWithBatch(token);
    if (batchDecoded) {
      resolveCache.set(googleUrl, batchDecoded);
      return batchDecoded;
    }
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
  try {
    const u = new URL(decodeEntities(fallback));
    const publisher = u.searchParams.get('url');
    if (/bing\.com$/i.test(u.hostname) && publisher) return publisher;
  } catch { /* ignore */ }
  return fallback;
};

const lastNameOf = (name: string): string => {
  const normalized = fullNameOf(name).replace(/[.,]/g, ' ').trim();
  const parts = normalized.split(/\s+/).filter(p => !/^(jr|sr|ii|iii|iv)$/i.test(p));
  return parts[parts.length - 1] || normalized;
};

const fullNameOf = (name: string): string => {
  const raw = name.trim();
  if (raw.includes(',')) {
    const [beforeComma, afterComma = ''] = raw.split(',', 2).map(s => s.trim());
    if (/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(afterComma)) return beforeComma;
    return `${afterComma} ${beforeComma}`.replace(/\s+/g, ' ').trim();
  }
  const cleaned = raw.replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim();
  return cleaned;
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

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string;
  domain?: string;
  sourceCommonName?: string;
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
      source: cleanText(pickRaw('source') || pickRaw('News:Source')) || 'News',
      description: pickRaw('description'),
    });
  }
  return items;
}

async function fetchRss(query: string): Promise<ParsedItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)',
      },
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.warn('rss fetch non-ok', { query, status: res.status, preview: errorText.slice(0, 200) });
      return [];
    }
    const xml = await res.text();
    const parsed = parseRss(xml);
    if (parsed.length === 0) console.warn('rss returned no items', { query, status: res.status, preview: xml.slice(0, 200) });
    return parsed;
  } catch (e) {
    console.error('rss fetch failed', query, e);
    return [];
  }
}

async function fetchBingRss(query: string): Promise<ParsedItem[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)',
      },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch (e) {
    console.error('bing rss fetch failed', query, e);
    return [];
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchRssSequentially(queries: string[], limit: number): Promise<ParsedItem[]> {
  const items: ParsedItem[] = [];
  for (const query of queries) {
    if (items.length >= limit * 8) break;
    const parsed = await fetchRss(query);
    items.push(...parsed);
    if (query !== queries[queries.length - 1]) await delay(450);
  }
  return items;
}

async function fetchBingRssSequentially(queries: string[], limit: number): Promise<ParsedItem[]> {
  const items: ParsedItem[] = [];
  for (const query of queries.slice(0, 4)) {
    if (items.length >= limit * 4) break;
    const parsed = await fetchBingRss(query);
    items.push(...parsed);
    if (query !== queries[queries.length - 1]) await delay(300);
  }
  return items;
}

const parseGdeltDate = (raw?: string): string => {
  if (!raw) return new Date().toUTCString();
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return new Date(raw).toUTCString();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toUTCString();
};

async function fetchGdeltNews(people: Person[], limit: number): Promise<ParsedItem[]> {
  const primaryName = fullNameOf(people[0]?.name || '').trim();
  if (!primaryName) return [];
  const params = new URLSearchParams({
    query: `"${primaryName}"`,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(Math.min(Math.max(limit * 4, 10), 50)),
    sort: 'DateDesc',
    timespan: '1month',
    sourcelang: 'English',
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliPulse/1.0; +https://polipulseapp.com)' },
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn('gdelt fetch non-ok', { status: res.status, preview: text.slice(0, 120) });
      return [];
    }
    const json = JSON.parse(text) as { articles?: GdeltArticle[] };
    return (json.articles || []).map(a => ({
      title: a.title || '',
      link: a.url || '',
      pubDate: parseGdeltDate(a.seendate),
      source: a.sourceCommonName || a.domain || 'News',
      description: '',
    })).filter(a => a.title && a.link);
  } catch (e) {
    console.error('gdelt fetch failed', e);
    return [];
  } finally {
    clearTimeout(timer);
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


const titleSubjectKey = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|from|by|about|update|latest|breaking)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
};


async function resolveQuestionIds(
  supabase: ReturnType<typeof createClient>,
  explicitQuestionIds: string[],
  topics: string[],
): Promise<Array<{ id: string; text: string; topic_id: string | null; topic_name: string | null }>> {
  const seed = new Set(explicitQuestionIds.filter(Boolean));
  const topicCandidates = topics.filter(Boolean);
  if (topicCandidates.length > 0) {
    const { data } = await supabase
      .from('questions')
      .select('id')
      .in('topic_id', topicCandidates)
      .limit(500);
    for (const row of (data || []) as Array<{ id: string }>) seed.add(row.id);
  }
  const ids = Array.from(seed);
  if (ids.length === 0) return [];
  const { data: questions } = await supabase
    .from('questions')
    .select('id,text,topic_id,topics:topic_id(name)')
    .in('id', ids)
    .limit(500);

  return ((questions || []) as Array<any>).map((q) => ({
    id: q.id,
    text: q.text || '',
    topic_id: q.topic_id || null,
    topic_name: q.topics?.name || null,
  }));
}

interface ArticleClassification {
  is_policy_relevant: boolean;
  topic_id: string | null;
  question_ids: string[];
  confidence: 'high' | 'medium' | 'low';
}

async function classifyArticles(
  articles: Array<{ idx: number; title: string; snippet: string }>,
  topics: Array<{ id: string; name: string }>,
  questions: Array<{ id: string; text: string; topic_name: string | null }>,
): Promise<Map<number, ArticleClassification>> {
  const out = new Map<number, ArticleClassification>();
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || articles.length === 0 || questions.length === 0) return out;

  const topicList = topics.map(t => `- ${t.id}: ${t.name}`).join('\n');
  // Cap question list to avoid prompt bloat; prioritize unique by topic
  const cappedQuestions = questions.slice(0, 120);
  const questionList = cappedQuestions
    .map(q => `- ${q.id} [${q.topic_name || 'unknown'}]: ${q.text}`)
    .join('\n');
  const articleList = articles
    .map(a => `[${a.idx}] TITLE: ${a.title}\nSNIPPET: ${a.snippet || '(none)'}`)
    .join('\n\n');

  const systemPrompt = `You classify political news articles by policy topic and matching candidate quiz questions.

RULES:
- Horse-race, campaign-strategy, personnel, scandal, or "who's running in 2028" stories are NOT policy-relevant. Set is_policy_relevant=false, topic_id=null, question_ids=[].
- Only assign a topic_id from the provided list. If no topic clearly fits, topic_id=null.
- Only include question_ids when the article presents concrete evidence about a candidate's stance or action on THAT specific question. Maximum 2 IDs per article. If unsure, return [].
- confidence: "high" only when both topic and question are clearly evidenced. "medium" if topic is clear but question is approximate. "low" if either is a stretch — caller will then drop the labels.

Return strict JSON via the classify_articles tool.`;

  const userPrompt = `TOPICS:\n${topicList}\n\nQUESTIONS:\n${questionList}\n\nARTICLES:\n${articleList}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'classify_articles',
            description: 'Return classification for each article by index.',
            parameters: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      idx: { type: 'number' },
                      is_policy_relevant: { type: 'boolean' },
                      topic_id: { type: ['string', 'null'] },
                      question_ids: { type: 'array', items: { type: 'string' } },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['idx', 'is_policy_relevant', 'topic_id', 'question_ids', 'confidence'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['results'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'classify_articles' } },
      }),
    });

    if (!resp.ok) {
      console.warn('classifyArticles non-ok', resp.status, await resp.text().catch(() => ''));
      return out;
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return out;
    const parsed = JSON.parse(args);
    const validTopicIds = new Set(topics.map(t => t.id));
    const validQuestionIds = new Set(cappedQuestions.map(q => q.id));
    for (const r of (parsed.results || []) as Array<any>) {
      const topicId = r.topic_id && validTopicIds.has(r.topic_id) ? r.topic_id : null;
      const qIds = Array.isArray(r.question_ids)
        ? r.question_ids.filter((q: string) => validQuestionIds.has(q)).slice(0, 2)
        : [];
      out.set(Number(r.idx), {
        is_policy_relevant: !!r.is_policy_relevant,
        topic_id: topicId,
        question_ids: qIds,
        confidence: (r.confidence === 'high' || r.confidence === 'medium') ? r.confidence : 'low',
      });
    }
  } catch (err) {
    console.warn('classifyArticles error', err);
  }
  return out;
}


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Require an authenticated session to prevent anonymous abuse of external API
    // quotas and writes to the news cache tables.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    try {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const people = Array.isArray(body.people) ? body.people.slice(0, 12) : [];
    const topics = (body.topics || []).map(t => t.toLowerCase()).filter(Boolean);
    const explicitQuestionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (people.length === 0) {
      return new Response(JSON.stringify({ items: [], window: 'none' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve question IDs for caching. Only opt into the cache path when we have any —
    // legacy callers without questionIds keep the original network-only behavior.
    const questionMeta = await resolveQuestionIds(supabase, explicitQuestionIds, topics);
    const questionIds = questionMeta.map(q => q.id);
    const questionById = new Map(questionMeta.map(q => [q.id, q]));

    if (questionIds.length > 0) {
      const freshnessCutoff = new Date(Date.now() - 1000 * 60 * 30).toISOString();
      const { data: cachedRows } = await supabase
        .from('question_news_feed_cache')
        .select('rank_score, window_label, last_seen_at, question_id, article:news_articles!inner(id,title,url,source,published_at,snippet), qa:news_article_questions(question_id,matched_topics,question:questions(text,topics:topic_id(name)))')
        .in('question_id', questionIds)
        .gte('last_seen_at', freshnessCutoff)
        .order('rank_score', { ascending: false })
        .limit(limit * 3);

      if ((cachedRows || []).length > 0) {
        const dedupCache = new Map<string, FeedNewsItem>();
        for (const row of cachedRows || []) {
          const article = (row as any).article;
          if (!article?.url || dedupCache.has(article.url)) continue;
          dedupCache.set(article.url, {
            id: article.id,
            title: article.title,
            url: article.url,
            source: article.source,
            publishedAt: article.published_at,
            snippet: article.snippet || '',
            matchedPeople: [],
            matchedTopics: [],
            relevanceScore: (row as any).rank_score || 0,
            isTopTopicHit: false,
            isNew: (Date.now() - new Date(article.published_at).getTime()) <= 48 * 36e5,
            topicLabel: (row as any)?.qa?.[0]?.question?.topics?.name || questionById.get((row as any).question_id)?.topic_name || undefined,
            relatedQuestion: (row as any)?.qa?.[0]?.question?.text || questionById.get((row as any).question_id)?.text || undefined,
          });
        }
        const cachedItems = Array.from(dedupCache.values()).slice(0, limit);
        const cachedWindow = ((cachedRows?.[0] as any)?.window_label as 'today' | 'week' | 'month' | 'none') || 'none';
        return new Response(JSON.stringify({ items: cachedItems, window: cachedWindow }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const queries = buildQueries(people, body.state, body.district);
    const bingItems = await fetchBingRssSequentially(queries, limit);
    const gdeltItems = await fetchGdeltNews(people, limit);
    const rssItems: ParsedItem[] = [];
    const allItems = [...rssItems, ...bingItems, ...gdeltItems];
    console.info('relevant-news rss results', { queries: queries.length, googleItems: rssItems.length, bingItems: bingItems.length, gdeltItems: gdeltItems.length, allItems: allItems.length });

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
    const allRanked = Array.from(sourceMap.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore || +new Date(b.publishedAt) - +new Date(a.publishedAt),
    );
    const subjectDedup = new Map<string, (FeedNewsItem & { ageHours: number })>();
    for (const article of allRanked) {
      const subject = titleSubjectKey(article.title);
      const existing = subjectDedup.get(subject);
      if (!existing || existing.relevanceScore < article.relevanceScore || +new Date(existing.publishedAt) < +new Date(article.publishedAt)) {
        subjectDedup.set(subject, article);
      }
    }
    const all = Array.from(subjectDedup.values()).sort((a, b) => b.relevanceScore - a.relevanceScore || +new Date(b.publishedAt) - +new Date(a.publishedAt));
    console.info('relevant-news filtered results', { strict: dedup.size, fallback: fallbackDedup.size, candidates: all.length });

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
        else it.url = '';
      }
    }));
    const items = sliced
      .filter(it => !!it.title && !!it.url && !isGoogleHost(it.url))
      .map((it) => {
        const matchedQuestion = questionMeta.find(q => it.matchedTopics.includes((q.topic_name || '').toLowerCase()) || topics.includes((q.topic_name || '').toLowerCase()));
        const { ageHours: _a, ...rest } = it;
        return {
          ...rest,
          topicLabel: matchedQuestion?.topic_name || rest.matchedTopics[0],
          relatedQuestion: matchedQuestion?.text,
        };
      });

    // Persist into cache for future requests scoped to these questions.
    if (items.length > 0 && questionIds.length > 0) {
      EdgeRuntime.waitUntil((async () => {
        try {
          for (const item of items) {
            const { data: article } = await supabase
              .from('news_articles')
              .upsert({
                url: item.url,
                title: item.title,
                source: item.source,
                published_at: item.publishedAt,
                snippet: item.snippet || null,
              }, { onConflict: 'url' })
              .select('id')
              .single();

            if (!article?.id) continue;

            for (const questionId of questionIds) {
              await supabase.from('news_article_questions').upsert({
                article_id: article.id,
                question_id: questionId,
                relevance_score: item.relevanceScore,
                matched_people: item.matchedPeople,
                matched_topics: item.matchedTopics,
              }, { onConflict: 'article_id,question_id' });

              await supabase.from('question_news_feed_cache').upsert({
                question_id: questionId,
                article_id: article.id,
                rank_score: item.relevanceScore,
                window_label: windowLabel,
                last_seen_at: new Date().toISOString(),
              }, { onConflict: 'question_id,article_id' });
            }
          }
        } catch (err) {
          console.error('news cache persist failed', err);
        }
      })());
    }

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
