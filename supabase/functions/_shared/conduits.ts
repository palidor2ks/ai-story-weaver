// Conduit + memo-line rules for FEC Schedule A donor aggregation.
//
// FEC filings contain three kinds of lines that must NOT count toward a donor
// row's dollars, or the same money is counted twice (see docs/DATA-ACCURACY.md):
//   1. memo lines (memo_code = 'X') — informational duplicates of money reported
//      on another (countable) line. Finance reconciliation already excludes them;
//      donor aggregation must apply the same rule.
//   2. "SEE BELOW" / "EARMARKED CONTRIBUTION:" pass-through entries — conduit
//      batch totals whose underlying donors are itemized separately.
//   3. Any line under a conduit org's own name (ActBlue/WinRed/Democracy Engine).
//      Conduits are payment processors: the money belongs to the individual
//      donors, who are itemized on their own countable lines.
//
// Keep this list in sync with src/lib/conduits.ts (frontend copy — Vite and
// Deno cannot share a module).

export const KNOWN_CONDUITS = ['ACTBLUE', 'WINRED', 'DEMOCRACY ENGINE'];

export function isKnownConduitOrg(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  return KNOWN_CONDUITS.some((c) => upper.includes(c));
}

export function isMemoX(memoCode: string | null | undefined): boolean {
  return (memoCode ?? '').trim().toUpperCase() === 'X';
}

export function isSeeBelowPassThrough(memoText: string | null | undefined): boolean {
  if (!memoText) return false;
  const upper = memoText.toUpperCase();
  return upper.includes('SEE BELOW') || upper.includes('EARMARKED CONTRIBUTION:');
}

// The one aggregation rule: a Schedule A line counts toward donors.amount and
// donors.transaction_count iff it passes all three checks. Receipt-date fields
// stay unconditional (sync provenance, not displayed money).
// `effectiveMemoCode` is the importer's memo code AFTER Line-12-attribution and
// conduit-aggregate forcing (both importers compute it before this call).
export function shouldCountDonorLine(line: {
  contributorName: string;
  effectiveMemoCode: string | null;
  memoText: string | null;
}): boolean {
  return (
    !isKnownConduitOrg(line.contributorName) &&
    !isMemoX(line.effectiveMemoCode) &&
    !isSeeBelowPassThrough(line.memoText)
  );
}
