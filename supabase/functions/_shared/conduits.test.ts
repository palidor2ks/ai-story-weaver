// Tests for the donor-aggregation counting rule (see conduits.ts).
import { expect, test } from 'bun:test';
import {
  isKnownConduitOrg,
  isMemoX,
  isSeeBelowPassThrough,
  shouldCountDonorLine,
} from './conduits.ts';

test('isKnownConduitOrg matches substrings and any casing', () => {
  expect(isKnownConduitOrg('ACTBLUE')).toBe(true);
  expect(isKnownConduitOrg('ActBlue Texas')).toBe(true);
  expect(isKnownConduitOrg('WINRED')).toBe(true);
  expect(isKnownConduitOrg('Democracy Engine LLC')).toBe(true);
  expect(isKnownConduitOrg('AIPAC')).toBe(false); // earmark program, not a payment conduit
  expect(isKnownConduitOrg('')).toBe(false);
  expect(isKnownConduitOrg(null)).toBe(false);
});

test('isMemoX accepts case/whitespace variants, rejects everything else', () => {
  expect(isMemoX('X')).toBe(true);
  expect(isMemoX('x')).toBe(true);
  expect(isMemoX(' X ')).toBe(true);
  expect(isMemoX('')).toBe(false);
  expect(isMemoX(null)).toBe(false);
  expect(isMemoX('A')).toBe(false);
});

test('isSeeBelowPassThrough catches conduit batch-total memo text', () => {
  expect(isSeeBelowPassThrough('EARMARKED CONTRIBUTION: SEE BELOW')).toBe(true);
  expect(isSeeBelowPassThrough('Earmarked contribution: see below')).toBe(true);
  expect(isSeeBelowPassThrough('EARMARKED FOR ESPAILLAT')).toBe(false);
  expect(isSeeBelowPassThrough(null)).toBe(false);
});

test('countable individual earmark counts; its memo-X duplicate does not', () => {
  // The real money: individual's countable line (memo NULL)
  expect(
    shouldCountDonorLine({
      contributorName: 'DOE, JANE',
      effectiveMemoCode: null,
      memoText: 'EARMARKED THROUGH ACTBLUE',
    }),
  ).toBe(true);
  // The AIPAC member pattern: org-attributed memo-X line is informational
  expect(
    shouldCountDonorLine({
      contributorName: 'AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL ACTION COMMITTEE',
      effectiveMemoCode: 'X',
      memoText: 'EARMARKED FOR ADRIANO ESPAILLAT',
    }),
  ).toBe(false);
  // Individual memo-X duplicate (e.g. JFC Line-12 attribution) is informational
  expect(
    shouldCountDonorLine({
      contributorName: 'LEVINE, ALLEN',
      effectiveMemoCode: 'X',
      memoText: null,
    }),
  ).toBe(false);
});

test('conduit-named lines never count, memoed or not', () => {
  expect(
    shouldCountDonorLine({ contributorName: 'ACTBLUE', effectiveMemoCode: 'X', memoText: null }),
  ).toBe(false);
  expect(
    shouldCountDonorLine({ contributorName: 'ACTBLUE', effectiveMemoCode: null, memoText: null }),
  ).toBe(false);
  expect(
    shouldCountDonorLine({ contributorName: 'WinRed', effectiveMemoCode: null, memoText: 'EARMARKED FOR SMITH' }),
  ).toBe(false);
});

test('SEE BELOW pass-through is excluded even without a memo code', () => {
  expect(
    shouldCountDonorLine({
      contributorName: 'SOME BUNDLER COMMITTEE',
      effectiveMemoCode: null,
      memoText: 'EARMARKED CONTRIBUTION: SEE BELOW',
    }),
  ).toBe(false);
});

test('a direct PAC contribution counts', () => {
  expect(
    shouldCountDonorLine({
      contributorName: 'AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL ACTION COMMITTEE',
      effectiveMemoCode: null,
      memoText: null,
    }),
  ).toBe(true);
});
