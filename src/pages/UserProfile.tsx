import { useState } from 'react';
import { Header } from '@/components/Header';
import { ScoreBar } from '@/components/ScoreBar';
import { useAuth } from '@/context/AuthContext';
import { useProfile, useUserTopics, useUserTopicScores, useResetOnboarding, useUpdateProfile } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { User, RefreshCw, TrendingUp, Target, LogOut, RotateCcw, Users, Sparkles, Building2, MapPin, Pencil, Check, X, AlertCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MatchBadge } from '@/components/MatchBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

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
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: repsData, isLoading: repsLoading, error: repsError, refetch: refetchReps } = useRepresentatives(profile?.address);
  const representatives = repsData?.representatives ?? [];
  const congressionalDistrict = repsData?.district;
  const congressionalState = repsData?.state;
  const geocodeFailed = !repsLoading && profile?.address && !congressionalDistrict && !repsError;
  const resetOnboarding = useResetOnboarding();
  const updateProfile = useUpdateProfile();

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');

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

  const handleRefreshRepresentatives = () => {
    if (!profile?.address) return;
    refetchReps();
    toast('Refreshing representatives...');
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

  const handleEditAddress = () => {
    setAddressInput(profile?.address || '');
    setIsEditingAddress(true);
  };

  const handleSaveAddress = async () => {
    if (!addressInput.trim()) {
      toast.error('Please enter a valid address');
      return;
    }
    
    try {
      await updateProfile.mutateAsync({ address: addressInput.trim() });
      setIsEditingAddress(false);
      toast.success('Address updated successfully!');
    } catch (error) {
      console.error('Error updating address:', error);
      toast.error('Failed to update address. Please try again.');
    }
  };

  const handleCancelEditAddress = () => {
    setIsEditingAddress(false);
    setAddressInput('');
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
                {isEditingAddress ? (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1">
                      <AddressAutocomplete
                        value={addressInput}
                        onChange={setAddressInput}
                        onAddressSelect={(details) => setAddressInput(details.formattedAddress)}
                        placeholder="Start typing your address..."
                        className="text-sm"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                      onClick={handleSaveAddress}
                      disabled={updateProfile.isPending}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleCancelEditAddress}
                      disabled={updateProfile.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : profile.address ? (
                  <button
                    onClick={handleEditAddress}
                    className="text-sm text-muted-foreground flex items-center gap-1 mt-1 hover:text-foreground transition-colors group"
                  >
                    <MapPin className="w-3 h-3" />
                    {profile.address}
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <button
                    onClick={handleEditAddress}
                    className="text-sm text-primary flex items-center gap-1 mt-1 hover:underline"
                  >
                    <MapPin className="w-3 h-3" />
                    Add your address
                  </button>
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
              <Link to="/quiz?mode=random">
                <Button variant="default" className="w-full gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Answer More Questions (5 Random)
                </Button>
              </Link>
              <Link to="/quiz">
                <Button variant="outline" className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retake Full Quiz
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
            <CardTitle className="font-display flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Your Representatives
                {repsLoading ? (
                  <Badge variant="outline" className="ml-2 text-xs font-normal animate-pulse">
                    Looking up district...
                  </Badge>
                ) : congressionalState && congressionalDistrict ? (
                  <Badge variant="outline" className="ml-2 text-xs font-normal">
                    {congressionalState}-{congressionalDistrict}
                  </Badge>
                ) : null}
              </div>

              {profile.address && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefreshRepresentatives}
                  disabled={repsLoading}
                  aria-label="Refresh representatives"
                >
                  <RefreshCw className={cn("h-4 w-4", repsLoading && "animate-spin")} />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!profile.address ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">Add your address to see your congressional representatives.</p>
                <Button variant="outline" onClick={handleEditAddress}>
                  Add Address
                </Button>
              </div>
            ) : repsLoading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 py-4 text-muted-foreground">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                  <span>Finding your congressional representatives...</span>
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border animate-pulse">
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
            ) : repsError ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">Failed to load representatives</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      There was an error fetching your representatives. Please try again.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3 gap-2"
                      onClick={handleRefreshRepresentatives}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            ) : geocodeFailed ? (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-600">Could not find your congressional district</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      We couldn't determine your exact congressional district from the address provided. 
                      Try updating your address to include street number, city, state, and ZIP code.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                        onClick={handleEditAddress}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit Address
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2"
                        onClick={handleRefreshRepresentatives}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retry
                      </Button>
                    </div>
                  </div>
                </div>
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
