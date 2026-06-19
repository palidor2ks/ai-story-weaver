import { expect, test } from 'bun:test';
import { formatCandidateName } from './utils';

test('formatCandidateName: FEC LAST, FIRST all-caps → First Last', () => {
  expect(formatCandidateName('ADAMS, GEORGE')).toBe('George Adams');
  expect(formatCandidateName('ADEIMY, DEBORAH')).toBe('Deborah Adeimy');
  expect(formatCandidateName('SMITH, ADAM JAMES')).toBe('Adam James Smith');
});

test('formatCandidateName: handles suffixes', () => {
  expect(formatCandidateName('ADAMS-FALCONER, THOMAS MICHAEL JR.')).toBe('Thomas Michael Jr. Adams-Falconer');
  expect(formatCandidateName('JOHNSON, JAMES SR.')).toBe('James Sr. Johnson');
});

test('formatCandidateName: handles hyphenated last names', () => {
  expect(formatCandidateName('SMITH-JONES, MARY')).toBe('Mary Smith-Jones');
});

test('formatCandidateName: Mc prefix', () => {
  expect(formatCandidateName('MCCONNELL, MITCH')).toBe('Mitch McConnell');
  expect(formatCandidateName('MCDONALD, JOHN')).toBe('John McDonald');
});

test("formatCandidateName: O'Brien apostrophe", () => {
  expect(formatCandidateName("O'BRIEN, JOHN")).toBe("John O'Brien");
});

test('formatCandidateName: proper-case names pass through unchanged', () => {
  expect(formatCandidateName('Adam Gray')).toBe('Adam Gray');
  expect(formatCandidateName('Addison P. McDowell')).toBe('Addison P. McDowell');
  expect(formatCandidateName('Donald J. Trump')).toBe('Donald J. Trump');
});

test('formatCandidateName: double comma (FEC data artifact)', () => {
  expect(formatCandidateName('BRINK,, BRIDGET')).toBe('Bridget Brink');
});

test('formatCandidateName: strips FEC honorific appended to first-name portion', () => {
  // FEC stores "LAST, FIRST MIDDLE MR" — MR must not appear in the output
  expect(formatCandidateName('MAPP, ADRIAN O MR')).toBe('Adrian O Mapp');
  expect(formatCandidateName('AGUILAR, ANTHONY BAILEY MR.')).toBe('Anthony Bailey Aguilar');
  expect(formatCandidateName('SMITH, JANE MS')).toBe('Jane Smith');
  expect(formatCandidateName('JONES, ROBERT DR.')).toBe('Robert Jones');
  expect(formatCandidateName('WILLIAMS, CAROL MRS.')).toBe('Carol Williams');
});

test('formatCandidateName: strips leading honorific from comma-free names', () => {
  expect(formatCandidateName('Mr. John Smith')).toBe('John Smith');
  expect(formatCandidateName('DR. ALICE JONES')).toBe('Alice Jones');
});

test('formatCandidateName: suffixes (JR/SR) are preserved, not stripped', () => {
  expect(formatCandidateName('ADAMS-FALCONER, THOMAS MICHAEL JR.')).toBe('Thomas Michael Jr. Adams-Falconer');
  expect(formatCandidateName('JOHNSON, JAMES SR.')).toBe('James Sr. Johnson');
});

test('formatCandidateName: academic credentials move after last name', () => {
  expect(formatCandidateName('ADUBATO, BETH ELLEN PH.D.')).toBe('Beth Ellen Adubato, Ph.D.');
  expect(formatCandidateName('SMITH, ALICE M.D.')).toBe('Alice Smith, M.D.');
  expect(formatCandidateName('DOE, JOHN ESQ.')).toBe('John Doe, Esq.');
});

test('formatCandidateName: null/empty', () => {
  expect(formatCandidateName(null)).toBe('');
  expect(formatCandidateName(undefined)).toBe('');
  expect(formatCandidateName('')).toBe('');
});
