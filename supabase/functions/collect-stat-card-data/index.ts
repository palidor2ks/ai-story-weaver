import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  sourceUrl: z.string().url(),
  statTitle: z.string().min(3).max(140).optional(),
  statValue: z.string().min(1).max(80).optional(),
  statContext: z.string().max(240).optional(),
  sourceLabel: z.string().max(80).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

function textBetween(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  if (!match?.[1]) return '';
  return decodeHtml(match[1].replace(/\s+/g, ' ').trim());
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return textBetween(
    html,
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
  ) || textBetween(
    html,
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i'),
  );
}

function cleanVisibleText(html: string) {
  return decodeHtml(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferStatValue(text: string) {
  const patterns = [
    /\$\s?\d[\d,.]*(?:\s?(?:million|billion|trillion|m|bn|k))?/i,
    /\d[\d,.]*\s?%/i,
    /\d[\d,.]*\s?(?:votes|donors|contributions|bills|candidates|committees|people|users)/i,
    /\d[\d,.]*/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return '';
}

function sentenceWith(value: string, text: string) {
  if (!value) return '';
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`[^.!?]{0,120}${escaped}[^.!?]{0,160}[.!?]?`, 'i'));
  return match?.[0]?.replace(/\s+/g, ' ').trim() ?? '';
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('unauthorized');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error('unauthorized');

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin, error } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error) throw error;
  if (!isAdmin) throw new Error('forbidden');
  return { admin, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { admin, userId } = await requireAdmin(req);
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const input = parsed.data;
    const url = new URL(input.sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol) || isBlockedHost(url.hostname)) {
      return json({ error: 'Unsupported or unsafe source URL' }, 400);
    }

    const fetched = await fetch(url.toString(), {
      headers: { 'User-Agent': 'PoliPulseStatCardBot/1.0 (+https://polipulseapp.com)' },
      redirect: 'follow',
    });
    if (!fetched.ok) return json({ error: `Source fetch failed with ${fetched.status}` }, 502);

    const contentType = fetched.headers.get('content-type') ?? '';
    const raw = await fetched.text();
    const title = extractMeta(raw, 'og:title') || textBetween(raw, /<title[^>]*>([\s\S]*?)<\/title>/i) || url.hostname;
    const description = extractMeta(raw, 'og:description') || extractMeta(raw, 'description');
    const visibleText = cleanVisibleText(raw).slice(0, 8000);
    const corpus = `${title}. ${description}. ${visibleText}`;
    const statValue = input.statValue?.trim() || inferStatValue(corpus) || 'Review needed';
    const statContext = input.statContext?.trim() || sentenceWith(statValue, corpus) || description || `Pulled from ${url.hostname}.`;
    const statTitle = input.statTitle?.trim() || title.slice(0, 140);
    const sourceLabel = input.sourceLabel?.trim() || url.hostname.replace(/^www\./, '');
    const caption = `${statTitle}: ${statValue}\n\n${statContext}\n\nSource: ${sourceLabel}`.slice(0, 500);

    const { data, error } = await admin
      .from('social_stat_cards')
      .insert({
        source_url: url.toString(),
        source_title: title,
        stat_title: statTitle,
        stat_value: statValue,
        stat_context: statContext.slice(0, 240),
        source_label: sourceLabel,
        caption,
        created_by: userId,
        metadata: {
          content_type: contentType,
          source_description: description,
          extracted_at: new Date().toISOString(),
        },
      })
      .select('*')
      .single();
    if (error) throw error;

    return json({ card: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500;
    return json({ error: message }, status);
  }
});
