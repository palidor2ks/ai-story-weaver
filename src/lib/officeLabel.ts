const SUFFIX_MAP: Record<string, string> = {
  'ph.d.': 'Ph.D.',
  'phd': 'Ph.D.',
  'm.d.': 'M.D.',
  'jr.': 'Jr.',
  'jr': 'Jr.',
  'sr.': 'Sr.',
  'sr': 'Sr.',
  'ii': 'II',
  'iii': 'III',
  'iv': 'IV',
  'esq.': 'Esq.',
  'esq': 'Esq.',
};

function capWord(w: string): string {
  if (!w) return w;
  const lower = w.toLowerCase();
  if (SUFFIX_MAP[lower]) return SUFFIX_MAP[lower];
  if (/^mc[a-z]/i.test(w)) return 'Mc' + w[2].toUpperCase() + w.slice(3).toLowerCase();
  if (/^mac[a-z]/i.test(w)) return 'Mac' + w[3].toUpperCase() + w.slice(4).toLowerCase();
  if (/^o'[a-z]/i.test(w)) return "O'" + w[2].toUpperCase() + w.slice(3).toLowerCase();
  return w.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCase(str: string): string {
  return str.split(/\s+/).map((token) => {
    if (token.includes('-')) return token.split('-').map(capWord).join('-');
    return capWord(token);
  }).join(' ');
}

/**
 * Convert ALL-CAPS candidate names (as stored from FEC) to display-friendly Title Case.
 * Reorders "LAST, FIRST MIDDLE" to "First Middle Last".
 * Mixed-case names pass through unchanged.
 */
export function toDisplayName(name: string | null | undefined): string {
  const s = (name ?? '').trim();
  if (!s) return s;
  const letters = s.replace(/[^a-zA-Z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) {
    const last = s.slice(0, commaIdx).trim();
    const rest = s.slice(commaIdx + 1).trim();
    return titleCase(rest ? `${rest} ${last}` : last);
  }
  return titleCase(s);
}

/**
 * Normalize an office string to a clean, location-free canonical title.
 *
 * Examples:
 *  "Mayor of Piscataway"                           -> "Mayor"
 *  "Town Council Member, COLONIA (At-Large)"       -> "Town Council Member"
 *  "Town Council Member, Piscataway (Ward 1)"      -> "Town Council Member"
 *  "President of the United States"                -> "President"
 *  "Governor of New Jersey"                        -> "Governor"
 *  "State Representative"                          -> "State House"
 *  "State Senator"                                 -> "State Senate"
 *
 * Well-known titles that legitimately contain "of" (e.g. "Secretary of State",
 * "Attorney General", "Speaker of the House") are preserved.
 */
export function normalizeOfficeName(
  office: string | null | undefined,
): string {
  const raw = (office ?? '').trim();
  if (!raw) return '';

  // Members of the U.S. House and Senate arrive labelled many ways across our
  // feeds — "Representative" / "Senator" (Congress.gov), "U.S. House FL-01" (FEC),
  // "Member, U.S. House of Representatives" (civic). Collapse every federal
  // congressional variant to one canonical chamber label so the same role never
  // shows up under two different names. Explicit "U.S. House/Senate" phrasings are
  // unambiguous, so resolve them up front — before the comma/"of" stripping below
  // would mangle forms like "Member, U.S. House of Representatives" into "Member".
  if (/\bu\.?s\.?\s*house\b/i.test(raw)) return 'U.S. House';
  if (/\bu\.?s\.?\s*senate\b/i.test(raw)) return 'U.S. Senate';

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

  // Canonicalize a few common short forms. The bare titles "Representative" and
  // "Senator" map to their chamber so they read the same as the explicit
  // "U.S. House" / "U.S. Senate" forms handled above.
  if (/^u\.?s\.?\s*house$/i.test(s) || /^(u\.?s\.?\s*|united\s+states\s+)?representative$/i.test(s)) s = 'U.S. House';
  else if (/^u\.?s\.?\s*senate$/i.test(s) || /^(u\.?s\.?\s*|united\s+states\s+)?senator$/i.test(s)) s = 'U.S. Senate';
  // State legislative chambers — mirror "U.S. House" / "U.S. Senate" style
  else if (/^state\s+(representative|delegate|assemblyman|assemblywoman|assembly\s+member|house\s+member|legislator)$/i.test(s)) s = 'State House';
  else if (/^state\s+senator?$/i.test(s)) s = 'State Senate';

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

  let clean = normalizeOfficeName(raw);
  if (/^president$/i.test(clean)) clean = 'President';

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
