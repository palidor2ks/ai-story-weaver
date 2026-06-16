// Tests for the visible-states ingestion gate helpers (isStateVisible, ingestionHiddenList)
// used by the cron/sync edge functions to skip hidden states while keeping national work.
import { expect, test } from 'bun:test';
import { ingestionHiddenList, isStateVisible } from './onboard-candidate.ts';

const hidden = new Set(['CA', 'NY', 'FL', 'US']);

test('isStateVisible: hidden state is not visible', () => {
  expect(isStateVisible('CA', hidden)).toBe(false);
  expect(isStateVisible('FL', hidden)).toBe(false);
});

test('isStateVisible: visible state is visible', () => {
  expect(isStateVisible('NC', hidden)).toBe(true);
  expect(isStateVisible('NJ', hidden)).toBe(true);
});

test('isStateVisible: case-insensitive', () => {
  expect(isStateVisible('ca', hidden)).toBe(false);
  expect(isStateVisible('nc', hidden)).toBe(true);
});

test('isStateVisible: national/President always kept (even though US is hidden)', () => {
  expect(isStateVisible(null, hidden)).toBe(true);
  expect(isStateVisible('', hidden)).toBe(true);
  expect(isStateVisible('US', hidden)).toBe(true);
  // president office in any state is national
  expect(isStateVisible('CA', hidden, 'President of the United States')).toBe(true);
});

test('ingestionHiddenList: drops US (so national rows survive query-level exclusion) and falsy', () => {
  const list = ingestionHiddenList(hidden);
  expect(list).toContain('CA');
  expect(list).toContain('NY');
  expect(list).toContain('FL');
  expect(list).not.toContain('US');
});

test('ingestionHiddenList: empty when nothing hidden', () => {
  expect(ingestionHiddenList(new Set())).toEqual([]);
});
