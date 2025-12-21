import { Header } from '@/components/Header';
import { ScoreBar } from '@/components/ScoreBar';
import { useAuth } from '@/context/AuthContext';
import { useProfile, useUserTopics, useUserTopicScores, useResetOnboarding } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { User, RefreshCw, TrendingUp, Target, LogOut, RotateCcw, Users, Sparkles, Building2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MatchBadge } from '@/components/MatchBadge';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileAnalysis {
  summary: string;
  keyInsights: string[];
  partyComparison: string;
  strongestPositions: string[];
  democratAlignment: number;
  republicanAlignment: number;
  overallScore: number;
  error?: string;
}

export const UserProfile = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: representatives = [], isLoading: repsLoading } = useRepresentatives(profile?.address);
  const resetOnboarding = useResetOnboarding();

  const topicScoresList = userTopicScores.map(ts => ({
    topicId: ts.topic_id,
    topicName: ts.topics?.name || ts.topic_id,
    score: ts.score,
  }));

  // Fetch AI analysis
  const { data: analysis, isLoading: analysisLoading } = useQuery<ProfileAnalysis>({
    queryKey: ['profile-analysis', profile?.id, topicScoresList],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('user-profile-analysis', {
        body: {
          overallScore: profile?.overall_score ?? 0,
          topicScores: topicScoresList,
          userName: profile?.name,
        },
      });
      
      if (error) throw error;
      return data as ProfileAnalysis;
    },
    enabled: !!profile && topicScoresList.length > 0,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  const handleResetOnboarding = async () => {
    if (!confirm('Are you sure you want to reset your onboarding? This will delete all your quiz answers and topic selections.')) {
      return;
    }
    
    try {
      await resetOnboarding.mutateAsync();
      toast.success('Onboarding reset successfully!');
      navigate('/');
    } catch (error) {
      console.error('Error resetting onboarding:', error);
      toast.error('Failed to reset onboarding. Please try again.');
    }
  };

  const getScoreLabel = (score: number) => {
    if (score >= 7) return 'L10';
    if (score >= 4) return 'L7';
    if (score >= 1) return 'L3';
    if (score >= -1) return 'C';
    if (score >= -4) return 'R3';
    if (score >= -7) return 'R7';
    return 'R10';
  };

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Republican': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'Independent': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground">Please complete onboarding first.</p>
          <Link to="/">
            <Button className="mt-4">Start Onboarding</Button>
          </Link>
        </main>
      </div>
    );
  }

  const topicsList = userTopics.map(ut => ({
    id: ut.topics?.id || ut.topic_id,
    name: ut.topics?.name || ut.topic_id,
    icon: ut.topics?.icon || '',
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4 max-w-4xl">
        {/* Profile Header */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 mb-8 shadow-elevated">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-hero flex items-center justify-center">
                <User className="w-10 h-10 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                  {profile.name}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Member since {new Date(profile.created_at).toLocaleDateString()}
                </p>
                {profile.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {profile.address}
                  </p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Overall Score with L10-R10 Display */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Your Political Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-8 p-6 rounded-xl bg-secondary/50">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Overall Score
              </span>
              <div className="flex items-center justify-center gap-4 mt-2">
                <div className={cn(
                  "text-5xl font-display font-bold",
                  profile.overall_score >= 30 && "text-blue-600",
                  profile.overall_score <= -30 && "text-red-600",
                  profile.overall_score > -30 && profile.overall_score < 30 && "text-accent"
                )}>
                  {getScoreLabel(profile.overall_score / 10)}
                </div>
                <div className="text-2xl text-muted-foreground">
                  ({profile.overall_score > 0 ? '+' : ''}{profile.overall_score})
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {profile.overall_score >= 30 ? 'You tend to lean Progressive on most issues' : 
                 profile.overall_score <= -30 ? 'You tend to lean Conservative on most issues' : 
                 'You hold moderate or mixed views across issues'}
              </p>
            </div>

            {/* Party Platform Comparison */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">Democratic Party</span>
                </div>
                <div className="text-3xl font-bold text-blue-600">
                  {analysisLoading ? <Skeleton className="h-9 w-16" /> : `${analysis?.democratAlignment ?? 50}%`}
                </div>
                <p className="text-sm text-muted-foreground">Platform Alignment</p>
              </div>
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-600">Republican Party</span>
                </div>
                <div className="text-3xl font-bold text-red-600">
                  {analysisLoading ? <Skeleton className="h-9 w-16" /> : `${analysis?.republicanAlignment ?? 50}%`}
                </div>
                <p className="text-sm text-muted-foreground">Platform Alignment</p>
              </div>
            </div>

            {/* Score Breakdown */}
            {topicScoresList.length > 0 && (
              <div className="space-y-4">
                {topicScoresList.map((ts, index) => (
                  <div 
                    key={ts.topicId}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <ScoreBar
                      score={ts.score}
                      label={ts.topicName}
                      size="md"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border space-y-3">
              <Link to="/quiz">
                <Button variant="outline" className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retake Quiz
                </Button>
              </Link>
              <Button 
                variant="ghost" 
                className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleResetOnboarding}
                disabled={resetOnboarding.isPending}
              >
                <RotateCcw className="w-4 h-4" />
                {resetOnboarding.isPending ? 'Resetting...' : 'Reset Onboarding'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Analysis Summary */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              AI Political Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysisLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : analysis?.summary ? (
              <div className="space-y-4">
                <p className="text-foreground leading-relaxed">{analysis.summary}</p>
                
                {analysis.keyInsights && analysis.keyInsights.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-foreground mb-2">Key Insights</h4>
                    <ul className="space-y-2">
                      {analysis.keyInsights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-2 text-muted-foreground">
                          <span className="text-accent mt-1">•</span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.partyComparison && (
                  <div className="mt-4 p-4 rounded-lg bg-secondary/50">
                    <h4 className="font-semibold text-foreground mb-2">Party Platform Comparison</h4>
                    <p className="text-muted-foreground">{analysis.partyComparison}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Complete the quiz to see your AI-generated political analysis.</p>
            )}
          </CardContent>
        </Card>

        {/* Your Representatives */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              Your Representatives
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!profile.address ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">Add your address to see your congressional representatives.</p>
                <Button variant="outline" onClick={() => navigate('/')}>
                  Update Address
                </Button>
              </div>
            ) : repsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : representatives.length > 0 ? (
              <div className="space-y-4">
                {representatives.map((rep) => {
                  const matchScore = calculateMatchScore(profile.overall_score ?? 0, rep.overall_score);
                  return (
                    <Link
                      key={rep.id}
                      to={`/candidate/${rep.bioguide_id || rep.id}`}
                      className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate">{rep.name}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground">{rep.office}</span>
                          <Badge variant="outline" className={cn("text-xs", getPartyColor(rep.party))}>
                            {rep.party}
                          </Badge>
                        </div>
                      </div>
                      <MatchBadge matchScore={matchScore} size="sm" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No representatives found for your address.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Priority Topics */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Your Priority Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topicsList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {topicsList.map(topic => (
                  <Badge 
                    key={topic.id} 
                    variant="secondary"
                    className="px-4 py-2 text-base gap-2"
                  >
                    <span>{topic.icon}</span>
                    {topic.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No priority topics selected yet.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
