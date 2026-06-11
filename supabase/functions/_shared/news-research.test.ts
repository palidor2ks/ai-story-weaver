// Tests for the pure helpers behind the grounded controversy-research hook. The
// network/AI paths (callYouSmart + distill) are integration-only; these cover the
// string/citation guards that keep a cited URL real and a hook clean.
import { expect, test } from 'bun:test';
import { cleanHook, hostLabel, pickCitation } from './news-research-utils.ts';

test('hostLabel strips www and returns bare host', () => {
  expect(hostLabel('https://www.politico.com/news/2026/01/01/story')).toBe('politico.com');
  expect(hostLabel('https://apnews.com/article/abc')).toBe('apnews.com');
});

test('hostLabel returns empty string for a non-URL', () => {
  expect(hostLabel('not a url')).toBe('');
});

test('cleanHook trims quotes, markdown, and collapses whitespace', () => {
  expect(cleanHook('  “is  under   investigation”  ')).toBe('is under investigation');
  expect(cleanHook('**faces** an _ethics_ probe')).toBe('faces an ethics probe');
  expect(cleanHook(null)).toBe('');
  expect(cleanHook(undefined)).toBe('');
});

const citations = [
  { title: 'AP News', url: 'https://apnews.com/a' },
  { title: 'Politico', url: 'https://politico.com/b' },
];

test('pickCitation resolves a valid in-range index', () => {
  expect(pickCitation(citations, 1)?.url).toBe('https://politico.com/b');
});

test('pickCitation falls back to the first citation for an invalid/out-of-range index', () => {
  // The model can only ever cite a URL the research actually returned.
  expect(pickCitation(citations, 9)?.url).toBe('https://apnews.com/a');
  expect(pickCitation(citations, -1)?.url).toBe('https://apnews.com/a');
  expect(pickCitation(citations, 'x')?.url).toBe('https://apnews.com/a');
  expect(pickCitation(citations, 1.5)?.url).toBe('https://apnews.com/a');
});

test('pickCitation returns null when there are no citations', () => {
  expect(pickCitation([], 0)).toBeNull();
});
