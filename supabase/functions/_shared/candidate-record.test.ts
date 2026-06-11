// Tests for recordBlockFromAnalysis — the "positions & goals" block that powers the
// "Analysis" caption style. The key guarantee: it surfaces positions/goals (never money)
// and returns null when there's nothing usable (so the caller doesn't fall back to finance).
import { expect, test } from 'bun:test';
import { recordBlockFromAnalysis } from './candidate-record-utils.ts';

test('builds a positions + goals block from structured fields', () => {
  const block = recordBlockFromAnalysis({
    positions: [{ topic: 'Fiscal Policy', stance: 'Advocates fiscal restraint' }, { topic: 'Judiciary', stance: 'Limit foreign influence' }],
    goals: ['Deliver transparency on federal files', 'Promote conservative outcomes'],
  });
  expect(block).toBe('Positions — Fiscal Policy: Advocates fiscal restraint; Judiciary: Limit foreign influence. Goals — Deliver transparency on federal files; Promote conservative outcomes.');
});

test('handles positions-only and goals-only', () => {
  expect(recordBlockFromAnalysis({ positions: [{ topic: 'Trade', stance: 'Protectionist' }] })).toBe('Positions — Trade: Protectionist.');
  expect(recordBlockFromAnalysis({ goals: ['Cut red tape'] })).toBe('Goals — Cut red tape.');
});

test('falls back to the prose summary only when positions/goals are empty', () => {
  expect(recordBlockFromAnalysis({ summary: 'A two-term incumbent focused on energy.' })).toBe('A two-term incumbent focused on energy.');
  // Structured fields win over summary when present.
  expect(recordBlockFromAnalysis({ positions: [{ topic: 'Energy', stance: 'Pro-drilling' }], summary: 'ignored' })).toBe('Positions — Energy: Pro-drilling.');
});

test('returns null when there is nothing usable or info is insufficient', () => {
  expect(recordBlockFromAnalysis(null)).toBeNull();
  expect(recordBlockFromAnalysis({})).toBeNull();
  expect(recordBlockFromAnalysis({ positions: [], goals: [], summary: '   ' })).toBeNull();
  expect(recordBlockFromAnalysis({ insufficient_information: true, summary: 'do not use' })).toBeNull();
});

test('skips malformed position entries', () => {
  const block = recordBlockFromAnalysis({
    positions: [{ topic: 'Health', stance: '' }, { topic: '', stance: 'x' }, { topic: 'Tax', stance: 'Low' }] as never,
  });
  expect(block).toBe('Positions — Tax: Low.');
});
