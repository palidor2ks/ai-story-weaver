import { useEffect, useMemo, useState } from 'react';
import { useCandidate, useCandidateDonors } from '@/hooks/useCandidates';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { useAvailableCycles } from '@/hooks/useAvailableCycles';
import { useFECTotals } from '@/hooks/useFECTotals';
import { useFinanceReconciliation } from '@/hooks/useFinanceReconciliation';
import { useRepresentativeDetails } from '@/hooks/useRepresentativeDetails';
import { useCandidateIE } from '@/hooks/useIndependentExpenditures';
import { computeFundingBreakdown, withPercents } from '@/lib/fundingBreakdown';
import { proxiedImageUrl } from '@/lib/imageProxy';

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
  topSpenders: { name: string; support: number; oppose: number }[];
  topDonors: { name: string; amount: number }[];
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
  const { data: ieData } = useCandidateIE(id ?? null);

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

    const isConduitDonor = (d: (typeof donors)[number]) =>
      d.is_conduit_org ||
      CONDUIT_NAMES.some((c) =>
        (d.display_name || d.name || '').toUpperCase().includes(c),
      );

    const donorAgg = new Map<string, number>();
    donors
      .filter((d) => !isConduitDonor(d) && !d.is_transfer)
      .forEach((d) => {
        const n = (d.display_name || d.name || 'Unknown').trim();
        donorAgg.set(n, (donorAgg.get(n) ?? 0) + Number(d.amount ?? 0));
      });
    const topDonors = Array.from(donorAgg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount }));

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

    const fundingInput = {
      fecItemized,
      fecUnitemized,
      fecPacContributions: financeReconciliation?.fec_pac_contributions ?? 0,
      fecPartyContributions: financeReconciliation?.fec_party_contributions ?? 0,
      fecTransfers: financeReconciliation?.fec_transfers ?? 0,
      fecLoans: financeReconciliation?.fec_loans ?? 0,
      fecCandidateContribution:
        financeReconciliation?.fec_candidate_contribution ?? 0,
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
        ? withPercents(b.sources, b.total)
            .filter((r) => r.amount > 0)
            .map((r) => ({ label: r.label, pct: r.pct, color: r.color }))
        : undefined;

    const cycles = ieData?.availableCycles ?? [];
    const ieCycle = cycles[0] ?? null;
    const rows = (ieData?.rows ?? []).filter((r) =>
      ieCycle ? String(r.cycle) === ieCycle : true,
    );
    const spenderMap = new Map<
      string,
      { name: string; support: number; oppose: number }
    >();
    rows.forEach((r) => {
      const key = r.spending_committee_fec_id;
      const cur = spenderMap.get(key) ?? {
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
      .slice(0, 2);

    const brandHost =
      typeof window !== 'undefined'
        ? window.location.host.replace(/^www\./, '')
        : 'polipulseapp.com';

    return {
      brandHost,
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
      topSpenders,
      topDonors,
      fundingBreakdown,
      fundingCycle: fundingInput.cycleLabel,
    };
  }, [
    id,
    candidate,
    scoreMap,
    donors,
    financeReconciliation,
    fecTotals,
    ieData,
    resolvedImage,
    effectiveCycle,
    cycleInfo,
  ]);

  const loading = candidateLoading || cyclesLoading || donorsLoading;
  return { loading, data };
}
