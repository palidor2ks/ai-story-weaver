// Committee/PAC OUTSIDE-SPENDER social card: pick pool, verified facts, and the
// "follow the money" caption composer for the auto-poster's `committee_spender`
// rotation type.
//
// This is the COMMITTEE-anchored path (a notable outside-spender profile, mirroring
// /committee/:id and its Independent Expenditures section) — it replaces the older
// CANDIDATE-anchored "top committee spender" caption/card (facts about a politician's
// biggest outside spender) that the committee_spender rotation used to produce.
//
// Facts come straight from public RPCs over the IE rollup view + independent_
// expenditures (get_top_committee_spenders / get_committee_card_facts) — numbers are
// never re-rounded or invented. The caption reuses finance-caption.ts's AI gateway +
// sentence-fit helpers so it reads consistently with the rest of the app.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  PLATFORM_LIMITS,
  aiCaption,
  fmtMoney,
  summarizeForSocial,
  tidyName,
} from './finance-caption.ts';

export interface CommitteeSpender {
  fec_committee_id: string;
  name: string;
  total_spent: number;
}

export interface CommitteeTarget {
  name: string;
  amount: number;
  dir: 'support' | 'oppose';
}

export interface CommitteeCardFacts {
  name: string;
  total_spent: number | null;
  support_total: number | null;
  oppose_total: number | null;
  top_targets: CommitteeTarget[];
  cause: { label: string; reasoning: string | null } | null;
}

// The daily pick POOL: top outside spenders by total IE $, excluding recently-featured
// fec ids.
export async function fetchTopCommitteeSpenders(
  admin: SupabaseClient,
  limit: number,
  excludeIds: string[],
): Promise<CommitteeSpender[]> {
  const { data } = await admin.rpc('get_top_committee_spenders', {
    _limit: limit,
    _exclude_ids: excludeIds ?? [],
  });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    fec_committee_id: String(r.fec_committee_id),
    name: String(r.name ?? ''),
    total_spent: Number(r.total_spent ?? 0),
  }));
}

// Verified facts behind one committee's card, keyed by fec_committee_id. Null when
// the id resolves to no outside spender.
export async function fetchCommitteeCardFacts(
  admin: SupabaseClient,
  fecId: string,
): Promise<CommitteeCardFacts | null> {
  const { data } = await admin.rpc('get_committee_card_facts', { _fec_id: fecId });
  const raw = (data ?? null) as Record<string, unknown> | null;
  if (!raw || !raw.name) return null;
  const targets = Array.isArray(raw.top_targets) ? raw.top_targets : [];
  const cause = raw.cause && typeof raw.cause === 'object'
    ? raw.cause as { label?: unknown; reasoning?: unknown }
    : null;
  return {
    name: String(raw.name),
    total_spent: raw.total_spent != null ? Number(raw.total_spent) : null,
    support_total: raw.support_total != null ? Number(raw.support_total) : null,
    oppose_total: raw.oppose_total != null ? Number(raw.oppose_total) : null,
    top_targets: (targets as Array<Record<string, unknown>>)
      .filter((t) => t && t.name != null)
      .map((t) => ({
        name: String(t.name),
        amount: Number(t.amount ?? 0),
        dir: t.dir === 'oppose' ? 'oppose' : 'support',
      })),
    cause: cause && cause.label != null
      ? { label: String(cause.label), reasoning: cause.reasoning != null ? String(cause.reasoning) : null }
      : null,
  };
}

// Compact, prompt-ready list of this committee's verified facts (no invented numbers).
function committeeFactsBlock(f: CommitteeCardFacts): string {
  const name = tidyName(f.name) || f.name;
  const lines: string[] = [];
  lines.push(`Outside-spending committee / Super PAC (use exactly this name): ${name}`);
  if ((f.total_spent ?? 0) > 0) {
    lines.push(`Total independent-expenditure money spent to influence races: ${fmtMoney(f.total_spent)}.`);
  }
  const sup = f.support_total ?? 0;
  const opp = f.oppose_total ?? 0;
  if (sup > 0 || opp > 0) {
    lines.push(`Split: ${fmtMoney(sup)} spent SUPPORTING candidates vs ${fmtMoney(opp)} spent OPPOSING candidates.`);
  }
  const tops = f.top_targets.filter((t) => (t.amount ?? 0) > 0).slice(0, 3);
  if (tops.length > 0) {
    lines.push(`Biggest targets of that money: ${
      tops.map((t) => `${tidyName(t.name)} (${fmtMoney(t.amount)} to ${t.dir === 'support' ? 'elect' : 'defeat'} them)`).join('; ')
    }.`);
  }
  if (f.cause) {
    lines.push(`Classified cause / agenda: ${f.cause.label}${
      f.cause.reasoning ? ` — ${summarizeForSocial(f.cause.reasoning, 220)}` : ''
    }.`);
  }
  return lines.join('\n');
}

function buildCommitteePrompt(platform: string, block: string, max: number): string {
  const long = PLATFORM_LIMITS[platform]?.long ?? false;
  const lengthRule = long
    ? `Length: 2–4 short sentences, under ${max} characters.`
    : `Length: ONE or TWO tight sentences. Stay comfortably under ${max} characters — aim for about ${Math.round(max * 0.85)} and leave room; never run to the limit.`;
  return `You are a sharp political-money watchdog writing a punchy, headline-worthy ${platform.toUpperCase()} post about ONE big OUTSIDE-SPENDING committee / Super PAC — who they are and which candidates their money is working to elect or defeat — built for media consumption and engagement.

Use ONLY the verified facts below. Never invent, alter, or re-round any number; never add a fact that isn't listed. You MAY tidy an ALL-CAPS committee or candidate name to Title Case.

VERIFIED FACTS:
${block}

Write the post:
- OPEN with the committee's name and its total outside-spending figure — that's the hook. Big outside money trying to buy seats is the story.
- Then surface the single most striking secondary fact: the biggest candidate they spent FOR or AGAINST, OR (if given) their classified cause/agenda. "Follow the money" — whom they bankroll or attack is the story.
- If a cause/agenda is given, you MAY characterize the committee by it, but stay strictly FACTUAL — no name-calling, no invented numbers, no editorializing beyond the facts.
- Intense, headline-worthy, media-ready. Exactly ONE tasteful emoji.
- ${lengthRule}
- Plain text ONLY — no markdown, no asterisks, no hashtags. Do NOT include a URL (a link is appended automatically). No quotes, no preamble.`;
}

// Deterministic fallback caption, built to fit (no ellipsis fragments).
function committeeTemplateCaption(f: CommitteeCardFacts, max: number): string {
  const name = tidyName(f.name) || f.name;
  const top = f.top_targets.filter((t) => (t.amount ?? 0) > 0)[0] ?? null;
  const causeClause = f.cause ? ` Classified as ${f.cause.label}.` : '';
  const topClause = top
    ? ` Biggest play: ${fmtMoney(top.amount)} to ${top.dir === 'support' ? 'elect' : 'defeat'} ${tidyName(top.name)}.`
    : '';
  const base = `${name} has spent ${fmtMoney(f.total_spent)} in outside money to sway federal races.${topClause}${causeClause} Follow the money. 💸`;
  return summarizeForSocial(base, max);
}

// Builds a "follow the money" caption for one outside-spender committee + platform.
// Returns null only when the committee has no usable facts (caller should fall back).
export async function composeCommitteeSpenderCaption(
  admin: SupabaseClient,
  aiKey: string | undefined,
  fecId: string,
  platform: string,
  label: string | null,
): Promise<{ caption: string; source: string } | null> {
  const cfg = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.x;
  const f = await fetchCommitteeCardFacts(admin, fecId);
  // No resolvable committee or no spending to talk about — caller falls back to a static line.
  if (!f || (f.total_spent ?? 0) <= 0) return null;
  void label; // label (subject_label) is informational; facts already carry the name.

  const ai = await aiCaption(aiKey, buildCommitteePrompt(platform, committeeFactsBlock(f), cfg.max), cfg.max);
  if (ai) {
    // aiCaption already guarantees a complete sentence within cfg.max.
    return { caption: ai, source: 'committee_entity_ai' };
  }
  return { caption: committeeTemplateCaption(f, cfg.max), source: 'committee_entity_template' };
}
