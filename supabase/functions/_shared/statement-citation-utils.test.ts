// Tests for the part-1b phase-1 pure helpers (see statement-citation-utils.ts).
import { expect, test } from 'bun:test';
import { buildFindSourceQuery, detectArtifactHint, stanceLine } from './statement-citation-utils.ts';

test('detectArtifactHint matches the phase-1 artifact classes', () => {
  expect(detectArtifactHint('In a 2019 press release, she said…')).toBe('press release');
  expect(detectArtifactHint('In an interview with WMUR he stated…')).toBe('interview');
  expect(detectArtifactHint('He wrote an op-ed in the Houston Chronicle…')).toBe('op-ed');
  expect(detectArtifactHint('During a town hall in Mesa…')).toContain('town hall');
  expect(detectArtifactHint('His platform focuses on housing.')).toBeNull();
  expect(detectArtifactHint(null)).toBeNull();
});

test('stanceLine spells out the left/right axis convention from src/lib/scoring.ts', () => {
  expect(stanceLine('Should X happen?', -10)).toContain('progressive/left');
  expect(stanceLine('Should X happen?', 7)).toContain('conservative/right');
  expect(stanceLine('Should X happen?', 7)).toContain('value 7');
});

test('buildFindSourceQuery is question-shaped and names the person and claim', () => {
  const q = buildFindSourceQuery({
    name: 'Jane Doe',
    office: 'U.S. House NH-01',
    state: 'NH',
    description: 'In a 2021 press release, Doe called for expanding rural broadband.',
    artifactHint: 'press release',
  });
  expect(q).toContain('Jane Doe, U.S. House NH-01, of NH');
  expect(q).toContain('a specific press release');
  expect(q).toContain('rural broadband');
  // The research query must NOT offer a bail-out token — the 2026-06-11 gate runs showed
  // the research model answers an "else say NONE" command with an instant NONE for every
  // row. Rejection is the verify_citation distiller's job.
  expect(q).not.toContain('NONE');
  expect(q).toContain('not someone with a similar name'); // identity guard present
});

test('buildFindSourceQuery truncates very long descriptions', () => {
  const q = buildFindSourceQuery({ name: 'A', description: 'x'.repeat(2000) });
  expect(q.length).toBeLessThan(1400);
});
