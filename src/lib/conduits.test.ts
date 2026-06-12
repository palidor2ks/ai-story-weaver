import { expect, test } from 'bun:test';
import { isConduitDonor, isConduitName } from './conduits';

test('isConduitName matches substrings in any casing, nothing else', () => {
  expect(isConduitName('ACTBLUE')).toBe(true);
  expect(isConduitName('ActBlue Texas')).toBe(true);
  expect(isConduitName('WINRED')).toBe(true);
  expect(isConduitName('Democracy Engine LLC')).toBe(true);
  expect(isConduitName('AIPAC')).toBe(false);
  expect(isConduitName(null)).toBe(false);
  expect(isConduitName(undefined)).toBe(false);
});

test('isConduitDonor honors the DB flag', () => {
  expect(isConduitDonor({ name: 'SOME PROCESSOR', is_conduit_org: true })).toBe(true);
  expect(isConduitDonor({ name: 'SOME PAC', is_conduit_org: false })).toBe(false);
});

test('isConduitDonor prefers display_name, falls back to name', () => {
  // Canonical name says conduit even when the raw name does not
  expect(isConduitDonor({ name: 'AB TEXAS', display_name: 'ActBlue' })).toBe(true);
  // No display_name: raw name decides
  expect(isConduitDonor({ name: 'WINRED' })).toBe(true);
  expect(isConduitDonor({ name: 'DOE, JANE' })).toBe(false);
});
