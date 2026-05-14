import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  matchedPeople: string[];
  matchedTopics: string[];
  relevanceScore: number;
  isTopTopicHit: boolean;
  isNew: boolean;
};

const decode = (s: string) => s.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const pickTag = (xml: string, tag: string): string => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
};

const hash = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { people = [], topics = [], district = null, state = null, perPerson = 3 } = await req.json();
    const personList: string[] = (people || []).filter(Boolean).slice(0, 12);
    const topicList: string[] = (topics || []).filter(Boolean).slice(0, 10);

    const feeds = personList.slice(0, 6).map((person) => {
      const districtClause = district ? ` OR \"${state || ''}-${district}\"` : '';
      const q = encodeURIComponent(`\"${person}\" (${topicList.slice(0, 3).join(' OR ')})${districtClause}`);
      return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    });

    const all: Article[] = [];
    for (const feed of feeds) {
      const res = await fetch(feed);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, perPerson)) {
        const title = pickTag(item, 'title');
        const url = pickTag(item, 'link');
        const snippet = pickTag(item, 'description').replace(/<[^>]+>/g, '').slice(0, 260);
        const publishedAt = pickTag(item, 'pubDate');
        const source = pickTag(item, 'source') || 'Google News';

        const lowerText = `${title} ${snippet}`.toLowerCase();
        const matchedPeople = personList.filter(p => lowerText.includes(p.toLowerCase()));
        const matchedTopics = topicList.filter(t => lowerText.includes(t.toLowerCase()));
        const relevanceScore = (matchedPeople.length * 5) + (matchedTopics.length * 3);
        const isTopTopicHit = matchedTopics.length > 0;
        const isNew = Date.now() - new Date(publishedAt).getTime() < 1000 * 60 * 60 * 48;

        all.push({
          id: await hash(`${url}|${publishedAt}`),
          title,
          url,
          source,
          publishedAt,
          snippet,
          matchedPeople,
          matchedTopics,
          relevanceScore,
          isTopTopicHit,
          isNew,
        });
      }
    }

    const deduped = Array.from(new Map(all.map(a => [a.url, a])).values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 20);

    return new Response(JSON.stringify({ articles: deduped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error), articles: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
