// Tests for the evidence-index pure helpers (see evidence-index-utils.ts).
import { expect, test } from 'bun:test';
import {
  absolutizeUrl,
  candidateFeedPaths,
  extractPressLinks,
  extractRssLinks,
  parseFeedItems,
  stripHtmlToText,
} from './evidence-index-utils.ts';

test('parseFeedItems reads RSS 2.0 items incl. CDATA titles', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Lee &amp; Colleagues Introduce Bill]]></title>
      <link>https://www.lee.senate.gov/2024/7/example</link>
      <pubDate>Tue, 09 Jul 2024 12:00:00 GMT</pubDate></item>
    <item><title>No link item</title></item>
  </channel></rss>`;
  const items = parseFeedItems(xml);
  expect(items).toHaveLength(1);
  expect(items[0].title).toBe('Lee & Colleagues Introduce Bill');
  expect(items[0].url).toBe('https://www.lee.senate.gov/2024/7/example');
  expect(items[0].publishedAt).toContain('Jul 2024');
});

test('parseFeedItems falls back to Atom entries', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Statement on X</title>
      <link href="https://example.house.gov/news/1"/>
      <updated>2026-01-02T03:04:05Z</updated></entry>
  </feed>`;
  const items = parseFeedItems(xml);
  expect(items).toHaveLength(1);
  expect(items[0].url).toBe('https://example.house.gov/news/1');
});

test('stripHtmlToText drops script/nav blocks and squeezes whitespace', () => {
  const html = `<html><head><script>var x=1;</script></head>
    <body><nav>Home | About</nav><h1>Title</h1><p>First &amp; second.</p>
    <footer>contact</footer></body></html>`;
  const text = stripHtmlToText(html);
  expect(text).toContain('Title');
  expect(text).toContain('First & second.');
  expect(text).not.toContain('var x=1');
  expect(text).not.toContain('Home | About');
});

test('extractRssLinks finds advertised feeds and absolutizes them', () => {
  const html = `<link rel="alternate" type="application/rss+xml" href="/rss/press.xml">
    <link rel="stylesheet" href="/style.css">`;
  expect(extractRssLinks(html, 'https://www.titus.house.gov/'))
    .toEqual(['https://www.titus.house.gov/rss/press.xml']);
});

test('candidateFeedPaths probes the common newsroom locations', () => {
  const paths = candidateFeedPaths('https://www.hinson.house.gov/');
  expect(paths[0]).toBe('https://www.hinson.house.gov/rss.xml');
  expect(paths).toContain('https://www.hinson.house.gov/media/press-releases/feed');
});

test('extractPressLinks keeps same-host release-looking links, skips listings and crumbs', () => {
  const base = 'https://www.booker.senate.gov/news/press';
  const html = `
    <a href="/news/press/booker-announces-major-investment-in-nj">Booker Announces Major Investment in NJ</a>
    <a href="/news/press">All Press Releases</a>
    <a href="https://twitter.com/booker">Twitter</a>
    <a href="/news/press/other-release-about-housing-policy">Other Release About Housing Policy</a>
    <a href="/news/press/x">go</a>`;
  const items = extractPressLinks(html, base);
  expect(items.map((i) => i.url)).toEqual([
    'https://www.booker.senate.gov/news/press/booker-announces-major-investment-in-nj',
    'https://www.booker.senate.gov/news/press/other-release-about-housing-policy',
  ]);
});

test('absolutizeUrl handles relative and absolute hrefs', () => {
  expect(absolutizeUrl('https://a.gov/news/', '../rss.xml')).toBe('https://a.gov/rss.xml');
  expect(absolutizeUrl('https://a.gov/', 'https://b.gov/x')).toBe('https://b.gov/x');
  expect(absolutizeUrl('https://a.gov/', 'not a url://')).not.toBeNull(); // URL() tolerates this as a path
});
