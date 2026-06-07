// Race-comparison social card: verified facts + the "follow the money" caption
// composer for the manual `race_comparison` post type.
//
// A race card is a head-to-head between TWO candidates in one election
// (state + office + year), chosen either as leading-Democrat-vs-leading-Republican
// ('dvr') or the two best-funded candidates ('money'). All numbers come from the
// get_race_card_facts RPC (finance_reconciliation / donors / independent_expenditures)
// — never re-rounded or invented. The caption reuses finance-caption.ts's AI gateway
// and sentence-fit helpers so it reads consistently with the rest of the app.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type Facts,
  PLATFORM_LIMITS,
  aiCaption,
  fmtMoney,
  summarizeForSocial,
  tidyName,
} from './finance-caption.ts';

export interface RaceDonor {
  name: string;
  amount: number;
  cause: string | null;
}

export interface RacePosition {
  topic: string;
  score: number;
}

export interface RaceCandidateFacts {
  id: string;
  name: string;
  party: string;
  score: number | null;
  incumbent: boolean;
  image_url: string | null;
  raised: number | null;
  finance: Facts | null;
  top_donors: RaceDonor[];
  positions: RacePosition[];
}

export interface RaceCardFacts {
  state: string;
  office: string;
  year: number;
  mode: string;
  candidates: RaceCandidateFacts[];
}

export interface RaceParams {
  state: string;
  office: string;
  year: number;
  mode: string; // 'dvr' | 'money'
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function parseCandidate(raw: Record<string, unknown>): RaceCandidateFacts {
  const donors = Array.isArray(raw.top_donors) ? raw.top_donors : [];
  const positions = Array.isArray(raw.positions) ? raw.positions : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    party: String(raw.party ?? ''),
    score: toNum(raw.score),
    incumbent: raw.incumbent === true,
    image_url: raw.image_url != null ? String(raw.image_url) : null,
    raised: toNum(raw.raised),
    finance: (raw.finance ?? null) as Facts | null,
    top_donors: (donors as Array<Record<string, unknown>>)
      .filter((d) => d && d.name != null)
      .map((d) => ({ name: String(d.name), amount: toNum(d.amount) ?? 0, cause: d.cause != null ? String(d.cause) : null })),
    positions: (positions as Array<Record<string, unknown>>)
      .filter((p) => p && p.topic != null)
      .map((p) => ({ topic: String(p.topic), score: toNum(p.score) ?? 0 })),
  };
}

// Verified facts behind one race's head-to-head card. Null when the race resolves
// to fewer than two candidates.
export async function fetchRaceCardFacts(
  admin: SupabaseClient,
  params: RaceParams,
): Promise<RaceCardFacts | null> {
  const { data } = await admin.rpc('get_race_card_facts', {
    _state: params.state,
    _office: params.office,
    _year: params.year,
    _mode: params.mode || 'dvr',
  });
  const raw = (data ?? null) as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw.candidates) || raw.candidates.length < 2) return null;
  return {
    state: String(raw.state ?? params.state),
    office: String(raw.office ?? params.office),
    year: toNum(raw.year) ?? params.year,
    mode: String(raw.mode ?? params.mode),
    candidates: (raw.candidates as Array<Record<string, unknown>>).slice(0, 2).map(parseCandidate),
  };
}

function partyFull(party: string): string {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('rep')) return 'Republican';
  if (p.startsWith('dem')) return 'Democrat';
  if (p.startsWith('ind')) return 'Independent';
  return party || 'Nonpartisan';
}

// A tidy, human title for the race, e.g. "2026 U.S. Senate (KY)".
export function raceTitle(f: RaceCardFacts): string {
  return `${f.year} ${f.office}`.replace(/\s+/g, ' ').trim();
}

function fundingAngle(c: RaceCandidateFacts): string | null {
  const fu = c.finance?.funding;
  if (!fu) return null;
  if (fu.self_funded > 0 && fu.self_funded >= (c.raised ?? 0) * 0.4) return `largely self-funded (${fmtMoney(fu.self_funded)} of their own money)`;
  if (fu.pac_pct >= 40) return `${fu.pac_pct}% PAC-funded`;
  if (fu.small_pct >= 50) return `${fu.small_pct}% small-dollar grassroots`;
  if (fu.large_pct >= 55) return `${fu.large_pct}% large-donor backed`;
  return null;
}

// Compact, prompt-ready facts for both candidates in the race (no invented numbers).
function raceFactsBlock(f: RaceCardFacts): string {
  const lines: string[] = [];
  lines.push(`Race: ${raceTitle(f)} — a head-to-head between two candidates.`);
  for (const c of f.candidates) {
    const bits: string[] = [];
    bits.push(`${tidyName(c.name)} (${partyFull(c.party)}${c.incumbent ? ', incumbent' : ''})`);
    if ((c.raised ?? 0) > 0) bits.push(`raised ${fmtMoney(c.raised)}${c.finance?.donor_count ? ` from ${c.finance.donor_count.toLocaleString('en-US')} donors` : ''}`);
    const fund = fundingAngle(c);
    if (fund) bits.push(fund);
    const sup = c.finance?.ie_support ?? 0;
    const opp = c.finance?.ie_oppose ?? 0;
    if (sup > 0 || opp > 0) bits.push(`outside money ${fmtMoney(sup)} supporting / ${fmtMoney(opp)} opposing them`);
    const donor = c.top_donors[0];
    if (donor && donor.amount > 0) bits.push(`top donor ${tidyName(donor.name)} (${fmtMoney(donor.amount)}${donor.cause ? `, ${donor.cause}` : ''})`);
    const causes = c.top_donors.map((d) => d.cause).filter(Boolean) as string[];
    if (causes.length > 0) bits.push(`donor causes: ${[...new Set(causes)].join(', ')}`);
    lines.push(`- ${bits.join('; ')}.`);
  }
  return lines.join('\n');
}

function buildRacePrompt(platform: string, block: string, max: number): string {
  const long = PLATFORM_LIMITS[platform]?.long ?? false;
  const lengthRule = long
    ? `Length: 3–5 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; never run to the limit.`;
  return `You are a sharp political-money watchdog writing a punchy, headline-worthy ${platform.toUpperCase()} post COMPARING the two leading candidates in ONE U.S. election race — who is funding each of them and what that money reveals — built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS name to Title Case.

VERIFIED FACTS:
${block}

Write the post:
- OPEN by naming the race and the sharpest money contrast between the two candidates — e.g. one is far better funded, one is self-funding, one is grassroots vs big-money/PAC-backed. That gap is the hook.
- Then surface ONE more telling contrast: outside (Super PAC) money for/against, a notable top donor or donor cause, or how their stated positions differ.
- Stay strictly FACTUAL and even-handed between the two — no name-calling, no endorsement, no invented numbers. "Follow the money" is the frame.
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Deterministic fallback caption, built to fit (no ellipsis fragments).
function raceTemplateCaption(f: RaceCardFacts, max: number): string {
  const [a, b] = f.candidates;
  const aMoney = fmtMoney(a.raised) ?? '$0';
  const bMoney = fmtMoney(b.raised) ?? '$0';
  const aFund = fundingAngle(a);
  const base = `${raceTitle(f)}: ${tidyName(a.name)} (${partyFull(a.party)}) has raised ${aMoney}${aFund ? `, ${aFund},` : ''} vs ${tidyName(b.name)} (${partyFull(b.party)}) at ${bMoney}. Follow the money. 💸`;
  return summarizeForSocial(base, max);
}

// Builds a "follow the money" comparison caption for a race + platform.
// Returns null only when the race has no usable facts (caller should fall back).
export async function composeRaceComparisonCaption(
  admin: SupabaseClient,
  aiKey: string | undefined,
  params: RaceParams,
  platform: string,
): Promise<{ caption: string; source: string } | null> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const f = await fetchRaceCardFacts(admin, params);
  if (!f || f.candidates.length < 2) return null;

  const ai = await aiCaption(aiKey, buildRacePrompt(platform, raceFactsBlock(f), cfg.max), cfg.max);
  if (ai) return { caption: ai, source: 'race_comparison_ai' };
  return { caption: raceTemplateCaption(f, cfg.max), source: 'race_comparison_template' };
}

// One-line OG description for the share-card unfurl.
export function raceCardDescription(f: RaceCardFacts): string {
  const [a, b] = f.candidates;
  return `Follow the money — ${tidyName(a.name)} (${fmtMoney(a.raised) ?? '$0'}) vs ${tidyName(b.name)} (${fmtMoney(b.raised) ?? '$0'})`.slice(0, 300);
}
