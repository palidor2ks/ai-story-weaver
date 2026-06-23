import { test, expect } from 'bun:test';
import { formatCandidateName, toDisplayName } from './candidateName';
// Deno-runtime copy used by edge functions — imported here so the two copies
// are locked to the same behaviour (see fixtures loop below).
import { formatCandidateName as edgeFormatCandidateName } from '../../supabase/functions/_shared/candidateName';

// input → expected, the single source of truth for name formatting behaviour.
const FIXTURES: Array<[string | null | undefined, string]> = [
  // FEC "LAST, FIRST" all-caps
  ['ADAMS, GEORGE', 'George Adams'],
  ['SMITH, ADAM JAMES', 'Adam James Smith'],
  // honorifics dropped (anywhere)
  ['AGUILAR, ANTHONY BAILEY MR.', 'Anthony Bailey Aguilar'],
  ['MAPP, ADRIAN O MR', 'Adrian O Mapp'],
  ['SMITH, JANE MS', 'Jane Smith'],
  ['JONES, ROBERT DR.', 'Robert Jones'],
  ['Mr. John Smith', 'John Smith'],
  ['Anthony Bailey Mr. Aguilar', 'Anthony Bailey Aguilar'],
  // academic credentials moved to the end (anywhere)
  ['ADUBATO, BETH ELLEN PH.D.', 'Beth Ellen Adubato, Ph.D.'],
  ['SMITH, ALICE M.D.', 'Alice Smith, M.D.'],
  ['DOE, JOHN ESQ.', 'John Doe, Esq.'],
  ['Beth Ellen Ph.D. Adubato', 'Beth Ellen Adubato, Ph.D.'],
  // genealogical suffixes preserved in place
  ['JOHNSON, JAMES SR.', 'James Sr. Johnson'],
  ['ADAMS-FALCONER, THOMAS MICHAEL JR.', 'Thomas Michael Jr. Adams-Falconer'],
  // Roman numerals upper-cased (the toDisplayName behaviour formatCandidateName lacked)
  ['KING, ROBERT III', 'Robert III King'],
  ['SMITH, JOHN II', 'John II Smith'],
  // name-prefix casing
  ['MCCONNELL, MITCH', 'Mitch McConnell'],
  ['MCDONALD, JOHN', 'John McDonald'],
  ['MACDONALD, JOHN', 'John MacDonald'],
  ["O'BRIEN, JOHN", "John O'Brien"],
  ['SMITH-JONES, MARY', 'Mary Smith-Jones'],
  // data artifacts
  ['BRINK,, BRIDGET', 'Bridget Brink'],
  // already-clean mixed case passes through unchanged
  ['Adam Gray', 'Adam Gray'],
  ['Addison P. McDowell', 'Addison P. McDowell'],
  ['Donald J. Trump', 'Donald J. Trump'],
  ['Pete Aguilar', 'Pete Aguilar'],
  ['Beth Ellen Adubato, Ph.D.', 'Beth Ellen Adubato, Ph.D.'],
  // empties
  ['', ''],
];

test('formatCandidateName: matches the canonical fixtures', () => {
  for (const [input, expected] of FIXTURES) {
    expect(formatCandidateName(input)).toBe(expected);
  }
});

test('formatCandidateName: null/undefined → empty string', () => {
  expect(formatCandidateName(null)).toBe('');
  expect(formatCandidateName(undefined)).toBe('');
});

test('toDisplayName is the same canonical formatter', () => {
  for (const [input, expected] of FIXTURES) {
    expect(toDisplayName(input)).toBe(expected);
  }
});

// Drift guard: the edge-function (Deno) copy MUST produce identical output to the
// frontend copy for every fixture. If someone edits one without the other, this fails.
test('edge-function _shared copy stays in sync with the frontend formatter', () => {
  for (const [input, expected] of FIXTURES) {
    expect(edgeFormatCandidateName(input)).toBe(expected);
    expect(edgeFormatCandidateName(input)).toBe(formatCandidateName(input));
  }
});
