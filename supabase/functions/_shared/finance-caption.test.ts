// Tests for pickAnalysisMode — the angle selector behind the analysis caption, and the
// guarantee that the "Analysis" caption style pins the record (positions/goals) angle.
import { expect, test } from 'bun:test';
import { pickAnalysisMode } from './finance-caption.ts';

test('forceMode "record" pins the record angle when a record summary exists', () => {
  expect(pickAnalysisMode({ long: false, hasRecord: true, hasFin: true, hasNews: false, forceMode: 'record' })).toBe('record');
  // Even on a long post with finance present, the pin wins (never funding/both).
  expect(pickAnalysisMode({ long: true, hasRecord: true, hasFin: true, hasNews: false, forceMode: 'record' })).toBe('record');
});

test('forceMode "record" is carried by a news hook alone (no record summary)', () => {
  expect(pickAnalysisMode({ long: false, hasRecord: false, hasFin: true, hasNews: true, forceMode: 'record' })).toBe('record');
});

test('forceMode "record" falls back to auto when neither record nor news backs it', () => {
  // Nothing to say in record mode → don't force an empty post; auto-pick funding.
  expect(pickAnalysisMode({ long: false, hasRecord: false, hasFin: true, hasNews: false, forceMode: 'record' })).toBe('funding');
});

test('without a forceMode, long posts cover both when record + finance exist', () => {
  expect(pickAnalysisMode({ long: true, hasRecord: true, hasFin: true, hasNews: false })).toBe('both');
  expect(pickAnalysisMode({ long: true, hasRecord: true, hasFin: false, hasNews: false })).toBe('record');
  expect(pickAnalysisMode({ long: true, hasRecord: false, hasFin: true, hasNews: false })).toBe('funding');
});

test('short posts pick one angle, randomized only when both exist', () => {
  // rand is injectable so the "both available" branch is deterministic under test.
  expect(pickAnalysisMode({ long: false, hasRecord: true, hasFin: true, hasNews: false, rand: 0.2 })).toBe('funding');
  expect(pickAnalysisMode({ long: false, hasRecord: true, hasFin: true, hasNews: false, rand: 0.8 })).toBe('record');
  // Only one ingredient → no randomness.
  expect(pickAnalysisMode({ long: false, hasRecord: true, hasFin: false, hasNews: false })).toBe('record');
  expect(pickAnalysisMode({ long: false, hasRecord: false, hasFin: true, hasNews: false })).toBe('funding');
});
