import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ScoreBar } from '@/components/ScoreBar';
import { MatchBadge } from '@/components/MatchBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCandidate, useCandidateDonors, useCandidateVotes, calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile, useUserTopicScores } from '@/hooks/useProfile';
import { useRepresentativeDetails } from '@/hooks/useRepresentativeDetails';
import { cn } from '@/lib/utils';
import { ArrowLeft, ExternalLink, MapPin, Calendar, DollarSign, Vote, User, Sparkles } from 'lucide-react';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { CoverageTierBadge, ConfidenceBadge, IncumbentBadge } from '@/components/CoverageTierBadge';
import { AIExplanation } from '@/components/AIExplanation';
import { EvidenceBrowser } from '@/components/EvidenceBrowser';
import { AIFeedback, ReportIssueButton } from '@/components/AIFeedback';
import { ContactInfoCard } from '@/components/ContactInfoCard';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

export const CandidateProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: profile } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: donors = [] } = useCandidateDonors(id);
  const { data: votes = [] } = useCandidateVotes(id);
  const { data: representativeDetails } = useRepresentativeDetails(id);

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

  const totalDonations = donors.reduce((sum, d) => sum + d.amount, 0);

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
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden flex-shrink-0">
              {(representativeDetails?.image_url || candidate.image_url) ? (
                <img 
                  src={representativeDetails?.image_url || candidate.image_url || ''}
                  alt={candidate.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className="w-full h-full bg-gradient-hero flex items-center justify-center"
                style={{ display: (representativeDetails?.image_url || candidate.image_url) ? 'none' : 'flex' }}
              >
                <User className="w-12 h-12 md:w-16 md:h-16 text-primary-foreground" />
              </div>
            </div>

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
              </div>

              {/* Score Display */}
              <div className="mb-3">
                <ScoreDisplay score={candidate.overall_score} size="md" showLabel />
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

            {/* Match Score */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Your Match</p>
              <MatchBadge matchScore={matchScore} size="lg" />
            </div>
          </div>
        </div>

        {/* AI Explanation Section */}
        <div className="mb-8">
          <AIExplanation
            candidateId={candidate.id}
            candidateName={candidate.name}
            topicScores={candidateTopicScores}
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
              <h4 className="font-semibold text-foreground mb-4">Topic-by-Topic Comparison</h4>
              <div className="space-y-4">
                {candidateTopicScores.map(ts => (
                  <ScoreBar
                    key={ts.topicId}
                    score={ts.score}
                    label={ts.topicName}
                  />
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
                  <CardTitle className="font-display">Campaign Finance</CardTitle>
                  <span className="text-sm text-muted-foreground">2024 Cycle</span>
                </div>
              </CardHeader>
              <CardContent>
                {donors.length > 0 ? (
                  <>
                    <div className="mb-6 p-4 rounded-xl bg-secondary/50">
                      <p className="text-sm text-muted-foreground">Total Raised</p>
                      <p className="text-3xl font-bold text-foreground">
                        ${totalDonations.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {donors.map(donor => (
                        <div key={donor.id} className="flex items-center justify-between p-4 rounded-lg border border-border">
                          <div>
                            <p className="font-medium text-foreground">{donor.name}</p>
                            <Badge variant="secondary" className="mt-1">{donor.type}</Badge>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-foreground">${donor.amount.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">{donor.cycle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Data sourced from public FEC filings
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Donor information not available for this candidate.
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
      </main>
    </div>
  );
};
