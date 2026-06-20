import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function capitalizeNameWord(word: string): string {
  if (!word) return word;
  if (word.includes('-')) return word.split('-').map(capitalizeNameWord).join('-');
  if (word.includes("'")) return word.split("'").map(capitalizeNameWord).join("'");
  // Mc prefix: McConnell, McDonald
  if (word.startsWith('mc') && word.length > 3) {
    return 'Mc' + word[2].toUpperCase() + word.slice(3);
  }
  return word[0].toUpperCase() + word.slice(1);
}

function toNameTitleCase(str: string): string {
  return str.toLowerCase().split(/\s+/).map(capitalizeNameWord).join(' ');
}

// Honorific titles that FEC data appends to the first-name portion of
// "LAST, FIRST MIDDLE MR." style strings. These must never appear in the
// rendered display name.
const HONORIFIC_TITLES = new Set([
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'dr', 'dr.', 'hon', 'hon.', 'rev', 'rev.',
  'sir', 'prof', 'prof.',
]);

// Post-nominal academic/professional credentials in the FEC first-name portion
// that should appear AFTER the last name: "Beth Ellen Adubato, Ph.D."
const CREDENTIAL_SUFFIXES: Record<string, string> = {
  'ph.d.': 'Ph.D.',
  'phd': 'Ph.D.',
  'm.d.': 'M.D.',
  'esq.': 'Esq.',
  'esq': 'Esq.',
};

// Splits a list of name tokens into the real name words and any post-nominal
// credentials, dropping honorifics entirely. Works regardless of where the
// honorific/credential sits in the list — leading, middle, or trailing — so
// stranded titles like "Beth Ellen Ph.D. Adubato" are cleaned up.
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
 * Normalises a candidate name to "First [Middle] Last" title-case format.
 * Handles FEC-style "LAST, FIRST MIDDLE MR." all-caps strings (stripping
 * honorific prefixes) and passes through names already in proper mixed case.
 * Honorifics (Mr., Dr., …) are removed and post-nominal credentials (Ph.D.,
 * M.D., Esq.) are moved after the last name — wherever they appear in the
 * string, including stranded in the middle of an already-rearranged name.
 */
export function formatCandidateName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  const isAllCaps = name === name.toUpperCase();
  let result = name;
  let credential = '';
  if (name.includes(',')) {
    const comma = name.indexOf(',');
    const last = name.slice(0, comma).trim();
    // Strip any extra leading commas (e.g. "BRINK,, BRIDGET" → first="BRIDGET")
    const rawFirst = name.slice(comma + 1).replace(/^[,\s]+/, '').trim();
    const { nameTokens, credTokens } = partitionNameTokens(rawFirst.split(/\s+/));
    const first = nameTokens.join(' ').trim();
    credential = credTokens.join(', ');
    result = first && last ? `${first} ${last}` : first || last;
  } else {
    // No comma: drop honorifics anywhere (e.g. "Mr. John Smith", "Anthony
    // Bailey Mr. Aguilar") and pull credentials out to the end.
    const { nameTokens, credTokens } = partitionNameTokens(result.trim().split(/\s+/));
    credential = credTokens.join(', ');
    result = nameTokens.join(' ');
  }
  const base = isAllCaps ? toNameTitleCase(result) : result;
  return credential ? `${base}, ${credential}` : base;
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

const trimZero = (s: string) => s.replace(/\.0$/, '');

/**
 * Compact currency: $1.2B, $266M, $4.9M, $15K, $42.
 * Returns "—" for null/undefined/NaN.
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${trimZero((abs / 1_000_000_000).toFixed(1))}B`;
  if (abs >= 10_000_000) return `${sign}$${Math.round(abs / 1_000_000)}M`;
  if (abs >= 1_000_000) return `${sign}$${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Full currency for tooltips: $266,908,815.
 */
export function formatFullCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
