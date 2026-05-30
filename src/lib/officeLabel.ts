/**
 * Normalize an office string to a clean, location-free canonical title.
 *
 * Examples:
 *  "Mayor of Piscataway"                           -> "Mayor"
 *  "Town Council Member, COLONIA (At-Large)"       -> "Town Council Member"
 *  "Town Council Member, Piscataway (Ward 1)"      -> "Town Council Member"
 *  "President of the United States"                -> "President"
 *  "Governor of New Jersey"                        -> "Governor"
 *
 * Well-known titles that legitimately contain "of" (e.g. "Secretary of State",
 * "Attorney General", "Speaker of the House") are preserved.
 */
export function normalizeOfficeName(
  office: string | null | undefined,
): string {
  const raw = (office ?? '').trim();
  if (!raw) return '';

  let s = raw;

  // Drop trailing parentheticals (e.g. "(At-Large)", "(Ward 1)", "(1st District)", "(NJ)")
  s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();

  // Drop everything after the first comma (e.g. ", COLONIA")
  s = s.split(/\s*,\s*/)[0].trim();

  // Preserve known titles that contain "of"
  const PRESERVE_OF = /^(Secretary\s+of\s+State|Speaker\s+of\s+the\s+House|Chief\s+of\s+(Staff|Police)|Commander\s+in\s+Chief|President\s+pro\s+tempore)$/i;

  if (!PRESERVE_OF.test(s)) {
    // "Mayor of Springfield" / "Governor of New Jersey" / "President of the United States"
    s = s.replace(/\s+of\s+(the\s+)?.+$/i, '').trim();
  }

  // "U.S. House NJ-06" / "House NJ-6"
  s = s.replace(/\s+[A-Z]{2}\s*-\s*\d+\s*$/i, '').trim();
  // "Senator from New Jersey"
  s = s.replace(/\s+from\s+[A-Za-z .]+$/i, '').trim();
  // Trailing "District N" / "Ward N" / "Precinct N"
  s = s.replace(/\s*[-—–]?\s*(District|Ward|Precinct)\s+\w+\s*$/i, '').trim();

  // Canonicalize a few common short forms
  if (/^u\.?s\.?\s*house$/i.test(s)) s = 'U.S. House';
  else if (/^u\.?s\.?\s*senate$/i.test(s) || /^senator$/i.test(s)) s = 'U.S. Senate';

  return s || raw;
}

/**
 * Format a candidate's "Running for ..." label using a clean office name plus
 * a consistent state/district suffix.
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
