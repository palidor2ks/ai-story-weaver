// Tests for the per-answer source-audit pure helpers (see answer-source-audit.ts and
// docs/score-inversion-fix.md → "Per-answer source audit"). These two predicates are the
// contract between the SQL prefilter and the AI verdict step, so the invariants here are
// what keep the auditor from ever deleting a legitimately-cited answer.
import { expect, test } from 'bun:test';
import {
  isPartyOpposite,
  parseVerdict,
  combineReachability,
  isSafePublicHttpUrl,
} from './answer-source-audit.ts';

// ── isPartyOpposite ─────────────────────────────────────────────────────────────

test('flags a Republican answer that reads strongly left', () => {
  expect(isPartyOpposite({ party: 'Republican', answer_value: -3 })).toBe(true);
  expect(isPartyOpposite({ party: 'Republican Party', answer_value: -10 })).toBe(true);
});

test('flags a Democrat answer that reads strongly right', () => {
  expect(isPartyOpposite({ party: 'Democrat', answer_value: 3 })).toBe(true);
  expect(isPartyOpposite({ party: 'Democratic', answer_value: 7 })).toBe(true);
});

test('does not flag party-aligned or neutral answers', () => {
  expect(isPartyOpposite({ party: 'Republican', answer_value: 7 })).toBe(false);
  expect(isPartyOpposite({ party: 'Democrat', answer_value: -5 })).toBe(false);
  expect(isPartyOpposite({ party: 'Republican', answer_value: 0 })).toBe(false);
  expect(isPartyOpposite({ party: 'Democrat', answer_value: 0 })).toBe(false);
});

test('ignores mild deviations below the +/-3 threshold', () => {
  // -2 / +2 are not valid app values, but the predicate must still respect the threshold.
  expect(isPartyOpposite({ party: 'Republican', answer_value: -2 })).toBe(false);
  expect(isPartyOpposite({ party: 'Democrat', answer_value: 2 })).toBe(false);
});

test('is case-insensitive and tolerant of party prefixes/whitespace', () => {
  expect(isPartyOpposite({ party: '  republican ', answer_value: -5 })).toBe(true);
  expect(isPartyOpposite({ party: 'DEMOCRATIC-FARMER-LABOR', answer_value: 5 })).toBe(true);
});

test('returns false for third parties, missing party, or missing value', () => {
  expect(isPartyOpposite({ party: 'Independent', answer_value: -10 })).toBe(false);
  expect(isPartyOpposite({ party: 'Libertarian', answer_value: 10 })).toBe(false);
  expect(isPartyOpposite({ party: null, answer_value: -10 })).toBe(false);
  expect(isPartyOpposite({ party: 'Republican', answer_value: null })).toBe(false);
  expect(isPartyOpposite({})).toBe(false);
});

// ── parseVerdict ─────────────────────────────────────────────────────────────────

test('parses the canonical JSON object form', () => {
  expect(parseVerdict({ verdict: 'consistent', reason: 'bill text matches' }))
    .toEqual({ verdict: 'consistent', reason: 'bill text matches' });
  expect(parseVerdict({ verdict: 'contradicts', reason: 'source shows support' }).verdict)
    .toBe('contradicts');
  expect(parseVerdict({ verdict: 'unverifiable', reason: '404' }).verdict)
    .toBe('unverifiable');
});

test('is case-insensitive on the verdict keyword and trims the reason', () => {
  const out = parseVerdict({ verdict: '  CONTRADICTS ', reason: '  multi   space  ' });
  expect(out.verdict).toBe('contradicts');
  expect(out.reason).toBe('multi space');
});

test('classifies from the verdict label (object) or full text (string fallback)', () => {
  // Object form: classify from the LABEL only, never the reason prose (see destructive-safety
  // test below). A near-miss label like "contradiction" still resolves to 'contradicts'.
  expect(parseVerdict({ verdict: 'contradiction', reason: 'n/a' }).verdict).toBe('contradicts');
  // Bare-string fallback (JSON parse failed entirely): scan the whole model text.
  expect(parseVerdict('The source clearly supports the stored position').verdict)
    .toBe('consistent');
});

test('defaults to unverifiable for empty / unclassifiable input', () => {
  expect(parseVerdict('').verdict).toBe('unverifiable');
  expect(parseVerdict(null).verdict).toBe('unverifiable');
  expect(parseVerdict(undefined).verdict).toBe('unverifiable');
  expect(parseVerdict(42).verdict).toBe('unverifiable');
});

test('caps the reason length', () => {
  const long = 'x'.repeat(2000);
  expect(parseVerdict({ verdict: 'consistent', reason: long }).reason.length).toBe(500);
});

// ── parseVerdict: truncated / fenced model output (the JSON-leak + mislabel bug) ──
// Gemini + googleSearch can cut the reply off before the closing brace, so JSON.parse fails and
// the raw blob reaches parseVerdict as a string. The model's STRUCTURED verdict must still win
// over keyword-scanning the reason prose, otherwise a "consistent" answer with an "oppose"-ish
// explanation got flipped to the destructive 'contradicts' (observed in production).
test('honors an explicit verdict field in a truncated (unterminated) JSON blob', () => {
  const truncated =
    '```json\n{ "verdict": "consistent", "reason": "The source shows the politician opposed the';
  // Prose contains "opposed" — the old code keyword-scanned the whole blob and returned contradicts.
  expect(parseVerdict(truncated).verdict).toBe('consistent');
});

test('extracts the reason from a fenced JSON blob and drops the fence noise', () => {
  const out = parseVerdict('```json\n{ "verdict": "contradicts", "reason": "cited bill text supports it" }\n```');
  expect(out.verdict).toBe('contradicts');
  expect(out.reason).toBe('cited bill text supports it');
  expect(out.reason).not.toContain('```');
});

test('truncated blob with a verdict but no reason falls back to a clean default', () => {
  const out = parseVerdict('{ "verdict": "unverifiable", "reaso');
  expect(out.verdict).toBe('unverifiable');
  expect(out.reason).toBe('could not verify source');
});

test('prose-only output (no verdict field) still keyword-classifies as before', () => {
  expect(parseVerdict('The source clearly supports the stored position').verdict).toBe('consistent');
  expect(parseVerdict('This contradicts the record entirely').verdict).toBe('contradicts');
});

// ── combineReachability ────────────────────────────────────────────────────────

test('reachable source: trusts the AI verdict unchanged', () => {
  const ai = { verdict: 'consistent' as const, reason: 'ok' };
  expect(combineReachability(ai, true)).toEqual(ai);
});

test('unreachable + opposing AI verdict => contradicts', () => {
  const out = combineReachability({ verdict: 'contradicts', reason: 'opposes' }, false);
  expect(out.verdict).toBe('contradicts');
  expect(out.reason).toContain('unreachable');
});

test('unreachable only (AI inconclusive) => unverifiable', () => {
  expect(combineReachability({ verdict: 'consistent', reason: 'ok' }, false).verdict)
    .toBe('unverifiable');
  expect(combineReachability({ verdict: 'unverifiable', reason: 'idk' }, false).verdict)
    .toBe('unverifiable');
});

// ── parseVerdict must not let reason prose upgrade to the destructive 'contradicts' ──
test('reason prose containing "opposition" does NOT upgrade an unverifiable verdict', () => {
  // Object form with an unrecognized verdict label + opposey reason: must stay non-destructive.
  expect(parseVerdict({ verdict: 'unknown', reason: 'the source is in opposition but unclear' }).verdict)
    .toBe('unverifiable');
});
test('a near-miss verdict label is still classified from the label itself', () => {
  expect(parseVerdict({ verdict: 'contradicts.', reason: 'whatever' }).verdict).toBe('contradicts');
  expect(parseVerdict({ verdict: 'consistent!', reason: 'whatever' }).verdict).toBe('consistent');
});

// ── isSafePublicHttpUrl (SSRF guard) ─────────────────────────────────────────────
test('accepts ordinary public http(s) URLs', () => {
  expect(isSafePublicHttpUrl('https://www.congress.gov/bill/123')).toBe(true);
  expect(isSafePublicHttpUrl('http://example.com/path?q=1')).toBe(true);
  expect(isSafePublicHttpUrl('https://8.8.8.8/')).toBe(true);
});
test('rejects non-http(s), empty, and unparseable URLs', () => {
  expect(isSafePublicHttpUrl(null)).toBe(false);
  expect(isSafePublicHttpUrl('')).toBe(false);
  expect(isSafePublicHttpUrl('ftp://example.com')).toBe(false);
  expect(isSafePublicHttpUrl('file:///etc/passwd')).toBe(false);
  expect(isSafePublicHttpUrl('not a url')).toBe(false);
});
test('rejects loopback, link-local, and private ranges (SSRF)', () => {
  expect(isSafePublicHttpUrl('http://localhost/x')).toBe(false);
  expect(isSafePublicHttpUrl('http://127.0.0.1/x')).toBe(false);
  expect(isSafePublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  expect(isSafePublicHttpUrl('http://10.0.0.5/x')).toBe(false);
  expect(isSafePublicHttpUrl('http://172.16.0.1/x')).toBe(false);
  expect(isSafePublicHttpUrl('http://192.168.1.1/x')).toBe(false);
  expect(isSafePublicHttpUrl('http://[::1]/x')).toBe(false);
});
