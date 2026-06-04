// Shared "headline finance caption" composer, used by BOTH the auto-poster
// (generate-social-caption) and the rep-profile share button
// (compose-candidate-caption) so the two surfaces produce identical copy.
//
// Hybrid approach: get_candidate_caption_facts() returns the candidate's VERIFIED
// finance / independent-expenditure facts (numbers straight from the DB, never
// hallucinated), then the Lovable AI gateway writes punchy, number-driven copy
// from them. A deterministic template covers the no-AI path.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// max = hard character budget; long = give the fuller "deep analysis" treatment.
export const PLATFORM_LIMITS: Record<string, { max: number; long: boolean }> = {
  x: { max: 200, long: false },
  facebook: { max: 600, long: true },
  instagram: { max: 700, long: true },
  tiktok: { max: 260, long: false },
};

// Condense to a social-friendly snippet: trim to the last complete sentence that
// fits (past the halfway mark) else a word boundary + ellipsis. Always <= maxChars.
export function summarizeForSocial(text: string | null | undefined, maxChars: number): string {
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

// Directional ideology label from the PoliPulse -10..+10 score. Bands follow the
// app's CL/CR convention (center zone split at 0), so e.g. +1.18 reads Center-Right.
function ideologyLabel(score: number | null | undefined): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  // Only label the middle. A partisan's direction is implied by their party, so
  // "Left Democrat" / "Right Republican" is redundant — those return null and the
  // caption uses just the party name. Only a rep near the center gets a qualifier.
  if (score >= -0.5 && score <= 0.5) return 'Centrist';
  if (score > -3 && score < -0.5) return 'Center-Left';
  if (score > 0.5 && score < 3) return 'Center-Right';
  return null;
}

function partyFull(party: string | null | undefined): string {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('rep')) return 'Republican';
  if (p.startsWith('dem')) return 'Democrat';
  if (p.startsWith('ind')) return 'Independent';
  return (party ?? '').trim();
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
  if (s !== s.toUpperCase()) return s; // only re-case if it's shouting in ALL CAPS
  return s.split(/\s+/).map((w) => {
    const bare = w.replace(/[^A-Za-z.]/g, '');
    if (ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

export interface Facts {
  cycle: string | null;
  today?: string | null; // DB current date (YYYY-MM-DD) — authoritative "now".
  raised: number | null;
  donor_count: number | null;
  top_donor: { name: string; amount: number; type?: string } | null;
  ie_support: number | null;
  ie_oppose: number | null;
  top_support_pac: { name: string; amount: number } | null;
  top_oppose_pac: { name: string; amount: number } | null;
  // Direct-fundraising mix (shares of itemized donor money). Lets the caption say
  // whether they're small-dollar/grassroots, large-donor, or PAC-funded.
  funding?: {
    small_dollar: number; large_individual: number; pac: number; self_funded: number;
    donor_base: number; small_pct: number; large_pct: number; pac_pct: number;
  } | null;
}

function hasFinance(f: Facts | null): boolean {
  if (!f) return false;
  return (f.raised ?? 0) > 0 || (f.ie_support ?? 0) > 0 || (f.ie_oppose ?? 0) > 0;
}

function factsBlock(name: string, party: string, ideology: string | null, office: string, state: string, incumbent: boolean | null | undefined, f: Facts): string {
  const lines: string[] = [];
  lines.push(`Name to use for the politician (use exactly this, no other name): ${name}`);
  lines.push(`Leaning & party: ${ideology ? ideology + ' ' : ''}${partyFull(party)}`.trim());
  if (office) lines.push(`Office: ${office}${state ? ` (${state})` : ''}`);
  if (incumbent !== undefined && incumbent !== null) {
    lines.push(`Incumbent: ${incumbent ? 'yes — currently holds this seat' : 'no — a challenger, not the sitting officeholder'}`);
  }
  if (f.cycle) lines.push(`Election cycle: ${f.cycle}`);
  if ((f.raised ?? 0) > 0) lines.push(`Total raised: ${fmtMoney(f.raised)}${f.donor_count ? ` from ${f.donor_count.toLocaleString('en-US')} donors` : ''}`);
  if (f.top_donor && (f.top_donor.amount ?? 0) > 0) lines.push(`Largest direct donor: ${tidyName(f.top_donor.name)} at ${fmtMoney(f.top_donor.amount)}`);
  if ((f.ie_support ?? 0) > 0) lines.push(`Outside money spent SUPPORTING them: ${fmtMoney(f.ie_support)}${f.top_support_pac ? ` (biggest: ${tidyName(f.top_support_pac.name)}, ${fmtMoney(f.top_support_pac.amount)})` : ''}`);
  if ((f.ie_oppose ?? 0) > 0) lines.push(`Outside money spent OPPOSING them: ${fmtMoney(f.ie_oppose)}${f.top_oppose_pac ? ` (biggest: ${tidyName(f.top_oppose_pac.name)}, ${fmtMoney(f.top_oppose_pac.amount)})` : ''}`);
  if (f.funding) {
    const fu = f.funding;
    lines.push(`Funding mix (share of their itemized donor money): ${fu.small_pct}% small-dollar (under $200), ${fu.large_pct}% large individual donors, ${fu.pac_pct}% from PACs/committees${fu.self_funded > 0 ? `; self-funded ${fmtMoney(fu.self_funded)}` : ''}.`);
  }
  return lines.join('\n');
}

// The single biggest aggregate figure — the number the caption must open with.
function headlineHint(f: Facts): string | null {
  const opts: { v: number; text: string }[] = [];
  if ((f.raised ?? 0) > 0) opts.push({ v: f.raised!, text: `${fmtMoney(f.raised)} raised this cycle (the war chest)` });
  if ((f.ie_oppose ?? 0) > 0) opts.push({ v: f.ie_oppose!, text: `${fmtMoney(f.ie_oppose)} in outside money spent OPPOSING them` });
  if ((f.ie_support ?? 0) > 0) opts.push({ v: f.ie_support!, text: `${fmtMoney(f.ie_support)} in outside money spent SUPPORTING them` });
  if (opts.length === 0) return null;
  opts.sort((a, b) => b.v - a.v);
  return opts[0].text;
}

// US general election day: the first Tuesday after the first Monday of November.
function generalElectionDate(year: number): Date {
  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0=Sun..6=Sat
  const firstMonday = 1 + ((1 - nov1Dow + 7) % 7);
  return new Date(Date.UTC(year, 10, firstMonday + 1));
}

// Tells the model where "now" sits relative to the cycle's election so it uses
// correct tense — an upcoming race must never be written as if it already happened.
function electionTimingDirective(cycle: string | null, todayIso: string | null | undefined): string | null {
  const year = Number(cycle);
  if (!Number.isFinite(year) || year < 2000) return null;
  const now = todayIso ? new Date(`${todayIso}T00:00:00Z`) : new Date();
  if (Number.isNaN(now.getTime())) return null;
  const election = generalElectionDate(year);
  const days = Math.round((election.getTime() - now.getTime()) / 86_400_000);
  const dateStr = `${election.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${election.getUTCDate()}, ${year}`;
  const stamp = todayIso ?? 'now';
  if (days > 45) {
    return `TIMING (today is ${stamp}): The ${year} general election is ${dateStr}, still ~${days} days away. The campaign is ONGOING — write in present/future tense (e.g. "is building", "ahead of the November election"). ${year} is NOT over; never imply the race or fundraising has already finished.`;
  }
  if (days >= 0) {
    return `TIMING (today is ${stamp}): The ${year} election (${dateStr}) is only ~${days} days away — the final stretch. Use urgent present tense.`;
  }
  if (days >= -45) {
    return `TIMING (today is ${stamp}): The ${year} election (${dateStr}) just happened. Use past tense; you may note it was a recent race.`;
  }
  return `TIMING (today is ${stamp}): The ${year} election cycle (${dateStr}) is over. Use PAST tense (e.g. "in the ${year} cycle, raised...") and do not imply any active or upcoming race.`;
}

function buildPrompt(platform: string, block: string, hint: string | null, timing: string | null, handle: string | null, long: boolean, max: number): string {
  const handleRule = handle
    ? `\n- The "Name to use" above IS the rep's X handle (@${handle}) — refer to them by that handle in place of a real name, and never write their actual personal name. Do NOT put @${handle} as the very first character of the post (so X does not treat it as a reply).`
    : '';
  const focusRule = long
    ? `Give the fuller breakdown: money raised + donors, the standout donor, the funding mix, and the for-vs-against outside spending with the biggest PACs.`
    : `Be SELECTIVE — this is a short post. Include only THREE things: (1) the lead figure, (2) the SINGLE most striking secondary fact — pick ONE of: a lopsided for-vs-against fight, a notable funding angle (e.g. "42% PAC-funded" or small-dollar/grassroots), or the standout top donor${handle ? ', and (3) the @-mention' : ''}. Leave every other fact OUT — a tight post beats a crammed one, and it must never get cut off.`;
  const lengthRule = long
    ? `Length: 3–5 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; do NOT run to the limit.`;
  const leadRule = hint
    ? `OPEN with this exact figure — it is the single biggest number and MUST be your hook, right at the front: ${hint}.`
    : `LEAD with the single most eye-popping dollar figure and make it the hook.`;
  return `You are a sharp political-media editor writing a punchy, headline-worthy ${platform.toUpperCase()} post about a U.S. politician's campaign money, built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS committee name to Title Case.

VERIFIED FACTS:
${block}
${timing ? `\n${timing}\n` : ''}
Write the post:
- ${leadRule}
- ${focusRule}
- Match the tense and framing to the TIMING note above — an upcoming election must NOT be described in the past tense, and a finished one must not be written as if it's still ahead.
- Refer to them using the "Leaning & party" line EXACTLY as given. When it's only a party ("Democrat"/"Republican"), use just that — NEVER prepend "Left", "Right", "Progressive", "Conservative" or any direction yourself. Only a middle-of-the-road rep carries a "Center-Left", "Centrist", or "Center-Right" qualifier (e.g. "Center-Right Republican"). Say "re-election" only if the facts mark them as the incumbent; otherwise call it their campaign or bid.${handleRule}
- When you cite funding: small-dollar = under $200, and the "PACs/committees" share is direct money TO the campaign — keep it distinct from the outside/Super-PAC spending above.
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no underscores, no bullet points, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Normalize a stored handle ("@RepX" / "RepX") to a bare, valid X username, or null.
function normalizeHandle(h: string | null | undefined): string | null {
  const s = (h ?? '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

// Guarantee the @handle is present (mid-text, never leading) without exceeding max.
// If the model already wove it in, leave it; otherwise trim to make room and append.
function ensureHandle(caption: string, handle: string | null, max: number): string {
  if (!handle) return caption;
  if (new RegExp(`@${handle}(?![A-Za-z0-9_])`, 'i').test(caption)) return caption;
  const suffix = ` @${handle}`;
  const body = summarizeForSocial(caption, Math.max(1, max - suffix.length));
  return `${body}${suffix}`;
}

// Deterministic, safe fallback: lead with the single biggest number and assemble
// a sentence directly. Names the party, with a leaning qualifier only for middle reps.
function templateCaption(name: string, party: string, ideology: string | null, state: string, f: Facts, max: number): string {
  const who = `${name}, a ${ideology ? ideology + ' ' : ''}${partyFull(party)}${state ? ` (${state})` : ''}`.trim();
  const raised = f.raised ?? 0;
  const support = f.ie_support ?? 0;
  const oppose = f.ie_oppose ?? 0;
  const sup = f.top_support_pac;
  const opp = f.top_oppose_pac;
  const lead = Math.max(raised, support, oppose);
  let base: string;

  if (lead === oppose && oppose > 0) {
    base = `${fmtMoney(oppose)} in outside money is working to defeat ${who}${opp ? `, led by ${tidyName(opp.name)} (${fmtMoney(opp.amount)})` : ''}${support > 0 ? ` — vs ${fmtMoney(support)} backing them` : ''}. 💸`;
  } else if (lead === support && support > 0) {
    base = `${fmtMoney(support)} in outside money is backing ${who}${sup ? `, led by ${tidyName(sup.name)} (${fmtMoney(sup.amount)})` : ''}${oppose > 0 ? ` — vs ${fmtMoney(oppose)} against` : ''}. 💥`;
  } else {
    const extra = (support > 0 || oppose > 0) ? ` Outside money: ${fmtMoney(support)} for, ${fmtMoney(oppose)} against.` : '';
    base = `${fmtMoney(raised)} war chest for ${who}${f.donor_count ? `, built from ${f.donor_count.toLocaleString('en-US')} donors` : ''}${f.top_donor ? `; top donor ${tidyName(f.top_donor.name)} (${fmtMoney(f.top_donor.amount)})` : ''}.${extra} 🏦`;
  }
  return summarizeForSocial(base, max);
}

async function aiCaption(aiKey: string | undefined, prompt: string, max: number): Promise<string | null> {
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
    // Strip wrapping quotes and any stray markdown emphasis the model slips in.
    caption = caption.replace(/^["']|["']$/g, '').replace(/[*_`]/g, '').trim();
    caption = summarizeForSocial(caption, max);
    return caption || null;
  } catch {
    return null;
  }
}

export interface CandidateMeta {
  name: string;
  party: string;
  office: string;
  state: string;
  score: number | null;
  incumbent?: boolean | null;
  handle?: string | null; // X/Twitter handle (with or without leading @)
}

// Returns the headline caption for a candidate+platform, or null when the
// candidate has no usable finance/IE data (caller should fall back).
export async function composeFinanceCaption(
  admin: SupabaseClient,
  aiKey: string | undefined,
  candidateId: string,
  platform: string,
  meta: CandidateMeta,
): Promise<{ caption: string; source: string } | null> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const { data: factsRaw } = await admin.rpc('get_candidate_caption_facts', { _candidate_id: candidateId });
  const facts = (factsRaw ?? null) as Facts | null;
  if (!facts || !hasFinance(facts)) return null;

  const handle = normalizeHandle(meta.handle);
  // Use the @handle as the rep's name when we have one; fall back to the real name.
  const displayName = handle ? `@${handle}` : (meta.name || 'This candidate');
  const ideology = ideologyLabel(meta.score);
  const block = factsBlock(displayName, meta.party, ideology, meta.office, meta.state, meta.incumbent, facts);
  const hint = headlineHint(facts);
  const timing = electionTimingDirective(facts.cycle, facts.today);

  const ai = await aiCaption(aiKey, buildPrompt(platform, block, hint, timing, handle, cfg.long, cfg.max), cfg.max);
  if (ai) return { caption: ensureHandle(ai, handle, cfg.max), source: 'finance_ai' };
  return { caption: ensureHandle(templateCaption(displayName, meta.party, ideology, meta.state, facts, cfg.max), handle, cfg.max), source: 'finance_template' };
}
