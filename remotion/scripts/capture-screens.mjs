// Captures real screenshots of the live Polipulse site into remotion/public/screens/.
// Run with:  cd remotion && node scripts/capture-screens.mjs
import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/screens');
const BASE = process.env.BASE_URL || 'https://id-preview--b4a499eb-c11a-4320-8adc-dfe50259459a.lovable.app';

const CANDIDATE_ID = 'K000394';
const DONOR_ID = 'pac-donor-28f755fb265cc678a1555e7d7c203b7a';

const targets = [
  { name: 'home',       url: `${BASE}/`,                          width: 1920, height: 1080, full: false },
  { name: 'home-tall',  url: `${BASE}/`,                          width: 1920, height: 2600, full: false },
  { name: 'quiz',       url: `${BASE}/quiz`,                      width: 1920, height: 1200, full: false },
  { name: 'candidate',  url: `${BASE}/candidate/${CANDIDATE_ID}`, width: 1920, height: 3400, full: false },
  { name: 'donor',      url: `${BASE}/donor/${DONOR_ID}`,         width: 1920, height: 2800, full: false },
  { name: 'committees', url: `${BASE}/committees`,                width: 1920, height: 2200, full: false },
  { name: 'spenders',   url: `${BASE}/top-spenders`,              width: 1920, height: 2400, full: false },
];

const hideCss = `
  /* Kill cookie / consent banners + dev overlays */
  [class*="cookie" i], [id*="cookie" i],
  [class*="consent" i], [id*="consent" i],
  [data-lovable-badge], iframe[src*="lovable"],
  .lovable-badge { display: none !important; }
  html, body { scroll-behavior: auto !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  for (const t of targets) {
    console.log(`→ ${t.name}  ${t.url}  (${t.width}x${t.height})`);
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(t.url, { waitUntil: 'networkidle', timeout: 60_000 });
    } catch (e) {
      console.warn('  goto fallback (load):', e.message);
      await page.goto(t.url, { waitUntil: 'load', timeout: 60_000 });
    }
    await page.addStyleTag({ content: hideCss });
    await sleep(2500); // settle for images/skeletons
    // Scroll to top to be deterministic
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    const out = path.join(OUT, `${t.name}.png`);
    await page.screenshot({ path: out, fullPage: t.full, type: 'png' });
    console.log('  saved', out);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
