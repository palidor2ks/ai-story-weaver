import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.piscatawaynj.org/government/elected_officials';

// official id (from static_officials) -> profile page
const TARGETS: Array<{ id: string; url: string }> = [
  { id: 'mayor_nj_piscataway', url: `${BASE}/mayor_brian_wahler.php` },
  { id: 'local_nj_piscataway_town_council_member_michele_lombardi',  url: `${BASE}/ward_4_councilmember.php` },
  { id: 'local_nj_piscataway_town_council_member_sharon_carmichael', url: `${BASE}/ward_3_councilmember.php` },
  { id: 'local_nj_piscataway_town_council_member_gabrielle_cahill',  url: `${BASE}/at-large_councilmember1.php` },
  { id: 'local_nj_piscataway_town_council_member_laura_leibowitz',   url: `${BASE}/at-large_councilmember2.php` },
  { id: 'local_nj_piscataway_town_council_member_sarah_rashid',      url: `${BASE}/at-large_councilmember3.php` },
  { id: 'local_nj_piscataway_town_council_member_frank_uhrin',       url: `${BASE}/ward_1_councilmember.php` },
  { id: 'local_nj_piscataway_town_council_member_dennis_espinosa',   url: `${BASE}/ward_2_councilmember.php` },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&[a-z]+;/gi, ' ');
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPost(html: string): string | null {
  const m = html.match(/<div id="post"[^>]*>([\s\S]*?)<!-- \/#post -->/i);
  return m ? m[1] : null;
}

function extractFirstImage(postHtml: string, baseUrl: string): string | null {
  // Prefer images that look like portraits (contain name token), else first non-icon
  const imgs = [...postHtml.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const src of imgs) {
    const lower = src.toLowerCase();
    if (lower.includes('logo') || lower.includes('icon') || lower.includes('cleardot')) continue;
    return src.startsWith('http') ? src : new URL(src, baseUrl).toString();
  }
  return null;
}

function extractTermEnd(text: string): string | null {
  // e.g. "Her current term expires on December 31, 2026."
  const m = text.match(/term expires (?:on )?([A-Z][a-z]+ \d{1,2},\s*\d{4})/i);
  if (!m) return null;
  const d = new Date(m[1]);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractEmail(html: string): string | null {
  const m = html.match(/mailto:([^"'?\s>]+)/i);
  return m ? m[1].trim() : null;
}

function extractPhone(text: string): string | null {
  const m = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return m ? m[0] : null;
}

async function processOne(supabase: any, t: { id: string; url: string }) {
  const res = await fetch(t.url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!res.ok) {
    return { id: t.id, ok: false, error: `HTTP ${res.status}` };
  }
  const html = await res.text();
  const postHtml = extractPost(html);
  if (!postHtml) return { id: t.id, ok: false, error: 'no #post block' };

  const bioRaw = stripHtml(postHtml);
  const bio = bioRaw && !/^coming soon/i.test(bioRaw) && bioRaw.length > 40 ? bioRaw.slice(0, 4000) : null;
  const photo = extractFirstImage(postHtml, t.url);
  const email = extractEmail(html);
  const phone = extractPhone(bioRaw);
  const termEnd = bio ? extractTermEnd(bio) : null;

  const update: Record<string, unknown> = {
    website_url: t.url,
    source_url: t.url,
    source_last_fetched_at: new Date().toISOString(),
  };
  if (bio) update.bio = bio;
  if (email) update.email = email;
  if (phone) update.phone = phone;
  if (termEnd) update.term_end = termEnd;
  if (photo) update.image_url = photo;

  const { error } = await supabase.from('static_officials').update(update).eq('id', t.id);
  if (error) return { id: t.id, ok: false, error: error.message };

  return {
    id: t.id,
    ok: true,
    fields: Object.keys(update),
    bio_chars: bio?.length ?? 0,
    photo: photo ?? null,
    term_end: termEnd ?? null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: must be admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    for (const t of TARGETS) {
      try {
        results.push(await processOne(supabase, t));
      } catch (e) {
        results.push({ id: t.id, ok: false, error: (e as Error).message });
      }
      // small delay to be polite
      await new Promise(r => setTimeout(r, 250));
    }

    const ok = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      updated: ok,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[scrape-piscataway-officials] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
