// Pure, dependency-free helpers for the grounded controversy-research hook. Kept in
// their own module (type-only imports) so they're unit-testable without dragging in
// the supabase-js / ai-cache runtime imports that bun can't resolve in the test env.
import type { YouCitation } from './you-search.ts';

// Tidy a URL's hostname into a short attribution label, used only when the model
// doesn't supply a cleaner source name (e.g. "www.politico.com/..." -> "politico.com").
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Strip wrapping quotes, stray markdown, and whitespace noise from a distilled hook.
export function cleanHook(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

// Resolve the model's chosen citation index against the REAL list, so the cited URL
// can only ever be one the research returned (falls back to the first citation).
export function pickCitation(citations: YouCitation[], index: unknown): YouCitation | null {
  if (!Array.isArray(citations) || citations.length === 0) return null;
  const i = Number(index);
  if (Number.isInteger(i) && i >= 0 && i < citations.length) return citations[i];
  return citations[0];
}
