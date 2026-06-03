// `html-to-image` is only needed when a user actually exports/shares a card.
// Load it lazily so its (canvas-heavy) code stays out of the page's initial bundle.
let htmlToImagePromise: Promise<typeof import('html-to-image')> | null = null;
function loadHtmlToImage() {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import('html-to-image');
  }
  return htmlToImagePromise;
}

const PIXEL_RATIO = 2;

const RENDER_OPTIONS = {
  cacheBust: true,
  pixelRatio: PIXEL_RATIO,
  backgroundColor: undefined,
  // Wait for fonts/images to settle
  fetchRequestInit: { mode: 'cors' as RequestMode },
};

export async function nodeToBlob(node: HTMLElement): Promise<Blob> {
  const { toPng, toBlob } = await loadHtmlToImage();
  // Two-pass render to ensure web fonts are applied
  await toPng(node, RENDER_OPTIONS);
  const blob = await toBlob(node, RENDER_OPTIONS);
  if (!blob) throw new Error('Failed to render image');
  return blob;
}

export async function downloadNode(node: HTMLElement, filename: string) {
  const blob = await nodeToBlob(node);
  triggerBlobDownload(blob, filename);
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyNodeToClipboard(node: HTMLElement): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    const blob = await nodeToBlob(node);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (e) {
    console.warn('copyNodeToClipboard failed', e);
    return false;
  }
}

export async function nodeToFile(node: HTMLElement, filename: string): Promise<File> {
  const blob = await nodeToBlob(node);
  return new File([blob], filename, { type: 'image/png' });
}

export interface RenderQAResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  fontsReady: boolean;
  stable: boolean;
  warnings: string[];
}

async function decodeImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode rendered image'));
    img.src = dataUrl;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Pre-share QA: render the node twice, ensure web fonts are loaded,
 * and verify the rasterized output matches the expected pixel dimensions
 * (catches cropping, late font loads, and unsettled images before the user
 * downloads or sends the card).
 */
export async function renderNodeWithQA(node: HTMLElement): Promise<RenderQAResult> {
  const warnings: string[] = [];

  // 1. Make sure web fonts are loaded before we rasterize
  let fontsReady = true;
  try {
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch {
    fontsReady = false;
    warnings.push('Could not confirm web fonts finished loading.');
  }

  const { toPng, toBlob } = await loadHtmlToImage();

  const rect = node.getBoundingClientRect();
  const expectedWidth = Math.round(rect.width * PIXEL_RATIO);
  const expectedHeight = Math.round(rect.height * PIXEL_RATIO);

  // 2. Two renders — compare byte length to detect "not yet settled" output
  //    (e.g. background images, masks, or fonts that swapped after first paint).
  const firstPng = await toPng(node, RENDER_OPTIONS);
  const secondBlob = await toBlob(node, RENDER_OPTIONS);
  if (!secondBlob) throw new Error('Failed to render image');
  const secondDataUrl = await blobToDataUrl(secondBlob);

  const stable = Math.abs(firstPng.length - secondDataUrl.length) < firstPng.length * 0.01;
  if (!stable) {
    warnings.push('Render is still settling (fonts or images loading) — try preview again.');
  }

  // 3. Decode and verify dimensions
  const { width, height } = await decodeImageSize(secondDataUrl);
  const widthDelta = Math.abs(width - expectedWidth);
  const heightDelta = Math.abs(height - expectedHeight);
  if (widthDelta > 2) {
    warnings.push(
      `Exported width ${width}px does not match expected ${expectedWidth}px — content may be cropped.`,
    );
  }
  if (heightDelta > 2) {
    warnings.push(
      `Exported height ${height}px does not match expected ${expectedHeight}px — content may be cropped.`,
    );
  }

  return {
    blob: secondBlob,
    dataUrl: secondDataUrl,
    width,
    height,
    expectedWidth,
    expectedHeight,
    fontsReady,
    stable,
    warnings,
  };
}
