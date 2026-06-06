// Cron-invoked (daily) OR admin-invoked (the "Generate now" button).
//
// Substack has no publishing API, so this never posts anything. It compiles the
// recent social_posts (the stat cards already curated for X/TikTok) into one
// long-form Markdown newsletter "digest" and stores it as a DRAFT for an admin
// to review, copy, and paste into Substack.
//
// Two modes:
//   - Daily cron (body {}): only generates when substack_enabled is on AND a new
//     edition is due per substack_frequency_days. Otherwise a no-op.
//   - Manual (body { force: true }): the admin button generates immediately,
//     bypassing the enabled/cadence gates (but still no-ops with no content).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const aiKey = Deno.env.get('LOVABLE_API_KEY');
const PUBLIC_SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.polipulseapp.com').replace(/\/+$/, '');

const DAY_MS = 86_400_000;
const MAX_ITEMS = 24;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface DigestItem {
  label: string;
  typeLabel: string;
  blurb: string;
  url: string;
}

const TYPE_LABELS: Record<string, string> = {
  rep_profile: 'Representative',
  candidate: 'Representative',
  ai_analysis: 'Analysis',
  committee_spender: 'Top PAC spender',
  top_donor: 'Top donor',
};

// Profile link per subject type — mirrors _shared/social-card.ts targetUrl logic.
function profileUrl(subjectType: string, subjectId: string): string {
  const id = encodeURIComponent(subjectId);
  if (subjectType === 'top_donor') return `${PUBLIC_SITE_URL}/donor/${id}`;
  if (subjectType === 'committee_spender') return `${PUBLIC_SITE_URL}/committee/${id}`;
  return `${PUBLIC_SITE_URL}/candidate/${id}`;
}

function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'America/New_York' };
  const s = new Intl.DateTimeFormat('en-US', opts).format(start);
  const e = new Intl.DateTimeFormat('en-US', opts).format(end);
  return s === e ? e : `${s}–${e}`;
}

// Deterministic digest used when no AI key is set or the model call fails — so a
// generation request always yields something publishable.
function buildFallback(items: DigestItem[], range: string): { title: string; subtitle: string; body: string } {
  const title = `PoliPulse Roundup — ${range}`;
  const subtitle = 'Follow the money: who is raising, spending, and shaping the race.';
  const intro = `Here's the latest from PoliPulse for ${range} — a quick look at the representatives, donors, and PACs that stood out.`;
  const lines = items
    .map((it) => `- **${it.label}** _(${it.typeLabel})_ — ${it.blurb} [See the breakdown →](${it.url})`)
    .join('\n');
  const outro = `\nWant the full picture? Explore every candidate, donor, and committee at [PoliPulse](${PUBLIC_SITE_URL}).`;
  const body = `${intro}\n\n## In this edition\n\n${lines}\n${outro}`;
  return { title, subtitle, body };
}

// Pull a usable headline JSON object out of a model response that may be wrapped
// in prose or ```json fences.
function parseDigestJson(raw: string): { title?: string; subtitle?: string; body_markdown?: string } | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    return null;
  }
}

async function composeWithAI(items: DigestItem[], range: string): Promise<{ title: string; subtitle: string; body: string } | null> {
  if (!aiKey) return null;
  const itemsJson = JSON.stringify(items.map((it) => ({ subject: it.label, type: it.typeLabel, note: it.blurb, link: it.url })), null, 2);
  const prompt = [
    'You are the editor of PoliPulse, a nonpartisan civic newsletter that follows political money — candidate fundraising, top donors, and PAC spending.',
    `Write this week's edition covering ${range}. Use ONLY the items below; do not invent figures, names, or facts.`,
    '',
    'Return ONLY a JSON object with exactly these keys:',
    '  "title": a punchy, specific headline (<= 80 chars)',
    '  "subtitle": one-line deck (<= 120 chars)',
    '  "body_markdown": the article in Markdown',
    '',
    'Rules for body_markdown:',
    '- Open with a 1–2 sentence intro that frames the week.',
    '- Then a section per item: a bold subject line, one or two sentences of nonpartisan context drawn from its note, and a Markdown link using the EXACT link provided.',
    '- Keep it tight and skimmable. No fabricated numbers. No hashtags. End with a short call to action linking to ' + PUBLIC_SITE_URL + '.',
    '',
    'Items:',
    itemsJson,
  ].join('\n');

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', temperature: 0.7, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const content: string = j?.choices?.[0]?.message?.content ?? '';
    const parsed = parseDigestJson(content);
    if (!parsed?.title || !parsed?.body_markdown) return null;
    return {
      title: String(parsed.title).trim(),
      subtitle: String(parsed.subtitle ?? '').trim(),
      body: String(parsed.body_markdown).trim(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(supaUrl, serviceKey);

    // Auth: cron/service-role (the daily run) OR an authenticated admin (the button).
    let createdBy: string | null = null;
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!role) return json({ error: 'forbidden' }, 403);
      createdBy = user.id;
    }

    const body = (await req.json().catch(() => ({}))) as { force?: unknown; lookback_days?: unknown };
    const force = body?.force === true;

    const { data: settings } = await admin.from('social_post_settings').select('*').eq('id', 1).maybeSingle();
    if (!settings) return json({ error: 'settings_missing' }, 500);

    // Cadence gates (skipped for a manual force).
    if (!force) {
      if (!settings.substack_enabled) return json({ ok: true, skipped: 'disabled' });
      const freqDays = Number(settings.substack_frequency_days ?? 7);
      const last = settings.substack_last_generated_at ? new Date(settings.substack_last_generated_at).getTime() : 0;
      if (last && last > Date.now() - freqDays * DAY_MS) {
        return json({ ok: true, skipped: 'not_due', next_eligible: new Date(last + freqDays * DAY_MS).toISOString() });
      }
    }

    const lookbackDays = Number(body?.lookback_days ?? settings.substack_lookback_days ?? 7);
    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - lookbackDays * DAY_MS);

    // Recent curated cards — both already-posted and queued count as "covered".
    const { data: posts, error: postsErr } = await admin
      .from('social_posts')
      .select('id, subject_type, subject_id, subject_label, created_at, status')
      .in('status', ['posted', 'pending_review'])
      .gte('created_at', periodStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (postsErr) throw postsErr;

    // One entry per subject (most recent wins), capped.
    const seen = new Set<string>();
    const chosen = (posts ?? []).filter((p) => {
      const key = `${p.subject_type}:${p.subject_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_ITEMS);

    if (chosen.length === 0) {
      return json({ ok: true, skipped: 'no_content', message: 'No social posts in the lookback window to compile.' });
    }

    // Best available caption per post → the item blurb.
    const ids = chosen.map((p) => p.id);
    const { data: platformRows } = await admin
      .from('social_post_platforms')
      .select('post_id, platform, caption')
      .in('post_id', ids);
    const captionByPost = new Map<string, string>();
    for (const row of platformRows ?? []) {
      const cap = (row.caption ?? '').trim();
      if (!cap) continue;
      const existing = captionByPost.get(row.post_id);
      // Prefer the X caption; otherwise keep the first non-empty one.
      if (!existing || row.platform === 'x') captionByPost.set(row.post_id, cap);
    }

    const items: DigestItem[] = chosen.map((p) => ({
      label: p.subject_label ?? 'This subject',
      typeLabel: TYPE_LABELS[p.subject_type] ?? 'Spotlight',
      blurb: captionByPost.get(p.id) ?? `Featured on PoliPulse.`,
      url: profileUrl(p.subject_type, p.subject_id),
    }));

    const range = fmtRange(periodStart, periodEnd);
    const ai = await composeWithAI(items, range);
    const composed = ai ?? buildFallback(items, range);

    const { data: inserted, error: insErr } = await admin
      .from('substack_digests')
      .insert({
        title: composed.title,
        subtitle: composed.subtitle || null,
        body_markdown: composed.body,
        status: 'draft',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        source_post_ids: ids,
        item_count: items.length,
        model: ai ? 'google/gemini-2.5-flash' : 'fallback',
        created_by: createdBy,
      })
      .select('id, title, item_count')
      .single();
    if (insErr) throw insErr;

    await admin.from('social_post_settings').update({ substack_last_generated_at: new Date().toISOString() }).eq('id', 1);

    return json({ ok: true, digest_id: inserted.id, title: inserted.title, item_count: inserted.item_count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return json({ error: message }, 500);
  }
});
