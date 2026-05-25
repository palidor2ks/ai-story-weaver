// Pure helper that turns FEC reconciliation values into a 4-bucket
// "Funding Sources" breakdown shared between the profile page and the
// shareable Baseball card.

export interface FundingBucket {
  label: string;
  amount: number;
  color: string; // hsl(...) string using semantic-ish tokens
}

export interface FundingBreakdown {
  sources: FundingBucket[];
  total: number;
  cycleLabel?: string;
}

export interface FundingInput {
  fecItemized?: number | null;
  fecUnitemized?: number | null;
  fecPacContributions?: number | null;
  fecPartyContributions?: number | null;
  fecTransfers?: number | null;
  fecLoans?: number | null;
  fecCandidateContribution?: number | null;
  fecOtherReceipts?: number | null;
  cycleLabel?: string;
}

const n = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);

export function computeFundingBreakdown(input: FundingInput): FundingBreakdown {
  const individuals = n(input.fecItemized) + n(input.fecUnitemized);
  const pacs =
    n(input.fecPacContributions) + n(input.fecPartyContributions) + n(input.fecTransfers);
  const other = n(input.fecOtherReceipts);
  const self = n(input.fecLoans) + n(input.fecCandidateContribution);

  const sources: FundingBucket[] = [
    { label: 'Individual Donors', amount: individuals, color: 'hsl(217 91% 60%)' },
    { label: 'PACs & Committees', amount: pacs, color: 'hsl(199 89% 60%)' },
    { label: 'Other Receipts', amount: other, color: 'hsl(280 75% 65%)' },
    { label: 'Self-Funding', amount: self, color: 'hsl(220 14% 65%)' },
  ];

  const total = sources.reduce((s, b) => s + b.amount, 0);

  return { sources, total, cycleLabel: input.cycleLabel };
}

export function withPercents(
  sources: FundingBucket[],
  total: number,
): Array<FundingBucket & { pct: number }> {
  if (total <= 0) return sources.map((s) => ({ ...s, pct: 0 }));
  return sources.map((s) => ({ ...s, pct: Math.round((s.amount / total) * 100) }));
}
