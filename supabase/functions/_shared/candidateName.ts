/**
 * Candidate-name formatter for edge functions (Deno runtime).
 *
 * BYTE-FOR-BYTE behavioural copy of src/lib/candidateName.ts. The Vite (browser)
 * and Deno (edge) runtimes can't share a single source file without a build step,
 * so this copy exists for edge functions. src/lib/candidateName.test.ts imports
 * BOTH this file and the frontend one and asserts identical output across a
 * fixture table — so if these two ever drift, CI fails. Keep them in sync.
 */

const HONORIFIC_TITLES = new Set([
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'dr', 'dr.', 'hon', 'hon.', 'rev', 'rev.',
  'sir', 'prof', 'prof.',
]);

const CREDENTIAL_SUFFIXES: Record<string, string> = {
  'ph.d.': 'Ph.D.',
  'phd': 'Ph.D.',
  'm.d.': 'M.D.',
  'esq.': 'Esq.',
  'esq': 'Esq.',
};

const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv']);

function capitalizeNameWord(word: string): string {
  if (!word) return word;
  if (word.includes('-')) return word.split('-').map(capitalizeNameWord).join('-');
  if (word.includes("'")) return word.split("'").map(capitalizeNameWord).join("'");
  const lower = word.toLowerCase();
  if (ROMAN_NUMERALS.has(lower)) return lower.toUpperCase();
  if (lower.startsWith('mc') && lower.length > 3) {
    return 'Mc' + lower[2].toUpperCase() + lower.slice(3);
  }
  if (lower.startsWith('mac') && lower.length > 4) {
    return 'Mac' + lower[3].toUpperCase() + lower.slice(4);
  }
  return lower[0].toUpperCase() + lower.slice(1);
}

function toNameTitleCase(str: string): string {
  return str.toLowerCase().split(/\s+/).map(capitalizeNameWord).join(' ');
}

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
