// Tests for pickAnalysisMode — the angle selector behind the analysis caption, and the
// guarantee that the "Analysis" caption style pins the record (positions/goals) angle.
import { expect, test } from 'bun:test';
import { composeNewsCaption, composeRecordCaption, pickAnalysisMode } from './finance-caption.ts';

// With no AI key, aiCaption returns null, so these exercise the deterministic templates.
const meta = { name: 'Jane Smith', party: 'Republican', office: 'U.S. House', state: 'OH', score: 2, handle: null };

test('composeNewsCaption never returns null — distinct "no news" line when there is no hook', async () => {
  const r = await composeNewsCaption(undefined, meta, 'x', null);
  expect(r.source).toBe('news_none');
  expect(r.caption).toContain('No major recent news on Jane Smith');
  // The "no news" line must not read like a finance caption.
  expect(r.caption.toLowerCase()).not.toContain('raised');
});

test('composeNewsCaption leads with the attributed news, not money', async () => {
  const r = await composeNewsCaption(undefined, meta, 'x', { hook: 'won the Republican primary', source: 'AP', url: 'https://apnews.com/x' });
  expect(r.source).toBe('news_template');
  expect(r.caption).toContain('Per AP, Jane Smith won the Republican primary');
});

test('composeRecordCaption never returns null — distinct "not available" line with no record', async () => {
  const r = await composeRecordCaption(undefined, meta, 'x', null);
  expect(r.source).toBe('record_none');
  expect(r.caption).toContain("positions and goals isn't available yet");
});

test('composeRecordCaption frames positions/goals (never money/news)', async () => {
  const r = await composeRecordCaption(undefined, meta, 'x', 'Positions — Tax: Low. Goals — Cut spending.');
  expect(r.source).toBe('record_template');
  expect(r.caption).toContain('Where Jane Smith stands:');
  expect(r.caption.toLowerCase()).not.toContain('donor');
});

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
