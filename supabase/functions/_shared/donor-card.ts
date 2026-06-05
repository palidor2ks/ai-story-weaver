// Donor-ENTITY social card: pick pool, verified facts, and the "follow the money"
// caption composer for the auto-poster's `top_donor` rotation type.
//
// This is the DONOR-anchored path (a notable donor profile, mirroring /donor/:id
// and the in-app DonorStatsCard) — it replaces the older CANDIDATE-anchored
// "top donor" caption/card (facts about a politician's biggest donor) that the
// top_donor rotation used to produce.
//
// Facts come straight from public RPCs over the donor-consolidation MVs
// (get_top_donor_entities / get_donor_card_facts) — numbers are never re-rounded
// or invented. The caption reuses finance-caption.ts's AI gateway + sentence-fit
// helpers so it reads consistently with the rest of the app.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  PLATFORM_LIMITS,
  aiCaption,
  fmtMoney,
  summarizeForSocial,
  tidyName,
} from './finance-caption.ts';

export interface DonorEntity {
  primary_id: string;
  display_name: string;
  type: string;
  total_amount: number;
}

export interface DonorRecipient {
  name: string;
  amount: number;
}

export interface DonorCardFacts {
  display_name: string;
  type: string;
  location: string | null;
  total_given: number | null;
  donation_count: number | null;
  recipient_count: number | null;
  cycle_count: number | null;
  latest_cycle: string | null;
  top_recipients: DonorRecipient[];
  cause: { label: string; reasoning: string | null } | null;
}

// The daily pick POOL: top donors by total $, excluding recently-featured ids.
export async function fetchTopDonorEntities(
  admin: SupabaseClient,
  limit: number,
  excludeIds: string[],
): Promise<DonorEntity[]> {
  const { data } = await admin.rpc('get_top_donor_entities', {
    _limit: limit,
    _exclude_ids: excludeIds ?? [],
  });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    primary_id: String(r.primary_id),
    display_name: String(r.display_name ?? ''),
    type: String(r.type ?? ''),
    total_amount: Number(r.total_amount ?? 0),
  }));
}

// Verified facts behind one donor's card, keyed by primary_id. Null when the id
// resolves to no donor.
export async function fetchDonorCardFacts(
  admin: SupabaseClient,
  donorId: string,
): Promise<DonorCardFacts | null> {
  const { data } = await admin.rpc('get_donor_card_facts', { _donor_id: donorId });
  const raw = (data ?? null) as Record<string, unknown> | null;
  if (!raw || !raw.display_name) return null;
  const recips = Array.isArray(raw.top_recipients) ? raw.top_recipients : [];
  const cause = raw.cause && typeof raw.cause === 'object'
    ? raw.cause as { label?: unknown; reasoning?: unknown }
    : null;
  return {
    display_name: String(raw.display_name),
    type: String(raw.type ?? ''),
    location: raw.location != null ? String(raw.location) : null,
    total_given: raw.total_given != null ? Number(raw.total_given) : null,
    donation_count: raw.donation_count != null ? Number(raw.donation_count) : null,
    recipient_count: raw.recipient_count != null ? Number(raw.recipient_count) : null,
    cycle_count: raw.cycle_count != null ? Number(raw.cycle_count) : null,
    latest_cycle: raw.latest_cycle != null ? String(raw.latest_cycle) : null,
    top_recipients: (recips as Array<Record<string, unknown>>)
      .filter((r) => r && r.name != null)
      .map((r) => ({ name: String(r.name), amount: Number(r.amount ?? 0) })),
    cause: cause && cause.label != null
      ? { label: String(cause.label), reasoning: cause.reasoning != null ? String(cause.reasoning) : null }
      : null,
  };
}

// Donors are people/orgs, not parties — display the type in plain English. PAC
// and Organization are already clear; Individual reads better as "individual donor".
function donorTypeNoun(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('ind')) return 'individual donor';
  if (t === 'pac') return 'PAC';
  if (t.startsWith('org')) return 'organization';
  return 'donor';
}

// Compact, prompt-ready list of this donor's verified facts (no invented numbers).
function donorFactsBlock(f: DonorCardFacts): string {
  const name = tidyName(f.display_name) || f.display_name;
  const lines: string[] = [];
  lines.push(`Donor (use exactly this name): ${name}`);
  lines.push(`Donor type: ${donorTypeNoun(f.type)}`);
  if (f.location) lines.push(`Based in: ${f.location}`);
  if ((f.total_given ?? 0) > 0) {
    lines.push(`Total political money given (all cycles in our data): ${fmtMoney(f.total_given)}${
      f.cycle_count && f.cycle_count > 1 ? ` across ${f.cycle_count} election cycles` : ''
    }${f.recipient_count ? `, to ${f.recipient_count.toLocaleString('en-US')} recipients` : ''}.`);
  }
  const tops = f.top_recipients.filter((r) => (r.amount ?? 0) > 0).slice(0, 3);
  if (tops.length > 0) {
    lines.push(`Biggest recipients of their money: ${
      tops.map((r) => `${tidyName(r.name)} (${fmtMoney(r.amount)})`).join('; ')
    }.`);
  }
  if (f.cause) {
    lines.push(`Classified cause / leaning: ${f.cause.label}${
      f.cause.reasoning ? ` — ${summarizeForSocial(f.cause.reasoning, 220)}` : ''
    }.`);
  }
  return lines.join('\n');
}

function buildDonorPrompt(platform: string, block: string, max: number): string {
  const long = PLATFORM_LIMITS[platform]?.long ?? false;
  const lengthRule = long
    ? `Length: 2–4 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; never run to the limit.`;
  return `You are a sharp political-money watchdog writing a punchy, headline-worthy ${platform.toUpperCase()} post about ONE big political DONOR — who they are and where their money goes — built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS donor or recipient name to Title Case.

VERIFIED FACTS:
${block}

Write the post:
- OPEN with the donor's name and their total giving figure — that's the hook.
- Then surface the single most striking secondary fact: their biggest recipient, OR (if given) their classified cause/leaning. "Follow the money" — who they bankroll is the story.
- If a cause/leaning is given, you MAY characterize the donor by it, but stay strictly FACTUAL — no name-calling, no invented numbers, no editorializing beyond the facts.
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Deterministic fallback caption, built to fit (no ellipsis fragments).
function donorTemplateCaption(f: DonorCardFacts, max: number): string {
  const name = tidyName(f.display_name) || f.display_name;
  const top = f.top_recipients.filter((r) => (r.amount ?? 0) > 0)[0] ?? null;
  const causeClause = f.cause ? ` Classified as ${f.cause.label}.` : '';
  const topClause = top ? ` Biggest recipient: ${tidyName(top.name)} (${fmtMoney(top.amount)}).` : '';
  const base = `${name}, a ${donorTypeNoun(f.type)}, has given ${fmtMoney(f.total_given)} in political money${
    f.cycle_count && f.cycle_count > 1 ? ` across ${f.cycle_count} cycles` : ''
  }.${topClause}${causeClause} Follow the money. 💰`;
  return summarizeForSocial(base, max);
}

// Builds a "follow the money" caption for one donor entity + platform.
// Returns null only when the donor has no usable facts (caller should fall back).
export async function composeDonorEntityCaption(
  admin: SupabaseClient,
  aiKey: string | undefined,
  donorId: string,
  platform: string,
  label: string | null,
): Promise<{ caption: string; source: string } | null> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const f = await fetchDonorCardFacts(admin, donorId);
  // No resolvable donor or no money to talk about — caller falls back to a static line.
  if (!f || (f.total_given ?? 0) <= 0) return null;
  void label; // label (subject_label) is informational; facts already carry the name.

  const ai = await aiCaption(aiKey, buildDonorPrompt(platform, donorFactsBlock(f), cfg.max), cfg.max);
  if (ai) {
    // aiCaption already guarantees a complete sentence within cfg.max.
    return { caption: ai, source: 'donor_entity_ai' };
  }
  return { caption: donorTemplateCaption(f, cfg.max), source: 'donor_entity_template' };
}
