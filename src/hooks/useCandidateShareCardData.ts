import { useEffect, useMemo, useState } from 'react';
import { useCandidate, useCandidateDonors } from '@/hooks/useCandidates';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { useAvailableCycles } from '@/hooks/useAvailableCycles';
import { useFECTotals } from '@/hooks/useFECTotals';
import { useFinanceReconciliation } from '@/hooks/useFinanceReconciliation';
import { useRepresentativeDetails } from '@/hooks/useRepresentativeDetails';
import { useCandidateIE } from '@/hooks/useIndependentExpenditures';
import { getDonorCause, useDonorCauses } from '@/hooks/useDonorCauses';
import { computeFundingBreakdown, groupFundingSources, withPercents } from '@/lib/fundingBreakdown';
import { proxiedImageUrl } from '@/lib/imageProxy';
import { BRAND_HOST } from '@/lib/brand';
import { supabase } from '@/integrations/supabase/client';
import { choosePrimaryCauseLabel, type CauseDisplayInfo } from '@/lib/committeeCauseDisplay';
import { useQuery } from '@tanstack/react-query';

const CONDUIT_NAMES = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(proxiedImageUrl(url));
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.type.includes('text/html')) return null;
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface CandidateShareCardData {
  brandHost: string;
  candidateId: string;
  candidateName: string;
  candidateOffice: string;
  candidateState: string | null;
  candidateDistrict: string | null;
  candidateParty: string;
  candidateImage: string | null;
  candidateScore: number | null;
  userScore: null;
  matchScore: 0;
  agreements: [];
  disagreements: [];
  incumbent: boolean | undefined;
  coverageTier: string | undefined;
  confidence: string | undefined;
  ieCycle: string | null;
  totalRaised: number | null;
  totalSpent: number | null;
  outsideSupport: number | null;
  outsideOppose: number | null;
  topSpenders: { name: string; support: number; oppose: number; primaryCause?: string | null }[];
  topDonors: { name: string; amount: number; primaryCause?: string | null }[];
  fundingBreakdown:
    | { label: string; pct: number; color: string }[]
    | undefined;
  fundingCycle: string | undefined;
}

/**
 * Mirrors the data assembly used by the rep-profile share button
 * (`ShareProfileButton` + `CandidateProfile`) so the auto-generated admin
 * stat card includes top donors, funding breakdown, and IE spenders.
 */
export function useCandidateShareCardData(
  candidateId: string | undefined | null,
): { loading: boolean; data: CandidateShareCardData | null } {
  const id = candidateId ?? undefined;
  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: scoreMap } = useCandidateScoreMap(id ? [id] : undefined);
  const { data: cycleInfo, isLoading: cyclesLoading } = useAvailableCycles(id);
  const effectiveCycle = cycleInfo?.defaultCycle;
  const { data: donors = [], isLoading: donorsLoading } = useCandidateDonors(
    id,
    effectiveCycle,
  );
  const { data: representativeDetails } = useRepresentativeDetails(id);

  const committeeId = donors[0]?.recipient_committee_id ?? null;
  const isAllCycles = effectiveCycle === 'all';
  const { data: fecTotals } = useFECTotals(
    committeeId,
    !isAllCycles && effectiveCycle ? effectiveCycle : '2024',
    !!effectiveCycle && !isAllCycles,
  );
  const { data: financeReconciliation } = useFinanceReconciliation(
    id,
    effectiveCycle,
  );
  const requestedIeCycle = effectiveCycle && effectiveCycle !== 'all' ? effectiveCycle : null;
  const { data: cycleIeData, isLoading: cycleIeLoading, isFetching: cycleIeFetching } = useCandidateIE(id ?? null, requestedIeCycle);
  const { data: latestIeData, isLoading: latestIeLoading, isFetching: latestIeFetching } = useCandidateIE(id ?? null, null);

  const topDonorSummaries = useMemo(() => {
    const isConduitDonor = (d: (typeof donors)[number]) =>
      d.is_conduit_org ||
      CONDUIT_NAMES.some((c) =>
        (d.display_name || d.name || '').toUpperCase().includes(c),
      );

    const donorAgg = new Map<
      string,
      { name: string; amount: number; type: (typeof donors)[number]['type'] }
    >();
    donors
      .filter((d) => !isConduitDonor(d) && !d.is_transfer)
      .forEach((d) => {
        const name = (d.display_name || d.name || 'Unknown').trim();
        const existing = donorAgg.get(name);
        if (existing) {
          existing.amount += Number(d.amount ?? 0);
          if (existing.type !== 'PAC' && existing.type !== 'Organization') {
            existing.type = d.type;
          }
        } else {
          donorAgg.set(name, {
            name,
            amount: Number(d.amount ?? 0),
            type: d.type,
          });
        }
      });

    return Array.from(donorAgg.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }, [donors]);

  const { data: donorCauseMap } = useDonorCauses(
    topDonorSummaries.map((d) => ({ name: d.name, type: d.type })),
  );

  const topSpenderIds = useMemo(() => {
    const requestedRows = requestedIeCycle
      ? (cycleIeData?.rows ?? []).filter((r) => String(r.cycle) === requestedIeCycle)
      : [];
    const useRequestedCycle = !!requestedIeCycle && requestedRows.length > 0;
    const sourceIeData = useRequestedCycle ? cycleIeData : latestIeData;
    const cycles = sourceIeData?.availableCycles ?? [];
    const ieCycle = useRequestedCycle ? requestedIeCycle : cycles[0] ?? null;
    const rows = useRequestedCycle
      ? requestedRows
      : (sourceIeData?.rows ?? []).filter((r) =>
          ieCycle ? String(r.cycle) === ieCycle : true,
        );
    const spenderTotals = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.spending_committee_fec_id;
      if (!key) return;
      spenderTotals.set(key, (spenderTotals.get(key) ?? 0) + Number(r.amount ?? 0));
    });
    return Array.from(spenderTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([fecId]) => fecId)
      .sort();
  }, [cycleIeData, latestIeData, requestedIeCycle]);

  const { data: spenderCauseMap } = useQuery({
    queryKey: ['candidate-share-card-spender-causes', topSpenderIds],
    enabled: topSpenderIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from('committee_topics')
        .select(
          'fec_committee_id, secondary_cause_ids, primary_cause:primary_cause_id(id, label)',
        )
        .in('fec_committee_id', topSpenderIds);
      const rows = (data ?? []) as unknown as Array<{
        fec_committee_id: string | null;
        secondary_cause_ids: string[] | null;
        primary_cause: CauseDisplayInfo | null;
      }>;
      const secondaryIds = Array.from(
        new Set(rows.flatMap((r) => r.secondary_cause_ids ?? [])),
      );
      const { data: secondaryCauses } =
        secondaryIds.length > 0
          ? await supabase
              .from('committee_causes')
              .select('id, label')
              .in('id', secondaryIds)
          : { data: [] };
      const causeRows = (secondaryCauses ?? []) as unknown as CauseDisplayInfo[];
      const causeById = new Map(causeRows.map((cause) => [cause.id, cause]));
      const map = new Map<string, string>();
      rows.forEach((r) => {
        if (!r.fec_committee_id) return;
        const label = choosePrimaryCauseLabel(
          r.primary_cause,
          (r.secondary_cause_ids ?? [])
            .map((secondaryId) => causeById.get(secondaryId))
            .filter(Boolean) as CauseDisplayInfo[],
        );
        if (label) map.set(r.fec_committee_id, label);
      });
      return map;
    },
  });

  const [resolvedImage, setResolvedImage] = useState<string | null>(null);
  const rawImage =
    representativeDetails?.image_url || candidate?.image_url || null;

  useEffect(() => {
    if (!rawImage) {
      setResolvedImage(null);
      return;
    }
    setResolvedImage(rawImage);
    let cancelled = false;
    const urls: string[] = [rawImage];
    if (id && /^[A-Z]\d{6}$/.test(id)) {
      urls.push(`https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`);
    }
    (async () => {
      for (const url of urls) {
        if (url.startsWith('data:')) {
          if (!cancelled) setResolvedImage(url);
          return;
        }
        const b64 = await imageUrlToBase64(url);
        if (b64 && !cancelled) {
          setResolvedImage(b64);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawImage, id]);

  const data = useMemo<CandidateShareCardData | null>(() => {
    if (!id || !candidate) return null;

    const score = scoreMap?.get(id) ?? candidate.overall_score ?? null;

    const topDonors = topDonorSummaries.map((donor) => ({
      name: donor.name,
      amount: donor.amount,
      primaryCause: getDonorCause(donorCauseMap, donor.name, donor.type)?.label ?? null,
    }));

    const fecItemized =
      financeReconciliation?.fec_itemized ??
      fecTotals?.individual_itemized_contributions ??
      null;
    const fecUnitemized =
      financeReconciliation?.fec_unitemized ??
      fecTotals?.individual_unitemized_contributions ??
      null;
    const fecTotalReceipts =
      financeReconciliation?.fec_total_receipts ??
      fecTotals?.total_receipts ??
      null;
    const fecTotalDisbursements = fecTotals?.total_disbursements ?? null;

    const fundingInput = {
      fecItemized,
      fecUnitemized,
      fecPacContributions:
        financeReconciliation?.fec_pac_contributions ?? fecTotals?.pac_contributions ?? 0,
      fecPartyContributions:
        financeReconciliation?.fec_party_contributions ?? fecTotals?.party_contributions ?? 0,
      fecTransfers: financeReconciliation?.fec_transfers ?? fecTotals?.transfers ?? 0,
      fecLoans: financeReconciliation?.fec_loans ?? fecTotals?.loans ?? 0,
      fecCandidateContribution:
        financeReconciliation?.fec_candidate_contribution ?? fecTotals?.candidate_contribution ?? 0,
      fecOtherReceipts:
        financeReconciliation?.fec_other_receipts ??
        fecTotals?.other_receipts ??
        0,
      fecTotalReceipts,
      cycleLabel:
        effectiveCycle && effectiveCycle !== 'all'
          ? String(effectiveCycle)
          : cycleInfo?.defaultCycle
          ? String(cycleInfo.defaultCycle)
          : undefined,
    };

    const b = computeFundingBreakdown(fundingInput);
    const fundingBreakdown =
      b.total > 0
        ? withPercents(groupFundingSources(b.sources, b.total), b.total)
            .map((r) => ({ label: r.label, pct: r.pct, color: r.color }))
        : undefined;

    const requestedRows = requestedIeCycle
      ? (cycleIeData?.rows ?? []).filter((r) => String(r.cycle) === requestedIeCycle)
      : [];
    const useRequestedCycle = !!requestedIeCycle && requestedRows.length > 0;
    const sourceIeData = useRequestedCycle ? cycleIeData : latestIeData;
    const cycles = sourceIeData?.availableCycles ?? [];
    const ieCycle = useRequestedCycle ? requestedIeCycle : cycles[0] ?? null;
    const rows = useRequestedCycle
      ? requestedRows
      : (sourceIeData?.rows ?? []).filter((r) =>
          ieCycle ? String(r.cycle) === ieCycle : true,
        );
    const spenderMap = new Map<
      string,
      { fecId: string; name: string; support: number; oppose: number }
    >();
    rows.forEach((r) => {
      const key = r.spending_committee_fec_id;
      const cur = spenderMap.get(key) ?? {
        fecId: key,
        name: r.spending_committee_name ?? key,
        support: 0,
        oppose: 0,
      };
      const amt = Number(r.amount ?? 0);
      if (r.support_oppose_indicator === 'S') cur.support += amt;
      else cur.oppose += amt;
      spenderMap.set(key, cur);
    });
    const topSpenders = Array.from(spenderMap.values())
      .sort((a, b) => b.support + b.oppose - (a.support + a.oppose))
      .slice(0, 2)
      .map(({ fecId, ...spender }) => ({
        ...spender,
        primaryCause: spenderCauseMap?.get(fecId) ?? null,
      }));

    // Total outside (independent-expenditure) spending for the displayed cycle,
    // split by stance so the card can show a "For" / "Against" breakdown. Mirror
    // the support/oppose split used to build spenderMap above.
    const outsideSupportTotal = rows.reduce(
      (sum, r) => sum + (r.support_oppose_indicator === 'S' ? Number(r.amount ?? 0) : 0),
      0,
    );
    const outsideOpposeTotal = rows.reduce(
      (sum, r) => sum + (r.support_oppose_indicator === 'S' ? 0 : Number(r.amount ?? 0)),
      0,
    );

    return {
      brandHost: BRAND_HOST,
      candidateId: id,
      candidateName: candidate.name,
      candidateOffice: candidate.office,
      candidateState: candidate.state ?? null,
      candidateDistrict: candidate.district ?? null,
      candidateParty: candidate.party,
      candidateImage: resolvedImage,
      candidateScore: score,
      userScore: null,
      matchScore: 0,
      agreements: [],
      disagreements: [],
      incumbent: candidate.is_incumbent ?? true,
      coverageTier: candidate.coverage_tier ?? undefined,
      confidence: candidate.confidence ?? undefined,
      ieCycle,
      totalRaised: fecTotalReceipts,
      totalSpent: fecTotalDisbursements,
      outsideSupport: outsideSupportTotal > 0 ? outsideSupportTotal : null,
      outsideOppose: outsideOpposeTotal > 0 ? outsideOpposeTotal : null,
      topSpenders,
      topDonors,
      fundingBreakdown,
      fundingCycle: fundingInput.cycleLabel,
    };
  }, [
    id,
    candidate,
    scoreMap,
    topDonorSummaries,
    donorCauseMap,
    financeReconciliation,
    fecTotals,
    cycleIeData,
    latestIeData,
    spenderCauseMap,
    resolvedImage,
    effectiveCycle,
    requestedIeCycle,
    cycleInfo,
  ]);

  const loading =
    candidateLoading ||
    cyclesLoading ||
    donorsLoading ||
    cycleIeLoading ||
    latestIeLoading ||
    cycleIeFetching ||
    latestIeFetching;
  return { loading, data };
}
