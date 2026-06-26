import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn, formatCompactCurrency } from '@/lib/utils';
import { useCandidate, useCandidateDonors } from '@/hooks/useCandidates';
import { useAvailableCycles } from '@/hooks/useAvailableCycles';
import { useFinanceReconciliation } from '@/hooks/useFinanceReconciliation';
import { useFECTotals } from '@/hooks/useFECTotals';
import { FundingSourcesBreakdown } from '@/components/FundingSourcesBreakdown';
import { isConduitDonor } from '@/lib/conduits';
import type { FundingInput } from '@/lib/fundingBreakdown';

type Cycle = '2024' | '2020' | 'Career';

const CYCLES: Cycle[] = ['2024', '2020', 'Career'];

// Compact form ($12M) to match the funding-sources header and the rest of the app.
const fmt = (n: number | null | undefined) =>
  n != null && n > 0 ? formatCompactCurrency(n) : '—';

export const CandidateDonors = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>('2024');

  const { data: candidate } = useCandidate(id);
  const { data: cycleInfo } = useAvailableCycles(id);

  // Translate the 3-chip selection into the hook's cycle param.
  const hookCycle = cycle === 'Career' ? 'all' : cycle;
  const concreteCycles = (cycleInfo?.cycles ?? []).filter((c) => c !== 'all');

  const { data: donors = [], isLoading: donorsLoading } = useCandidateDonors(
    id,
    cycle === 'Career' ? undefined : cycle,
  );

  const { data: financeReconciliation } = useFinanceReconciliation(
    id,
    hookCycle,
    hookCycle === 'all' ? concreteCycles : undefined,
  );

  // Derive committee ID for FEC totals fallback (from first non-conduit donor).
  const committeeId =
    donors.find((d) => d.recipient_committee_id)?.recipient_committee_id ?? null;

  const { data: fecTotals } = useFECTotals(
    committeeId,
    cycle !== 'Career' ? cycle : '2024',
    cycle !== 'Career',
  );

  // Prefer nightly reconciliation; fall back to live FEC API.
  const fecTotalReceipts =
    financeReconciliation?.fec_total_receipts ?? fecTotals?.total_receipts ?? null;
  const fecTotalDisbursements = fecTotals?.total_disbursements ?? null;
  const fecCashOnHand = fecTotals?.cash_on_hand_end_period ?? null;
  // Debt is not available in current data sources
  const fecDebt: number | null = null;

  const fecItemized =
    financeReconciliation?.fec_itemized ??
    fecTotals?.individual_itemized_contributions ??
    null;
  const fecUnitemized =
    financeReconciliation?.fec_unitemized ??
    fecTotals?.individual_unitemized_contributions ??
    null;
  const fecPacContributions =
    financeReconciliation?.fec_pac_contributions ?? fecTotals?.pac_contributions ?? 0;
  const fecPartyContributions =
    financeReconciliation?.fec_party_contributions ?? fecTotals?.party_contributions ?? 0;
  const fecTransfers =
    financeReconciliation?.fec_transfers ?? fecTotals?.transfers ?? 0;
  const fecLoans = financeReconciliation?.fec_loans ?? fecTotals?.loans ?? 0;
  const fecCandidateContribution =
    financeReconciliation?.fec_candidate_contribution ??
    fecTotals?.candidate_contribution ??
    0;
  const fecOtherReceipts =
    financeReconciliation?.fec_other_receipts ?? fecTotals?.other_receipts ?? 0;

  const fundingInput: FundingInput = {
    fecItemized,
    fecUnitemized,
    fecPacContributions,
    fecPartyContributions,
    fecTransfers,
    fecLoans,
    fecCandidateContribution,
    fecOtherReceipts,
    fecTotalReceipts,
    cycleLabel: cycle !== 'Career' ? cycle : undefined,
  };

  // Top donors — exclude conduit processors for the ranked list.
  const rankedDonors = donors.filter((d) => !isConduitDonor(d));
  const topDonors = rankedDonors.slice(0, 10);
  const maxAmount = topDonors[0]?.amount ?? 1;

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Navy gradient header */}
      <div
        className="relative px-4 pt-12 pb-10"
        style={{ background: 'linear-gradient(150deg, #182B7A, #0C1A52)' }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(`/candidate/${id}/profile`)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white"
            aria-label="Back to profile"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-mono-label text-white text-sm font-semibold tracking-widest uppercase">
            Funding &amp; Donors
          </span>
          {/* Right spacer keeps the title centred */}
          <div className="w-9" />
        </div>
        {candidate && (
          <p className="text-center text-white/60 text-xs mt-2">{candidate.name}</p>
        )}
      </div>

      <div className="px-4 pb-20">
        {/* Summary card — overlaps header */}
        <div className="bg-white rounded-2xl shadow-lg px-6 py-5 -mt-4 mb-4">
          {donorsLoading ? (
            <div className="grid grid-cols-4 gap-2 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-5 bg-poli-surface rounded w-16 mx-auto" />
                  <div className="h-3 bg-poli-surface rounded w-20 mx-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 divide-x divide-poli-surface text-center">
              <div className="pr-2">
                <div className="text-base font-bold text-poli-body leading-tight">
                  {fmt(fecTotalReceipts)}
                </div>
                <div className="text-[9px] text-poli-muted leading-tight mt-0.5 uppercase tracking-wide">
                  Total Raised
                </div>
              </div>
              <div className="px-2">
                <div className="text-base font-bold text-poli-body leading-tight">
                  {fmt(fecCashOnHand)}
                </div>
                <div className="text-[9px] text-poli-muted leading-tight mt-0.5 uppercase tracking-wide">
                  Cash on Hand
                </div>
              </div>
              <div className="px-2">
                <div className="text-base font-bold text-poli-body leading-tight">
                  {fmt(fecTotalDisbursements)}
                </div>
                <div className="text-[9px] text-poli-muted leading-tight mt-0.5 uppercase tracking-wide">
                  Total Spent
                </div>
              </div>
              <div className="pl-2">
                <div className="text-base font-bold text-poli-body leading-tight">
                  {fmt(fecDebt)}
                </div>
                <div className="text-[9px] text-poli-muted leading-tight mt-0.5 uppercase tracking-wide">
                  Debt
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cycle selector chips */}
        <div className="flex gap-2 mb-5">
          {CYCLES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={cn(
                'font-sans font-bold text-[12px] px-4 py-[7px] rounded-[20px]',
                cycle === c ? 'bg-poli-navy text-white' : 'bg-poli-surface text-poli-body',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Source of funds */}
        {(fecTotalReceipts ?? 0) > 0 && (
          <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 mb-4 shadow-sm">
            <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3 uppercase">
              Source of Funds
            </p>
            <FundingSourcesBreakdown input={fundingInput} />
          </div>
        )}

        {/* Top donors */}
        <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-wider mb-4">
            Top Donors
          </p>

          {donorsLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-poli-surface rounded" />
              ))}
            </div>
          ) : topDonors.length === 0 ? (
            <p className="text-sm text-poli-muted text-center py-6">No donor data available.</p>
          ) : (
            <div className="space-y-3">
              {topDonors.map((donor) => {
                const barWidth = maxAmount > 0 ? (donor.amount / maxAmount) * 100 : 0;
                return (
                  <div key={`${donor.id}-${donor.cycle}`}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-medium text-poli-body text-sm truncate pr-3 max-w-[65%]">
                        {donor.display_name}
                      </span>
                      <span className="font-semibold text-poli-navy text-sm tabular-nums shrink-0">
                        {formatCompactCurrency(donor.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-poli-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-poli-navy/20"
                        style={{ width: `${Math.max(2, barWidth)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rankedDonors.length > 10 && (
            <button
              type="button"
              onClick={() => navigate(`/candidate/${id}/profile`)}
              className="mt-5 w-full rounded-[20px] border border-poli-navy text-poli-navy font-bold text-sm py-2.5"
            >
              See all donors
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
