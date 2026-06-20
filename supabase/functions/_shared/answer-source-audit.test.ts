// Tests for the per-answer source-audit pure helpers (see answer-source-audit.ts and
// docs/score-inversion-fix.md → "Per-answer source audit"). These two predicates are the
// contract between the SQL prefilter and the AI verdict step, so the invariants here are
// what keep the auditor from ever deleting a legitimately-cited answer.
import { expect, test } from 'bun:test';
import {
  isPartyOpposite,
  parseVerdict,
  combineReachability,
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

test('classifies prose when the verdict field is unrecognized', () => {
  expect(parseVerdict({ verdict: 'maybe', reason: 'the cited vote actually opposes it' }).verdict)
    .toBe('contradicts');
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
