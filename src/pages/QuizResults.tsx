import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { ScoreText } from '@/components/ScoreText';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { useProfile, useUserTopicScores, useUserTopics } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials, CivicOfficial, OfficeLevelType } from '@/hooks/useCivicOfficials';
import { usePersonalizedScoreMap } from '@/hooks/usePersonalizedScoreMap';
import { useUpcomingElections } from '@/hooks/useUpcomingElections';
import { RepresentativeComparisonCard } from '@/components/RepresentativeComparisonCard';
import { unifiedCandidateNameKey } from '@/hooks/useUnifiedCandidates';
import { formatRunningForOffice } from '@/lib/officeLabel';
import { BRAND_HOST } from '@/lib/brand';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';
import { Loader2, Sparkles, ArrowRight, BarChart3, Users, Share2, Building2, MapPin, Calendar, Vote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileAnalysis {
  summary: string;
  keyInsights: string[];
  partyComparison?: string;
  strongestPositions?: string[];
  democratAlignment: number;
  republicanAlignment: number;
  overallScore: number;
}

export const QuizResults = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: userTopics = [] } = useUserTopics();
  const { data: repsData, isLoading: repsLoading } = useRepresentatives(profile?.address);
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(profile?.address);
  const { data: upcomingElections, isLoading: upcomingLoading } = useUpcomingElections(profile?.address);
  const [profileAnalysis, setProfileAnalysis] = useState<ProfileAnalysis | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [resultsShareOpen, setResultsShareOpen] = useState(false);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);

  const federalReps = repsData?.representatives ?? [];
  const allRepsLoading = repsLoading || civicLoading;

  // Build set of name keys already shown in Representatives so we can dedupe
  const repNameKeys = useMemo(() => {
    const set = new Set<string>();
    federalReps.forEach(r => set.add(unifiedCandidateNameKey(r.name, r.office)));
    if (civicData) {
      [...civicData.federalExecutive, ...civicData.stateExecutive, ...civicData.stateLegislative, ...civicData.local]
        .forEach(o => set.add(unifiedCandidateNameKey(o.name, o.office)));
    }
    return set;
  }, [federalReps, civicData]);

  // Collect all official IDs for score resolution
  const allOfficialIds = useMemo(() => {
    const ids: string[] = [];
    federalReps.forEach(rep => ids.push(rep.bioguide_id || rep.id));
    if (civicData) {
      civicData.federalExecutive.forEach(o => ids.push(o.id));
      civicData.stateExecutive.forEach(o => ids.push(o.id));
      civicData.stateLegislative.forEach(o => ids.push(o.id));
      civicData.local.forEach(o => ids.push(o.id));
    }
    if (upcomingElections) {
      [...upcomingElections.federal, ...upcomingElections.state, ...upcomingElections.local]
        .forEach(e => e.candidates.forEach(c => ids.push(c.candidate_id)));
    }
    return ids.filter(Boolean);
  }, [federalReps, civicData, upcomingElections]);

  const { data: scoreMap } = usePersonalizedScoreMap(allOfficialIds);

  // Sort topic scores by weight (user's ranking) for the share card
  const topTopicsForShare = useMemo(() => {
    return [...userTopicScores]
      .sort((a, b) => {
        const aw = userTopics.find(ut => ut.topic_id === a.topic_id)?.weight || 0;
        const bw = userTopics.find(ut => ut.topic_id === b.topic_id)?.weight || 0;
        return bw - aw;
      })
      .slice(0, 4)
      .map(ts => ({
        topicName: ts.topics?.name || ts.topic_id,
        score: ts.score,
      }));
  }, [userTopicScores, userTopics]);

  // Personalized: returns rep's score averaged only across the questions the
  // user answered. Returns null (NA) when there is no overlap.
  const getResolvedScore = (id: string, _fallbackScore: number | null): number | null => {
    return scoreMap?.get(id) ?? null;
  };

  // Fetch AI profile analysis on mount
  useEffect(() => {
    const fetchProfileAnalysis = async () => {
      if (!session || !profile || userTopicScores.length === 0) return;
      
      setIsLoadingAI(true);
      try {
        const topicScoresForAI = userTopicScores.map(ts => ({
          topicId: ts.topic_id,
          topicName: ts.topics?.name || ts.topic_id,
          score: ts.score,
        }));

        const { data, error } = await supabase.functions.invoke('user-profile-analysis', {
          body: {
            overallScore: profile.overall_score,
            topicScores: topicScoresForAI,
            userName: profile.name,
          },
        });

        if (error) throw error;
        setProfileAnalysis(data);
      } catch (error) {
        console.error('Failed to fetch profile analysis:', error);
        toast({
          title: 'AI Analysis',
          description: 'Could not load AI analysis. Scores are still displayed.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingAI(false);
      }
    };

    fetchProfileAnalysis();
  }, [session, profile, userTopicScores, toast]);

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!profile) {
    navigate('/onboarding');
    return null;
  }

  // Sort topic scores by weight (user's ranking)
  const sortedTopicScores = [...userTopicScores].sort((a, b) => {
    const aWeight = userTopics.find(ut => ut.topic_id === a.topic_id)?.weight || 0;
    const bWeight = userTopics.find(ut => ut.topic_id === b.topic_id)?.weight || 0;
    return bWeight - aWeight;
  });

  const getScoreBarWidth = (score: number) => {
    return ((score + 10) / 20) * 100;
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const inviteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const brandHost = BRAND_HOST;







  return (
    <div className="min-h-screen bg-background">
      <Header />

      <Seo
        title="Your Political Profile — Pulse"
        description="See your personalized political profile based on your quiz responses, and compare your views with candidates and parties."
        path="/results"
        noIndex
      />
      <main className="container py-8 px-4 max-w-3xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Your Political Profile
          </h1>
          <p className="text-muted-foreground mb-4">
            Based on your quiz responses and topic priorities
          </p>

          {/* Share Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setResultsShareOpen(true)}
            >
              <Share2 className="w-4 h-4" />
              Share my results
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setInviteShareOpen(true)}
            >
              <Users className="w-4 h-4" />
              Invite others
            </Button>
          </div>

          <ShareCardModal
            open={resultsShareOpen}
            onOpenChange={setResultsShareOpen}
            url={shareUrl}
            data={{
              kind: 'user-profile',
              brandHost,
              userName: profile?.name,
              userScore: profile?.overall_score ?? null,
              topTopics: topTopicsForShare,
            }}
            caption={{
              surface: 'quiz_results',
              kind: 'user-profile',
              userName: profile?.name,
              userScore: profile?.overall_score ?? null,
              topTopics: topTopicsForShare,
              url: shareUrl,
            }}
          />
          <ShareCardModal
            open={inviteShareOpen}
            onOpenChange={setInviteShareOpen}
            url={inviteUrl}
            data={{
              kind: 'invite',
              brandHost,
            }}
            caption={{ kind: 'invite', url: inviteUrl, surface: 'quiz_results_invite' }}
          />
        </div>

        {/* Overall Score Card */}
        <Card className="mb-8 shadow-elevated border-primary/20 animate-slide-up">
          <CardContent className="pt-8 pb-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">Your Overall Score</p>
            <div className="mb-4">
              <ScoreText score={profile.overall_score} size="lg" showLabel />
            </div>
            <p className="text-lg font-medium text-foreground">
              {getScoreLabel(profile.overall_score)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Score Version: {profile.score_version || 'v1.0'}
            </p>
          </CardContent>
        </Card>

        {/* Party Alignment Card */}
        <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '50ms' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Party Alignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingAI ? (
              <div className="flex items-center gap-3 text-muted-foreground py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Calculating party alignment...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Democratic Alignment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="font-medium text-foreground">Democratic Party</span>
                    </div>
                    <span className="font-bold text-blue-600">
                      {profileAnalysis?.democratAlignment ?? 50}%
                    </span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${profileAnalysis?.democratAlignment ?? 50}%` }}
                    />
                  </div>
                </div>

                {/* Republican Alignment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="font-medium text-foreground">Republican Party</span>
                    </div>
                    <span className="font-bold text-red-600">
                      {profileAnalysis?.republicanAlignment ?? 50}%
                    </span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 transition-all duration-500"
                      style={{ width: `${profileAnalysis?.republicanAlignment ?? 50}%` }}
                    />
                  </div>
                </div>

                {profileAnalysis?.partyComparison && (
                  <p className="text-sm text-muted-foreground pt-2 border-t border-border">
                    {profileAnalysis.partyComparison}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Profile Summary */}
        <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Profile Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingAI ? (
              <div className="flex items-center gap-3 text-muted-foreground py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analyzing your political profile...</span>
              </div>
            ) : profileAnalysis ? (
              <div className="space-y-4">
                <p className="text-foreground leading-relaxed">{profileAnalysis.summary}</p>
                
                {profileAnalysis.keyInsights && profileAnalysis.keyInsights.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Key Insights</h4>
                    <ul className="space-y-2">
                      {profileAnalysis.keyInsights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {profileAnalysis.strongestPositions && profileAnalysis.strongestPositions.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Your Strongest Positions</h4>
                    <div className="flex flex-wrap gap-2">
                      {profileAnalysis.strongestPositions.map((position, index) => (
                        <span 
                          key={index} 
                          className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full"
                        >
                          {position}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                AI summary unavailable. Your scores are displayed below.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Your Representatives Card — with AI comparison summaries */}
        <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '150ms' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Your Representatives
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!profile.address ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">Add your address in your profile to see your representatives and how they match with your views.</p>
                <Button variant="outline" onClick={() => navigate('/profile')}>
                  Go to Profile
                </Button>
              </div>
            ) : allRepsLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Finding your representatives...</span>
              </div>
            ) : (federalReps.length > 0 || (civicData && (civicData.federalExecutive.length > 0 || civicData.stateExecutive.length > 0 || civicData.stateLegislative.length > 0 || civicData.local.length > 0))) ? (
              <div className="space-y-6">
                {/* Federal Executive (President, VP) */}
                {civicData && civicData.federalExecutive.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Federal Executive
                    </h4>
                    <div className="space-y-3">
                      {civicData.federalExecutive.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Federal Legislative (Congress) */}
                {federalReps.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      U.S. Congress
                    </h4>
                    <div className="space-y-3">
                      {federalReps.map((rep) => {
                        const repId = rep.bioguide_id || rep.id;
                        const official: CivicOfficial = {
                          id: repId,
                          name: rep.name,
                          office: rep.office,
                          party: rep.party,
                          image_url: rep.image_url || '',
                          overall_score: rep.overall_score,
                          level: 'federal' as OfficeLevelType,
                          state: '',
                          is_incumbent: true,
                          coverage_tier: 'tier_3',
                          confidence: 'low',
                        };
                        return (
                          <RepresentativeComparisonCard
                            key={repId}
                            official={official}
                            resolvedScore={getResolvedScore(repId, rep.overall_score)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* State Executive (Governor, Lt. Governor) */}
                {civicData && civicData.stateExecutive.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      State Executive
                    </h4>
                    <div className="space-y-3">
                      {civicData.stateExecutive.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* State Legislative */}
                {civicData && civicData.stateLegislative.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      State Legislature
                    </h4>
                    <div className="space-y-3">
                      {civicData.stateLegislative.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Local Officials */}
                {civicData && civicData.local.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Local Officials
                    </h4>
                    <div className="space-y-3">
                      {civicData.local.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No representatives found for your address.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Candidates on Your Ballot — upcoming elections */}
        {profile.address && (upcomingLoading || (upcomingElections && [...upcomingElections.federal, ...upcomingElections.state, ...upcomingElections.local].length > 0)) && (
          <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '175ms' }}>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" />
                Candidates on Your Ballot
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingLoading ? (
                <div className="flex items-center gap-3 text-muted-foreground py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Finding upcoming elections...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {(['federal', 'state', 'local'] as const).flatMap(level =>
                    (upcomingElections?.[level] ?? []).map(election => {
                      const newCandidates = election.candidates.filter(
                        c => !repNameKeys.has(unifiedCandidateNameKey(c.name, c.office)),
                      );
                      if (newCandidates.length === 0) return null;
                      const dateStr = new Date(election.election_date).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      });
                      return (
                        <div key={election.id}>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {election.name} — {dateStr}
                          </h4>
                          <div className="space-y-3">
                            {newCandidates.map(c => {
                              const official: CivicOfficial = {
                                id: c.candidate_id,
                                name: c.name,
                                office: c.office,
                                party: (c.party as any) || 'Other',
                                image_url: c.image_url || '',
                                overall_score: c.overall_score ?? 0,
                                level: (level === 'federal' ? 'federal' : level === 'state' ? 'state' : 'local') as OfficeLevelType,
                                state: c.state,
                                district: c.district || undefined,
                                is_incumbent: c.is_incumbent,
                                coverage_tier: (c.coverage_tier as any) || 'tier_3',
                                confidence: (c.confidence as any) || 'low',
                              };
                              const levelLabel = level === 'federal' ? 'Federal' : level === 'state' ? 'State' : 'Local';
                              const officeLabel = formatRunningForOffice(c.office, c.state, c.district);
                              return (
                                <div key={c.candidate_id} className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="secondary" className="gap-1">
                                      <Vote className="w-3 h-3" />
                                      Running for {officeLabel}
                                    </Badge>
                                    <Badge variant="outline">{levelLabel}</Badge>
                                  </div>
                                  <RepresentativeComparisonCard
                                    official={official}
                                    resolvedScore={getResolvedScore(c.candidate_id, c.overall_score)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Topic Breakdown Card */}
        <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '200ms' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Topic Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-6">
              Your scores across your top 5 priority topics
            </p>
            
            <div className="space-y-4">
              {sortedTopicScores.slice(0, 5).map((ts, index) => {
                const topicName = ts.topics?.name || ts.topic_id;
                const weight = userTopics.find(ut => ut.topic_id === ts.topic_id)?.weight || 1;
                
                return (
                  <div key={ts.topic_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="font-medium text-foreground">{topicName}</span>
                      </div>
                      <span className={cn(
                        "font-mono text-sm font-semibold",
                        ts.score < 0 ? "text-blue-600" : ts.score > 0 ? "text-red-600" : "text-purple-600"
                      )}>
                        {formatScore(ts.score)}
                      </span>
                    </div>
                    
                    {/* Visual bar */}
                    <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 bg-blue-100" />
                        <div className="w-1/2 bg-red-100" />
                      </div>
                      <div 
                        className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full transition-all"
                        style={{ left: `${getScoreBarWidth(ts.score)}%`, transform: 'translateX(-50%)' }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Left</span>
                      <span>Center</span>
                      <span>Right</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center animate-slide-up" style={{ animationDelay: '300ms' }}>
          <Button 
            size="lg" 
            onClick={() => navigate('/profile')}
            className="gap-2"
          >
            Find Your Candidates
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Compare your positions with candidates in your district
          </p>
        </div>
      </main>
    </div>
  );
};
