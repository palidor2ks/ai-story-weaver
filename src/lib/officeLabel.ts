/**
 * Format a candidate's "Running for ..." label using a clean office name plus
 * a consistent state/district suffix.
 *
 * - Strips any trailing "(STATE)", "STATE-N", or "STATE District N" embedded
 *   in the source office string so we don't double up on location.
 * - Appends "— {STATE}-{N}" for House districts, "— {STATE}" for statewide,
 *   "— United States" for federal President, and nothing if state is missing.
 */
export function formatRunningForOffice(
  office: string | null | undefined,
  state?: string | null,
  district?: string | null,
): string {
  const raw = (office ?? '').trim();
  if (!raw) return state ? `Office in ${state}` : 'Office';

  // Strip any embedded location info from the source office string
  let clean = raw
    // "U.S. House NJ-06" / "House NJ-6"
    .replace(/\s+[A-Z]{2}\s*-\s*\d+\s*$/i, '')
    // "U.S. Senate (NJ)" / "Senator (NJ)"
    .replace(/\s*\([A-Z]{2}\)\s*$/i, '')
    // "Senator from New Jersey" / "Representative from NJ"
    .replace(/\s+from\s+[A-Za-z .]+$/i, '')
    // "Governor of New Jersey"
    .replace(/\s+of\s+(the\s+)?[A-Z][A-Za-z .]+$/, '')
    // Trailing "District N"
    .replace(/\s*[-—–]?\s*District\s+\d+\s*$/i, '')
    .trim();

  // Normalize a few common short forms
  if (/^u\.?s\.?\s*house$/i.test(clean)) clean = 'U.S. House';
  else if (/^u\.?s\.?\s*senate$/i.test(clean) || /^senator$/i.test(clean)) clean = 'U.S. Senate';
  else if (/^president(\s+of\s+the\s+united\s+states)?$/i.test(clean)) clean = 'President';

  const st = (state ?? '').trim().toUpperCase();
  const dist = (district ?? '').toString().trim().replace(/^0+/, '');

  let suffix = '';
  if (clean === 'President') {
    suffix = ' — United States';
  } else if (st && dist) {
    suffix = ` — ${st}-${dist.padStart(2, '0')}`;
  } else if (st) {
    suffix = ` — ${st}`;
  }

  return `${clean}${suffix}`;
}
