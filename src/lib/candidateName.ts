/**
 * THE single canonical candidate-name formatter for the frontend + scripts.
 *
 * Turns a stored/raw candidate name into a clean display name:
 *  - FEC "LAST, FIRST MIDDLE MR." all-caps strings become "First Middle Last"
 *  - honorifics (Mr., Dr., Ms., …) are dropped wherever they appear
 *  - academic credentials (Ph.D., M.D., Esq.) move after the last name
 *  - genealogical suffixes (Jr./Sr.) stay in place; Roman numerals (II/III/IV)
 *    are upper-cased; Mc/Mac/O' and hyphenated names are cased correctly
 *  - names already in proper mixed case pass through unchanged
 *
 * History: this used to be FIVE divergent implementations (formatCandidateName
 * in utils.ts, toDisplayName in officeLabel.ts, formatName in the CDN script,
 * the useCandidates CDN map, and an inlined copy in the refresh-candidates-cache
 * edge function), which let the same display bug recur five times. They are now
 * unified here. The edge function (Deno runtime) cannot import this file, so it
 * keeps a byte-identical copy in supabase/functions/_shared/candidateName.ts;
 * candidateName.test.ts runs both through the same fixtures to lock them together.
 */

// Honorific titles that FEC data appends to the name — never shown.
const HONORIFIC_TITLES = new Set([
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'dr', 'dr.', 'hon', 'hon.', 'rev', 'rev.',
  'sir', 'prof', 'prof.',
]);

// Post-nominal credentials that should render AFTER the last name.
const CREDENTIAL_SUFFIXES: Record<string, string> = {
  'ph.d.': 'Ph.D.',
  'phd': 'Ph.D.',
  'm.d.': 'M.D.',
  'esq.': 'Esq.',
  'esq': 'Esq.',
};

// Generational suffixes that should be upper-cased, not title-cased ("III" not "Iii").
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv']);

function capitalizeNameWord(word: string): string {
  if (!word) return word;
  if (word.includes('-')) return word.split('-').map(capitalizeNameWord).join('-');
  if (word.includes("'")) return word.split("'").map(capitalizeNameWord).join("'");
  const lower = word.toLowerCase();
  if (ROMAN_NUMERALS.has(lower)) return lower.toUpperCase();
  // Mc prefix: McConnell, McDonald
  if (lower.startsWith('mc') && lower.length > 3) {
    return 'Mc' + lower[2].toUpperCase() + lower.slice(3);
  }
  // Mac prefix: MacDonald (length guard avoids mangling "Mack" → "MacK")
  if (lower.startsWith('mac') && lower.length > 4) {
    return 'Mac' + lower[3].toUpperCase() + lower.slice(4);
  }
  return lower[0].toUpperCase() + lower.slice(1);
}

function toNameTitleCase(str: string): string {
  return str.toLowerCase().split(/\s+/).map(capitalizeNameWord).join(' ');
}

// Splits name tokens into the real name words and any post-nominal credentials,
// dropping honorifics — regardless of where they sit (leading, middle, trailing),
// so stranded titles like "Beth Ellen Ph.D. Adubato" are cleaned up.
function partitionNameTokens(tokens: string[]): {
  nameTokens: string[];
  credTokens: string[];
} {
  const nameTokens: string[] = [];
  const credTokens: string[] = [];
  for (const w of tokens) {
    if (!w) continue;
    const lower = w.toLowerCase();
    if (HONORIFIC_TITLES.has(lower)) continue;
    const cred = CREDENTIAL_SUFFIXES[lower];
    if (cred) {
      credTokens.push(cred);
    } else {
      nameTokens.push(w);
    }
  }
  return { nameTokens, credTokens };
}

/**
 * Normalises a candidate name to clean "First [Middle] Last" display form.
 * See module header for the full rule set. Mixed-case input without a comma is
 * returned unchanged; all-caps input is title-cased.
 */
export function formatCandidateName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  const collapsed = name.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  const isAllCaps = collapsed === collapsed.toUpperCase();
  let result = collapsed;
  let credential = '';
  if (collapsed.includes(',')) {
    const comma = collapsed.indexOf(',');
    const last = collapsed.slice(0, comma).trim();
    // Strip any extra leading commas (e.g. "BRINK,, BRIDGET" → first="BRIDGET")
    const rawFirst = collapsed.slice(comma + 1).replace(/^[,\s]+/, '').trim();
    const { nameTokens, credTokens } = partitionNameTokens(rawFirst.split(/\s+/));
    const first = nameTokens.join(' ').trim();
    credential = credTokens.join(', ');
    result = first && last ? `${first} ${last}` : first || last;
  } else {
    const { nameTokens, credTokens } = partitionNameTokens(collapsed.split(/\s+/));
    credential = credTokens.join(', ');
    result = nameTokens.join(' ');
  }
  const base = isAllCaps ? toNameTitleCase(result) : result;
  return credential ? `${base}, ${credential}` : base;
}

/**
 * @deprecated Alias of {@link formatCandidateName}. Kept so existing
 * `toDisplayName` import sites keep working; prefer formatCandidateName.
 */
export const toDisplayName = formatCandidateName;
