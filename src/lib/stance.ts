// Shared "how does this score compare to yours" stance logic.
// Used by the Compare page (CompareView) and the rep-profile "Positions & your match" list.
// Scores run −10 (progressive) … +10 (conservative); 0 means no lean.

export type StanceKind = 'ALIGNS' | 'DIFFERS' | 'PARTIAL';

/** Compare two topic scores (e.g. a candidate's vs. yours) into a match stance. */
export function compareStances(scoreA: number, scoreB: number): StanceKind {
  const signA = Math.sign(scoreA);
  const signB = Math.sign(scoreB);
  if (signA === 0 || signB === 0) return 'PARTIAL';
  if (signA === signB) return 'ALIGNS';
  return 'DIFFERS';
}

/** Tailwind classes (Design-B palette) for a stance pill: green align / red differ / gold partial. */
export function stanceBadgeClass(kind: StanceKind): string {
  switch (kind) {
    case 'ALIGNS':
      return 'bg-[#1B7A4B]/10 text-[#1B7A4B]';
    case 'DIFFERS':
      return 'bg-[#C8102E]/10 text-[#C8102E]';
    case 'PARTIAL':
      return 'bg-[#C19A3F]/10 text-[#C19A3F]';
  }
}

/** Short display label, e.g. for the compact profile rows: ALIGN / DIFFER / PARTIAL. */
export function stanceShortLabel(kind: StanceKind): string {
  switch (kind) {
    case 'ALIGNS':
      return 'ALIGN';
    case 'DIFFERS':
      return 'DIFFER';
    case 'PARTIAL':
      return 'PARTIAL';
  }
}
