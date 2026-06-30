import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { logBadgeEvent } from '@/lib/badges';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCandidate, useCandidateDonors, useCandidateVotes, calculateMatchScore } from '@/hooks/useCandidates';
import { useCandidateEarmarkRollups } from '@/hooks/useCandidateEarmarkRollups';
import { isConduitDonor } from '@/lib/conduits';
import { buildEarmarkRollupIndex, earmarkRollupKey, matchEarmarkRollupKey, normalizeOrgKey } from '@/lib/earmarkRollups';
import { useProfile, useUserTopicScores } from '@/hooks/useProfile';
import { useRepresentativeDetails } from '@/hooks/useRepresentativeDetails';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useAuth } from '@/context/AuthContext';
import { useFECIntegration } from '@/hooks/useFECIntegration';
import { useFECTotals } from '@/hooks/useFECTotals';
import { useFinanceReconciliation, useCommitteeRollups } from '@/hooks/useFinanceReconciliation';
import { useAvailableCycles } from '@/hooks/useAvailableCycles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBillSponsors } from '@/hooks/useBillSponsors';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { useCandidatePersonalizedScore } from '@/hooks/useCandidatePersonalizedScore';
import { FinanceReconciliationCard } from '@/components/FinanceReconciliationCard';
import { FinanceSummaryCard, type FinanceSummaryData } from '@/components/FinanceSummaryCard';
import { FundingSourcesBreakdown } from '@/components/FundingSourcesBreakdown';
import { NjStateFinanceSection } from '@/components/NjStateFinanceSection';
import { FlStateFinanceSection } from '@/components/FlStateFinanceSection';
import { NyStateFinanceSection } from '@/components/NyStateFinanceSection';
import { TxStateFinanceSection } from '@/components/TxStateFinanceSection';
import { normalizeOfficeName } from '@/lib/officeLabel';
import { computeFundingBreakdown, groupFundingSources, withPercents } from '@/lib/fundingBreakdown';
import { CandidateIESection } from '@/components/IndependentExpenditureSections';
import { useCandidateIE } from '@/hooks/useIndependentExpenditures';
import { cn, formatCompactCurrency } from '@/lib/utils';
import { ArrowLeft, ExternalLink, MapPin, Calendar, DollarSign, Vote, Sparkles, Pencil, BadgeCheck, FileText, RefreshCw, Info, AlertTriangle, Search, X, ChevronDown, ChevronUp, ScrollText, Briefcase, Heart } from 'lucide-react';
import { RecipientAIAnalysisDialog } from '@/components/RecipientAIAnalysisDialog';
import { BillAIAnalysisDialog } from '@/components/BillAIAnalysisDialog';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScoreText } from '@/components/ScoreText';
import { CandidateScoreCard } from '@/components/CandidateScoreCard';
import { CoverageTierBadge, ConfidenceBadge, IncumbentBadge } from '@/components/CoverageTierBadge';
import { AIExplanation } from '@/components/AIExplanation';

import { AIFeedback, ReportIssueButton } from '@/components/AIFeedback';
import { ContactInfoCard } from '@/components/ContactInfoCard';
import { CandidatePositions } from '@/components/CandidatePositions';
import { PositionsMatchList } from '@/components/PositionsMatchList';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { CandidateEditDialog } from '@/components/admin/CandidateEditDialog';
import { ClaimProfileDialog } from '@/components/ClaimProfileDialog';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { VotingRecordSection, topicNameToId } from '@/components/VotingRecordSection';
import { ShareProfileButton } from '@/components/ShareProfileButton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDonorCauses, getDonorCause } from '@/hooks/useDonorCauses';
import { CauseBadge } from '@/components/CauseBadge';
import { useDonorAliasNames } from '@/hooks/useDonorAliasNames';

const normalizeDistrictLabel = (district: string | null | undefined) => {
  const normalized = district?.toString().trim();
  if (!normalized) return null;

  if (/^district\b/i.test(normalized)) return normalized;

  return `District ${normalized.replace(/^0+/, '') || normalized}`;
};

const getLocationLabel = (
  state: string | null | undefined,
  district: string | null | undefined,
) => {
  const stateLabel = state?.trim();
  const districtLabel = normalizeDistrictLabel(district);

  if (stateLabel && districtLabel) return `${stateLabel} · ${districtLabel}`;
  return stateLabel ?? districtLabel ?? 'Location unavailable';
};

const getOfficeLocationLabel = (
  office: string | null | undefined,
  state: string | null | undefined,
  district: string | null | undefined,
) => {
  const officeLabel = office?.trim() || 'Official';
  return `${officeLabel} ${getLocationLabel(state, district)}`;
};

const getOfficeAbbrev = (office: string | undefined | null): string => {
  if (!office) return 'OFF';
  const o = office.toLowerCase();
  if (o.includes('senator')) return 'SEN';
  if (o.includes('representative')) return 'REP';
  if (o.includes('governor')) return 'GOV';
  return office.slice(0, 3).toUpperCase();
};

const getBillStatusStyle = (status: string | null | undefined) => {
  const s = (status || '').toLowerCase();
  if (s.includes('enacted') || s.includes('signed') || s.includes('became law'))
    return 'bg-poli-green text-white';
  if (s.includes('passed') && s.includes('senate'))
    return 'bg-poli-navy text-white';
  if (s.includes('committee'))
    return 'bg-poli-gold text-white';
  return 'bg-poli-surface text-poli-dim';
};

const StatusBadge = ({ status }: { status?: string | null }) => {
  if (!status) return null;
  const label = status.length > 18 ? status.slice(0, 16) + '…' : status;
  return (
    <span className={cn('font-mono-label text-[9px] font-semibold px-2 py-0.5 rounded-[5px] shrink-0', getBillStatusStyle(status))}>
      {label.toUpperCase()}
    </span>
  );
};

export const CandidateProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: profile } = useProfile();
  useEffect(() => { if (id) logBadgeEvent('match_viewed', { candidate_id: id }); }, [id]);
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: scoreMap } = useCandidateScoreMap(id ? [id] : undefined);
  const { data: personalized } = useCandidatePersonalizedScore(id);
  const { data: cycleInfo } = useAvailableCycles(id);
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFecBreakdownOpen, setIsFecBreakdownOpen] = useState(false);
  const [visibleDonorCount, setVisibleDonorCount] = useState(20);
  const [visibleBillCount, setVisibleBillCount] = useState(20);
  const [donorSearch, setDonorSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'issues' | 'votes' | 'bills' | 'money' | 'contact' | 'positions'>('issues');
  const effectiveCycle = selectedCycle ?? cycleInfo?.defaultCycle;
  const { data: donors = [], refetch: refetchDonors } = useCandidateDonors(id, effectiveCycle);
  const { data: earmarkRollups = [] } = useCandidateEarmarkRollups(id, effectiveCycle);
  const { data: ieData } = useCandidateIE(id, effectiveCycle);
  const ieSupport = ieData?.totals.support_amount ?? 0;
  const ieOppose = ieData?.totals.oppose_amount ?? 0;
  const donorCauseLookupDonors = useMemo(() => {
    const search = donorSearch.trim().toLowerCase();
    const lookupLimit = Math.max(visibleDonorCount, 60);
    const matchingDonors = search
      ? donors.filter((d) =>
        [d.display_name, d.name, d.employer, d.contributor_city, d.contributor_state, d.type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
      : donors;

    // Conduit rows never render, so don't let them eat cause-lookup slots.
    return matchingDonors.filter((d) => !isConduitDonor(d)).slice(0, lookupLimit);
  }, [donors, donorSearch, visibleDonorCount]);
  const donorCauseInputs = useMemo(
    () => [
      ...donorCauseLookupDonors.flatMap(d => {
        const names = [d.name, d.display_name, ...(d.name_variations ?? [])]
          .filter((name): name is string => Boolean(name?.trim()));
        return Array.from(new Set(names.map((name) => name.trim()))).map((name) => ({
          name,
          type: d.type,
        }));
      }),
      // Earmark-program orgs (e.g. AIPAC) are not in the donor list but need
      // a cause lookup so their cards show the same cause badge as donor cards.
      ...earmarkRollups.map(r => ({ name: r.org_label, type: r.org_type })),
    ],
    [donorCauseLookupDonors, earmarkRollups],
  );
  const { data: donorCauseMap } = useDonorCauses(donorCauseInputs);

  const donorAliasLookupInputs = useMemo(() => {
    return Array.from(
      donors.reduce((map, d) => {
        if (!d.name || (d.type !== 'PAC' && d.type !== 'Organization')) return map;
        const key = `${d.name.trim().toUpperCase()}|${d.type}`;
        if (!map.has(key)) map.set(key, { name: d.name.trim(), type: d.type });
        return map;
      }, new Map<string, { name: string; type: string }>()).values(),
    );
  }, [donors]);

  const { data: donorAliasNameMap } = useDonorAliasNames(donorAliasLookupInputs);
  const { data: votes = [] } = useCandidateVotes(id);
  const alignmentPercent = useMemo(() => {
    if (!candidate || !votes.length) return null;
    const userScoreMap: Record<string, number> = {};
    userTopicScores.forEach(ts => { userScoreMap[ts.topic_id] = ts.score; });
    let support = 0, oppose = 0;
    votes.forEach(vote => {
      const topicId = topicNameToId[vote.topic];
      if (!topicId) return;
      const userScore = userScoreMap[topicId];
      if (userScore === undefined || userScore === null) return;
      const isProgressiveBill = candidate.party === 'Democrat';
      if (isProgressiveBill) {
        if (userScore < 0) support++; else if (userScore > 0) oppose++;
      } else {
        if (userScore > 0) support++; else if (userScore < 0) oppose++;
      }
    });
    const total = support + oppose;
    return total > 0 ? Math.round((support / total) * 100) : null;
  }, [votes, userTopicScores, candidate?.party]);
  const { data: representativeDetails } = useRepresentativeDetails(id);
  const { data: adminData } = useAdminRole();
  const { user } = useAuth();
  const { fetchFECDonors, isDonorLoading } = useFECIntegration();
  const queryClient = useQueryClient();
  
  // Get FEC committee ID from first donor record or we'll pass null
  const committeeId = donors[0]?.recipient_committee_id ?? null;
  const isAllCycles = effectiveCycle === 'all';
  const concreteCycles = (cycleInfo?.cycles ?? []).filter((c) => c !== 'all');
  const { data: fecTotals } = useFECTotals(
    committeeId,
    !isAllCycles && effectiveCycle ? effectiveCycle : '2024',
    !!effectiveCycle && !isAllCycles,
  );
  const { data: financeReconciliation } = useFinanceReconciliation(
    id,
    effectiveCycle,
    isAllCycles ? concreteCycles : undefined,
  );
  const { data: committeeRollups = [] } = useCommitteeRollups(
    id,
    effectiveCycle,
    isAllCycles ? concreteCycles : undefined,
  );
  
  // Fetch bills sponsored/cosponsored by this legislator
  const { data: sponsoredBills = [], isLoading: billsLoading } = useBillSponsors(id);
  
  const isAdmin = adminData?.isAdmin ?? false;
  const isPoliticianOwner = !!user && candidate?.claimed_by_user_id === user.id;
  const canEdit = isAdmin || isPoliticianOwner;
  const isClaimed = !!candidate?.claimed_by_user_id;

  // Must be before early returns to maintain consistent hook order
  const resolvedScore = useMemo(() => {
    if (!id || !candidate) return candidate?.overall_score ?? 0;
    const mapped = scoreMap?.get(id);
    return mapped !== undefined ? mapped : candidate.overall_score;
  }, [id, scoreMap, candidate]);

  const handleFetchDonors = async () => {
    if (!candidate?.fec_candidate_id || !id) return;
    
    const cycleForSync = effectiveCycle && effectiveCycle !== 'all' ? effectiveCycle : (cycleInfo?.defaultCycle ?? '2024');
    const result = await fetchFECDonors(id, candidate.fec_candidate_id, cycleForSync);
    if (result.success) {
      toast.success(`Imported ${result.imported} donors totaling $${(result.totalRaised || 0).toLocaleString()}`);
      refetchDonors();
      queryClient.invalidateQueries({ queryKey: ['candidate', id] });
    } else {
      toast.error(result.error || 'Failed to fetch donors');
    }
  };

  if (candidateLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground">Candidate not found</p>
          <Link to="/candidates">
            <Button className="mt-4">Back to Candidates</Button>
          </Link>
        </main>
      </div>
    );
  }

  const locationLabel = getLocationLabel(candidate.state, candidate.district);
  const officeLocationLabel = getOfficeLocationLabel(candidate.office, candidate.state, candidate.district);

  const userScore = profile?.overall_score ?? 0;
  const matchScore = calculateMatchScore(userScore, resolvedScore);

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };


  // Transform candidate topic scores
  const candidateTopicScores = (candidate.topicScores || []).map(ts => ({
    topicId: ts.topic_id,
    topicName: ts.topics?.name || ts.topic_id,
    score: ts.score,
  }));

  // Calculate agreements and disagreements
  const comparisons = candidateTopicScores.map(cs => {
    const userTopic = userTopicScores.find(ut => ut.topic_id === cs.topicId);
    const userVal = userTopic?.score ?? 0;
    const diff = Math.abs(userVal - cs.score);
    const isAgreement = userTopic && Math.sign(userTopic.score) === Math.sign(cs.score);
    return {
      ...cs,
      userScore: userVal,
      difference: diff,
      isAgreement,
    };
  });

  const agreements = comparisons.filter(c => c.isAgreement).sort((a, b) => a.difference - b.difference).slice(0, 3);
  const disagreements = comparisons.filter(c => !c.isAgreement && c.score !== 0).sort((a, b) => b.difference - a.difference).slice(0, 3);

  // Normalize FEC totals to use reconciliation first, then live API as a fallback
  const fecItemized = financeReconciliation?.fec_itemized ?? fecTotals?.individual_itemized_contributions ?? null;
  const fecUnitemized = financeReconciliation?.fec_unitemized ?? fecTotals?.individual_unitemized_contributions ?? null;
  const fecTotalReceipts = financeReconciliation?.fec_total_receipts ?? fecTotals?.total_receipts ?? null;
  const fecTotalDisbursements = fecTotals?.total_disbursements ?? null;
  const hasFecBreakdown = fecTotalReceipts !== null && fecTotalReceipts > 0;
  const fecSourceLabel = financeReconciliation ? 'Nightly reconciliation (cached)' : fecTotals ? 'Live FEC API (fallback)' : null;

  // Donor-count badges for the FEC category cards (conduits never count).
  // Conduit detection (is_conduit_org flag + name match) lives in src/lib/conduits.
  const itemizedIndividualDonors = donors.filter(d => d.is_contribution !== false && !d.is_transfer && !isConduitDonor(d));
  const pacDonors = donors.filter(d => d.is_contribution !== false && !d.is_transfer && !isConduitDonor(d) && (d.type === 'PAC' || d.type === 'Organization'));

  // Conduit orgs (pass-throughs) are excluded from the list entirely; their
  // donors are itemized individually and no aggregated conduit amount is shown.
  const conduitDonors = donors.filter(d => isConduitDonor(d));
  
  // FEC PAC and Party contributions — prefer nightly reconciliation, fall back to
  // live FEC totals so these land in real buckets instead of "Other / Uncategorized".
  const fecPacContributions = financeReconciliation?.fec_pac_contributions ?? fecTotals?.pac_contributions ?? 0;
  const fecPartyContributions = financeReconciliation?.fec_party_contributions ?? fecTotals?.party_contributions ?? 0;

  // Additional FEC breakdown fields (loans, transfers, candidate contributions, other receipts)
  const fecLoans = financeReconciliation?.fec_loans ?? fecTotals?.loans ?? 0;
  const fecTransfers = financeReconciliation?.fec_transfers ?? fecTotals?.transfers ?? 0;
  const fecCandidateContribution = financeReconciliation?.fec_candidate_contribution ?? fecTotals?.candidate_contribution ?? 0;
  const fecOtherReceipts = financeReconciliation?.fec_other_receipts ?? fecTotals?.other_receipts ?? 0;
  
  // Contribution list total: Sum of all FEC breakdown components (should exactly equal FEC Total Receipts)
  // This ensures our breakdown table rows always sum to the FEC total
  const contributionListTotal = (fecItemized ?? 0) + fecPacContributions + fecPartyContributions + 
    (fecUnitemized ?? 0) + fecLoans + fecTransfers + fecCandidateContribution + fecOtherReceipts;
  
  // Since we derive contributionListTotal from FEC components, it should match FEC Total exactly
  // Any variance indicates missing data in our FEC breakdown fields
  const varianceAmount = fecTotalReceipts !== null ? contributionListTotal - fecTotalReceipts : 0;
  const varianceThreshold = 1; // Allow $1 rounding tolerance
  const hasVariance = fecTotalReceipts !== null && Math.abs(varianceAmount) > varianceThreshold;
  const variancePct = fecTotalReceipts ? ((varianceAmount / fecTotalReceipts) * 100).toFixed(1) : '0';

  const formatCurrency = formatCompactCurrency;

  // Shared funding-source input — used for the on-page panel and the
  // shareable Baseball card so the numbers always match.
  const fundingInput = {
    fecItemized,
    fecUnitemized,
    fecPacContributions,
    fecPartyContributions,
    fecTransfers,
    fecLoans,
    fecCandidateContribution,
    fecOtherReceipts,
    fecTotalReceipts,
    cycleLabel:
      effectiveCycle && effectiveCycle !== 'all'
        ? String(effectiveCycle)
        : cycleInfo?.defaultCycle
        ? String(cycleInfo.defaultCycle)
        : undefined,
  };
  const fundingBreakdownComputed = (() => {
    const b = computeFundingBreakdown(fundingInput);
    if (b.total <= 0) return undefined;
    return withPercents(groupFundingSources(b.sources, b.total), b.total)
      .map((r) => ({ label: r.label, pct: r.pct, color: r.color }));
  })();


  return (
    <div className="min-h-screen bg-[#F5F6FA] pb-20">
      <Seo
        title={`${candidate.name} — Pulse`}
        description={`See ${candidate.name}'s positions, voting record, donors, and how they align with your views on the issues that matter most.`}
        path={`/candidate/${candidate.id}`}
        type="profile"
        image={candidate.image_url || undefined}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: candidate.name,
          jobTitle: candidate.office,
          ...(candidate.image_url ? { image: candidate.image_url } : {}),
          ...(candidate.party
            ? { affiliation: { "@type": "Organization", name: candidate.party } }
            : {}),
          ...(candidate.state
            ? { homeLocation: { "@type": "Place", name: candidate.state } }
            : {}),
          url: `https://www.polipulseapp.com/candidate/${candidate.id}`,
        }}
      />

      {/* NAVY GRADIENT HEADER */}
      <div className="bg-gradient-to-br from-poli-navy to-poli-dark text-white pb-12">
        {/* Top bar: back, title, share+follow */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <Link to="/candidates">
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </Link>
          <span className="font-mono-label text-[11px] tracking-widest uppercase text-white/80">
            {getOfficeAbbrev(candidate.office)}. {candidate.name.split(' ').slice(-1)[0].toUpperCase()}
          </span>
          <div className="flex items-center gap-3">
            <ShareProfileButton
              candidateId={candidate.id}
              candidateName={candidate.name}
              candidateOffice={candidate.office}
              candidateState={candidate.state}
              candidateDistrict={candidate.district}
              candidateParty={candidate.party}
              candidateScore={resolvedScore}
              candidateImage={representativeDetails?.image_url || candidate.image_url}
              fecId={candidate.fec_candidate_id ?? null}
              userScore={userScore}
              matchScore={matchScore}
              agreements={agreements}
              disagreements={disagreements}
              profileUrl={window.location.href}
              incumbent={candidate.is_incumbent ?? true}
              coverageTier={candidate.coverage_tier ?? undefined}
              confidence={candidate.confidence ?? undefined}
              totalRaised={fecTotalReceipts}
              totalSpent={fecTotalDisbursements}
              topDonors={(() => {
                const agg = new Map<string, { name: string; amount: number; primaryCause?: string | null; primaryCauseStance?: string | null; viaEarmarks?: boolean }>();
                const rollupIndex = buildEarmarkRollupIndex(earmarkRollups);
                const rollupMatch = new Map<string, { name: string; type: string }>();
                donors
                  .filter((d) => !isConduitDonor(d) && !d.is_transfer)
                  .forEach((d) => {
                    const aliasName = donorAliasNameMap?.get(`${d.name.trim().toUpperCase()}|${d.type}`);
                    const n = (aliasName || d.display_name || d.name || 'Unknown').trim();
                    const matchedKey = matchEarmarkRollupKey(d, rollupIndex);
                    if (matchedKey) {
                      if (!rollupMatch.has(matchedKey)) rollupMatch.set(matchedKey, { name: n, type: d.type });
                      return;
                    }
                    const cause = getDonorCause(donorCauseMap, d.name, d.type) ?? getDonorCause(donorCauseMap, n, d.type);
                    const key = `${n.toUpperCase()}|${d.type}`;
                    const current = agg.get(key) ?? { name: n, amount: 0, primaryCause: cause?.label ?? null, primaryCauseStance: cause?.stance ?? null };
                    current.amount += Number(d.amount ?? 0);
                    if (!current.primaryCause && cause?.label) { current.primaryCause = cause.label; current.primaryCauseStance = cause.stance ?? null; }
                    agg.set(key, current);
                  });
                earmarkRollups.forEach((r) => {
                  const match = rollupMatch.get(earmarkRollupKey(r.org_label, r.cycle));
                  const name = match?.name || r.org_label;
                  const type = match?.type ?? (r.org_type === 'Organization' ? 'Organization' : 'PAC');
                  const cause = getDonorCause(donorCauseMap, r.org_label, type) ?? getDonorCause(donorCauseMap, name, type);
                  const key = `${name.toUpperCase()}|${type}|earmark`;
                  const current = agg.get(key) ?? { name, amount: 0, primaryCause: cause?.label ?? null, primaryCauseStance: cause?.stance ?? null, viaEarmarks: true };
                  current.amount += r.direct_amount + r.routed_amount;
                  agg.set(key, current);
                });
                return Array.from(agg.values()).sort((a, b) => b.amount - a.amount).slice(0, 3);
              })()}
              fundingBreakdown={fundingBreakdownComputed}
              fundingCycle={fundingInput.cycleLabel}
              selfFunded={(fecLoans ?? 0) + (fecCandidateContribution ?? 0)}
            />
            <Heart className="w-5 h-5 text-white/70" />
          </div>
        </div>

        {/* Identity row */}
        <div className="flex items-center gap-4 px-5 pt-1">
          <OfficialAvatar
            imageUrl={representativeDetails?.image_url || candidate.image_url}
            name={candidate.name}
            party={candidate.party}
            size="lg"
            className="rounded-full ring-2 ring-white/30 ring-offset-2 ring-offset-transparent shrink-0"
          />
          <div>
            <h1 className="font-sans font-black text-[23px] leading-tight text-white">{candidate.name}</h1>
            <p className="text-white/70 text-sm mt-0.5">
              {normalizeOfficeName(candidate.office)} · {candidate.state}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: candidate.party === 'Democrat' ? '#60A5FA' : candidate.party === 'Republican' ? '#FCA5A5' : '#D1FAE5' }}
              />
              <span className="text-white/80 text-sm">{candidate.party}</span>
              {candidate.is_incumbent === true && <span className="text-white/50 text-sm">· Incumbent</span>}
              {candidate.is_incumbent === false && <span className="text-white/50 text-sm">· Challenger</span>}
            </div>
          </div>
        </div>
      </div>

      {/* POLISCORE OVERLAP CARD */}
      <div className="mx-4 -mt-6 bg-white rounded-[22px] shadow-[0_10px_30px_rgba(11,15,34,0.12)] p-5">
        <p className="font-mono-label text-[9.5px] tracking-[2px] text-poli-red mb-2">POLISCORE</p>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-sans font-black text-[46px] leading-none text-poli-navy">
                <ScoreText score={resolvedScore} />
              </span>
            </div>
            <p className="text-[13px] text-poli-dim mt-1">
              {personalized?.score !== null && personalized?.score !== undefined
                ? `Personalized score (${personalized.matchedCount} questions)`
                : 'Score unavailable'}
            </p>
          </div>
          {matchScore !== null && (
            <div className="flex flex-col items-center shrink-0">
              <div
                className="relative w-[64px] h-[64px] rounded-full"
                style={{ background: `conic-gradient(#182B7A 0 ${Math.round(matchScore)}%, #ECECF2 ${Math.round(matchScore)}% 100%)` }}
              >
                <div className="absolute inset-[8px] bg-white rounded-full flex items-center justify-center">
                  <span className="font-sans font-black text-[13px] text-poli-navy">{Math.round(matchScore)}%</span>
                </div>
              </div>
              <p className="font-mono-label text-[8px] text-poli-muted tracking-wide mt-1">YOUR MATCH</p>
            </div>
          )}
        </div>
        {/* Slider */}
        <div className="mt-4 relative">
          <div className="h-[5px] rounded-full bg-gradient-to-r from-[#2E5BFF] via-[#ECECF2] to-[#FF5A6E]" />
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${Math.max(2, Math.min(98, 50 + (resolvedScore / 10) * 45))}%` }}
          >
            <div className="w-[14px] h-[14px] rounded-full bg-poli-navy border-2 border-white shadow -translate-x-1/2" />
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-mono-label text-[8px] text-poli-muted">L · LIBERAL</span>
            <span className="font-mono-label text-[8px] text-poli-muted">CONSERVATIVE · C</span>
          </div>
        </div>
      </div>

      {/* STAT GRID */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        {[
          { value: fecTotalReceipts ? formatCurrency(fecTotalReceipts) : '—', label: 'Total raised' },
          { value: fecTotalDisbursements ? formatCurrency(fecTotalDisbursements) : '—', label: 'Spent' },
        ].map(stat => (
          <div key={stat.label} className="border border-[rgba(20,23,58,0.1)] rounded-[14px] p-2.5 bg-white">
            <p className="font-sans font-black text-[18px] text-poli-navy leading-none">{String(stat.value)}</p>
            <p className="text-[10px] text-poli-dim mt-1 leading-tight">{stat.label}</p>
          </div>
        ))}
        {/* Legislative alignment % box */}
        <div className="border border-[rgba(20,23,58,0.1)] rounded-[14px] p-2.5 bg-white flex items-center justify-center">
          <div className="text-center">
            <p className={cn(
              "font-sans font-black text-[18px] leading-none",
              alignmentPercent === null ? "text-poli-navy" : alignmentPercent >= 70 ? "text-agree" : alignmentPercent >= 40 ? "text-amber-600" : "text-disagree"
            )}>
              {alignmentPercent !== null ? `${alignmentPercent}%` : '—'}
            </p>
            <p className="text-[10px] text-poli-dim mt-1 leading-tight">legislative alignment</p>
          </div>
        </div>
        {/* Outside spend box — for/against in one box */}
        <div className="border border-[rgba(20,23,58,0.1)] rounded-[14px] p-2.5 bg-white">
          <div className="flex items-center justify-around gap-2">
            <div className="text-center">
              <p className="font-sans font-black text-[18px] text-agree leading-none">
                {ieSupport ? formatCurrency(ieSupport) : '—'}
              </p>
              <p className="text-[9px] text-poli-dim mt-0.5 leading-tight">For</p>
            </div>
            <div className="w-px self-stretch bg-[rgba(20,23,58,0.1)]" aria-hidden />
            <div className="text-center">
              <p className="font-sans font-black text-[18px] text-disagree leading-none">
                {ieOppose ? formatCurrency(ieOppose) : '—'}
              </p>
              <p className="text-[9px] text-poli-dim mt-0.5 leading-tight">Against</p>
            </div>
          </div>
          <p className="text-[10px] text-poli-dim mt-1 leading-tight text-center">Outside spend</p>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="mt-4 px-4">
        <div className="grid grid-cols-6 gap-1">
          {(['issues', 'positions', 'votes', 'bills', 'money', 'contact'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'font-sans font-bold text-[10px] py-[7px] rounded-[16px] text-center leading-tight transition-colors',
                activeTab === tab
                  ? 'bg-poli-navy text-white'
                  : 'bg-poli-surface text-poli-body hover:bg-poli-surface/70',
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="mx-4 mt-4 pb-24">
        {/* ISSUES TAB */}
        {activeTab === 'issues' && (
          <div>
            <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 mb-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red">AI ANALYSIS</p>
                {matchScore !== null && (
                  <span className="font-mono-label text-[10px] font-semibold px-2 py-0.5 rounded-full bg-poli-navy/10 text-poli-navy">
                    {Math.round(matchScore)}% Match
                  </span>
                )}
              </div>
              <AIExplanation
                candidateId={candidate.id}
                candidateName={candidate.name}
                topicScores={candidateTopicScores}
                userTopicScores={userTopicScores.map(uts => {
                  const topic = candidateTopicScores.find(c => c.topicId === uts.topic_id);
                  return { topicId: uts.topic_id, topicName: topic?.topicName || uts.topic_id, score: uts.score };
                })}
                matchScore={matchScore}
              />
            </div>
          </div>
        )}

        {/* POSITIONS TAB */}
        {activeTab === 'positions' && (
          <div>
            <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm">
              <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">POSITIONS & YOUR MATCH</p>
              <PositionsMatchList
                candidateId={candidate.id}
                candidateName={candidate.name}
                candidateTopicScores={candidateTopicScores}
                userTopicScores={userTopicScores}
              />
            </div>
            {/* Sourced Q&A / provenance detail, collapsed by default below the match list */}
            <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm mt-3">
              <CandidatePositions candidateId={candidate.id} candidateName={candidate.name} />
            </div>
          </div>
        )}

        {/* VOTES TAB */}
        {activeTab === 'votes' && (
          <div>
            <VotingRecordSection
              votes={votes}
              userTopicScores={userTopicScores}
              representativeParty={candidate.party}
              candidateName={candidate.name}
              candidateState={candidate.state}
              candidateOffice={candidate.office}
            />
            <Link to={`/candidate/${id}/votes`} className="block mt-3">
              <button className="w-full border border-[rgba(20,23,58,0.14)] text-poli-navy font-bold text-sm rounded-[14px] py-3.5">
                See all {votes.length} votes →
              </button>
            </Link>
          </div>
        )}

        {/* BILLS TAB */}
        {activeTab === 'bills' && (
          <div>
            <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm">
              <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">SPONSORED BILLS</p>
              {sponsoredBills.slice(0, visibleBillCount).map((bill) => (
                <div key={bill.bill_id} className="py-3 border-t border-[rgba(20,23,58,0.07)] first:border-t-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono-label text-[11px] text-poli-muted block mb-0.5">
                        {bill.bill_type} {bill.bill_number}
                      </span>
                      <p className="text-[13px] font-semibold text-poli-navy leading-snug">{bill.bill_name}</p>
                    </div>
                    <StatusBadge status={bill.status} />
                  </div>
                </div>
              ))}
              {sponsoredBills.length > visibleBillCount && (
                <button
                  onClick={() => setVisibleBillCount(prev => prev + 20)}
                  className="mt-3 w-full border border-[rgba(20,23,58,0.14)] text-poli-navy font-bold text-sm rounded-[14px] py-3"
                >
                  Show {sponsoredBills.length - visibleBillCount} more
                </button>
              )}
            </div>
          </div>
        )}

        {/* MONEY TAB */}
        {activeTab === 'money' && (
          <div>
            {/* Cycle selector chips */}
            <div className="flex gap-2 mb-3">
              {(cycleInfo?.cycles ?? []).filter(c => c !== 'all').slice(0, 3).map(cy => (
                <button
                  key={cy}
                  onClick={() => setSelectedCycle(cy)}
                  className={cn(
                    'font-sans font-bold text-[12px] px-4 py-[7px] rounded-[20px]',
                    effectiveCycle === cy
                      ? 'bg-poli-navy text-white'
                      : 'bg-poli-surface text-poli-body',
                  )}
                >
                  {cy}
                </button>
              ))}
            </div>
            {/* Summary card */}
            {fecTotalReceipts && (
              <div className="bg-gradient-to-br from-poli-navy to-poli-dark rounded-[18px] p-4 mb-3 text-white">
                <p className="font-mono-label text-[9px] tracking-[2px] text-white/55 mb-1">TOTAL RAISED</p>
                <p className="font-sans font-black text-[36px] leading-none">{formatCurrency(fecTotalReceipts)}</p>
                {fecTotalDisbursements && (
                  <div className="flex gap-4 mt-3">
                    <div>
                      <p className="font-mono-label text-[9px] text-white/55">SPENT</p>
                      <p className="font-bold text-[16px]">{formatCurrency(fecTotalDisbursements)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Funding sources breakdown */}
            {fundingBreakdownComputed && (
              <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 mb-3 shadow-sm">
                <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">SOURCE OF FUNDS</p>
                <FundingSourcesBreakdown input={fundingInput} />
              </div>
            )}
            {/* Top donors preview (3) */}
            {donors.filter(d => !isConduitDonor(d)).slice(0, 3).length > 0 && (
              <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm">
                <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">TOP DONORS</p>
                {donors.filter(d => !isConduitDonor(d)).slice(0, 3).map((donor, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-t border-[rgba(20,23,58,0.07)] first:border-t-0">
                    <div>
                      <span className="font-mono-label text-[11px] text-poli-muted mr-2">#{i + 1}</span>
                      <span className="text-[13px] font-bold text-poli-body">{donor.display_name || donor.name}</span>
                      {donor.type && <p className="text-[11px] text-poli-muted">{donor.type}</p>}
                    </div>
                    <span className="font-mono-label text-[13px] font-semibold text-poli-navy">
                      {formatCurrency(donor.amount ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* CTA to full donors page */}
            <Link to={`/candidate/${id}/donors`} className="block mt-3">
              <button className="w-full bg-poli-navy text-white font-bold text-sm rounded-[14px] py-3.5">
                Funding & donor details →
              </button>
            </Link>
            {/* State-legislator campaign finance. Each section self-gates: it
                renders only for legislators in its state that have synced
                contribution data, so they're no-ops for everyone else. */}
            <div className="mt-3 space-y-3">
              <NjStateFinanceSection
                name={candidate.name}
                district={candidate.district}
                office={candidate.office}
                state={candidate.state}
                level={(candidate as { level?: string }).level}
              />
              <FlStateFinanceSection
                name={candidate.name}
                district={candidate.district}
                office={candidate.office}
                state={candidate.state}
                level={(candidate as { level?: string }).level}
              />
              <NyStateFinanceSection
                name={candidate.name}
                district={candidate.district}
                office={candidate.office}
                state={candidate.state}
                level={(candidate as { level?: string }).level}
              />
              <TxStateFinanceSection
                name={candidate.name}
                district={candidate.district}
                office={candidate.office}
                state={candidate.state}
                level={(candidate as { level?: string }).level}
              />
            </div>
            {/* Top spenders — outside groups making independent expenditures for/against.
                Use the resolved candidate.id (not the raw route id) so synthetic
                executive routes like /candidate/federal_president still match IE rows. */}
            <div className="mt-3">
              <CandidateIESection candidateId={candidate.id} preferredCycle={effectiveCycle} />
            </div>
          </div>
        )}


        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <div>
            <div className="bg-white rounded-[18px] border border-[rgba(20,23,58,0.08)] p-4 shadow-sm">
              <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">OFFICES</p>
              {representativeDetails ? (
                <ContactInfoCard representative={representativeDetails} />
              ) : (
                <p className="text-sm text-poli-muted">Contact information unavailable</p>
              )}
            </div>
            <div className="flex gap-2.5 mt-3">
              {representativeDetails?.phone && (
                <a href={`tel:${representativeDetails.phone}`} className="flex-1">
                  <button className="w-full bg-poli-navy text-white font-bold text-sm rounded-[14px] py-3.5">
                    Call office
                  </button>
                </a>
              )}
              <button className="flex-1 bg-poli-red text-white font-bold text-sm rounded-[14px] py-3.5">
                Town halls
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Edit Dialog */}
      {isAdmin && candidate && (
        <CandidateEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          candidateId={candidate.id}
          candidateName={candidate.name}
          currentData={{
            name: candidate.name,
            party: candidate.party,
            office: candidate.office,
            state: candidate.state,
            district: candidate.district,
            image_url: candidate.image_url,
            overall_score: resolvedScore,
            coverage_tier: candidate.coverage_tier || 'tier_3',
            confidence: candidate.confidence || 'medium',
          }}
        />
      )}
    </div>
  );
};
