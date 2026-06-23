// Pure helpers for the per-answer, evidence-grounded score-inversion auditor
// (see docs/score-inversion-fix.md → "Per-answer source audit"). These are the two
// decision points that need to be unit-testable and consistent between the SQL prefilter
// (answer_audit_detect) and the edge-function AI check (audit-answer-sources):
//
//   1. isPartyOpposite — the cheap "this cited answer points the wrong way for its party"
//      predicate the detector encodes in SQL. Reproduced here so the verdict can be sanity-
//      checked / the predicate reused without round-tripping the DB.
//   2. parseVerdict — turn the Gemini JSON (or its prose fallback) into the constrained
//      {consistent|contradicts|unverifiable} verdict the audit row stores.
//
// IMPORTANT design note: party-opposite is only the PREFILTER. It is NOT proof of an
// inversion — a Republican who genuinely opposes a Republican-coded bill is legitimately
// party-opposite. The final verdict comes from comparing each answer against its OWN cited
// source (parseVerdict over the AI check), never from party alone.

// ── 1. Party-opposite prefilter ────────────────────────────────────────────────

export interface PartyOppositeFields {
  party?: string | null;
  answer_value?: number | null;
}

// Mirrors the SQL in answer_audit_detect():
//   (party ILIKE 'Republican%' AND answer_value <= -3)
//   OR (party ILIKE 'Democrat%' AND answer_value >= 3)
// A Republican answer that reads strongly left (<= -3) or a Democrat answer that reads
// strongly right (>= 3) is "party-opposite" and worth verifying against its source.
// Threshold ±3 matches the app's smallest non-neutral magnitude (VALID_VALUES).
export function isPartyOpposite(a: PartyOppositeFields): boolean {
  const v = typeof a.answer_value === 'number' ? a.answer_value : null;
  if (v === null) return false;
  const party = (a.party ?? '').trim().toLowerCase();
  if (party.startsWith('republican') && v <= -3) return true;
  if (party.startsWith('democrat') && v >= 3) return true;
  return false;
}

// ── 2. Gemini verdict parser ────────────────────────────────────────────────────

export type AuditVerdict = 'consistent' | 'contradicts' | 'unverifiable';

export interface ParsedVerdict {
  verdict: AuditVerdict;
  reason: string;
}

const VERDICTS: readonly AuditVerdict[] = ['consistent', 'contradicts', 'unverifiable'];

function clampReason(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// Accepts the model's JSON object ({ verdict, reason }) OR a loose string and normalizes it
// to one of the three allowed verdicts. Anything we can't confidently classify becomes
// 'unverifiable' — the safe default, because only 'contradicts' triggers a deletion+regen.
export function parseVerdict(input: unknown): ParsedVerdict {
  // Object form (preferred): { verdict, reason }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const raw = String(obj.verdict ?? '').trim().toLowerCase();
    const reason = clampReason(obj.reason);
    if ((VERDICTS as readonly string[]).includes(raw)) {
      return { verdict: raw as AuditVerdict, reason };
    }
    // Unrecognized verdict label: classify from the verdict LABEL only — never the reason
    // prose. 'contradicts' triggers a deletion+regen, so we must not let an incidental word
    // like "opposition" in an explanation upgrade a non-destructive verdict.
    return classifyText(raw, reason);
  }

  // String form: scan for a verdict keyword.
  if (typeof input === 'string') {
    return classifyText(input, clampReason(input));
  }

  return { verdict: 'unverifiable', reason: 'no verdict returned' };
}

function classifyText(text: string, reason: string): ParsedVerdict {
  const t = text.toLowerCase();
  // Order matters: "contradicts" is the consequential verdict, check it first, then the
  // explicit "consistent". Default to unverifiable when neither is clearly present.
  if (/\bcontradict/.test(t) || /\boppos/.test(t) || /\binvert/.test(t)) {
    return { verdict: 'contradicts', reason: reason || 'source contradicts stored stance' };
  }
  if (/\bconsistent\b/.test(t) || /\bsupport/.test(t) || /\bagree/.test(t) || /\bmatch/.test(t)) {
    return { verdict: 'consistent', reason: reason || 'source consistent with stored stance' };
  }
  return { verdict: 'unverifiable', reason: reason || 'could not verify source' };
}

// SSRF guard for the reachability probe (used by audit-answer-sources before it fetch()es a
// stored source_url). Accept only http(s) URLs whose host is a public name/address — reject
// loopback, link-local, and RFC-1918 private ranges so a poisoned source_url can never make the
// edge function probe internal infrastructure (e.g. cloud metadata at 169.254.169.254).
export function isSafePublicHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) return false;
  // IPv6 loopback (::1) / unique-local (fc00::/7) / link-local (fe80::/10)
  if (host === '::1' || /^(fc|fd|fe8|fe9|fea|feb)/i.test(host)) return false;
  // IPv4 dotted-quad: block this-host / loopback / private / link-local ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return false;
    if (a === 169 && b === 254) return false;          // link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false;          // 192.168.0.0/16
  }
  return true;
}

// Combine the source-reachability probe with the AI stance verdict. The owner's rule:
//   - source unreachable AND the AI says it opposes  → contradicts (fabricated/wrong citation)
//   - source unreachable only (AI inconclusive)      → unverifiable
//   - source reachable                               → trust the AI verdict as-is
export function combineReachability(
  ai: ParsedVerdict,
  reachable: boolean,
): ParsedVerdict {
  if (reachable) return ai;
  if (ai.verdict === 'contradicts') {
    return { verdict: 'contradicts', reason: `source unreachable; ${ai.reason}`.slice(0, 500) };
  }
  return { verdict: 'unverifiable', reason: `source unreachable; ${ai.reason}`.slice(0, 500) };
}
