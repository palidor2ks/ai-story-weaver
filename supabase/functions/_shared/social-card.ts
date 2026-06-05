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
  type Facts,
  fetchCandidateFacts,
  fmtMoney,
  tidyName,
  topOutsideSpender,
} from './finance-caption.ts';

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

function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const photo = photoDataUri
    ? `<image href="${photoDataUri}" x="${cx - photoR}" y="${photoCy - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)" />`
    : `<circle cx="${cx}" cy="${photoCy}" r="${photoR}" fill="#1e293b" />
       <text x="${cx}" y="${photoCy + 56}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="150" fill="#cbd5e1">${escapeXml(initials(c.name ?? ''))}</text>`;

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

  <circle cx="${cx}" cy="${photoCy}" r="${photoR + 8}" fill="none" stroke="#1f2a44" stroke-width="6" />
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

// ---------- money cards (top committee/PAC spender, top donor) ----------

// A stroked 24-viewBox icon scaled and centred horizontally at the given top y.
function centredIcon(paths: string, topY: number, size: number, color: string): string {
  const s = size / 24;
  const x = CARD_SIZE / 2 - size / 2;
  return `<g transform="translate(${x},${topY}) scale(${s})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}
const ICON_LANDMARK = '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 21 8H3z"/>';
const ICON_COIN = '<circle cx="12" cy="12" r="9"/><path d="M14.2 9.3a2.4 2.2 0 0 0-2.2-1.3h-.6a2 2 0 0 0 0 4h1.2a2 2 0 0 1 0 4h-.6a2.4 2.2 0 0 1-2.2-1.3"/><path d="M12 6v1.4M12 16.6V18"/>';

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

interface MoneyCardOpts {
  eyebrow: string;
  icon: string;
  accent: string;
  bigFigure: string;
  subLine: string;
  bar: { segments: { value: number; color: string }[]; left: string; right: string; leftColor: string; rightColor: string } | null;
}

// Shared scaffold: the same PoliPulse header / photo / name / party chip as the
// score card, with the lower half given over to one big money figure + icon.
function buildMoneyCardSvg(c: CardCandidate, photoDataUri: string | null, o: MoneyCardOpts): string {
  const cx = CARD_SIZE / 2;
  const displayName = truncate(c.name ?? 'Unknown', 30);
  const officeLine = escapeXml(truncate([c.office, c.state].filter(Boolean).join(', ') + (c.district ? ` • District ${c.district}` : ''), 42));
  const party = (c.party ?? '').trim();
  const partyDisplay = truncate(party || 'Nonpartisan', 24);
  const pColor = partyColor(party);
  const partyChipWidth = Math.min(CARD_SIZE - 160, Math.max(160, 64 + partyDisplay.length * 18));

  const photoR = 118;
  const photoCy = 300;
  const photo = photoDataUri
    ? `<image href="${photoDataUri}" x="${cx - photoR}" y="${photoCy - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)" />`
    : `<circle cx="${cx}" cy="${photoCy}" r="${photoR}" fill="#1e293b" />
       <text x="${cx}" y="${photoCy + 40}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="110" fill="#cbd5e1">${escapeXml(initials(c.name ?? ''))}</text>`;

  const bar = o.bar
    ? `${segmentBar(958, o.bar.segments)}
       <text x="150" y="1012" text-anchor="start" font-family="Inter" font-weight="700" font-size="26" fill="${o.bar.leftColor}">${escapeXml(o.bar.left)}</text>
       <text x="${CARD_SIZE - 150}" y="1012" text-anchor="end" font-family="Inter" font-weight="700" font-size="26" fill="${o.bar.rightColor}">${escapeXml(o.bar.right)}</text>`
    : '';

  return `<svg width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1220" />
      <stop offset="1" stop-color="#111d3a" />
    </linearGradient>
    <clipPath id="avatar"><circle cx="${cx}" cy="${photoCy}" r="${photoR}" /></clipPath>
  </defs>

  <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bg)" />

  <text x="72" y="96" font-family="Inter" font-weight="700" font-size="40" fill="#f8fafc">PoliPulse</text>
  <text x="${CARD_SIZE - 72}" y="96" text-anchor="end" font-family="Inter" font-weight="400" font-size="26" fill="#94a3b8">Follow the Money</text>

  <circle cx="${cx}" cy="${photoCy}" r="${photoR + 8}" fill="none" stroke="#1f2a44" stroke-width="6" />
  ${photo}

  <text x="${cx}" y="498" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${nameFontSize(displayName)}" fill="#f8fafc">${escapeXml(displayName)}</text>
  <text x="${cx}" y="552" text-anchor="middle" font-family="Inter" font-weight="400" font-size="32" fill="#cbd5e1">${officeLine}</text>
  <rect x="${cx - partyChipWidth / 2}" y="580" width="${partyChipWidth}" height="48" rx="24" fill="${pColor}" fill-opacity="0.18" stroke="${pColor}" stroke-width="2" />
  <text x="${cx}" y="613" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="${pColor}">${escapeXml(partyDisplay)}</text>

  <text x="${cx}" y="690" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#94a3b8" letter-spacing="3">${escapeXml(o.eyebrow)}</text>
  ${centredIcon(o.icon, 712, 64, o.accent)}
  <text x="${cx}" y="868" text-anchor="middle" font-family="Inter" font-weight="700" font-size="120" fill="${o.accent}">${escapeXml(o.bigFigure)}</text>
  <text x="${cx}" y="922" text-anchor="middle" font-family="Inter" font-weight="400" font-size="34" fill="#e2e8f0">${escapeXml(truncate(o.subLine, 52))}</text>
  ${bar}
</svg>`;
}

function buildCommitteeSvg(c: CardCandidate, top: { name: string; amount: number; dir: 'support' | 'oppose' }, support: number, oppose: number, photo: string | null): string {
  const GREEN = '#22c55e';
  const RED = '#ef4444';
  const accent = top.dir === 'oppose' ? RED : GREEN;
  return buildMoneyCardSvg(c, photo, {
    eyebrow: 'BIGGEST OUTSIDE SPENDER',
    icon: ICON_LANDMARK,
    accent,
    bigFigure: fmtMoney(top.amount) ?? '—',
    subLine: `${tidyName(top.name)} — to ${top.dir === 'support' ? 'elect' : 'defeat'} them`,
    bar: (support > 0 || oppose > 0)
      ? {
          segments: [{ value: support, color: GREEN }, { value: oppose, color: RED }],
          left: `${fmtMoney(support) ?? '$0'} for`,
          right: `${fmtMoney(oppose) ?? '$0'} against`,
          leftColor: GREEN,
          rightColor: RED,
        }
      : null,
  });
}

function buildDonorSvg(c: CardCandidate, f: Facts, photo: string | null): string {
  const d = f.top_donor!;
  const GOLD = '#fbbf24';
  const type = d.type && !/^ind/i.test(d.type) ? ` (${tidyName(d.type)})` : '';
  const fu = f.funding;
  return buildMoneyCardSvg(c, photo, {
    eyebrow: 'TOP CAMPAIGN DONOR',
    icon: ICON_COIN,
    accent: GOLD,
    bigFigure: fmtMoney(d.amount) ?? '—',
    subLine: `${tidyName(d.name)}${type}`,
    bar: fu
      ? {
          segments: [
            { value: fu.small_pct, color: '#22c55e' },
            { value: fu.large_pct, color: GOLD },
            { value: fu.pac_pct, color: '#ef4444' },
          ],
          left: `${fu.small_pct}% small-dollar`,
          right: `${fu.pac_pct}% PAC`,
          leftColor: '#22c55e',
          rightColor: '#ef4444',
        }
      : null,
  });
}

// Pick the right SVG for the post's subject_type. Money cards need verified facts;
// when those are missing we fall back to the candidate score card so we always
// produce a usable image.
function buildCardSvgFor(subjectType: string, c: CardCandidate, facts: Facts | null, photo: string | null): string {
  if (subjectType === 'committee_spender' && facts) {
    const top = topOutsideSpender(facts);
    if (top) return buildCommitteeSvg(c, top, facts.ie_support ?? 0, facts.ie_oppose ?? 0, photo);
  }
  if (subjectType === 'top_donor' && facts?.top_donor && (facts.top_donor.amount ?? 0) > 0) {
    return buildDonorSvg(c, facts, photo);
  }
  return buildSvg(c, photo);
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

export async function renderStatCardPng(subjectType: string, c: CardCandidate, facts: Facts | null): Promise<Uint8Array> {
  const photo = await fetchImageDataUri(c.image_url);
  return rasterize(buildCardSvgFor(subjectType, c, facts, photo));
}

// One-line OpenGraph description for a money card (used for link unfurls); null
// for non-money types so the caller keeps its default office • party line.
function moneyCardDescription(subjectType: string, facts: Facts | null): string | null {
  if (subjectType === 'committee_spender' && facts) {
    const top = topOutsideSpender(facts);
    if (top) return `${fmtMoney(top.amount)} from ${tidyName(top.name)} to ${top.dir === 'support' ? 'elect' : 'defeat'} them`.slice(0, 300);
  }
  if (subjectType === 'top_donor' && facts?.top_donor && (facts.top_donor.amount ?? 0) > 0) {
    return `Top donor: ${tidyName(facts.top_donor.name)} — ${fmtMoney(facts.top_donor.amount)}`.slice(0, 300);
  }
  return null;
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
  post: { id: string; subject_id: string; subject_label: string | null; subject_type?: string | null },
): Promise<RenderedCard> {
  const supaUrl = Deno.env.get('SUPABASE_URL')!;
  const subjectType = post.subject_type ?? 'rep_profile';
  const isMoneyCard = subjectType === 'committee_spender' || subjectType === 'top_donor';

  const { data: cand, error: candErr } = await admin
    .from('candidates')
    .select('id, name, office, party, state, district, image_url, overall_score')
    .eq('id', post.subject_id)
    .maybeSingle();
  if (candErr) throw candErr;
  if (!cand) throw new Error('candidate_not_found');

  // Money cards are bespoke SVG layouts the screenshot service doesn't know about,
  // so always render them locally (with verified facts). Other types prefer the
  // real CandidateStatCard via the screenshot service, falling back to SVG.
  const facts = isMoneyCard ? await fetchCandidateFacts(admin, post.subject_id) : null;
  const png = isMoneyCard
    ? await renderStatCardPng(subjectType, cand as unknown as CardCandidate, facts)
    : SCREENSHOT_SERVICE_URL
      ? await screenshotCard(post.subject_id)
      : await renderStatCardPng(subjectType, cand as unknown as CardCandidate, null);

  const id = makeId();
  const path = `${id}.png`;
  const up = await admin.storage.from('share-cards').upload(path, png, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false,
  });
  if (up.error) throw new Error(`upload_failed: ${up.error.message}`);

  const targetUrl = `${PUBLIC_SITE_URL}/candidate/${encodeURIComponent(post.subject_id)}`;
  const ogTitle = (post.subject_label ?? (cand as { name?: string }).name ?? 'PoliPulse').slice(0, 200);
  const ogDescription = moneyCardDescription(subjectType, facts) ?? [cand.office, cand.party].filter(Boolean).join(' • ').slice(0, 300);

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
