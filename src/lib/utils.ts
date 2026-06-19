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

/**
 * Normalises a candidate name to "First [Middle] Last" title-case format.
 * Handles FEC-style "LAST, FIRST MIDDLE MR." all-caps strings (stripping
 * honorific prefixes) and passes through names already in proper mixed case.
 * Post-nominal credentials (Ph.D., M.D., Esq.) are moved after the last name.
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
    const firstTokens: string[] = [];
    const credTokens: string[] = [];
    for (const w of rawFirst.split(/\s+/)) {
      const lower = w.toLowerCase();
      if (HONORIFIC_TITLES.has(lower)) continue;
      const cred = CREDENTIAL_SUFFIXES[lower];
      if (cred) {
        credTokens.push(cred);
      } else {
        firstTokens.push(w);
      }
    }
    const first = firstTokens.join(' ').trim();
    credential = credTokens.join(', ');
    result = first && last ? `${first} ${last}` : first || last;
  } else {
    // No comma: strip a leading honorific if present (e.g. "Mr. John Smith" → "John Smith")
    const tokens = result.trim().split(/\s+/);
    if (tokens.length > 1 && HONORIFIC_TITLES.has(tokens[0].toLowerCase())) {
      result = tokens.slice(1).join(' ');
    }
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
