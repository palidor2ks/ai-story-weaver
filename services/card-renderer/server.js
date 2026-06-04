// Tiny headless-Chrome screenshot service for the automatic social-post pipeline.
//
// It loads the app's public render route (which mounts the real
// CandidateStatCard), waits for the card to signal it's ready, and returns a
// 1080x1080 PNG. The Supabase edge function `render-social-card` calls this and
// uploads the PNG — so the auto-posted card is byte-for-byte the same component
// the in-app share button produces.
//
// Env:
//   APP_BASE_URL   - origin of the deployed app (e.g. https://www.polipulseapp.com)
//   SHARED_SECRET  - require this value in the `x-render-token` header (recommended)
//   PORT           - listen port (default 8080)
//   NAV_TIMEOUT_MS - per-render timeout (default 35000)

const express = require('express');
const { chromium } = require('playwright');

const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.polipulseapp.com').replace(/\/+$/, '');
const SHARED_SECRET = process.env.SHARED_SECRET || '';
const PORT = Number(process.env.PORT || 8080);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 35000);
const CARD_SIZE = 1080;

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .catch((e) => {
        browserPromise = null; // allow a later retry after a transient launch failure
        throw e;
      });
  }
  return browserPromise;
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.status(200).send('ok'));

app.post('/render', async (req, res) => {
  if (SHARED_SECRET && req.get('x-render-token') !== SHARED_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const candidateId = String((req.body && req.body.candidateId) || '').trim();
  if (!candidateId || !/^[\w.-]{1,128}$/.test(candidateId)) {
    return res.status(400).json({ error: 'invalid_candidate_id' });
  }

  const url = `${APP_BASE_URL}/r/card/${encodeURIComponent(candidateId)}`;
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: CARD_SIZE, height: CARD_SIZE },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    // The render page sets window.__CARD_READY__ once the card data + layout settle.
    await page.waitForFunction(() => window.__CARD_READY__ === true, null, { timeout: NAV_TIMEOUT_MS });

    const el = await page.$('#card-root');
    const png = el
      ? await el.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: CARD_SIZE, height: CARD_SIZE } });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    return res.status(200).send(png);
  } catch (e) {
    return res.status(500).json({ error: 'render_failed', detail: String((e && e.message) || e) });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`card-renderer listening on :${PORT} (app=${APP_BASE_URL})`);
});
