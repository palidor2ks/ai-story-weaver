import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
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
import { FinanceReconciliationCard } from '@/components/FinanceReconciliationCard';
import { FinanceSummaryCard, type FinanceSummaryData } from '@/components/FinanceSummaryCard';
import { cn } from '@/lib/utils';
import { ArrowLeft, ExternalLink, MapPin, Calendar, DollarSign, Vote, Sparkles, Pencil, BadgeCheck, FileText, RefreshCw, Info, AlertTriangle } from 'lucide-react';
import { ScoreText } from '@/components/ScoreText';
import { CoverageTierBadge, ConfidenceBadge, IncumbentBadge } from '@/components/CoverageTierBadge';
import { AIExplanation } from '@/components/AIExplanation';
import { EvidenceBrowser } from '@/components/EvidenceBrowser';
import { AIFeedback, ReportIssueButton } from '@/components/AIFeedback';
import { ContactInfoCard } from '@/components/ContactInfoCard';
import { CandidatePositions } from '@/components/CandidatePositions';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { CandidateEditDialog } from '@/components/admin/CandidateEditDialog';
import { ClaimProfileDialog } from '@/components/ClaimProfileDialog';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const CandidateProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: profile } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: donors = [], refetch: refetchDonors } = useCandidateDonors(id);
  const { data: votes = [] } = useCandidateVotes(id);
  const { data: representativeDetails } = useRepresentativeDetails(id);
  const { data: adminData } = useAdminRole();
  const { user } = useAuth();
  const { fetchFECDonors, isDonorLoading } = useFECIntegration();
  const queryClient = useQueryClient();
  
  // Get FEC committee ID from first donor record or we'll pass null
  const committeeId = donors[0]?.recipient_committee_id ?? null;
  const { data: fecTotals } = useFECTotals(committeeId);
  const { data: financeReconciliation } = useFinanceReconciliation(id);
  const { data: committeeRollups = [] } = useCommitteeRollups(id);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const isAdmin = adminData?.isAdmin ?? false;
  const isPoliticianOwner = !!user && candidate?.claimed_by_user_id === user.id;
  const canEdit = isAdmin || isPoliticianOwner;
  const isClaimed = !!candidate?.claimed_by_user_id;

  const handleFetchDonors = async () => {
    if (!candidate?.fec_candidate_id || !id) return;
    
    const result = await fetchFECDonors(id, candidate.fec_candidate_id);
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
  const matchScore = calculateMatchScore(userScore, candidate.overall_score);

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
  const conduitOrgNames = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];
  const isConduitDonor = (d: typeof donors[0]) => d.is_conduit_org || conduitOrgNames.some(c => d.name.toUpperCase().includes(c));
  
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
  
  // Other Receipts = FEC Total - Itemized - Unitemized (includes PACs, transfers, loans, etc.)
  const otherReceipts = (fecTotalReceipts ?? 0) - (fecItemized ?? 0) - (fecUnitemized ?? 0);
  
  // Full donor list total (for display - but excluding conduits which are pass-throughs)
  const donorListTotal = donors.filter(d => !isConduitDonor(d)).reduce((sum, d) => sum + d.amount, 0);
  
  // Contribution list total: itemized individuals + unitemized + other receipts (which includes transfers/PACs)
  // This should match FEC total receipts
  const contributionListTotal = itemizedIndividualTotal + (fecUnitemized ?? 0) + (otherReceipts > 0 ? otherReceipts : 0);
  
  // Variance check: compare our calculated list total to FEC reported total receipts
  const varianceAmount = fecTotalReceipts !== null ? contributionListTotal - fecTotalReceipts : 0;
  const varianceThreshold = fecTotalReceipts ? Math.max(1, fecTotalReceipts * 0.01) : 1;
  const hasVariance = fecTotalReceipts !== null && Math.abs(varianceAmount) > varianceThreshold;
  const variancePct = fecTotalReceipts ? ((varianceAmount / fecTotalReceipts) * 100).toFixed(1) : '0';

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        {/* Back Button */}
        <Link to="/feed" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Feed
        </Link>

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
                {candidate.hasOverride && (
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
              </div>

              {/* Score Display */}
              <div className="mb-3">
                <ScoreText score={candidate.overall_score} size="lg" showLabel />
              </div>

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

        {/* Contact Info Section */}
        {representativeDetails && (
          <div className="mb-8">
            <ContactInfoCard representative={representativeDetails} />
          </div>
        )}

        {/* You vs Candidate */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              You vs. {candidate.name.split(' ')[0]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Agreements */}
              <div>
                <h4 className="font-semibold text-agree mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-agree/20 flex items-center justify-center text-sm">✓</span>
                  Where You Agree
                </h4>
                {agreements.length > 0 ? (
                  <div className="space-y-3">
                    {agreements.map(a => (
                      <div key={a.topicId} className="p-3 rounded-lg bg-agree/5 border border-agree/20">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-foreground">{a.topicName}</span>
                          <span className="text-sm text-agree">Both {a.score >= 0 ? 'Progressive' : 'Conservative'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">You:</span>
                            <span className="ml-2 font-medium">{a.userScore > 0 ? '+' : ''}{a.userScore}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Them:</span>
                            <span className="ml-2 font-medium">{a.score > 0 ? '+' : ''}{a.score}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No clear agreements found based on your quiz responses.</p>
                )}
              </div>

              {/* Disagreements */}
              <div>
                <h4 className="font-semibold text-disagree mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-disagree/20 flex items-center justify-center text-sm">✗</span>
                  Where You Differ
                </h4>
                {disagreements.length > 0 ? (
                  <div className="space-y-3">
                    {disagreements.map(d => (
                      <div key={d.topicId} className="p-3 rounded-lg bg-disagree/5 border border-disagree/20">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-foreground">{d.topicName}</span>
                          <span className="text-sm text-disagree">Opposing views</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">You:</span>
                            <span className="ml-2 font-medium">{d.userScore > 0 ? '+' : ''}{d.userScore}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Them:</span>
                            <span className="ml-2 font-medium">{d.score > 0 ? '+' : ''}{d.score}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No clear disagreements found based on your quiz responses.</p>
                )}
              </div>
            </div>

            {/* Topic Breakdown */}
            <div className="mt-8 pt-8 border-t border-border">
              <h4 className="font-semibold text-foreground mb-4">Topic-by-Topic Scores</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {candidateTopicScores.map(ts => (
                  <div key={ts.topicId} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <span className="text-sm font-medium text-foreground">{ts.topicName}</span>
                    <ScoreText score={ts.score} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

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
                    <span className="text-sm text-muted-foreground">2024 Cycle</span>
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
                    
                    {/* Finance Summary Card - visible to all users */}
                    <FinanceSummaryCard
                      data={{
                        fecItemized,
                        fecUnitemized,
                        fecTotalReceipts,
                      }}
                      className="mb-6"
                    />

                    {/* FEC-derived aggregates to align list with summary */}
                    {hasFecBreakdown && (
                      <div className="mb-6 space-y-3">
                        {fecSourceLabel && (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            <span>Totals shown below use {fecSourceLabel}.</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 rounded-lg border border-border/70 bg-secondary/40">
                            <p className="text-xs text-muted-foreground">Itemized Individual</p>
                            <p className="text-lg font-semibold">{formatCurrency(fecItemized)}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{itemizedIndividualDonors.length} donors (Line 11)</p>
                          </div>
                          <div className="p-3 rounded-lg border border-border/70 bg-secondary/40">
                            <p className="text-xs text-muted-foreground">Unitemized (Small Donors)</p>
                            <p className="text-lg font-semibold">{formatCurrency(fecUnitemized)}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">&lt;$200, FEC aggregate</p>
                          </div>
                          <div className="p-3 rounded-lg border border-border/70 bg-secondary/40">
                            <p className="text-xs text-muted-foreground">Transfers (Line 12)</p>
                            <p className="text-lg font-semibold">{formatCurrency(transferTotal)}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{transferDonors.length} committee transfers</p>
                          </div>
                          <div className="p-3 rounded-lg border border-border/70 bg-secondary/40">
                            <p className="text-xs text-muted-foreground">Other Receipts</p>
                            <p className="text-lg font-semibold">{formatCurrency(otherReceipts > 0 ? otherReceipts - transferTotal : 0)}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">PAC/Loans/Misc</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Variance Check Banner */}
                    {hasVariance && fecTotalReceipts !== null && (
                      <div className={cn(
                        "mb-4 p-3 rounded-lg border flex items-start gap-2",
                        Math.abs(Number(variancePct)) > 5 
                          ? "bg-amber-500/10 border-amber-500/30" 
                          : "bg-muted/50 border-border"
                      )}>
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <span className="font-medium">Data Variance Detected</span>
                          <div className="text-xs text-muted-foreground mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>FEC Total: <strong>{formatCurrency(fecTotalReceipts)}</strong></div>
                            <div>List Total: <strong>{formatCurrency(contributionListTotal)}</strong></div>
                            <div>Delta: <strong className={varianceAmount > 0 ? "text-agree" : "text-disagree"}>
                              {varianceAmount > 0 ? '+' : ''}{formatCurrency(varianceAmount)} ({variancePct}%)
                            </strong></div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Variance may occur if donor list is incomplete or FEC totals include categories not shown here.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-6 p-4 rounded-xl bg-secondary/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Itemized Individual Contributors</p>
                          <p className="text-2xl font-bold text-foreground">
                            {itemizedIndividualDonors.length} donors
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Excludes {transferDonors.length} transfers, {conduitDonors.length} conduit pass-throughs
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Itemized List Total</p>
                          <p className="text-xl font-bold text-foreground">{formatCurrency(itemizedIndividualTotal)}</p>
                          {conduitTotal > 0 && (
                            <p className="text-[10px] text-amber-600 mt-1">+${conduitTotal.toLocaleString()} conduit (excluded)</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {donors.map(donor => {
                        // Identify conduit organizations
                        const conduitOrgs = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];
                        const isConduit = conduitOrgs.some(c => donor.name.toUpperCase().includes(c));
                        
                        return (
                          <div key={donor.id} className={cn(
                            "flex items-center justify-between p-4 rounded-lg border",
                            isConduit ? "border-amber-500/30 bg-amber-500/5" : "border-border"
                          )}>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-foreground">{donor.name}</p>
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
                        );
                      })}
                    </div>
                    
                    {/* Conduit explanation */}
                    {donors.some(d => ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'].some(c => d.name.toUpperCase().includes(c))) && (
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
          </TabsContent>

          <TabsContent value="votes">
            <Card className="shadow-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display">Voting Record</CardTitle>
                  <span className="text-sm text-muted-foreground">Key Votes</span>
                </div>
              </CardHeader>
              <CardContent>
                {votes.length > 0 ? (
                  <div className="space-y-4">
                    {votes.map(vote => (
                      <div key={vote.id} className="p-4 rounded-lg border border-border">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="secondary">{vote.topic}</Badge>
                              <span className="text-sm text-muted-foreground">{vote.bill_id}</span>
                            </div>
                            <h4 className="font-medium text-foreground">{vote.bill_name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{vote.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <Badge 
                              variant={(vote.position === 'Yea' || (vote.position as string) === 'Sponsored') ? 'default' : 'secondary'}
                              className={cn(
                                (vote.position === 'Yea' || (vote.position as string) === 'Sponsored') && "bg-agree text-agree-foreground",
                                vote.position === 'Nay' && "bg-disagree text-disagree-foreground",
                                (vote.position as string) === 'Cosponsored' && "bg-primary/80 text-primary-foreground"
                              )}
                            >
                              {vote.position}
                            </Badge>
                            <p className="text-sm text-muted-foreground mt-1">
                              {new Date(vote.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Voting record not available for this candidate.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Evidence Browser */}
        <div className="mt-8">
          <EvidenceBrowser 
            candidateName={candidate.name}
            stances={candidateTopicScores.map(ts => ({
              questionId: ts.topicId,
              questionText: `Position on ${ts.topicName}`,
              topicName: ts.topicName,
              stance: 'known' as const,
              score: ts.score,
              sources: [{ title: 'Public records', url: '#' }],
            }))}
          />
        </div>

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
              overall_score: candidate.overall_score,
              coverage_tier: candidate.coverage_tier || 'tier_3',
              confidence: candidate.confidence || 'medium',
            }}
          />
        )}
      </main>
    </div>
  );
};
