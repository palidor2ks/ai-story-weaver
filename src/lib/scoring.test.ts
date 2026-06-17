import { expect, test } from 'bun:test';
import { isTrustedForScoring } from './scoring';

test('isTrustedForScoring trusts vote-derived answers even with no URL', () => {
  expect(isTrustedForScoring({ evidence_type: 'voting_record' })).toBe(true);
  expect(isTrustedForScoring({ source_type: 'voting_record', source_url: null })).toBe(true);
});

test('isTrustedForScoring trusts any answer carrying a real source URL', () => {
  expect(isTrustedForScoring({ evidence_type: 'inferred', source_url: 'https://x.test/a' })).toBe(true);
  expect(isTrustedForScoring({ source_type: 'campaign_website', source_urls: ['https://x.test/b'] })).toBe(true);
});

test('isTrustedForScoring excludes inferred / URL-less claimed answers', () => {
  // inferred party-platform guess, no URL → not trusted
  expect(isTrustedForScoring({ evidence_type: 'inferred', source_type: 'other' })).toBe(false);
  // fabricated-provenance public statement with no link → not trusted
  expect(isTrustedForScoring({ evidence_type: 'public_statement', source_type: 'public_statement' })).toBe(false);
  // campaign position claimed but no link → not trusted
  expect(isTrustedForScoring({ evidence_type: 'campaign_position', source_type: 'campaign_website' })).toBe(false);
});

test('isTrustedForScoring treats blank/empty URLs as no URL', () => {
  expect(isTrustedForScoring({ source_url: '   ' })).toBe(false);
  expect(isTrustedForScoring({ source_urls: [] })).toBe(false);
  expect(isTrustedForScoring({ source_urls: ['', '  '] })).toBe(false);
  expect(isTrustedForScoring({ source_urls: ['', 'https://x.test/c'] })).toBe(true);
});

test('isTrustedForScoring is false when all provenance is null/absent', () => {
  expect(isTrustedForScoring({})).toBe(false);
  expect(isTrustedForScoring({ evidence_type: null, source_type: null, source_url: null, source_urls: null })).toBe(false);
});
