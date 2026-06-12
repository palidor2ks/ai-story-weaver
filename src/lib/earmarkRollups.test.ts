import { expect, test } from 'bun:test';
import {
  buildEarmarkRollupIndex,
  earmarkRollupKey,
  matchEarmarkRollupKey,
  normalizeOrgKey,
} from './earmarkRollups';

const AIPAC_RAW = 'AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL ACTION COMMITTEE';

test('normalizeOrgKey collapses whitespace and uppercases', () => {
  expect(normalizeOrgKey('  Aipac   Pac ')).toBe('AIPAC PAC');
  expect(normalizeOrgKey('AIPAC\u00A0PAC')).toBe('AIPAC PAC'); // NBSP counts as whitespace
});

test('matchEarmarkRollupKey tries every known spelling for the donor cycle', () => {
  const index = buildEarmarkRollupIndex([{ org_label: AIPAC_RAW, cycle: '2026' }]);

  // Raw FEC name matches directly
  expect(
    matchEarmarkRollupKey({ name: AIPAC_RAW, cycle: '2026' }, index),
  ).toBe(earmarkRollupKey(AIPAC_RAW, '2026'));

  // Consolidated row whose display_name/name differ from the raw spelling
  expect(
    matchEarmarkRollupKey(
      {
        name: 'AIPAC',
        display_name: 'AIPAC',
        name_variations: ['AIPAC', AIPAC_RAW],
        cycle: '2026',
      },
      index,
    ),
  ).toBe(earmarkRollupKey(AIPAC_RAW, '2026'));

  // Same org, different cycle: no match (rollups are per-cycle)
  expect(matchEarmarkRollupKey({ name: AIPAC_RAW, cycle: '2024' }, index)).toBeNull();

  // Unrelated donor: no match
  expect(matchEarmarkRollupKey({ name: 'DOE, JANE', cycle: '2026' }, index)).toBeNull();
});

test('buildEarmarkRollupIndex keys by normalized label + cycle', () => {
  const index = buildEarmarkRollupIndex([
    { org_label: 'Aipac  Pac', cycle: '2024' },
    { org_label: 'AIPAC PAC', cycle: '2026' },
  ]);
  expect(index.size).toBe(2);
  expect(index.has('AIPAC PAC|2024')).toBe(true);
  expect(index.has('AIPAC PAC|2026')).toBe(true);
});
