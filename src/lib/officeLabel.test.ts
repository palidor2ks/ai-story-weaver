import { test, expect } from 'bun:test';
import { toDisplayName, normalizeOfficeName } from './officeLabel';

test('toDisplayName: FEC LAST, FIRST all-caps → First Last', () => {
  expect(toDisplayName('ADAMS, GEORGE')).toBe('George Adams');
  expect(toDisplayName('SMITH, ADAM JAMES')).toBe('Adam James Smith');
});

test('toDisplayName: drops honorific appended by FEC (regression for mid-name title)', () => {
  // Was rendering "Anthony Bailey Mr. Aguilar" — the title must be dropped.
  expect(toDisplayName('AGUILAR, ANTHONY BAILEY MR.')).toBe('Anthony Bailey Aguilar');
  expect(toDisplayName('SMITH, JANE MS')).toBe('Jane Smith');
  expect(toDisplayName('JONES, ROBERT DR.')).toBe('Robert Jones');
});

test('toDisplayName: moves academic credential after last name (regression)', () => {
  // Was rendering "Beth Ellen Ph.D. Adubato" — credential must move to the end.
  expect(toDisplayName('ADUBATO, BETH ELLEN PH.D.')).toBe('Beth Ellen Adubato, Ph.D.');
  expect(toDisplayName('SMITH, ALICE M.D.')).toBe('Alice Smith, M.D.');
  expect(toDisplayName('DOE, JOHN ESQ.')).toBe('John Doe, Esq.');
});

test('toDisplayName: genealogical suffixes (Jr/Sr/III) are preserved', () => {
  expect(toDisplayName('JOHNSON, JAMES SR.')).toBe('James Sr. Johnson');
  expect(toDisplayName('ADAMS, THOMAS JR.')).toBe('Thomas Jr. Adams');
  expect(toDisplayName('KING, ROBERT III')).toBe('Robert III King');
});

test('toDisplayName: Mc/Mac/O prefixes and hyphenated names', () => {
  expect(toDisplayName('MCCONNELL, MITCH')).toBe('Mitch McConnell');
  expect(toDisplayName("O'BRIEN, JOHN")).toBe("John O'Brien");
  expect(toDisplayName('SMITH-JONES, MARY')).toBe('Mary Smith-Jones');
});

test('toDisplayName: mixed-case names pass through unchanged', () => {
  expect(toDisplayName('Pete Aguilar')).toBe('Pete Aguilar');
  expect(toDisplayName('Addison P. McDowell')).toBe('Addison P. McDowell');
});

test('toDisplayName: null/empty', () => {
  expect(toDisplayName(null)).toBe('');
  expect(toDisplayName(undefined)).toBe('');
  expect(toDisplayName('')).toBe('');
});

test('normalizeOfficeName: collapses federal congressional variants', () => {
  expect(normalizeOfficeName('U.S. House NJ-06')).toBe('U.S. House');
  expect(normalizeOfficeName('Member, U.S. House of Representatives')).toBe('U.S. House');
  expect(normalizeOfficeName('Senator from New Jersey')).toBe('U.S. Senate');
});
