// Server-side stat-card renderer.
//
// The admin Queue renders the rich in-app <CandidateStatCard> in the browser
// (html-to-image) and uploads the PNG. For fully-automated posting there is no
// browser, so this module produces a purpose-built 1080x1080 card entirely on
// the server: hand-authored SVG rasterised with resvg-wasm, text drawn with the
// Inter font fetched from Google Fonts. The output is uploaded to the same
// `share-cards` bucket + table the browser flow uses, so the rest of the
// pipeline (share-card-page OpenGraph unfurl, post-social-card) is unchanged.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const RESVG_WASM_URL = 'https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const CARD_SIZE = 1080;
const PUBLIC_SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.polipulseapp.com').replace(/\/+$/, '');

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

const fontCache = new Map<number, Uint8Array>();
async function loadInter(weight: number): Promise<Uint8Array> {
  const cached = fontCache.get(weight);
  if (cached) return cached;
  // Text cannot render without a font, so retry transient upstream blips once.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // An old IE user-agent makes Google Fonts serve a plain TTF (resvg cannot
      // read woff2). We then pull the .ttf URL out of the returned CSS.
      const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko' },
      });
      if (!cssRes.ok) throw new Error(`font_css_${cssRes.status}`);
      const css = await cssRes.text();
      // Only accept TTF/OTF — resvg cannot decode woff2, so never fall back to
      // a generic url() that might be woff2.
      const match = css.match(/url\(([^)]+\.(?:ttf|otf))\)/i);
      if (!match) throw new Error('font_ttf_not_found');
      const fontRes = await fetch(match[1]);
      if (!fontRes.ok) throw new Error(`font_fetch_${fontRes.status}`);
      const buf = new Uint8Array(await fontRes.arrayBuffer());
      fontCache.set(weight, buf);
      return buf;
    } catch (e) {
      lastErr = e;
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
  const [regular, bold, photo] = await Promise.all([
    loadInter(400),
    loadInter(700),
    fetchImageDataUri(c.image_url),
  ]);
  await ensureWasm();
  const svg = buildSvg(c, photo);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_SIZE },
    font: { fontBuffers: [regular, bold], defaultFontFamily: 'Inter', loadSystemFonts: false },
  });
  return resvg.render().asPng();
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
  post: { id: string; subject_id: string; subject_label: string | null },
): Promise<RenderedCard> {
  const supaUrl = Deno.env.get('SUPABASE_URL')!;

  const { data: cand, error: candErr } = await admin
    .from('candidates')
    .select('id, name, office, party, state, district, image_url, overall_score')
    .eq('id', post.subject_id)
    .maybeSingle();
  if (candErr) throw candErr;
  if (!cand) throw new Error('candidate_not_found');

  const png = await renderCandidateCardPng(cand as unknown as CardCandidate);

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
  const ogDescription = [cand.office, cand.party].filter(Boolean).join(' • ').slice(0, 300);

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
