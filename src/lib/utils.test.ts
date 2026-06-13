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

test('formatCandidateName: null/empty', () => {
  expect(formatCandidateName(null)).toBe('');
  expect(formatCandidateName(undefined)).toBe('');
  expect(formatCandidateName('')).toBe('');
});
