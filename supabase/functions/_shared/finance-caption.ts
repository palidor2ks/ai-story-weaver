// Shared "headline finance caption" composer, used by BOTH the auto-poster
// (generate-social-caption) and the rep-profile share button
// (compose-candidate-caption) so the two surfaces produce identical copy.
//
// Hybrid approach: get_candidate_caption_facts() returns the candidate's VERIFIED
// finance / independent-expenditure facts (numbers straight from the DB, never
// hallucinated), then the Lovable AI gateway writes punchy, number-driven copy
// from them. A deterministic template covers the no-AI path.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { NewsHook } from './news-research.ts';

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

// Trim to the largest prefix that ENDS on a complete sentence (. ! ?) within max.
// Unlike summarizeForSocial it never appends an ellipsis — it returns a finished
// thought, or '' when not even the first sentence fits (caller should shorten/retry).
export function fitToSentence(text: string | null | undefined, max: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max + 1);
  let cut = -1;
  for (const m of head.matchAll(/[.!?](?=\s|$)/g)) {
    if (m.index !== undefined && m.index < max) cut = m.index + 1;
  }
  return cut > 0 ? clean.slice(0, cut).trim() : '';
}

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

// Watchdog read of where a campaign's itemized money comes from: small-dollar is a
// genuine grassroots positive, while a high PAC or large-individual share is a red flag
// worth calling out plainly (they answer to big/institutional donors, not small-dollar
// voters). Embeds the real percentage so the cue stays strictly factual. Null when mixed.
export function fundingCharacter(fu: Facts['funding']): string | null {
  if (!fu) return null;
  const { small_pct, large_pct, pac_pct } = fu;
  if (pac_pct >= 50) return `PAC-dependent — ${pac_pct}% of its donations come from PACs and committees, not voters`;
  if (small_pct >= 55) return `genuinely grassroots — ${small_pct}% of its donations are small-dollar`;
  if (pac_pct >= 35) return `heavily PAC-funded — ${pac_pct}% of its donations from PACs/committees`;
  if (large_pct >= 55) return `big-money-backed — ${large_pct}% of its donations come from large individual donors, not grassroots`;
  if (small_pct >= 35 && small_pct >= pac_pct && small_pct >= large_pct) return `with a real small-dollar base (${small_pct}% of its donations)`;
  if (pac_pct + large_pct >= 60) return `funded mostly by big donors and PACs (${large_pct}% large individual / ${pac_pct}% PAC of its donations), not small-dollar givers`;
  return null;
}

export function fmtMoney(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

const ACRONYMS = new Set(['PAC', 'PACS', 'INC', 'INC.', 'LLC', 'USA', 'AIPAC', 'US', 'GOP', 'NRA', 'AFL', 'CIO']);

// When ALL-CAPS text has "LAST, FIRST" shape, these first-after-comma tokens indicate
// an organization (not a person) — don't reorder those.
const ORG_FIRST_TOKENS = new Set([
  'inc', 'inc.', 'llc', 'llc.', 'pac', 'corp', 'corp.', 'ltd', 'ltd.',
  'committee', 'foundation', 'fund', 'assoc', 'assoc.', 'co.',
]);

// Post-nominal credentials in the FEC first-name slot that belong after the last name.
const FEC_CREDENTIALS: Record<string, string> = {
  'ph.d.': 'Ph.D.', 'phd': 'Ph.D.', 'm.d.': 'M.D.', 'esq.': 'Esq.', 'esq': 'Esq.',
};

function capWord(w: string): string {
  const bare = w.replace(/[^A-Za-z.]/g, '');
  if (ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function tidyName(name: string | null | undefined): string {
  const s = (name ?? '').trim();
  if (!s) return '';
  if (s !== s.toUpperCase()) return s; // only re-case if it's shouting in ALL CAPS

  // Detect FEC "LAST, FIRST [MIDDLE]" person-name format and reorder to "First Last".
  // Guard: skip when the first token after the comma looks like an org suffix (INC, LLC…).
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) {
    const before = s.slice(0, commaIdx).trim();
    const afterTokens = s.slice(commaIdx + 1).trim().split(/\s+/).filter(Boolean);
    if (!before.includes(' ') && afterTokens.length > 0 && !ORG_FIRST_TOKENS.has(afterTokens[0].toLowerCase())) {
      const creds: string[] = [];
      const firstMid: string[] = [];
      for (const w of afterTokens) {
        const cred = FEC_CREDENTIALS[w.toLowerCase()];
        if (cred) creds.push(cred);
        else firstMid.push(w);
      }
      const base = [...firstMid, before].map(capWord).join(' ');
      return creds.length ? `${base}, ${creds.join(', ')}` : base;
    }
  }

  return s.split(/\s+/).map(capWord).join(' ');
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
    lines.push(`Funding mix — these are shares of total CONTRIBUTIONS from donors, a SEPARATE and smaller base than "Total raised" above (which also includes loans, self-funding and transfers). Do NOT present them as a share of the total raised / war chest: ${fu.small_pct}% small-dollar (under $200), ${fu.large_pct}% large individual donors, ${fu.pac_pct}% from PACs/committees${fu.self_funded > 0 ? `; plus ${fmtMoney(fu.self_funded)} self-funded` : ''}.`);
    const character = fundingCharacter(fu);
    if (character) lines.push(`Funding character (surface this as a pointed but strictly factual watchdog angle): ${character}.`);
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

function buildPrompt(platform: string, block: string, hint: string | null, timing: string | null, handle: string | null, long: boolean, max: number, news: NewsHook | null = null): string {
  const handleRule = handle
    ? `\n- The "Name to use" above IS the rep's X handle (@${handle}) — refer to them by that handle in place of a real name, and never write their actual personal name. Do NOT put @${handle} as the very first character of the post (so X does not treat it as a reply).`
    : '';
  // Real, sourced recent news is the most attention-grabbing angle when present; it
  // becomes the hook and the money figure drops to supporting context.
  const newsBlock = news
    ? `\nIN THE NEWS (real, recently reported by ${news.source} — treat as a verified, attributed fact):\n${news.hook}\n`
    : '';
  const focusRule = long
    ? `Give the fuller breakdown: money raised + donors, the standout donor, the funding mix, and the for-vs-against outside spending with the biggest PACs.${news ? ` Frame it all UNDER the news hook above.` : ''}`
    : news
      ? `Be SELECTIVE — this is a short post. Lead with the news hook, then add the SINGLE most striking money fact (the lead figure or a notable funding angle) as supporting context${handle ? ', plus the @-mention' : ''}. Leave every other fact OUT — a tight post beats a crammed one, and it must never get cut off.`
      : `Be SELECTIVE — this is a short post. Include only THREE things: (1) the lead figure, (2) the SINGLE most striking secondary fact — pick ONE of: a lopsided for-vs-against fight, a notable funding angle (e.g. "42% PAC-funded" or small-dollar/grassroots), or the standout top donor${handle ? ', and (3) the @-mention' : ''}. Leave every other fact OUT — a tight post beats a crammed one, and it must never get cut off.`;
  const lengthRule = long
    ? `Length: 3–5 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; do NOT run to the limit.`;
  const leadRule = news
    ? `OPEN with the news hook above and attribute it to ${news.source} (e.g. "Per ${news.source}, …" or "${news.source} reports …") — it is your headline. Then bring in the money below as supporting context.`
    : hint
      ? `OPEN with this exact figure — it is the single biggest number and MUST be your hook, right at the front: ${hint}.`
      : `LEAD with the single most eye-popping dollar figure and make it the hook.`;
  const newsRule = news
    ? `\n- The IN THE NEWS item is real reporting by ${news.source}, not your own claim: state it EXACTLY as factually as written, attributed to ${news.source}. NEVER sharpen it into an accusation, add a detail, or imply guilt beyond what is reported.`
    : '';
  return `You are a sharp political-media editor writing a punchy, headline-worthy ${platform.toUpperCase()} post about a U.S. politician, built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS committee name to Title Case.

VERIFIED FACTS:
${block}
${newsBlock}${timing ? `\n${timing}\n` : ''}
Write the post:
- ${leadRule}${newsRule}
- ${focusRule}
- Match the tense and framing to the TIMING note above — an upcoming election must NOT be described in the past tense, and a finished one must not be written as if it's still ahead.
- Refer to them using the "Leaning & party" line EXACTLY as given. When it's only a party ("Democrat"/"Republican"), use just that — NEVER prepend "Left", "Right", "Progressive", "Conservative" or any direction yourself. Only a middle-of-the-road rep carries a "Center-Left", "Centrist", or "Center-Right" qualifier (e.g. "Center-Right Republican"). Say "re-election" only if the facts mark them as the incumbent; otherwise call it their campaign or bid.${handleRule}
- When you cite funding: small-dollar = under $200, and the "PACs/committees" share is direct money TO the campaign — keep it distinct from the outside/Super-PAC spending above. CRITICAL — the funding-mix percentages are shares of the candidate's CONTRIBUTIONS (small-dollar + large individual + PAC), which is a DIFFERENT, smaller base than the total raised / war chest. NEVER state a funding-mix percentage as a share of the total raised or war chest (e.g. do NOT write "91% of her $956K war chest"); say "X% of her donations/contributions" or give the percentage on its own. Take a WATCHDOG stance on the money: heavy PAC or large-individual funding is a red flag worth calling out plainly (they answer to big/institutional donors, not small-dollar voters), while a high small-dollar share is a genuine grassroots positive. If a "Funding character" cue is given, lead with it or feature it prominently. Be pointed but strictly FACTUAL — never invent, alter, or re-round a number, and no name-calling.
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no underscores, no bullet points, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Normalize a stored handle ("@RepX" / "RepX") to a bare, valid X username, or null.
function normalizeHandle(h: string | null | undefined): string | null {
  const s = (h ?? '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

// Guarantee the @handle is present (mid-text, never leading) without exceeding max
// and without ever slicing a sentence in half. If making room for the handle would
// cut mid-thought, we keep the full thought and drop the handle instead.
function ensureHandle(caption: string, handle: string | null, max: number): string {
  if (!handle) return caption;
  if (new RegExp(`@${handle}(?![A-Za-z0-9_])`, 'i').test(caption)) return caption;
  const suffix = ` @${handle}`;
  if (caption.length + suffix.length <= max) return `${caption}${suffix}`;
  const body = fitToSentence(caption, max - suffix.length);
  return body ? `${body}${suffix}` : caption;
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
    const character = fundingCharacter(f.funding);
    base = `${fmtMoney(raised)} war chest for ${who}${f.donor_count ? `, built from ${f.donor_count.toLocaleString('en-US')} donors` : ''}${f.top_donor ? `; top donor ${tidyName(f.top_donor.name)} (${fmtMoney(f.top_donor.amount)})` : ''}${character ? ` — ${character}` : ''}.${extra} 🏦`;
  }
  return summarizeForSocial(base, max);
}

// Calls the model and returns a caption that is ALWAYS a complete thought within
// max — never an ellipsis-truncated fragment. If the model overshoots the budget,
// we trim back to the last whole sentence; if even that doesn't fit, we retry once
// with a hard brevity instruction, then give up (null) so the caller falls back to
// the deterministic template (which is built to fit).
export async function aiCaption(aiKey: string | undefined, prompt: string, max: number): Promise<string | null> {
  if (!aiKey) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = attempt === 0
      ? prompt
      : `${prompt}\n\nIMPORTANT: Your previous attempt ran too long and got cut off. Rewrite it as a SINGLE complete sentence that ends cleanly in well under ${max} characters — it must read as a finished thought, never trailing off.`;
    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.8,
          messages: [{ role: 'user', content }],
        }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      let caption: string = j?.choices?.[0]?.message?.content ?? '';
      // Strip wrapping quotes and any stray markdown emphasis the model slips in.
      caption = caption.replace(/^["']|["']$/g, '').replace(/[*_`]/g, '').trim();
      if (caption && caption.length <= max) return caption; // already a full thought that fits
      const fitted = fitToSentence(caption, max); // else trim back to a whole sentence
      if (fitted) return fitted;
      // Too long with no earlier sentence break — loop to retry with the brevity nudge.
    } catch {
      // network/parse blip — retry, then fall through to null
    }
  }
  return null;
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
  news: NewsHook | null = null,
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

  const ai = await aiCaption(aiKey, buildPrompt(platform, block, hint, timing, handle, cfg.long, cfg.max, news), cfg.max);
  if (ai) return { caption: ensureHandle(ai, handle, cfg.max), source: news ? 'finance_news_ai' : 'finance_ai' };
  return { caption: ensureHandle(templateCaption(displayName, meta.party, ideology, meta.state, facts, cfg.max), handle, cfg.max), source: 'finance_template' };
}

// Compact, prompt-ready summary of a candidate's verified finance facts (no name/party
// preamble) — the funding "ingredient" for an analysis post. Null when there's no money data.
function fundingFactsLine(f: Facts | null): string | null {
  if (!f || !hasFinance(f)) return null;
  const parts: string[] = [];
  if ((f.raised ?? 0) > 0) parts.push(`raised ${fmtMoney(f.raised)}${f.donor_count ? ` from ${f.donor_count.toLocaleString('en-US')} donors` : ''}${f.cycle ? ` (${f.cycle} cycle)` : ''}`);
  if (f.top_donor && (f.top_donor.amount ?? 0) > 0) parts.push(`largest donor ${tidyName(f.top_donor.name)} at ${fmtMoney(f.top_donor.amount)}`);
  if (f.funding) parts.push(`funding mix (shares of contributions, not of total raised) ${f.funding.small_pct}% small-dollar / ${f.funding.large_pct}% large individual / ${f.funding.pac_pct}% PAC`);
  if ((f.ie_support ?? 0) > 0 || (f.ie_oppose ?? 0) > 0) parts.push(`outside money ${fmtMoney(f.ie_support ?? 0)} supporting vs ${fmtMoney(f.ie_oppose ?? 0)} opposing`);
  return parts.length ? parts.join('; ') : null;
}

function buildAnalysisPrompt(
  platform: string, displayName: string, partyLine: string,
  record: string | null, funding: string | null, character: string | null,
  timing: string | null, handle: string | null, mode: 'both' | 'funding' | 'record', max: number,
  news: NewsHook | null = null,
): string {
  const long = PLATFORM_LIMITS[platform]?.long ?? false;
  const handleRule = handle
    ? `\n- Refer to them as @${handle} in place of a real name; never write their actual personal name, and do NOT start the post with @${handle} (so X does not treat it as a reply).`
    : '';
  const newsRule = news
    ? `\n- IN THE NEWS (real, recently reported by ${news.source} — treat as a verified, attributed fact): ${news.hook}. OPEN with this as your hook and attribute it to ${news.source} (e.g. "Per ${news.source}, …"); it is the most attention-grabbing angle. State it EXACTLY as written — never sharpen it into an accusation, add a detail, or imply guilt beyond what is reported.`
    : '';
  const focus = mode === 'both'
    ? `Cover BOTH angles: (1) who they are — their record, positions, and what they're known for; and (2) their campaign money and what it says about WHO funds them.`
    : mode === 'funding'
      ? `Focus ONLY on their campaign money and what it says about who funds them — one tight angle.`
      : `Focus ONLY on who they are — their record, positions, and what they're known for — one tight angle. Do NOT cite dollar figures.`;
  const recordRule = (mode !== 'funding' && record)
    ? `\n- What they're known for (summarize faithfully; never invent or embellish): ${record}`
    : '';
  const fundingRule = (mode !== 'record' && (funding || character))
    ? `\n- Verified finance facts (never invent or re-round a number): ${funding ?? 'n/a'}.${character ? ` Funding character (feature this prominently): ${character}.` : ''} Any funding-mix percentage is a share of the candidate's CONTRIBUTIONS, NOT of the total raised / war chest — never write it as "X% of the $Y raised"; say "X% of their donations" or give the percentage on its own. Take a WATCHDOG stance: call out heavy PAC/large-individual funding plainly (they answer to big/institutional donors, not small-dollar voters); treat a high small-dollar share as a genuine grassroots positive. Pointed but strictly factual — no name-calling.`
    : '';
  const lengthRule = long
    ? `Length: 3–5 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; never run to the limit.`;
  return `You are a sharp political-media editor writing a punchy, headline-worthy ${platform.toUpperCase()} post about a U.S. politician, built for media consumption and engagement.

Subject: ${displayName} — ${partyLine}.
${focus}${recordRule}${fundingRule}
${timing ? `\n${timing}\n` : ''}
Write the post:
- Match the tense and framing to the TIMING note above (if given) — an upcoming election must NOT be written in the past tense.${newsRule}${handleRule}
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no underscores, no bullet points, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Decide which angle an analysis caption leads with. A caller-pinned `forceMode` wins
// when the available data backs it (a news hook alone can carry the 'record' angle);
// otherwise long posts cover both when possible, and short posts feature ONE angle —
// randomized (via `rand`) only when both a record summary and finance data exist.
export function pickAnalysisMode(opts: {
  long: boolean; hasRecord: boolean; hasFin: boolean; hasNews: boolean;
  forceMode?: 'record' | 'funding' | 'both'; rand?: number;
}): 'both' | 'funding' | 'record' {
  const { long, hasRecord, hasFin, hasNews, forceMode, rand = Math.random() } = opts;
  const canRecord = hasRecord || hasNews;
  if (forceMode === 'record' && canRecord) return 'record';
  if (forceMode === 'funding' && hasFin) return 'funding';
  if (forceMode === 'both' && (hasRecord || hasFin)) return hasRecord && hasFin ? 'both' : (hasFin ? 'funding' : 'record');
  if (long) return hasRecord && hasFin ? 'both' : (hasFin ? 'funding' : 'record');
  if (hasRecord && hasFin) return rand < 0.5 ? 'funding' : 'record';
  return hasFin ? 'funding' : 'record';
}

// Caption for an "AI analysis" rotation post about a candidate. Blends two ingredients —
// their cached record summary and their verified finance facts — per the user's rule:
// short posts (X/TikTok) feature ONE angle, randomized; long posts (FB/IG) cover BOTH.
// Returns null only when we have neither a record summary nor any finance data.
export async function composeAnalysisCaption(
  admin: SupabaseClient,
  aiKey: string | undefined,
  candidateId: string,
  platform: string,
  meta: CandidateMeta,
  recordSummary: string | null | undefined,
  news: NewsHook | null = null,
  // Pin the angle instead of the default randomized pick — used by the "Analysis"
  // caption style to force the record (positions/goals/activity) angle, never funding.
  forceMode?: 'record' | 'funding' | 'both',
): Promise<{ caption: string; source: string } | null> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const { data: factsRaw } = await admin.rpc('get_candidate_caption_facts', { _candidate_id: candidateId });
  const facts = (factsRaw ?? null) as Facts | null;
  const hasFin = hasFinance(facts);
  const record = (recordSummary ?? '').replace(/\s+/g, ' ').trim() || null;
  // A real, sourced news hook is enough to carry a post on its own, even with no
  // record summary or finance data — that's exactly when it's most useful.
  if (!record && !hasFin && !news) return null;

  const mode = pickAnalysisMode({
    long: cfg.long, hasRecord: !!record, hasFin, hasNews: !!news, forceMode,
  });

  const handle = normalizeHandle(meta.handle);
  const displayName = handle ? `@${handle}` : (meta.name || 'This candidate');
  const ideology = ideologyLabel(meta.score);
  const partyLine = `${ideology ? ideology + ' ' : ''}${partyFull(meta.party)}${meta.office ? `, ${meta.office}${meta.state ? ` (${meta.state})` : ''}` : ''}`.trim();
  const funding = fundingFactsLine(facts);
  const character = fundingCharacter(facts?.funding ?? null);
  const timing = facts ? electionTimingDirective(facts.cycle, facts.today) : null;
  const recordForPrompt = record ? summarizeForSocial(record, 500) : null;

  const prompt = buildAnalysisPrompt(platform, displayName, partyLine, recordForPrompt, funding, character, timing, handle, mode, cfg.max, news);
  const ai = await aiCaption(aiKey, prompt, cfg.max);
  if (ai) return { caption: ensureHandle(ai, handle, cfg.max), source: `analysis_${mode}${news ? '_news' : ''}_ai` };

  // Deterministic fallback when the model is unavailable. A news hook (when present)
  // leads, attributed to its source; the record/funding angle follows if we have it.
  const newsClause = news ? `Per ${news.source}, ${displayName} ${news.hook}.` : '';
  let body: string;
  if (mode === 'funding') {
    body = templateCaption(displayName, meta.party, ideology, meta.state, facts as Facts, cfg.max);
  } else if (mode === 'record') {
    body = record ?? '';
  } else {
    const fundClause = character ? ` ${displayName} is ${character}.` : (funding ? ` ${displayName}: ${funding}.` : '');
    body = `${record}${fundClause}`.trim();
  }
  const base = [newsClause, body].filter(Boolean).join(' ').trim() || `${displayName} on PoliPulse.`;
  return { caption: ensureHandle(summarizeForSocial(base, cfg.max), handle, cfg.max), source: `analysis_${mode}${news ? '_news' : ''}_template` };
}

// Shared party/office descriptor for the single-angle composers below.
function subjectPartyLine(meta: CandidateMeta): string {
  const ideology = ideologyLabel(meta.score);
  return `${ideology ? ideology + ' ' : ''}${partyFull(meta.party)}${meta.office ? `, ${meta.office}${meta.state ? ` (${meta.state})` : ''}` : ''}`.trim();
}

// "In the news" caption — built from ONLY a real, attributed news hook. Deliberately
// excludes finance/positions so it reads as today's news about the rep, not a money or
// record post. ALWAYS returns a caption (an honest "no recent news" line when there's no
// hook) so the picker never silently leaves a different style's text in place.
export async function composeNewsCaption(
  aiKey: string | undefined,
  meta: CandidateMeta,
  platform: string,
  news: NewsHook | null,
): Promise<{ caption: string; source: string }> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const handle = normalizeHandle(meta.handle);
  const displayName = handle ? `@${handle}` : (meta.name || 'This politician');
  if (!news) {
    // No recent coverage — say so plainly (clearly NOT the finance/positions caption).
    const base = `📰 No major recent news on ${displayName} in the headlines right now.`;
    return { caption: ensureHandle(summarizeForSocial(base, cfg.max), handle, cfg.max), source: 'news_none' };
  }
  const handleRule = handle
    ? `\n- Refer to them as @${handle}; never write their real personal name, and do NOT start the post with @${handle} (so X does not treat it as a reply).`
    : '';
  const lengthRule = cfg.long
    ? `Length: 2–4 short sentences, under ${cfg.max} characters.`
    : `Length: ONE or TWO tight sentences, comfortably under ${cfg.max} characters — leave room.`;
  const prompt = `You are a sharp political-news editor writing a punchy, timely ${platform.toUpperCase()} post about the LATEST NEWS involving a U.S. politician. This is a NEWS post — what they're in the headlines for right now.

Subject: ${displayName} — ${subjectPartyLine(meta)}.

THE NEWS (real, reported by ${news.source} — treat as a verified, attributed fact; this is your ONLY material): ${news.hook}

Write the post:
- OPEN with the news itself, attributed to ${news.source} (e.g. "Per ${news.source}, …" or "${news.source}: …"). It must read like a news headline, not a profile blurb. Make it feel current.
- Use ONLY the news above. Do NOT mention campaign finance, fundraising, donors, PACs, outside spending, or any dollar figure, and do NOT bring in their general policy positions or goals. Add no fact, allegation, or detail not in the news line; never sharpen it into an accusation or imply guilt beyond what is reported.${handleRule}
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji (prefer 📰 or 🗞️).
- ${lengthRule}
- Plain text ONLY — no markdown, no hashtags, no URLs. No quotes, no preamble.`;
  const ai = await aiCaption(aiKey, prompt, cfg.max);
  if (ai) return { caption: ensureHandle(ai, handle, cfg.max), source: 'news_ai' };
  const base = `📰 Per ${news.source}, ${displayName} ${news.hook}.`;
  return { caption: ensureHandle(summarizeForSocial(base, cfg.max), handle, cfg.max), source: 'news_template' };
}

// "Analysis" caption — built from ONLY the candidate's positions & goals (the same
// record the AI-analysis dialog shows). Deliberately excludes money and news headlines.
// `record` is a positions/goals text block. ALWAYS returns a caption (an honest "not
// available yet" line when there's no record) so the picker never silently leaves a
// different style's text in place.
export async function composeRecordCaption(
  aiKey: string | undefined,
  meta: CandidateMeta,
  platform: string,
  record: string | null,
): Promise<{ caption: string; source: string }> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const handle = normalizeHandle(meta.handle);
  const displayName = handle ? `@${handle}` : (meta.name || 'This politician');
  const clean = (record ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    // No positions/goals on file yet — say so plainly (clearly NOT the finance/news caption).
    const base = `🗳️ A detailed breakdown of ${displayName}'s positions and goals isn't available yet.`;
    return { caption: ensureHandle(summarizeForSocial(base, cfg.max), handle, cfg.max), source: 'record_none' };
  }
  const handleRule = handle
    ? `\n- Refer to them as @${handle}; never write their real personal name, and do NOT start the post with @${handle} (so X does not treat it as a reply).`
    : '';
  const lengthRule = cfg.long
    ? `Length: 2–4 short sentences, under ${cfg.max} characters.`
    : `Length: ONE or TWO tight sentences, comfortably under ${cfg.max} characters — leave room.`;
  const prompt = `You are a sharp political editor writing a punchy ${platform.toUpperCase()} post summarizing WHO a U.S. politician is — what they stand for, their positions and goals. This is a PROFILE of their platform, NOT news and NOT campaign money.

Subject: ${displayName} — ${subjectPartyLine(meta)}.

THEIR POSITIONS & GOALS (summarize faithfully; never invent or embellish): ${summarizeForSocial(clean, 700)}

Write the post:
- Frame it as where they stand / what they're fighting for (e.g. "Where ${displayName} stands:" or "${displayName}'s platform:"). Capture the ONE or TWO most defining positions or goals.
- Do NOT mention campaign finance, fundraising, donors, PACs, outside spending, or any dollar figure, and do NOT reference recent news headlines or current events. This is about their enduring positions, not a money story or a news story.${handleRule}
- Neutral and factual — describe their stance, don't cheerlead or attack.
- Headline-worthy and readable. Exactly ONE tasteful emoji (prefer 🗳️ or 📋).
- ${lengthRule}
- Plain text ONLY — no markdown, no hashtags, no URLs. No quotes, no preamble.`;
  const ai = await aiCaption(aiKey, prompt, cfg.max);
  if (ai) return { caption: ensureHandle(ai, handle, cfg.max), source: 'record_ai' };
  return { caption: ensureHandle(summarizeForSocial(`Where ${displayName} stands: ${clean}`, cfg.max), handle, cfg.max), source: 'record_template' };
}

