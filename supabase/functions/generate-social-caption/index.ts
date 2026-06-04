// Admin-only OR cron-invoked. Generates a punchy, headline-worthy caption for a
// social_posts row + platform. Hybrid approach: a Postgres function returns the
// candidate's VERIFIED finance/IE facts (so figures are never hallucinated), then
// the Lovable AI gateway is asked to write media-ready copy from those facts. Falls
// back to a deterministic template (then the cached AI analysis summary) if the AI
// is unavailable or the candidate has no finance data.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { readCache } from '../_shared/ai-cache.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const aiKey = Deno.env.get('LOVABLE_API_KEY');

const BodySchema = z.object({
  post_id: z.string().uuid(),
  platform: z.enum(['x', 'facebook', 'instagram', 'tiktok']),
});

// max = hard character budget; long = give the fuller "deep analysis" treatment.
const limits: Record<string, { max: number; long: boolean }> = {
  // X budget ~200 so the caption + appended profile link stays under 280.
  x: { max: 200, long: false },
  facebook: { max: 600, long: true },
  instagram: { max: 700, long: true },
  tiktok: { max: 260, long: false },
};

// ── helpers ──────────────────────────────────────────────────────────────────

// Condense to a social-friendly snippet: trim to the last complete sentence that
// fits (past the halfway mark) else a word boundary + ellipsis. Always <= maxChars.
function summarizeForSocial(text: string | null | undefined, maxChars: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const head = clean.slice(0, maxChars + 1);
  let sentenceCut = -1;
  for (const m of head.matchAll(/[.!?](?=\s|$)/g)) {
    if (m.index !== undefined && m.index < maxChars) sentenceCut = m.index + 1;
  }
  if (sentenceCut >= Math.floor(maxChars * 0.5)) return clean.slice(0, sentenceCut).trim();
  const wordWindow = clean.slice(0, maxChars - 1);
  const lastSpace = wordWindow.lastIndexOf(' ');
  const base = (lastSpace > 0 ? wordWindow.slice(0, lastSpace) : wordWindow).replace(/[\s,;:.!?-]+$/, '');
  return `${base}…`;
}

// Directional ideology label from the PoliPulse -10..+10 score.
function ideologyLabel(score: number | null | undefined): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (score <= -7) return 'Far-Left';
  if (score <= -4) return 'Left';
  if (score <= -1.5) return 'Center-Left';
  if (score < 1.5) return 'Centrist';
  if (score < 4) return 'Center-Right';
  if (score < 7) return 'Right';
  return 'Far-Right';
}

function partyAbbr(party: string | null | undefined): string {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('rep')) return 'R';
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('ind')) return 'I';
  return (party ?? '').slice(0, 1).toUpperCase() || '?';
}

function fmtMoney(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

const ACRONYMS = new Set(['PAC', 'PACS', 'INC', 'INC.', 'LLC', 'USA', 'AIPAC', 'US', 'GOP', 'NRA', 'AFL', 'CIO']);
function tidyName(name: string | null | undefined): string {
  const s = (name ?? '').trim();
  if (!s) return '';
  // Only re-case if it's shouting in ALL CAPS; otherwise leave as authored.
  if (s !== s.toUpperCase()) return s;
  return s.split(/\s+/).map((w) => {
    const bare = w.replace(/[^A-Za-z.]/g, '');
    if (ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

interface Facts {
  cycle: string | null;
  raised: number | null;
  donor_count: number | null;
  top_donor: { name: string; amount: number; type?: string } | null;
  ie_support: number | null;
  ie_oppose: number | null;
  top_support_pac: { name: string; amount: number } | null;
  top_oppose_pac: { name: string; amount: number } | null;
}

function hasFinance(f: Facts | null): boolean {
  if (!f) return false;
  return (f.raised ?? 0) > 0 || (f.ie_support ?? 0) > 0 || (f.ie_oppose ?? 0) > 0;
}

// The verified-facts block handed to the model. Only non-null lines are included.
function factsBlock(name: string, party: string, ideology: string | null, office: string, state: string, f: Facts): string {
  const lines: string[] = [];
  lines.push(`Name: ${name}`);
  lines.push(`Party & leaning: ${party}${ideology ? `, ${ideology}` : ''}`);
  if (office) lines.push(`Office: ${office}${state ? ` (${state})` : ''}`);
  if (f.cycle) lines.push(`Election cycle: ${f.cycle}`);
  if ((f.raised ?? 0) > 0) lines.push(`Total raised: ${fmtMoney(f.raised)}${f.donor_count ? ` from ${f.donor_count.toLocaleString('en-US')} donors` : ''}`);
  if (f.top_donor && (f.top_donor.amount ?? 0) > 0) lines.push(`Largest direct donor: ${tidyName(f.top_donor.name)} at ${fmtMoney(f.top_donor.amount)}`);
  if ((f.ie_support ?? 0) > 0) lines.push(`Outside money spent SUPPORTING them: ${fmtMoney(f.ie_support)}${f.top_support_pac ? ` (biggest: ${tidyName(f.top_support_pac.name)}, ${fmtMoney(f.top_support_pac.amount)})` : ''}`);
  if ((f.ie_oppose ?? 0) > 0) lines.push(`Outside money spent OPPOSING them: ${fmtMoney(f.ie_oppose)}${f.top_oppose_pac ? ` (biggest: ${tidyName(f.top_oppose_pac.name)}, ${fmtMoney(f.top_oppose_pac.amount)})` : ''}`);
  return lines.join('\n');
}

function buildPrompt(platform: string, block: string, long: boolean, max: number): string {
  const lengthRule = long
    ? `Length: 3–5 short sentences. Give the fuller breakdown — money raised + donors, the standout donor, and the for-vs-against outside spending with the biggest PACs. Keep it under ${max} characters.`
    : `Length: 1–2 short, punchy sentences, under ${max} characters.`;
  return `You are a sharp political-media editor writing a punchy, headline-worthy ${platform.toUpperCase()} post about a U.S. politician's campaign money, built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS committee name to Title Case.

VERIFIED FACTS:
${block}

Write the post:
- Lead with the single most newsworthy angle — a giant war chest, a lopsided for-vs-against fight, a striking top donor, or an overwhelming flood of outside money. Make the big numbers pop.
- Intense, headline-worthy, media-ready. Pick whatever framing the numbers make most dramatic.
- Exactly ONE tasteful emoji.
- ${lengthRule}
- No hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble. Output plain text only.`;
}

// Deterministic, safe fallback when the AI is unavailable: pick the most dramatic
// angle from the numbers and assemble a sentence directly.
function templateCaption(name: string, party: string, ideology: string | null, state: string, f: Facts, max: number): string {
  const tag = `${ideology ? ideology + ' ' : ''}${partyAbbr(party)}${state ? `-${state}` : ''}`;
  const support = f.ie_support ?? 0;
  const oppose = f.ie_oppose ?? 0;
  const raised = f.raised ?? 0;
  const sup = f.top_support_pac;
  const opp = f.top_oppose_pac;
  let base: string;

  if (oppose >= 1_000_000 && oppose >= support * 1.5) {
    base = `${name} (${tag}) raised ${fmtMoney(raised)} — but ${fmtMoney(oppose)} in outside money is working to defeat them${opp ? `, led by ${tidyName(opp.name)} (${fmtMoney(opp.amount)})` : ''}. 💸`;
  } else if (support >= 1_000_000 && support >= oppose * 1.5) {
    base = `${fmtMoney(support)} in outside money is backing ${name} (${tag})${sup ? `, led by ${tidyName(sup.name)} (${fmtMoney(sup.amount)})` : ''}${oppose > 0 ? ` — vs ${fmtMoney(oppose)} against` : ' — with almost nothing spent against'}. 💥`;
  } else if (raised >= 15_000_000) {
    base = `${name} (${tag}) is sitting on a ${fmtMoney(raised)} war chest${f.donor_count ? ` from ${f.donor_count.toLocaleString('en-US')} donors` : ''}${f.top_donor ? `. Top donor: ${tidyName(f.top_donor.name)} (${fmtMoney(f.top_donor.amount)})` : ''}. 🏦`;
  } else if (support > 0 || oppose > 0) {
    base = `${name} (${tag}) raised ${fmtMoney(raised)}${f.top_donor ? `, top donor ${tidyName(f.top_donor.name)} (${fmtMoney(f.top_donor.amount)})` : ''}. Outside money: ${fmtMoney(support)} for, ${fmtMoney(oppose)} against. 💸`;
  } else {
    base = `${name} (${tag}) raised ${fmtMoney(raised)}${f.donor_count ? ` from ${f.donor_count.toLocaleString('en-US')} donors` : ''}${f.top_donor ? `, led by ${tidyName(f.top_donor.name)} (${fmtMoney(f.top_donor.amount)})` : ''}. 💰`;
  }
  return summarizeForSocial(base, max);
}

async function aiCaption(prompt: string, max: number): Promise<string | null> {
  if (!aiKey) return null;
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    let caption: string = j?.choices?.[0]?.message?.content ?? '';
    caption = caption.replace(/^["']|["']$/g, '').trim();
    caption = summarizeForSocial(caption, max);
    return caption || null;
  } catch {
    return null;
  }
}

// ── handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(supaUrl, serviceKey);

    // Cron / service-role callers (the auto-post pipeline) bypass the user check;
    // everyone else must be an authenticated admin.
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { post_id, platform } = parsed.data;

    const { data: post } = await admin.from('social_posts').select('*').eq('id', post_id).maybeSingle();
    if (!post) return new Response(JSON.stringify({ error: 'post_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const cfg = limits[platform];
    const stat = post.stat_payload ?? {};

    const save = async (caption: string, source: string) => {
      await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
      return new Response(JSON.stringify({ caption, source }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    // ── Primary: headline caption from VERIFIED finance/IE facts ──────────────
    if (post.subject_type === 'rep_profile' && post.subject_id) {
      const { data: cand } = await admin
        .from('candidates')
        .select('name, party, office, state, overall_score')
        .eq('id', post.subject_id)
        .maybeSingle();

      const { data: factsRaw } = await admin.rpc('get_candidate_caption_facts', { _candidate_id: post.subject_id });
      const facts = (factsRaw ?? null) as Facts | null;

      if (facts && hasFinance(facts)) {
        const name = (cand?.name as string) || String(post.subject_label ?? '').split('—')[0].trim() || 'This candidate';
        const party = (cand?.party as string) ?? stat.party ?? '';
        const office = (cand?.office as string) ?? stat.office ?? '';
        const state = (cand?.state as string) ?? stat.state ?? '';
        const score = (cand?.overall_score ?? stat.overall_score);
        const ideology = ideologyLabel(typeof score === 'number' ? score : Number(score));

        const block = factsBlock(name, party, ideology, office, state, facts);
        const ai = await aiCaption(buildPrompt(platform, block, cfg.long, cfg.max), cfg.max);
        if (ai) return await save(ai, 'finance_ai');
        return await save(templateCaption(name, party, ideology, state, facts, cfg.max), 'finance_template');
      }
    }

    // ── Fallback: the candidate's cached AI analysis summary, condensed ────────
    if (post.subject_type === 'rep_profile' && post.subject_id) {
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient', subject_id: `v2:candidate:${post.subject_id}`, cycle: null,
      });
      const summary = cached?.payload?.summary;
      if (cached?.payload && !cached.payload.insufficient_information && typeof summary === 'string' && summary.trim()) {
        return await save(summarizeForSocial(summary, cfg.max), 'ai_analysis');
      }
    }

    // ── Last resort: a plain static caption ───────────────────────────────────
    return await save(`${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`, 'static');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
