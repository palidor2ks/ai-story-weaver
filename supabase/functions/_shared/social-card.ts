// Server-side stat-card renderer for fully-automated posting (no browser).
//
// Preferred: when SCREENSHOT_SERVICE_URL is set, render the EXACT in-app
// <CandidateStatCard> by screenshotting it via the headless `card-renderer`
// service — identical to the in-app share button.
// Fallback: a purpose-built 1080x1080 SVG card rasterised with resvg-wasm
// (simpler; used only until the screenshot service is configured).
//
// Either way the PNG is uploaded to the same `share-cards` bucket + table the
// browser flow uses, so the rest of the pipeline (share-card-page OpenGraph
// unfurl, post-social-card) is unchanged.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import {
  fmtMoney,
  tidyName,
} from './finance-caption.ts';
import { type DonorCardFacts, fetchDonorCardFacts } from './donor-card.ts';
import { type CommitteeCardFacts, fetchCommitteeCardFacts } from './committee-card.ts';
import { type RaceCardFacts, type RaceCandidateFacts, type RaceParams, fetchRaceCardFacts, raceTitle, raceCardDescription, composeRaceAnalysis } from './race-card.ts';

const RACE_AI_KEY = Deno.env.get('LOVABLE_API_KEY');

const RESVG_WASM_URL = 'https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const CARD_SIZE = 1080;
const PUBLIC_SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.polipulseapp.com').replace(/\/+$/, '');

// When configured, render the EXACT in-app CandidateStatCard via the headless
// `services/card-renderer` screenshot service (same component as the share
// button). Until it's set, we fall back to the built-in SVG card below.
const SCREENSHOT_SERVICE_URL = Deno.env.get('SCREENSHOT_SERVICE_URL');
const SCREENSHOT_SERVICE_TOKEN = Deno.env.get('SCREENSHOT_SERVICE_TOKEN');

async function screenshotCard(candidateId: string): Promise<Uint8Array> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SCREENSHOT_SERVICE_TOKEN) headers['x-render-token'] = SCREENSHOT_SERVICE_TOKEN;
  const res = await fetch(SCREENSHOT_SERVICE_URL!, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateId }),
  });
  if (!res.ok) {
    throw new Error(`screenshot_failed_${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 1000) throw new Error('screenshot_too_small');
  return buf;
}

// ---------- one-time asset init (cached across warm invocations) ----------

let wasmReady: Promise<unknown> | null = null;
function ensureWasm(): Promise<unknown> {
  if (!wasmReady) {
    wasmReady = initWasm(fetch(RESVG_WASM_URL)).catch((e) => {
      // Reset so a later invocation can retry after a transient failure.
      wasmReady = null;
      throw e;
    });
  }
  return wasmReady;
}

// resvg needs raw TTF/OTF — it can't decode woff2. Scraping Google Fonts CSS
// for a TTF proved unreliable (Google serves woff to most user-agents, so no
// .ttf url is ever found and the render fails with font_ttf_not_found), so we
// fetch the static Inter TTFs directly from a CDN. @expo-google-fonts ships
// plain .ttf files; jsdelivr is primary with unpkg as a fallback.
const FONT_URLS: Record<number, string[]> = {
  400: [
    'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf',
    'https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf',
  ],
  700: [
    'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf',
    'https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf',
  ],
};

const fontCache = new Map<number, Uint8Array>();
async function loadInter(weight: number): Promise<Uint8Array> {
  const cached = fontCache.get(weight);
  if (cached) return cached;
  const urls = FONT_URLS[weight] ?? FONT_URLS[400];
  // Text cannot render without a font, so try each CDN and retry transient blips.
  let lastErr: unknown;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`font_fetch_${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength < 2000) throw new Error('font_too_small');
        fontCache.set(weight, buf);
        return buf;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('font_load_failed');
}

// ---------- helpers ----------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, max: number): string {
  const t = (s ?? '').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function partyColor(party: string | null): string {
  const p = (party ?? '').trim().toUpperCase();
  if (p.startsWith('R')) return '#ef4444';
  if (p.startsWith('D')) return '#3b82f6';
  return '#9ca3af';
}

async function fetchImageDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'PoliPulse-card/1.0' } });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 6_000_000) return null;
    // Derive a clean MIME from magic bytes — resvg only embeds PNG/JPEG
    // reliably, and echoing a parametrised content-type header (e.g.
    // "image/png; charset=utf-8") would yield a malformed data URI. Anything
    // else (webp/gif/svg) falls back to initials.
    let mime: string;
    if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
    else if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
    else return null;
    return `data:${mime};base64,${encodeBase64(buf)}`;
  } catch {
    return null;
  }
}

export interface CardCandidate {
  id: string;
  name: string;
  office: string | null;
  party: string | null;
  state: string | null;
  district: string | null;
  image_url: string | null;
  overall_score: number | string | null;
}

// ---------- SVG composition ----------

function nameFontSize(name: string): number {
  const len = (name ?? '').length;
  if (len > 24) return 54;
  if (len > 18) return 64;
  return 74;
}

function buildSvg(c: CardCandidate, photoDataUri: string | null): string {
  const cx = CARD_SIZE / 2;
  const displayName = truncate(c.name ?? 'Unknown', 30);
  const name = escapeXml(displayName);
  const officeLine = escapeXml(
    truncate(
      [c.office, c.state].filter(Boolean).join(', ') +
        (c.district ? ` • District ${c.district}` : ''),
      42,
    ),
  );
  const party = (c.party ?? '').trim();
  const partyDisplay = truncate(party || 'Nonpartisan', 24);
  const partyLabel = escapeXml(partyDisplay);
  const pColor = partyColor(party);
  const partyChipWidth = Math.min(CARD_SIZE - 160, Math.max(160, 64 + partyDisplay.length * 20));

  // Postgres `numeric` can arrive as a string via PostgREST — coerce defensively.
  const rawScore = typeof c.overall_score === 'string' ? parseFloat(c.overall_score) : c.overall_score;
  const hasScore = typeof rawScore === 'number' && Number.isFinite(rawScore);
  const score = hasScore ? Math.max(-10, Math.min(10, rawScore as number)) : 0;
  // Sign derived from the rounded value so a tiny negative shows "0.0", not "-0.0".
  const rounded = Math.round(score * 10) / 10;
  const scoreText = !hasScore
    ? '—'
    : rounded > 0
      ? `+${rounded.toFixed(1)}`
      : rounded < 0
        ? `-${Math.abs(rounded).toFixed(1)}`
        : '0.0';
  const trackX0 = 170;
  const trackX1 = CARD_SIZE - 170;
  const markerX = trackX0 + ((score + 10) / 20) * (trackX1 - trackX0);

  const photoR = 168;
  const photoCy = 348;
  // Avatar rule: render the photo ring + image ONLY when a real photo data URI
  // exists. With no photo we omit the avatar entirely (no ring, no initials
  // monogram) rather than show a placeholder coin. Candidates almost always have
  // a photo, so the rest of the layout is unchanged.
  const photo = photoDataUri
    ? `<circle cx="${cx}" cy="${photoCy}" r="${photoR + 8}" fill="none" stroke="#1f2a44" stroke-width="6" />
       <image href="${photoDataUri}" x="${cx - photoR}" y="${photoCy - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)" />`
    : '';

  return `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111d3a" />
    </linearGradient>
    <linearGradient id="scoreTrack" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3b82f6" />
      <stop offset="0.5" stop-color="#64748b" />
      <stop offset="1" stop-color="#ef4444" />
    </linearGradient>
    <clipPath id="avatar"><circle cx="${cx}" cy="${photoCy}" r="${photoR}" /></clipPath>
  </defs>

  <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bg)" />

  <text x="72" y="96" font-family="Inter" font-weight="700" font-size="40" fill="#f8fafc">PoliPulse</text>
  <text x="${CARD_SIZE - 72}" y="96" text-anchor="end" font-family="Inter" font-weight="400" font-size="26" fill="#94a3b8">Know Your Vote</text>

  ${photo}

  <text x="${cx}" y="640" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${nameFontSize(displayName)}" fill="#f8fafc">${name}</text>
  <text x="${cx}" y="700" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="#cbd5e1">${officeLine}</text>

  <rect x="${cx - partyChipWidth / 2}" y="730" width="${partyChipWidth}" height="52" rx="26" fill="${pColor}" fill-opacity="0.18" stroke="${pColor}" stroke-width="2" />
  <text x="${cx}" y="765" text-anchor="middle" font-family="Inter" font-weight="700" font-size="28" fill="${pColor}">${partyLabel}</text>

  <text x="${cx}" y="858" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="3">POLIPULSE SCORE</text>
  <text x="${cx}" y="940" text-anchor="middle" font-family="Inter" font-weight="700" font-size="96" fill="#f8fafc">${escapeXml(scoreText)}</text>

  <rect x="${trackX0}" y="968" width="${trackX1 - trackX0}" height="16" rx="8" fill="url(#scoreTrack)" />
  ${hasScore ? `<circle cx="${markerX}" cy="976" r="16" fill="#ffffff" stroke="#0b1220" stroke-width="4" />` : ''}
  <text x="${trackX0}" y="1024" text-anchor="start" font-family="Inter" font-weight="400" font-size="24" fill="#94a3b8">More left (−10)</text>
  <text x="${trackX1}" y="1024" text-anchor="end" font-family="Inter" font-weight="400" font-size="24" fill="#94a3b8">More right (+10)</text>
</svg>`;
}

export async function renderCandidateCardPng(c: CardCandidate): Promise<Uint8Array> {
  return rasterize(buildSvg(c, await fetchImageDataUri(c.image_url)));
}

// ---------- shared money-card helpers (donor + committee entity cards) ----------

// A stroked 24-viewBox icon scaled and centred horizontally at the given top y.
function centredIcon(paths: string, topY: number, size: number, color: string): string {
  const s = size / 24;
  const x = CARD_SIZE / 2 - size / 2;
  return `<g transform="translate(${x},${topY}) scale(${s})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}
const ICON_LANDMARK = '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 21 8H3z"/>';

// A horizontal multi-segment proportion bar (for "for vs against" or the funding mix).
function segmentBar(y: number, segments: { value: number; color: string }[]): string {
  const x0 = 150;
  const w = CARD_SIZE - 300;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0) || 1;
  let x = x0;
  const rects = segments.map((seg) => {
    const segW = (Math.max(0, seg.value) / total) * w;
    const r = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, segW).toFixed(1)}" height="20" fill="${seg.color}" />`;
    x += segW;
    return r;
  }).join('');
  // Rounded mask so the assembled bar has soft ends.
  return `<defs><clipPath id="barclip"><rect x="${x0}" y="${y}" width="${w}" height="20" rx="10" /></clipPath></defs>
    <g clip-path="url(#barclip)">${rects}</g>`;
}

// ---------- donor-ENTITY card (the `top_donor` rotation) ----------
//
// A standalone DONOR profile card (no candidate, no photo) mirroring the in-app
// DonorStatsCard + /donor/:id header: donor name, type badge, optional cause
// badge, a big "total given" figure, 4 stat tiles, top recipients, and a
// "Follow the Money" footer. Uses an initials monogram in a coin in place of a
// politician photo.

// Shrink a centered title to fit one line within maxWidth, stepping down to
// minFont; only hard-truncate if it still overflows at minFont (rare). AVG is a
// conservative Inter-bold char-width / font-size ratio so text never overflows.
const TITLE_AVG = 0.56;
function fitTitleFont(text: string, maxWidth: number, maxFont: number, minFont: number): number {
  let f = maxFont;
  while (f > minFont && (text ?? '').length * f * TITLE_AVG > maxWidth) f -= 2;
  return f;
}
function fitTitleText(text: string, fontSize: number, maxWidth: number): string {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * TITLE_AVG)));
  return (text ?? '').length > maxChars ? truncate(text, maxChars) : text;
}

// A pill chip (rounded rect + centered label) sized to its text. Returns the
// chip SVG plus the width used, so callers can place several side by side.
function chip(cx: number, y: number, label: string, color: string, fontSize = 26): { svg: string; width: number } {
  const text = truncate(label, 28);
  const width = Math.min(CARD_SIZE - 160, Math.max(120, 56 + text.length * (fontSize * 0.62)));
  const svg = `<rect x="${(cx - width / 2).toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="52" rx="26" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="2" />
    <text x="${cx}" y="${y + 35}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${fontSize}" fill="${color}">${escapeXml(text)}</text>`;
  return { svg, width };
}

// One stat tile (figure over uppercase label) in a bordered rounded box.
function statTile(x: number, y: number, w: number, h: number, value: string, label: string, accent: string): string {
  const cx = x + w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="#0f1a30" stroke="#1f2a44" stroke-width="2" />
    <text x="${cx}" y="${y + h / 2 - 2}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="56" fill="${accent}">${escapeXml(truncate(value, 10))}</text>
    <text x="${cx}" y="${y + h - 30}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="#94a3b8" letter-spacing="2">${escapeXml(label)}</text>`;
}

function compactCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.round(n)}`;
}

function buildDonorEntitySvg(f: DonorCardFacts): string {
  const cx = CARD_SIZE / 2;
  const GOLD = '#fbbf24';
  const name = tidyName(f.display_name) || f.display_name;
  const typeNoun = (f.type || 'Donor').replace(/^ind.*/i, 'Individual');
  const titleFont = fitTitleFont(name, CARD_SIZE - 110, 78, 34);
  const titleText = escapeXml(fitTitleText(name, titleFont, CARD_SIZE - 110));
  const eyebrow = 'DONOR PROFILE';

  // No avatar: donors never have a photo, and the owner's rule is "no initials
  // monogram when there's no picture." The layout is top-aligned to fill the space
  // the old monogram coin used to occupy (eyebrow ~y150, name ~y220, then chips,
  // location, stat tiles, recipients, footer).
  const chipsY = 268;

  // Identity chips (type, optional cause), centered as a row under the name.
  const typeChip = chip(0, 0, typeNoun, GOLD);
  const causeChip = f.cause ? chip(0, 0, f.cause.label, '#60a5fa') : null;
  const gap = 16;
  const totalChipW = typeChip.width + (causeChip ? gap + causeChip.width : 0);
  let chipX = cx - totalChipW / 2 + typeChip.width / 2;
  const typeChipSvg = chip(chipX, chipsY, typeNoun, GOLD).svg;
  chipX += typeChip.width / 2;
  let causeChipSvg = '';
  if (causeChip) {
    const ccx = chipX + gap + causeChip.width / 2;
    causeChipSvg = chip(ccx, chipsY, f.cause!.label, '#60a5fa').svg;
  }

  const locationY = chipsY + 52 + 48;
  const locationLine = f.location
    ? `<text x="${cx}" y="${locationY}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="28" fill="#94a3b8">${escapeXml(truncate(f.location, 40))}</text>`
    : '';

  // Stat tiles row: Total Given / Donations / Recipients / Cycles.
  const tileY = f.location ? locationY + 50 : chipsY + 52 + 56;
  const tileH = 150;
  const tileGap = 20;
  const margin = 80;
  const tileW = (CARD_SIZE - margin * 2 - tileGap * 3) / 4;
  const tiles = [
    statTile(margin + (tileW + tileGap) * 0, tileY, tileW, tileH, fmtMoney(f.total_given) ?? '$0', 'TOTAL GIVEN', '#22c55e'),
    statTile(margin + (tileW + tileGap) * 1, tileY, tileW, tileH, compactCount(f.donation_count), 'DONATIONS', '#e2e8f0'),
    statTile(margin + (tileW + tileGap) * 2, tileY, tileW, tileH, compactCount(f.recipient_count), 'RECIPIENTS', '#e2e8f0'),
    statTile(margin + (tileW + tileGap) * 3, tileY, tileW, tileH, f.latest_cycle ?? '—', 'LATEST CYCLE', '#e2e8f0'),
  ].join('');

  // Top recipients (up to 3): name left, amount right, one per row, generously
  // spaced now that the layout has the freed top space to use.
  const recips = f.top_recipients.filter((r) => (r.amount ?? 0) > 0).slice(0, 3);
  const recipHeaderY = tileY + tileH + 80;
  let recipBlock = '';
  if (recips.length > 0) {
    recipBlock += `<text x="${margin}" y="${recipHeaderY}" font-family="Inter" font-weight="700" font-size="28" fill="#94a3b8" letter-spacing="3">TOP RECIPIENTS</text>`;
    recips.forEach((r, i) => {
      const ry = recipHeaderY + 64 + i * 66;
      recipBlock += `<text x="${margin}" y="${ry}" font-family="Inter" font-weight="700" font-size="38" fill="#f8fafc">${escapeXml(truncate(tidyName(r.name), 30))}</text>
        <text x="${CARD_SIZE - margin}" y="${ry}" text-anchor="end" font-family="Inter" font-weight="700" font-size="38" fill="${GOLD}">${escapeXml(fmtMoney(r.amount) ?? '$0')}</text>`;
    });
  }

  return `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111d3a" />
    </linearGradient>
  </defs>

  <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bg)" />

  <text x="72" y="96" font-family="Inter" font-weight="700" font-size="40" fill="#f8fafc">PoliPulse</text>
  <text x="${CARD_SIZE - 72}" y="96" text-anchor="end" font-family="Inter" font-weight="400" font-size="26" fill="#94a3b8">Follow the Money</text>

  <text x="${cx}" y="172" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="4">${eyebrow}</text>
  <text x="${cx}" y="244" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${titleFont}" fill="#f8fafc">${titleText}</text>
  ${typeChipSvg}
  ${causeChipSvg}
  ${locationLine}

  ${tiles}
  ${recipBlock}

  <text x="${cx}" y="1048" text-anchor="middle" font-family="Inter" font-weight="400" font-size="22" fill="#64748b">polipulseapp.com — Follow the money</text>
</svg>`;
}

export async function renderDonorEntityCardPng(f: DonorCardFacts): Promise<Uint8Array> {
  return rasterize(buildDonorEntitySvg(f));
}

// ---------- committee/PAC OUTSIDE-SPENDER card (the `committee_spender` rotation) ----------
//
// A standalone outside-spender (Super PAC) profile card (no candidate, NO avatar)
// mirroring /committee/:id and its Independent Expenditures section: committee name,
// optional cause badge, a big "total spent" figure, a for/against split bar, the
// top candidates targeted, and a "Follow the Money" footer. Top-aligned like the
// reflowed donor card.

function buildCommitteeSpenderSvg(f: CommitteeCardFacts): string {
  const cx = CARD_SIZE / 2;
  const GREEN = '#22c55e';
  const RED = '#ef4444';
  const ACCENT = '#fbbf24';
  const name = tidyName(f.name) || f.name;
  const support = f.support_total ?? 0;
  const oppose = f.oppose_total ?? 0;
  const margin = 80;
  const titleFont = fitTitleFont(name, CARD_SIZE - 110, 74, 34);
  const titleText = escapeXml(fitTitleText(name, titleFont, CARD_SIZE - 110));
  const eyebrow = `OUTSIDE SPENDER${f.latest_cycle ? ` · ${escapeXml(f.latest_cycle)} CYCLE` : ''}`;

  // Optional cause chip, centered under the name.
  const chipsY = 268;
  const causeChipSvg = f.cause ? chip(cx, chipsY, f.cause.label, '#60a5fa').svg : '';

  // Big total-spent figure (the hook), with an eyebrow + landmark icon above it.
  const eyebrowY = f.cause ? chipsY + 96 : chipsY + 16;
  const iconTopY = eyebrowY + 18;
  const figureY = iconTopY + 154;
  const figure = `<text x="${cx}" y="${eyebrowY}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="3">TOTAL OUTSIDE SPENDING</text>
    ${centredIcon(ICON_LANDMARK, iconTopY, 64, ACCENT)}
    <text x="${cx}" y="${figureY}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="118" fill="${ACCENT}">${escapeXml(fmtMoney(f.total_spent) ?? '$0')}</text>`;

  // For/against split bar.
  let barBlock = '';
  let afterBarY = figureY + 70;
  if (support > 0 || oppose > 0) {
    const barY = figureY + 44;
    barBlock = `${segmentBar(barY, [{ value: support, color: GREEN }, { value: oppose, color: RED }])}
      <text x="${margin}" y="${barY + 56}" text-anchor="start" font-family="Inter" font-weight="700" font-size="28" fill="${GREEN}">${escapeXml(fmtMoney(support) ?? '$0')} to elect</text>
      <text x="${CARD_SIZE - margin}" y="${barY + 56}" text-anchor="end" font-family="Inter" font-weight="700" font-size="28" fill="${RED}">${escapeXml(fmtMoney(oppose) ?? '$0')} to defeat</text>`;
    afterBarY = barY + 56;
  }

  // Top targets (up to 3): candidate name left, amount + direction right.
  const targets = f.top_targets.filter((t) => (t.amount ?? 0) > 0).slice(0, 3);
  const tHeaderY = afterBarY + 72;
  let targetBlock = '';
  if (targets.length > 0) {
    targetBlock += `<text x="${margin}" y="${tHeaderY}" font-family="Inter" font-weight="700" font-size="28" fill="#94a3b8" letter-spacing="3">TOP TARGETS</text>`;
    targets.forEach((t, i) => {
      const ry = tHeaderY + 60 + i * 80;
      const color = t.dir === 'oppose' ? RED : GREEN;
      const verb = t.dir === 'oppose' ? 'against' : 'for';
      // Subline: the race targeted — office + state(-district), e.g. "U.S. Senate · KY".
      const stateLoc = t.state ? (t.district ? `${t.state}-${t.district}` : t.state) : '';
      const race = [t.office, stateLoc].filter(Boolean).join(' · ');
      const sub = race
        ? `<text x="${margin}" y="${ry + 30}" font-family="Inter" font-weight="400" font-size="24" fill="#94a3b8">${escapeXml(truncate(race, 30))}</text>`
        : '';
      targetBlock += `<text x="${margin}" y="${ry}" font-family="Inter" font-weight="700" font-size="34" fill="#f8fafc">${escapeXml(truncate(tidyName(t.name), 24))}</text>
        ${sub}
        <text x="${CARD_SIZE - margin}" y="${ry}" text-anchor="end" font-family="Inter" font-weight="700" font-size="34" fill="${color}">${escapeXml(fmtMoney(t.amount) ?? '$0')} ${verb}</text>`;
    });
  }

  return `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111d3a" />
    </linearGradient>
  </defs>

  <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bg)" />

  <text x="72" y="96" font-family="Inter" font-weight="700" font-size="40" fill="#f8fafc">PoliPulse</text>
  <text x="${CARD_SIZE - 72}" y="96" text-anchor="end" font-family="Inter" font-weight="400" font-size="26" fill="#94a3b8">Follow the Money</text>

  <text x="${cx}" y="172" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="4">${eyebrow}</text>
  <text x="${cx}" y="244" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${titleFont}" fill="#f8fafc">${titleText}</text>
  ${causeChipSvg}

  ${figure}
  ${barBlock}
  ${targetBlock}

  <text x="${cx}" y="1048" text-anchor="middle" font-family="Inter" font-weight="400" font-size="22" fill="#64748b">polipulseapp.com — Follow the money</text>
</svg>`;
}

export async function renderCommitteeSpenderCardPng(f: CommitteeCardFacts): Promise<Uint8Array> {
  return rasterize(buildCommitteeSpenderSvg(f));
}

// ---------- race-comparison card (the manual `race_comparison` post type) ----------
//
// A head-to-head between TWO candidates in one election (state + office + year),
// two columns split by a center "VS" rule. Each column shows: name + party, the
// candidate's overall lean, the big money-raised figure, a funding-character line,
// outside money for/against, and the standout donor (with cause). Below the columns,
// a full-width grid compares every FEDERAL policy position side by side, and a short
// AI analysis of their primary positions sits under the title.

const fmtScoreLR = (score: number): string => {
  const r = Math.round(score * 10) / 10;
  if (r === 0) return 'C';
  return r < 0 ? `L${Math.abs(r).toFixed(1)}` : `R${r.toFixed(1)}`;
};
// Blue (left) / red (right) / grey (center or missing) for a score value.
const leanColor = (score: number | null | undefined): string =>
  score == null ? '#9ca3af' : score < 0 ? '#3b82f6' : score > 0 ? '#ef4444' : '#9ca3af';

function raceFundingLine(c: RaceCandidateFacts): string | null {
  const fu = c.finance?.funding;
  if (!fu) return null;
  if (fu.self_funded > 0 && fu.self_funded >= (c.raised ?? 0) * 0.4) return `${fmtMoney(fu.self_funded)} self-funded`;
  if (fu.pac_pct >= 40) return `${fu.pac_pct}% PAC-funded`;
  if (fu.small_pct >= 50) return `${fu.small_pct}% small-dollar`;
  if (fu.large_pct >= 55) return `${fu.large_pct}% large-donor`;
  return null;
}

// Shared vertical plan for the two columns, so optional rows (funding / outside money
// / donor cause) keep BOTH columns aligned. Computed once from global flags.
interface RaceYPlan {
  name: number; party: number; overall: number; raisedLabel: number; raisedFig: number;
  funding: number | null; outsideLabel: number | null; outsideVal: number | null;
  donorLabel: number; donorName: number; donorAmt: number; cause: number | null;
  bottom: number;
}
function planRaceColumn(f: RaceCardFacts): RaceYPlan {
  const showFunding = f.candidates.some((c) => raceFundingLine(c) !== null);
  const showOutside = f.candidates.some((c) => (c.finance?.ie_support ?? 0) > 0 || (c.finance?.ie_oppose ?? 0) > 0);
  const showCause = f.candidates.some((c) => c.top_donors.find((d) => (d.amount ?? 0) > 0)?.cause);
  let y = 320;
  const name = y; y += 42;
  const party = y; y += 34;
  const overall = y; y += 50;
  const raisedLabel = y; y += 30;
  const raisedFig = y; y += 48;
  const funding = showFunding ? y : null; if (showFunding) y += 36;
  const outsideLabel = showOutside ? y : null; if (showOutside) y += 28;
  const outsideVal = showOutside ? y : null; if (showOutside) y += 42;
  const donorLabel = y; y += 28;
  const donorName = y; y += 30;
  const donorAmt = y; y += showCause ? 20 : 16;
  const cause = showCause ? y : null; if (showCause) y += 46;
  return { name, party, overall, raisedLabel, raisedFig, funding, outsideLabel, outsideVal, donorLabel, donorName, donorAmt, cause, bottom: y };
}

// One candidate column rendered against the shared y-plan.
function raceColumn(c: RaceCandidateFacts, x0: number, colW: number, Y: RaceYPlan): string {
  const cx = x0 + colW / 2;
  const pColor = partyColor(c.party);
  const parts: string[] = [];

  const name = tidyName(c.name) || c.name;
  const nameFont = name.length > 22 ? 30 : name.length > 16 ? 36 : 42;
  parts.push(`<text x="${cx}" y="${Y.name}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${nameFont}" fill="#f8fafc">${escapeXml(truncate(name, 26))}</text>`);
  const partyLine = `${(c.party || 'Nonpartisan')}${c.incumbent ? ' · Incumbent' : ''}`;
  parts.push(`<text x="${cx}" y="${Y.party}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="${pColor}">${escapeXml(truncate(partyLine, 28))}</text>`);

  // Overall lean (the candidate's headline score).
  if (c.score != null && Number.isFinite(c.score)) {
    parts.push(`<text x="${cx}" y="${Y.overall}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="#94a3b8">Overall lean <tspan font-weight="700" fill="${leanColor(c.score)}">${escapeXml(fmtScoreLR(c.score))}</tspan></text>`);
  }

  // Money raised — the column's hook.
  parts.push(`<text x="${cx}" y="${Y.raisedLabel}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="#94a3b8" letter-spacing="3">RAISED</text>`);
  parts.push(`<text x="${cx}" y="${Y.raisedFig}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="54" fill="#22c55e">${escapeXml(fmtMoney(c.raised) ?? '$0')}</text>`);
  const fundLine = raceFundingLine(c);
  if (fundLine && Y.funding != null) {
    parts.push(`<text x="${cx}" y="${Y.funding}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="24" fill="#cbd5e1">${escapeXml(fundLine)}</text>`);
  }

  // Outside money for/against (slot present when EITHER candidate has it).
  const sup = c.finance?.ie_support ?? 0;
  const opp = c.finance?.ie_oppose ?? 0;
  if (Y.outsideLabel != null && Y.outsideVal != null && (sup > 0 || opp > 0)) {
    parts.push(`<text x="${cx}" y="${Y.outsideLabel}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="20" fill="#94a3b8" letter-spacing="2">OUTSIDE MONEY</text>`);
    parts.push(`<text x="${cx}" y="${Y.outsideVal}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#e2e8f0"><tspan fill="#22c55e">${escapeXml(fmtMoney(sup) ?? '$0')}</tspan> for · <tspan fill="#ef4444">${escapeXml(fmtMoney(opp) ?? '$0')}</tspan> against</text>`);
  }

  // Standout donor + cause chip.
  const donor = c.top_donors.find((d) => (d.amount ?? 0) > 0);
  if (donor) {
    parts.push(`<text x="${cx}" y="${Y.donorLabel}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="20" fill="#94a3b8" letter-spacing="2">TOP DONOR</text>`);
    parts.push(`<text x="${cx}" y="${Y.donorName}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#f8fafc">${escapeXml(truncate(tidyName(donor.name), 24))}</text>`);
    parts.push(`<text x="${cx}" y="${Y.donorAmt}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="#fbbf24">${escapeXml(fmtMoney(donor.amount) ?? '$0')}</text>`);
    if (donor.cause && Y.cause != null) {
      parts.push(chip(cx, Y.cause, donor.cause, '#60a5fa', 22).svg);
    }
  }

  return parts.join('\n');
}

// Full-width grid comparing every federal policy position side by side:
// [A score]      Topic      [B score], one row per topic (union of both candidates),
// ordered by salience (strongest lean first).
function racePositionsGrid(f: RaceCardFacts, top: number, margin: number): string {
  const cx = CARD_SIZE / 2;
  const [a, b] = f.candidates;
  const map = new Map<string, { a?: number; b?: number }>();
  a.positions.forEach((p) => { const e = map.get(p.topic) ?? {}; e.a = p.score; map.set(p.topic, e); });
  b.positions.forEach((p) => { const e = map.get(p.topic) ?? {}; e.b = p.score; map.set(p.topic, e); });
  const rows = [...map.entries()]
    .map(([topic, v]) => ({ topic, a: v.a, b: v.b, sal: Math.max(Math.abs(v.a ?? 0), Math.abs(v.b ?? 0)) }))
    .sort((x, y) => y.sal - x.sal)
    .slice(0, 6);
  if (rows.length === 0) return '';

  const parts: string[] = [];
  parts.push(`<text x="${cx}" y="${top}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="22" fill="#94a3b8" letter-spacing="3">PRIMARY POSITIONS — L MORE LEFT · R MORE RIGHT</text>`);
  let y = top + 44;
  const step = 36;
  for (const r of rows) {
    parts.push(`<text x="${margin}" y="${y}" font-family="Inter" font-weight="700" font-size="26" fill="${leanColor(r.a)}">${escapeXml(r.a != null ? fmtScoreLR(r.a) : '—')}</text>
      <text x="${cx}" y="${y}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="24" fill="#e2e8f0">${escapeXml(truncate(r.topic, 30))}</text>
      <text x="${CARD_SIZE - margin}" y="${y}" text-anchor="end" font-family="Inter" font-weight="700" font-size="26" fill="${leanColor(r.b)}">${escapeXml(r.b != null ? fmtScoreLR(r.b) : '—')}</text>`);
    y += step;
  }
  return parts.join('\n');
}

// Word-wrap plain text into at most maxLines lines of ~maxChars, ellipsizing overflow.
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (((cur ? cur + ' ' : '') + w).length <= maxChars) {
      cur = cur ? `${cur} ${w}` : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    // If words remain unconsumed, mark the last line as truncated.
    const consumed = lines.join(' ').split(' ').length;
    if (consumed < words.length) lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,;:.!?-]+$/, '') + '…';
  }
  return lines.slice(0, maxLines);
}

function buildRaceComparisonSvg(f: RaceCardFacts, analysis: string | null): string {
  const cx = CARD_SIZE / 2;
  const margin = 64;
  const colGap = 44;
  const colW = (CARD_SIZE - margin * 2 - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colW + colGap;
  const title = raceTitle(f);
  const titleFont = title.length > 28 ? 44 : title.length > 20 ? 54 : 62;
  const [a, b] = f.candidates;
  const Y = planRaceColumn(f);

  // Short AI analysis of primary positions, under the title (up to 2 lines).
  const analysisLines = analysis ? wrapLines(analysis, 84, 2) : [];
  const analysisSvg = analysisLines
    .map((ln, i) => `<text x="${cx}" y="${240 + i * 28}" text-anchor="middle" font-family="Inter" font-weight="400" font-size="21" fill="#93a5c0">${escapeXml(ln)}</text>`)
    .join('\n');

  const gridTop = Y.bottom + 34;

  return `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111d3a" />
    </linearGradient>
  </defs>

  <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bg)" />

  <text x="72" y="96" font-family="Inter" font-weight="700" font-size="40" fill="#f8fafc">PoliPulse</text>
  <text x="${CARD_SIZE - 72}" y="96" text-anchor="end" font-family="Inter" font-weight="400" font-size="26" fill="#94a3b8">Follow the Money</text>

  <text x="${cx}" y="166" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="4">RACE COMPARISON</text>
  <text x="${cx}" y="212" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${titleFont}" fill="#f8fafc">${escapeXml(truncate(title, 36))}</text>
  ${analysisSvg}

  ${raceColumn(a, leftX, colW, Y)}
  ${raceColumn(b, rightX, colW, Y)}

  <line x1="${cx}" y1="${Y.name - 18}" x2="${cx}" y2="${Y.bottom - 6}" stroke="#1f2a44" stroke-width="3" />
  <circle cx="${cx}" cy="${Y.overall - 6}" r="30" fill="#0f1a30" stroke="#1f2a44" stroke-width="3" />
  <text x="${cx}" y="${Y.overall + 3}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="#fbbf24">VS</text>

  ${racePositionsGrid(f, gridTop, margin)}

  <text x="${cx}" y="1052" text-anchor="middle" font-family="Inter" font-weight="400" font-size="22" fill="#64748b">polipulseapp.com — Follow the money</text>
</svg>`;
}

export async function renderRaceComparisonCardPng(f: RaceCardFacts): Promise<Uint8Array> {
  // Generate the short positions-focused AI analysis at render time so it always
  // reflects current data (best-effort — a null falls back to no analysis line).
  let analysis: string | null = null;
  try {
    analysis = await composeRaceAnalysis(RACE_AI_KEY, f);
  } catch (e) {
    console.warn('race analysis failed', e);
  }
  return rasterize(buildRaceComparisonSvg(f, analysis));
}

async function rasterize(svg: string): Promise<Uint8Array> {
  const [regular, bold] = await Promise.all([loadInter(400), loadInter(700)]);
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_SIZE },
    font: { fontBuffers: [regular, bold], defaultFontFamily: 'Inter', loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

// The candidate score-card SVG fallback (used when the screenshot service isn't
// configured for rep_profile / ai_analysis). Money cards are now entity-anchored
// (top_donor, committee_spender) and handled directly in renderAndStoreCard.
export async function renderStatCardPng(c: CardCandidate): Promise<Uint8Array> {
  return rasterize(buildSvg(c, await fetchImageDataUri(c.image_url)));
}

// One-line OG description for a committee/PAC outside-spender card.
function committeeCardDescription(f: CommitteeCardFacts): string {
  const parts = [`${fmtMoney(f.total_spent) ?? '$0'} in outside spending`];
  const top = f.top_targets.filter((t) => (t.amount ?? 0) > 0)[0];
  if (top) parts.push(`${top.dir === 'oppose' ? 'against' : 'for'} ${tidyName(top.name)}`);
  else if (f.cause) parts.push(f.cause.label);
  return `Follow the money — ${parts.join(' · ')}`.slice(0, 300);
}

// One-line OG description for a donor-entity card.
function donorCardDescription(f: DonorCardFacts): string {
  const parts = [`${fmtMoney(f.total_given) ?? '$0'} given`];
  if (f.cause) parts.push(f.cause.label);
  else if (f.top_recipients[0]) parts.push(`top recipient ${tidyName(f.top_recipients[0].name)}`);
  return `Follow the money — ${parts.join(' · ')}`.slice(0, 300);
}

function makeId(len = 10): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export interface RenderedCard {
  id: string;
  shareUrl: string;
  imageUrl: string;
  imagePath: string;
}

// Renders the card for a social_posts row, uploads it, records the share_card,
// and writes share_url/image_url/share_card_id back onto the post — the
// server-side equivalent of the browser's captureAndUpload + render mutation.
export async function renderAndStoreCard(
  admin: ReturnType<typeof createClient>,
  post: { id: string; subject_id: string; subject_label: string | null; subject_type?: string | null; stat_payload?: Record<string, unknown> | null },
): Promise<RenderedCard> {
  const supaUrl = Deno.env.get('SUPABASE_URL')!;
  const subjectType = post.subject_type ?? 'rep_profile';

  let png: Uint8Array;
  let targetUrl: string;
  let ogTitle: string;
  let ogDescription: string;

  if (subjectType === 'race_comparison') {
    // Race head-to-head card: NOT candidate-anchored. The race (state/office/year/mode)
    // lives in stat_payload; re-fetch verified facts so the card reflects current data.
    const sp = post.stat_payload ?? {};
    const params: RaceParams = {
      state: String(sp.state ?? ''),
      office: String(sp.office ?? ''),
      year: Number(sp.year ?? 0),
      mode: String(sp.mode ?? 'dvr'),
    };
    const facts = await fetchRaceCardFacts(admin, params);
    if (!facts) throw new Error('race_not_found');
    png = await renderRaceComparisonCardPng(facts);
    // Deep-link to the better-funded candidate's public profile for the unfurl.
    targetUrl = `${PUBLIC_SITE_URL}/candidate/${encodeURIComponent(facts.candidates[0].id)}`;
    ogTitle = (post.subject_label ?? raceTitle(facts)).slice(0, 200);
    ogDescription = raceCardDescription(facts);
  } else if (subjectType === 'top_donor') {
    // Donor-ENTITY card: anchored on a donor, NOT a candidate. Never touches the
    // candidates table; deep-links to /donor/:id.
    const facts = await fetchDonorCardFacts(admin, post.subject_id);
    if (!facts) throw new Error('donor_not_found');
    png = await renderDonorEntityCardPng(facts);
    targetUrl = `${PUBLIC_SITE_URL}/donor/${encodeURIComponent(post.subject_id)}`;
    ogTitle = (post.subject_label ?? facts.display_name ?? 'PoliPulse').slice(0, 200);
    ogDescription = donorCardDescription(facts);
  } else if (subjectType === 'committee_spender') {
    // Committee/PAC OUTSIDE-SPENDER card: anchored on a Super PAC, NOT a candidate.
    // subject_id is the fec_committee_id; deep-links to /committee/:id. No avatar.
    const facts = await fetchCommitteeCardFacts(admin, post.subject_id);
    if (!facts) throw new Error('committee_not_found');
    png = await renderCommitteeSpenderCardPng(facts);
    targetUrl = `${PUBLIC_SITE_URL}/committee/${encodeURIComponent(post.subject_id)}`;
    ogTitle = (post.subject_label ?? facts.name ?? 'PoliPulse').slice(0, 200);
    ogDescription = committeeCardDescription(facts);
  } else {
    // Candidate-anchored cards (rep_profile, ai_analysis): the real CandidateStatCard
    // via the screenshot service when configured, else the SVG score card.
    const { data: cand, error: candErr } = await admin
      .from('candidates')
      .select('id, name, office, party, state, district, image_url, overall_score')
      .eq('id', post.subject_id)
      .maybeSingle();
    if (candErr) throw candErr;
    if (!cand) throw new Error('candidate_not_found');

    png = SCREENSHOT_SERVICE_URL
      ? await screenshotCard(post.subject_id)
      : await renderStatCardPng(cand as unknown as CardCandidate);

    targetUrl = `${PUBLIC_SITE_URL}/candidate/${encodeURIComponent(post.subject_id)}`;
    ogTitle = (post.subject_label ?? (cand as { name?: string }).name ?? 'PoliPulse').slice(0, 200);
    ogDescription = [cand.office, cand.party].filter(Boolean).join(' • ').slice(0, 300);
  }

  const id = makeId();
  const path = `${id}.png`;
  const up = await admin.storage.from('share-cards').upload(path, png, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false,
  });
  if (up.error) throw new Error(`upload_failed: ${up.error.message}`);

  const { error: insErr } = await admin.from('share_cards').insert({
    id,
    user_id: null,
    image_path: path,
    target_url: targetUrl,
    og_title: ogTitle,
    og_description: ogDescription,
  });
  if (insErr) {
    await admin.storage.from('share-cards').remove([path]);
    throw new Error(`share_card_insert_failed: ${insErr.message}`);
  }

  const { data: pub } = admin.storage.from('share-cards').getPublicUrl(path);
  const imageUrl = pub?.publicUrl ?? `${supaUrl}/storage/v1/object/public/share-cards/${path}`;
  const shareUrl = `${supaUrl}/functions/v1/share-card-page?id=${id}`;

  const { error: updErr } = await admin
    .from('social_posts')
    .update({ share_url: shareUrl, share_card_id: id, image_url: imageUrl, image_path: path })
    .eq('id', post.id);
  if (updErr) {
    // Roll back the orphaned card + object so a retry starts clean.
    await admin.from('share_cards').delete().eq('id', id);
    await admin.storage.from('share-cards').remove([path]);
    throw new Error(`post_update_failed: ${updErr.message}`);
  }

  return { id, shareUrl, imageUrl, imagePath: path };
}
