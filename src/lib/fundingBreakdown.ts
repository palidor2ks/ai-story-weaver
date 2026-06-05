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
  fecTotalReceipts?: number | null;
  cycleLabel?: string;
}

const n = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);

export function computeFundingBreakdown(input: FundingInput): FundingBreakdown {
  const largeIndividualDonors = n(input.fecItemized);
  const smallDonors = n(input.fecUnitemized);
  const pacs =
    n(input.fecPacContributions) + n(input.fecPartyContributions) + n(input.fecTransfers);
  const other = n(input.fecOtherReceipts);
  const self = n(input.fecLoans) + n(input.fecCandidateContribution);

  const sources: FundingBucket[] = [
    { label: 'Large Individual Donors', amount: largeIndividualDonors, color: 'hsl(217 91% 60%)' },
    { label: 'Small Donors (Unitemized)', amount: smallDonors, color: 'hsl(228 94% 67%)' },
    { label: 'PACs & Committees', amount: pacs, color: 'hsl(199 89% 60%)' },
    { label: 'Other Receipts', amount: other, color: 'hsl(280 75% 65%)' },
    { label: 'Self-Funding', amount: self, color: 'hsl(220 14% 65%)' },
  ];

  const known = sources.reduce((s, b) => s + b.amount, 0);
  const fecTotal = n(input.fecTotalReceipts);

  // If FEC total receipts is known and exceeds what we've categorized,
  // surface the gap as "Other / Uncategorized" so the panel reconciles
  // with the headline FEC Total Receipts figure.
  if (fecTotal > known + 1) {
    sources.push({
      label: 'Other / Uncategorized',
      amount: fecTotal - known,
      color: 'hsl(220 9% 55%)',
    });
  }

  const total = fecTotal > known ? fecTotal : known;

  return { sources, total, cycleLabel: input.cycleLabel };
}

export function withPercents(
  sources: FundingBucket[],
  total: number,
): Array<FundingBucket & { pct: number }> {
  if (total <= 0) return sources.map((s) => ({ ...s, pct: 0 }));
  return sources.map((s) => ({ ...s, pct: Math.round((s.amount / total) * 1000) / 10 }));
}

export interface GroupOptions {
  /** Max number of named bars before the remainder is folded into "Other". */
  maxVisible?: number;
  /** Hard cap: the folded "Other" bar may not exceed this % of total. */
  maxOtherPct?: number;
}

/**
 * Keeps a funding-sources chart readable: drops zero-value buckets, sorts by
 * amount, and once there are more than `maxVisible` sources folds the smallest
 * ones into a single "Other" bucket. The grouped "Other" is never allowed to
 * exceed `maxOtherPct` of the total — if folding the tail would breach that cap,
 * more named bars are revealed (down to showing everything, with no "Other") so
 * the catch-all stays a genuinely small slice.
 */
export function groupFundingSources(
  sources: FundingBucket[],
  total: number,
  opts: GroupOptions = {},
): FundingBucket[] {
  const maxVisible = opts.maxVisible ?? 5;
  const maxOtherPct = opts.maxOtherPct ?? 5;

  const positive = sources
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (positive.length <= maxVisible) return positive;

  const tailSum = (k: number) =>
    positive.slice(k).reduce((sum, b) => sum + b.amount, 0);

  // Start by folding everything past `maxVisible`, then reveal additional bars
  // one at a time until the folded remainder is within the cap.
  let keep = maxVisible;
  while (
    keep < positive.length &&
    total > 0 &&
    (tailSum(keep) / total) * 100 > maxOtherPct
  ) {
    keep += 1;
  }

  // Can't fold without breaching the cap — show every source, no "Other".
  if (keep >= positive.length) return positive;

  const otherAmount = tailSum(keep);
  if (otherAmount <= 0) return positive.slice(0, keep);

  return [
    ...positive.slice(0, keep),
    { label: 'Other', amount: otherAmount, color: 'hsl(220 9% 55%)' },
  ];
}
