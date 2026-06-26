import { describe, it, expect } from 'bun:test';
import { compareStances, stanceBadgeClass, stanceShortLabel } from './stance';

describe('compareStances', () => {
  it('same sign → ALIGNS', () => {
    expect(compareStances(-4, -1)).toBe('ALIGNS');
    expect(compareStances(3, 7)).toBe('ALIGNS');
  });

  it('opposite signs → DIFFERS', () => {
    expect(compareStances(-4, 5)).toBe('DIFFERS');
    expect(compareStances(2, -8)).toBe('DIFFERS');
  });

  it('either side is zero → PARTIAL', () => {
    expect(compareStances(0, 5)).toBe('PARTIAL');
    expect(compareStances(-3, 0)).toBe('PARTIAL');
    expect(compareStances(0, 0)).toBe('PARTIAL');
  });
});

describe('stanceShortLabel', () => {
  it('maps to compact labels', () => {
    expect(stanceShortLabel('ALIGNS')).toBe('ALIGN');
    expect(stanceShortLabel('DIFFERS')).toBe('DIFFER');
    expect(stanceShortLabel('PARTIAL')).toBe('PARTIAL');
  });
});

describe('stanceBadgeClass', () => {
  it('returns a class string per kind', () => {
    expect(stanceBadgeClass('ALIGNS')).toContain('1B7A4B');
    expect(stanceBadgeClass('DIFFERS')).toContain('C8102E');
    expect(stanceBadgeClass('PARTIAL')).toContain('C19A3F');
  });
});
