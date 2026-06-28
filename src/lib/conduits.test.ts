import { expect, test } from 'bun:test';
import { CONDUIT_NAMES, isConduitDonor, isConduitName } from './conduits';
// Edge-function (Deno) copy used by the FEC ETL — imported here so the two
// runtime copies of the conduit-org list are locked to the same set (see the
// drift-guard test at the bottom). Vite and Deno can't share a module, so this
// is the only thing keeping them from silently diverging.
import {
  KNOWN_CONDUITS,
  isKnownConduitOrg,
} from '../../supabase/functions/_shared/conduits';

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

// Drift guard: the frontend (CONDUIT_NAMES) and edge (KNOWN_CONDUITS) copies of
// the conduit-org list MUST cover the same processors. If they diverge, the UI
// would hide a donor row the ETL still counts (or vice-versa) — a data-accuracy
// hazard. Adding a processor to one list without the other fails this test.
test('frontend and edge conduit lists cover the same set', () => {
  const normalize = (list: readonly string[]) =>
    [...list].map((s) => s.toUpperCase()).sort();
  expect(normalize(CONDUIT_NAMES)).toEqual(normalize(KNOWN_CONDUITS));
});

test('isConduitName (frontend) and isKnownConduitOrg (edge) agree', () => {
  const fixtures = [
    'ACTBLUE',
    'ActBlue Texas',
    'WINRED',
    'WinRed',
    'Democracy Engine LLC',
    'AIPAC',
    'DOE, JANE',
    'SOME PAC',
    '',
  ];
  for (const name of fixtures) {
    expect(isConduitName(name)).toBe(isKnownConduitOrg(name));
  }
});
