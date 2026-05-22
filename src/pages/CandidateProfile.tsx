import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCandidate, useCandidateDonors, useCandidateVotes, calculateMatchScore } from '@/hooks/useCandidates';
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
import { FinanceReconciliationCard } from '@/components/FinanceReconciliationCard';
import { FinanceSummaryCard, type FinanceSummaryData } from '@/components/FinanceSummaryCard';
import { CandidateIESection } from '@/components/IndependentExpenditureSections';
import { cn, formatCompactCurrency } from '@/lib/utils';
import { ArrowLeft, ExternalLink, MapPin, Calendar, DollarSign, Vote, Sparkles, Pencil, BadgeCheck, FileText, RefreshCw, Info, AlertTriangle, Search, X, ChevronDown, ChevronUp, ScrollText, Briefcase } from 'lucide-react';
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
import { RelevantNewsFeed } from '@/components/RelevantNewsFeed';
import { CandidatePositions } from '@/components/CandidatePositions';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { CandidateEditDialog } from '@/components/admin/CandidateEditDialog';
import { ClaimProfileDialog } from '@/components/ClaimProfileDialog';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { VotingRecordSection } from '@/components/VotingRecordSection';
import { ShareProfileButton } from '@/components/ShareProfileButton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const CandidateProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: profile } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: scoreMap } = useCandidateScoreMap(id ? [id] : undefined);
  const { data: cycleInfo } = useAvailableCycles(id);
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined);
  const effectiveCycle = selectedCycle ?? cycleInfo?.defaultCycle;
  const { data: donors = [], refetch: refetchDonors } = useCandidateDonors(id, effectiveCycle);
  const { data: votes = [] } = useCandidateVotes(id);
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
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFecBreakdownOpen, setIsFecBreakdownOpen] = useState(false);
  const [visibleDonorCount, setVisibleDonorCount] = useState(20);
  const [visibleBillCount, setVisibleBillCount] = useState(20);
  const [donorSearch, setDonorSearch] = useState('');
  
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
          <Link to="/feed">
            <Button className="mt-4">Back to Feed</Button>
          </Link>
        </main>
      </div>
    );
  }

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

  // Use finance_reconciliation as single source of truth for totals when available
  // Prefer local_itemized_net (excludes earmark pass-throughs) for accurate display
  const totalDonations = financeReconciliation?.local_itemized_net ?? financeReconciliation?.local_itemized ?? donors.reduce((sum, d) => sum + d.amount, 0);
  const earmarkPassThroughs = (financeReconciliation?.local_itemized ?? 0) - (financeReconciliation?.local_itemized_net ?? 0);

  // Normalize FEC totals to use reconciliation first, then live API as a fallback
  const fecItemized = financeReconciliation?.fec_itemized ?? fecTotals?.individual_itemized_contributions ?? null;
  const fecUnitemized = financeReconciliation?.fec_unitemized ?? fecTotals?.individual_unitemized_contributions ?? null;
  const fecTotalReceipts = financeReconciliation?.fec_total_receipts ?? fecTotals?.total_receipts ?? null;
  const hasFecBreakdown = fecTotalReceipts !== null && fecTotalReceipts > 0;
  const fecSourceLabel = financeReconciliation ? 'Nightly reconciliation (cached)' : fecTotals ? 'Live FEC API (fallback)' : null;

  // FIX: Properly categorize donors to match FEC categories and avoid double-counting
  // Filter by is_contribution, is_transfer, and is_conduit_org flags from database
  // Use display_name (canonical name) for conduit detection
  const conduitOrgNames = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];
  const isConduitDonor = (d: typeof donors[0]) => d.is_conduit_org || conduitOrgNames.some(c => (d.display_name || d.name).toUpperCase().includes(c));
  
  // Itemized Individual = is_contribution && !is_transfer && !is_conduit_org (Line 11 contributions)
  const itemizedIndividualDonors = donors.filter(d => d.is_contribution !== false && !d.is_transfer && !isConduitDonor(d));
  const itemizedIndividualTotal = itemizedIndividualDonors.reduce((sum, d) => sum + d.amount, 0);
  
  // PAC/Committee contributions (Line 11C - typically type = 'PAC' or 'Organization')
  const pacDonors = donors.filter(d => d.is_contribution !== false && !d.is_transfer && !isConduitDonor(d) && (d.type === 'PAC' || d.type === 'Organization'));
  const pacTotal = pacDonors.reduce((sum, d) => sum + d.amount, 0);
  
  // Transfers (Line 12 - is_transfer = true)
  const transferDonors = donors.filter(d => d.is_transfer);
  const transferTotal = transferDonors.reduce((sum, d) => sum + d.amount, 0);
  
  // Conduit orgs (pass-throughs - should have $0 after fix, but display for transparency)
  const conduitDonors = donors.filter(d => isConduitDonor(d));
  const conduitTotal = conduitDonors.reduce((sum, d) => sum + d.amount, 0);
  
  // FEC PAC and Party contributions from reconciliation
  const fecPacContributions = financeReconciliation?.fec_pac_contributions ?? 0;
  const fecPartyContributions = financeReconciliation?.fec_party_contributions ?? 0;
  
  // Additional FEC breakdown fields (loans, transfers, candidate contributions, other receipts)
  const fecLoans = financeReconciliation?.fec_loans ?? 0;
  const fecTransfers = financeReconciliation?.fec_transfers ?? 0;
  const fecCandidateContribution = financeReconciliation?.fec_candidate_contribution ?? 0;
  const fecOtherReceipts = financeReconciliation?.fec_other_receipts ?? 0;
  
  // Visible donors total (from donors table - may be incomplete due to aggregation)
  const visibleDonorsTotal = donors.filter(d => !isConduitDonor(d)).reduce((sum, d) => sum + d.amount, 0);
  
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

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${candidate.name} — Pulse`}
        description={`See ${candidate.name}'s positions, voting record, donors, and how they align with your views on the issues that matter most.`}
        path={`/candidate/${candidate.id}`}
        type="article"
      />
      <Header />
      
      <main className="container py-8 px-4">
        {/* Back Button */}
        <Link to="/feed" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Feed
        </Link>

        {/* Mobile sticky identity bar */}
        <div className="md:hidden sticky top-16 z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border flex items-center gap-3 mb-4">
          <OfficialAvatar
            imageUrl={representativeDetails?.image_url || candidate.image_url}
            name={candidate.name}
            party={candidate.party}
            size="sm"
            className="rounded-lg shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-sm truncate">{candidate.name}</p>
            <p className="text-xs text-muted-foreground truncate">{candidate.party} · {candidate.office} {candidate.state}</p>
          </div>
        </div>

        {/* Hero Section */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 mb-8 shadow-elevated">

          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar */}
            <OfficialAvatar
              imageUrl={representativeDetails?.image_url || candidate.image_url}
              name={candidate.name}
              party={candidate.party}
              size="lg"
              className="rounded-2xl"
              imageClassName="object-top scale-110"
            />

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-start gap-4 mb-4">
                <div>
                  <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
                    {candidate.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-muted-foreground">
                    <span className="font-medium">{candidate.office}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {candidate.state} {candidate.district && `(${candidate.district})`}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("border text-sm", getPartyColor(candidate.party))}>
                  {candidate.party}
                </Badge>
                {isClaimed && (
                  <Badge variant="secondary" className="bg-agree/10 text-agree border-agree/30">
                    <BadgeCheck className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
                {candidate.hasOverride && isAdmin && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                    Overridden
                  </Badge>
                )}
              </div>
              
              {/* Edit Button (Admin or Politician Owner) */}
              <div className="flex items-center gap-2 flex-wrap">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                
                {/* Link to Politician Dashboard for profile owner */}
                {isPoliticianOwner && (
                  <Link to="/politician">
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileText className="h-4 w-4" />
                      Answer Questions
                    </Button>
                  </Link>
                )}
                
                {/* Claim Profile Button */}
                <ClaimProfileDialog
                  candidateId={candidate.id}
                  candidateName={candidate.name}
                  isAlreadyClaimed={isClaimed}
                />
                
                {/* Share Profile Button */}
                <RecipientAIAnalysisDialog
                  entityKind="candidate"
                  entityId={candidate.id}
                  entityName={candidate.name}
                  fecId={candidate.fec_candidate_id ?? null}
                  party={candidate.party}
                  office={candidate.office}
                  state={candidate.state}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      AI Analysis
                    </Button>
                  }
                />

                <ShareProfileButton
                  candidateName={candidate.name}
                  candidateOffice={candidate.office}
                  candidateParty={candidate.party}
                  candidateScore={resolvedScore}
                  candidateImage={representativeDetails?.image_url || candidate.image_url}
                  userScore={userScore}
                  matchScore={matchScore}
                  agreements={agreements}
                  disagreements={disagreements}
                  profileUrl={window.location.href}
                />
              </div>

              {/* Score Display */}
              <CandidateScoreCard score={resolvedScore} matchScore={matchScore} userScore={profile?.overall_score ?? null} className="mb-4" />

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <IncumbentBadge isIncumbent={candidate.is_incumbent ?? true} />
                <CoverageTierBadge tier={(candidate.coverage_tier as CoverageTier) || 'tier_3'} />
                <ConfidenceBadge confidence={(candidate.confidence as ConfidenceLevel) || 'medium'} />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Data updated {new Date(candidate.last_updated).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Explanation Section */}
        <div className="mb-8">
          <AIExplanation
            candidateId={candidate.id}
            candidateName={candidate.name}
            topicScores={candidateTopicScores}
            userTopicScores={userTopicScores.map(uts => {
              const topic = candidateTopicScores.find(c => c.topicId === uts.topic_id);
              return {
                topicId: uts.topic_id,
                topicName: topic?.topicName || uts.topic_id,
                score: uts.score,
              };
            })}
            matchScore={matchScore}
          />
        </div>

        {/* Positions & Sources Section */}
        <div className="mb-8">
          <CandidatePositions 
            candidateId={candidate.id} 
            candidateName={candidate.name} 
          />
        </div>

        {/* Prior Positions Section */}
        {candidate?.priorOffices && candidate.priorOffices.length > 0 && (
          <div className="mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-muted-foreground" />
                  Prior Positions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {candidate.priorOffices.map((po, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0 border-border">
                      <div>
                        <span className="font-medium">{po.office}</span>
                        {po.district && <span className="text-muted-foreground">, District {po.district}</span>}
                        <span className="text-muted-foreground"> — {po.state}</span>
                      </div>
                      {(po.start_year || po.end_year) && (
                        <span className="text-sm text-muted-foreground">
                          {po.start_year}–{po.end_year || 'Present'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Contact Info Section */}
        {representativeDetails && (
          <div className="mb-8">
            <ContactInfoCard representative={representativeDetails} />
          </div>
        )}

        {/* Latest News Section */}
        {candidate && (
          <div className="mb-8">
            <RelevantNewsFeed
              people={[{
                name: candidate.name,
                office: candidate.office,
                state: candidate.state,
                district: candidate.district,
              }]}
              topics={userTopicScores.map(uts => (uts as any).topic_id).filter(Boolean)}
              state={candidate.state}
              district={candidate.district}
              title={`Latest News about ${candidate.name}`}
              maxItems={8}
            />
          </div>
        )}


        {/* Tabs for Donors and Votes */}
        <Tabs defaultValue="donors" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="donors" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Donors
            </TabsTrigger>
            <TabsTrigger value="votes" className="gap-2">
              <Vote className="w-4 h-4" />
              Voting Record
            </TabsTrigger>
            <TabsTrigger value="legislation" className="gap-2">
              <ScrollText className="w-4 h-4" />
              Legislation {sponsoredBills.length > 0 && `(${sponsoredBills.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="donors">
            <Card className="shadow-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display">Campaign Contributions</CardTitle>
                  <div className="flex items-center gap-2">
                    {canEdit && candidate.fec_candidate_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFetchDonors}
                        disabled={isDonorLoading(id || '')}
                      >
                        <RefreshCw className={cn("w-4 h-4 mr-2", isDonorLoading(id || '') && "animate-spin")} />
                        Refresh Donors
                      </Button>
                    )}
                    <Select
                      value={effectiveCycle ?? ''}
                      onValueChange={(v) => setSelectedCycle(v)}
                      disabled={!cycleInfo}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        {(cycleInfo?.cycles ?? []).map((cy) => (
                          <SelectItem key={cy} value={cy}>{cy} Cycle</SelectItem>
                        ))}
                        <SelectItem value="all">All cycles</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {candidate.last_donor_sync && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(candidate.last_donor_sync).toLocaleDateString()}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {donors.length > 0 ? (
                  <>
                    {/* Recipient Transparency Banner */}
                    {donors[0]?.recipient_committee_name && (
                      <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-sm text-muted-foreground">
                          <strong className="text-foreground">Recipient:</strong> {donors[0].recipient_committee_name}
                          {donors[0].recipient_committee_id && (
                            <span className="text-xs ml-1">({donors[0].recipient_committee_id})</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          These are itemized contributions to the campaign committee, not personal income.
                        </p>
                      </div>
                    )}
                    

                    {/* FEC-derived aggregates to align list with FEC Total Receipts */}
                    {hasFecBreakdown && (
                      <Collapsible open={isFecBreakdownOpen} onOpenChange={setIsFecBreakdownOpen} className="mb-6">
                        <div className="rounded-lg border border-border overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-center justify-between px-4 py-3 bg-secondary/60 border-b border-border hover:bg-secondary/80 transition-colors">
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium text-foreground">FEC Contribution Breakdown</span>
                                {fecSourceLabel && (
                                  <span className="text-xs text-muted-foreground">({fecSourceLabel})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-primary">{formatCurrency(fecTotalReceipts)}</span>
                                {isFecBreakdownOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </div>
                            </button>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="divide-y divide-border">
                              {/* Itemized Individual (Line 11A) */}
                              <div className="flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-foreground">Itemized Individual (Line 11A)</span>
                                  <Badge variant="outline" className="text-[10px]">{itemizedIndividualDonors.length} donors</Badge>
                                </div>
                                <span className="text-sm font-semibold">{formatCurrency(fecItemized)}</span>
                              </div>
                              
                              {/* PAC/Committee (Line 11C) */}
                              {(financeReconciliation?.fec_pac_contributions ?? 0) > 0 && (
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-foreground">PAC/Committee (Line 11C)</span>
                                    <Badge variant="outline" className="text-[10px]">{pacDonors.length} sources</Badge>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(financeReconciliation?.fec_pac_contributions)}</span>
                                </div>
                              )}
                              
                              {/* Party Contributions (Line 11B) */}
                              {(financeReconciliation?.fec_party_contributions ?? 0) > 0 && (
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-foreground">Party Contributions (Line 11B)</span>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(financeReconciliation?.fec_party_contributions)}</span>
                                </div>
                              )}
                              
                              {/* Transfers (Line 12) */}
                              {fecTransfers > 0 && (
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">Transfers (Line 12)</span>
                                    <span className="text-[11px] text-muted-foreground">From other authorized committees</span>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(fecTransfers)}</span>
                                </div>
                              )}
                              
                              {/* Candidate Loans */}
                              {fecLoans > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 bg-amber-500/5">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">Candidate Loans</span>
                                    <span className="text-[11px] text-muted-foreground">Loans from the candidate to campaign</span>
                                  </div>
                                  <span className="text-sm font-semibold text-amber-700">{formatCurrency(fecLoans)}</span>
                                </div>
                              )}
                              
                              {/* Candidate Contribution */}
                              {fecCandidateContribution > 0 && (
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">Candidate Contribution</span>
                                    <span className="text-[11px] text-muted-foreground">Direct contribution from candidate</span>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(fecCandidateContribution)}</span>
                                </div>
                              )}
                              
                              {/* Other Receipts (Line 15) */}
                              {fecOtherReceipts > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">Other Receipts (Line 15)</span>
                                    <span className="text-[11px] text-muted-foreground">Slate mailers, refunds, misc</span>
                                  </div>
                                  <span className="text-sm font-semibold">{formatCurrency(fecOtherReceipts)}</span>
                                </div>
                              )}
                              
                              {/* Unitemized / Small Donors */}
                              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground">Unitemized (Small Donors)</span>
                                  <span className="text-[11px] text-muted-foreground">Donations &lt;$200, FEC aggregate</span>
                                </div>
                                <span className="text-sm font-semibold">{formatCurrency(fecUnitemized)}</span>
                              </div>
                              
                              {/* Total Row */}
                              <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-t-2 border-primary/30">
                                <span className="text-sm font-bold text-foreground">FEC Total Receipts</span>
                                <span className="text-lg font-bold text-primary">{formatCurrency(fecTotalReceipts)}</span>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )}

                    
                    <div className="mb-6 p-4 rounded-xl bg-secondary/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">All Contributors & Funding Sources</p>
                          <p className="text-2xl font-bold text-foreground">
                            {donors.filter(d => !isConduitDonor(d)).length}
                            {fecUnitemized && fecUnitemized > 0 ? ' + Small Donors' : ''}
                            {(fecLoans > 0 || fecCandidateContribution > 0 || fecTransfers > 0) ? ' + Self-Funding' : ''}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Individuals, PACs, Organizations{fecUnitemized && fecUnitemized > 0 ? ', Unitemized' : ''}
                            {(fecLoans > 0 || fecCandidateContribution > 0) && ', Candidate Self-Funding'}
                            {fecTransfers > 0 && ', Committee Transfers'}
                            {conduitDonors.length > 0 && ` (${conduitDonors.length} conduits excluded)`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">FEC Total Receipts</p>
                          <p className="text-xl font-bold text-foreground">
                            {formatCurrency(fecTotalReceipts ?? 0)}
                          </p>
                          {conduitTotal > 0 && (
                            <p className="text-[10px] text-amber-600 mt-1">+${conduitTotal.toLocaleString()} conduit (excluded)</p>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Search Bar */}
                    <div className="mb-4 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search donors by name, employer, or location..."
                        value={donorSearch}
                        onChange={(e) => {
                          setDonorSearch(e.target.value);
                          setVisibleDonorCount(20); // Reset pagination on search
                        }}
                        className="pl-9 pr-9"
                      />
                      {donorSearch && (
                        <button
                          onClick={() => {
                            setDonorSearch('');
                            setVisibleDonorCount(20);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {(() => {
                        // Build unified funding sources array
                        type FundingSource = {
                          id: string;
                          name: string;
                          amount: number;
                          sourceType: 'donor' | 'small_donors' | 'candidate_loan' | 'candidate_contribution' | 'committee_transfer';
                          donor?: typeof donors[0];
                          badgeLabel?: string;
                          badgeStyle?: string;
                          description?: string;
                          subLabel?: string;
                          searchText?: string;
                          linkTo?: string; // For clickable committee links
                        };

                        const allSources: FundingSource[] = [];
                        
                        // Add regular donors - but exclude entries already shown as FEC summary categories
                        // EXCEPT: Show transfer donors with their names for transparency (they just won't count toward totals)
                        donors.forEach(d => {
                          // Skip loan entries (line 13A) if fecLoans is already shown as FEC aggregate
                          if (fecLoans > 0 && d.line_number === '13A') {
                            return;
                          }
                          // Skip candidate contributions (line 11AI) if fecCandidateContribution is already shown
                          if (fecCandidateContribution > 0 && d.line_number === '11AI') {
                            return;
                          }
                          
                          const isTransfer = d.line_number?.startsWith('12') || d.is_transfer;
                          const displayName = d.display_name || d.name;
                          
                          // Show transfer donors with their names but mark them as transfers
                          if (isTransfer) {
                            // For transfers, the conduit_committee_id is the originating committee
                            const committeeId = d.conduit_committee_id;
                            allSources.push({
                              id: d.id,
                              name: displayName,
                              amount: d.amount,
                              sourceType: 'committee_transfer',
                              donor: d,
                              badgeLabel: 'Line 12',
                              badgeStyle: 'border-purple-500/50 text-purple-600 bg-purple-500/10',
                              description: `Transfer from ${displayName}`,
                              subLabel: 'Committee transfer',
                              searchText: [displayName, 'transfer committee'].join(' ').toLowerCase(),
                              linkTo: committeeId ? `/committee/${committeeId}` : undefined
                            });
                          } else {
                            allSources.push({
                              id: d.id,
                              name: d.name,
                              amount: d.amount,
                              sourceType: 'donor',
                              donor: d,
                              searchText: [displayName, d.employer, d.contributor_city, d.contributor_state, d.type].filter(Boolean).join(' ').toLowerCase()
                            });
                          }
                        });
                        
                        // Add FEC aggregate sources
                        if (fecUnitemized && fecUnitemized > 0) {
                          allSources.push({
                            id: 'small-donors',
                            name: 'Small Donors (Unitemized)',
                            amount: fecUnitemized,
                            sourceType: 'small_donors',
                            badgeLabel: 'Aggregate',
                            badgeStyle: 'border-primary/50 text-primary bg-primary/10',
                            description: 'Individual donations under $200 — not itemized by FEC',
                            subLabel: 'FEC aggregate',
                            searchText: 'small donors unitemized aggregate'
                          });
                        }
                        
                        if (fecLoans > 0) {
                          allSources.push({
                            id: 'candidate-loan',
                            name: candidate.name,
                            amount: fecLoans,
                            sourceType: 'candidate_loan',
                            badgeLabel: 'Candidate Loan',
                            badgeStyle: 'border-blue-500/50 text-blue-600 bg-blue-500/10',
                            description: 'Loan from the candidate to their own campaign — may be repaid from future contributions',
                            subLabel: 'Self-funded',
                            searchText: `${candidate.name.toLowerCase()} loan self-funded`
                          });
                        }
                        
                        if (fecCandidateContribution > 0) {
                          allSources.push({
                            id: 'candidate-contribution',
                            name: candidate.name,
                            amount: fecCandidateContribution,
                            sourceType: 'candidate_contribution',
                            badgeLabel: 'Candidate Contribution',
                            badgeStyle: 'border-blue-500/50 text-blue-600 bg-blue-500/10',
                            description: 'Direct contribution from the candidate (not a loan — non-repayable)',
                            subLabel: 'Self-funded',
                            searchText: `${candidate.name.toLowerCase()} contribution self-funded`
                          });
                        }
                        
                        // Only show FEC aggregate transfer entry if we don't have imported transfer donors
                        // (to avoid double-counting - we prefer to show individual transfer sources)
                        const hasImportedTransfers = donors.some(d => d.line_number?.startsWith('12') || d.is_transfer);
                        if (fecTransfers > 0 && !hasImportedTransfers) {
                          allSources.push({
                            id: 'committee-transfers',
                            name: 'Committee Transfers',
                            amount: fecTransfers,
                            sourceType: 'committee_transfer',
                            badgeLabel: 'Line 12',
                            badgeStyle: 'border-purple-500/50 text-purple-600 bg-purple-500/10',
                            description: 'Transfers from other authorized campaign committees',
                            subLabel: 'Inter-committee',
                            searchText: 'committee transfers inter-committee'
                          });
                        }
                        
                        // Sort by amount descending
                        allSources.sort((a, b) => b.amount - a.amount);
                        
                        // Filter by search term
                        const searchLower = donorSearch.toLowerCase().trim();
                        const filteredSources = searchLower
                          ? allSources.filter(s => s.searchText?.includes(searchLower))
                          : allSources;
                        
                        // Paginate
                        const visibleSources = filteredSources.slice(0, visibleDonorCount);
                        const remaining = filteredSources.length - visibleDonorCount;
                        
                        return (
                          <>
                            {visibleSources.length === 0 && (
                              <div className="text-center py-8 text-muted-foreground">
                                No donors match your search.
                              </div>
                            )}
                            {visibleSources.map(source => {
                              // Render donor-type sources
                              if (source.sourceType === 'donor' && source.donor) {
                                const donor = source.donor;
                                const displayName = donor.display_name || donor.name;
                                const conduitOrgs = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];
                                const isConduit = conduitOrgs.some(c => displayName.toUpperCase().includes(c));
                                
                                return (
                                  <Link
                                    key={source.id}
                                    to={`/donor/${donor.id}`}
                                    className="block group"
                                  >
                                    <div className={cn(
                                      "flex items-center justify-between p-4 rounded-lg border transition-all",
                                      isConduit 
                                        ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50" 
                                        : "border-border hover:border-primary/30 hover:shadow-sm"
                                    )}>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium text-foreground group-hover:text-primary transition-colors">{displayName}</p>
                                          {isConduit && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 bg-amber-500/10">
                                                    Conduit
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="font-medium mb-1">Pass-Through Organization</p>
                                                  <p className="text-xs">This organization processes donations on behalf of individual donors. 
                                                  The amount shown is the total routed through this conduit — individual donors are listed separately to avoid double-counting.</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                          {donor.is_consolidated && donor.name_variations && donor.name_variations.length > 1 && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <Badge variant="outline" className="text-[10px] border-primary/50 text-primary bg-primary/10">
                                                    {donor.name_variations.length} merged
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="font-medium mb-1">Merged Names</p>
                                                  <ul className="text-xs space-y-0.5">
                                                    {donor.name_variations.slice(0, 10).map((name, i) => (
                                                      <li key={i}>{name}</li>
                                                    ))}
                                                    {donor.name_variations.length > 10 && (
                                                      <li>...and {donor.name_variations.length - 10} more</li>
                                                    )}
                                                  </ul>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                          <Badge variant="secondary">{donor.type}</Badge>
                                          {isConduit && (
                                            <span className="text-xs text-amber-600">Pass-through</span>
                                          )}
                                          {donor.contributor_city && donor.contributor_state && (
                                            <span className="text-xs text-muted-foreground">
                                              {donor.contributor_city}, {donor.contributor_state}
                                            </span>
                                          )}
                                          {donor.employer && (
                                            <span className="text-xs text-muted-foreground">
                                              • {donor.employer}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className={cn("font-bold", isConduit ? "text-amber-600" : "text-foreground")}>
                                          ${donor.amount.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {donor.transaction_count > 1 ? `${donor.transaction_count} contributions` : donor.cycle}
                                        </p>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              }
                              
                              // Render FEC aggregate sources
                              const getBorderStyle = () => {
                                switch (source.sourceType) {
                                  case 'small_donors': return 'border-primary/30 bg-primary/5';
                                  case 'candidate_loan':
                                  case 'candidate_contribution': return 'border-blue-500/30 bg-blue-500/5';
                                  case 'committee_transfer': return 'border-purple-500/30 bg-purple-500/5';
                                  default: return 'border-border';
                                }
                              };
                              
                              const getAmountColor = () => {
                                switch (source.sourceType) {
                                  case 'candidate_loan':
                                  case 'candidate_contribution': return 'text-blue-600';
                                  case 'committee_transfer': return 'text-purple-600';
                                  default: return 'text-foreground';
                                }
                              };
                              
                              const content = (
                                <div className={cn(
                                  "flex items-center justify-between p-4 rounded-lg border",
                                  getBorderStyle(),
                                  source.linkTo && "cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
                                )}>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className={cn(
                                        "font-medium text-foreground",
                                        source.linkTo && "group-hover:text-primary transition-colors"
                                      )}>{source.name}</p>
                                      {source.badgeLabel && (
                                        <Badge variant="outline" className={cn("text-[10px]", source.badgeStyle)}>
                                          {source.badgeLabel}
                                        </Badge>
                                      )}
                                    </div>
                                    {source.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{source.description}</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className={cn("font-bold", getAmountColor())}>
                                      {formatCurrency(source.amount)}
                                    </p>
                                    {source.subLabel && (
                                      <p className="text-xs text-muted-foreground">{source.subLabel}</p>
                                    )}
                                  </div>
                                </div>
                              );
                              
                              // Wrap in Link if linkTo is set
                              if (source.linkTo) {
                                return (
                                  <Link key={source.id} to={source.linkTo} className="block">
                                    {content}
                                  </Link>
                                );
                              }
                              
                              return <div key={source.id}>{content}</div>;
                            })}
                            
                            {/* Load More Button */}
                            {remaining > 0 && (
                              <div className="flex justify-center pt-4">
                                <Button
                                  variant="outline"
                                  onClick={() => setVisibleDonorCount(prev => prev + 20)}
                                >
                                  Show 20 more ({remaining} remaining)
                                </Button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* Conduit explanation */}
                    {donors.some(d => ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'].some(c => (d.display_name || d.name).toUpperCase().includes(c))) && (
                      <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="text-amber-700">
                            <span className="font-medium">Conduit Organizations: </span>
                            WinRed, ActBlue, and Democracy Engine are payment processors that route donations from individual donors. 
                            Their totals represent pass-through amounts — the original donors are listed separately in this table.
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Itemized contributions from FEC Schedule A filings (line 11*/12*). 
                      Does not include unitemized small-dollar donations or other receipts.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Contribution data not available for this candidate.
                  </p>
                )}
              </CardContent>
            </Card>
            <div className="mt-6"><CandidateIESection candidateId={candidate.id} /></div>
          </TabsContent>


          <TabsContent value="votes">
            <VotingRecordSection 
              votes={votes}
              userTopicScores={userTopicScores}
              representativeParty={candidate.party}
            />
          </TabsContent>

          <TabsContent value="legislation">
            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="font-display">Sponsored & Cosponsored Legislation</CardTitle>
              </CardHeader>
              <CardContent>
                {billsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : sponsoredBills.length > 0 ? (
                  <div className="space-y-4">
                    {/* Summary badges */}
                    <div className="flex gap-2 mb-4">
                      <Badge className="bg-primary/10 text-primary border-primary/30">
                        Sponsored: {sponsoredBills.filter(b => b.is_sponsor).length}
                      </Badge>
                      <Badge variant="outline">
                        Cosponsored: {sponsoredBills.filter(b => !b.is_sponsor).length}
                      </Badge>
                    </div>
                    
                    {/* Bill list */}
                    <div className="divide-y divide-border">
                      {sponsoredBills.slice(0, visibleBillCount).map(bill => (
                        <div key={bill.bill_id} className="py-3 flex items-start gap-3">
                          <Badge 
                            variant={bill.is_sponsor ? "default" : "outline"} 
                            className={cn(
                              "shrink-0 text-xs",
                              bill.is_sponsor && "bg-primary text-primary-foreground"
                            )}
                          >
                            {bill.is_sponsor ? "Sponsor" : "Cosponsor"}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <a 
                              href={bill.url || `https://congress.gov/bill/${bill.congress}th-congress/${(bill.bill_type || 'hr').toLowerCase()}/${bill.bill_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:text-primary transition-colors line-clamp-2"
                            >
                              {bill.bill_type} {bill.bill_number}: {bill.bill_name}
                            </a>
                            <div className="mt-2">
                              <BillAIAnalysisDialog
                                billId={bill.bill_id}
                                billType={bill.bill_type}
                                billNumber={bill.bill_number}
                                billName={bill.bill_name}
                                congress={bill.congress}
                                topic={bill.topic}
                                status={bill.status}
                                billUrl={bill.url}
                                sponsorshipDate={bill.sponsorship_date}
                                candidateName={candidate.name}
                                candidateParty={candidate.party}
                                candidateOffice={candidate.office}
                                candidateState={candidate.state}
                                isSponsor={bill.is_sponsor}
                                trigger={
                                  <Button size="sm" variant="outline" className="h-7 text-xs">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Dig Deeper AI Analysis
                                  </Button>
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2 text-sm text-muted-foreground">
                              {bill.topic && (
                                <Badge variant="secondary" className="text-xs">{bill.topic}</Badge>
                              )}
                              {bill.status && <span>{bill.status}</span>}
                              {bill.sponsorship_date && (
                                <span className="text-xs">({new Date(bill.sponsorship_date).toLocaleDateString()})</span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      ))}
                    </div>
                    
                    {/* Load more */}
                    {sponsoredBills.length > visibleBillCount && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setVisibleBillCount(prev => prev + 20)}
                      >
                        Show More ({sponsoredBills.length - visibleBillCount} remaining)
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No sponsored or cosponsored legislation found for this legislator.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>


        {/* Report Issue & Feedback */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <ReportIssueButton 
            candidateId={candidate.id} 
            candidateName={candidate.name}
          />
        </div>

        {/* AI Disclaimer */}
        <div className="mt-8 p-4 rounded-lg bg-secondary/50 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            <strong>Score Version:</strong> {candidate.score_version || 'v1.0'} • This is not voting advice. Data is provided for informational purposes only.
          </p>
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
      </main>
    </div>
  );
};
