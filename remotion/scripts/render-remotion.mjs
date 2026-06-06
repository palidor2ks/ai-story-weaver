import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  openBrowser,
  ensureBrowser,
} from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Include the voiceover by default. Set MUTED=1 to render a silent video.
const muted = process.env.MUTED === "1";
// Default output lives in the repo's remotion dir so CI can pick it up.
const outputLocation =
  process.env.OUT ?? path.resolve(__dirname, "../out/website-video.mp4");

const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

// Use a system Chromium if one is provided, otherwise let Remotion download
// and manage its own Chrome (works out of the box in CI / clean environments).
const browserExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!browserExecutable) {
  await ensureBrowser();
}

const browser = await openBrowser("chrome", {
  browserExecutable,
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({
  serveUrl: bundled,
  id: "main",
  puppeteerInstance: browser,
});

await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation,
  puppeteerInstance: browser,
  muted,
  concurrency: 1,
});

await browser.close({ silent: false });
console.log("DONE →", outputLocation);
