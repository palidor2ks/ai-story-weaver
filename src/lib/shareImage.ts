import { toPng, toBlob } from 'html-to-image';

const RENDER_OPTIONS = {
  cacheBust: true,
  pixelRatio: 2,
  backgroundColor: undefined,
  // Wait for fonts/images to settle
  fetchRequestInit: { mode: 'cors' as RequestMode },
};

export async function nodeToBlob(node: HTMLElement): Promise<Blob> {
  // Two-pass render to ensure web fonts are applied
  await toPng(node, RENDER_OPTIONS);
  const blob = await toBlob(node, RENDER_OPTIONS);
  if (!blob) throw new Error('Failed to render image');
  return blob;
}

export async function downloadNode(node: HTMLElement, filename: string) {
  const blob = await nodeToBlob(node);
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
