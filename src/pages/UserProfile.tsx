import { useState, useMemo, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { useAuth } from '@/context/AuthContext';
import { useProfile, useUserTopics, useUserTopicScores, useResetOnboarding, useUpdateProfile } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials, CivicOfficial } from '@/hooks/useCivicOfficials';
import { usePersonalizedScoreMap } from '@/hooks/usePersonalizedScoreMap';
import { usePartyMatchScores } from '@/hooks/usePartyMatchScores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { normalizeOfficeName } from '@/lib/officeLabel';
import { User, RefreshCw, Target, LogOut, RotateCcw, Users, Sparkles, Building2, MapPin, Pencil, Check, X, AlertCircle, HelpCircle, Info, Share2 } from 'lucide-react';
import { EditProfileDialog } from '@/components/EditProfileDialog';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { AvatarUpload } from '@/components/AvatarUpload';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScoreText } from '@/components/ScoreText';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { RepresentativeComparisonCard } from '@/components/RepresentativeComparisonCard';
import { PartyComparisonCard } from '@/components/PartyComparisonCard';
import { VerificationBadges } from '@/components/VerificationBadges';
import { UpcomingElectionsCard } from '@/components/profile/UpcomingElectionsCard';
import { logBadgeEvent } from '@/lib/badges';
import { BadgeShelf } from '@/components/BadgeShelf';

interface ProfileAnalysis {
  summary: string;
  keyInsights: string[];
  partyComparison: string;
  strongestPositions: string[];
  democratAlignment: number;
  republicanAlignment: number;
  greenAlignment: number;
  libertarianAlignment: number;
  overallScore: number;
  error?: string;
}

export const UserProfile = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signOut, session } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: repsData, isLoading: repsLoading, error: repsError, refetch: refetchReps } = useRepresentatives(profile?.address);
  const { data: civicData, isLoading: civicLoading, refetch: refetchCivic } = useCivicOfficials(profile?.address);
  const { data: partyScores, isLoading: partyScoresLoading } = usePartyMatchScores();
  const federalReps = useMemo(() => repsData?.representatives ?? [], [repsData?.representatives]);
  const congressionalDistrict = repsData?.district;
  const congressionalState = repsData?.state;
  const geocodeFailed = !repsLoading && profile?.address && !congressionalDistrict && !repsError;

  // Combine all representatives
  const allRepsLoading = repsLoading || civicLoading;
  const resetOnboarding = useResetOnboarding();
  const updateProfile = useUpdateProfile();

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [isRefreshingRepAI, setIsRefreshingRepAI] = useState(false);
  const [isRefreshingAnalysis, setIsRefreshingAnalysis] = useState(false);
  const [isRefreshingParties, setIsRefreshingParties] = useState(false);

  // Fire identity_verified badge event when returning from ID.me
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('idme_callback') === 'true' && profile?.identity_verified) {
      logBadgeEvent('identity_verified');
    }
  }, [profile?.identity_verified]);


  // Collect all candidate IDs from civic officials and reps to fetch their scores
  const allOfficialIds = useMemo(() => {
    const ids: string[] = [];
    federalReps.forEach(rep => ids.push(rep.bioguide_id || rep.id));
    if (civicData) {
      civicData.federalExecutive.forEach(o => ids.push(o.id));
      civicData.stateExecutive.forEach(o => ids.push(o.id));
      civicData.stateLegislative.forEach(o => ids.push(o.id));
      civicData.local.forEach(o => ids.push(o.id));
    }
    return ids.filter(Boolean);
  }, [federalReps, civicData]);

  // Personalized score map: rep score averaged ONLY across the questions the
  // current user answered (apples-to-apples comparison).
  const { data: scoreMap } = usePersonalizedScoreMap(allOfficialIds);

  // Helper to get the resolved score for an official. Returns null (NA) when
  // there is no overlap between the user's answers and the rep's answers.
  const getResolvedScore = (id: string, _fallbackScore: number | null): number | null => {
    return scoreMap?.get(id) ?? null;
  };

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
    enabled: !!session && !!profile && topicScoresList.length > 0,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  const handleRefreshRepresentatives = () => {
    if (!profile?.address) return;
    refetchReps();
    refetchCivic();
    toast('Refreshing representatives...');
  };

  const handleResetOnboarding = async () => {
    if (!confirm('Are you sure you want to reset your onboarding? This will delete all your quiz answers and topic selections.')) {
      return;
    }

    try {
      await resetOnboarding.mutateAsync();
      toast.success('Onboarding reset successfully!');
      navigate('/onboarding');
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
      logBadgeEvent('address_added');
    } catch (error) {
      console.error('Error updating address:', error);
      toast.error('Failed to update address. Please try again.');
    }
  };

  const handleCancelEditAddress = () => {
    setIsEditingAddress(false);
    setAddressInput('');
  };

  const handleRefreshPoliticalAnalysis = async () => {
    setIsRefreshingAnalysis(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['profile-analysis'] });
      toast.success('Political analysis refreshed!');
    } catch (error) {
      console.error('Error refreshing analysis:', error);
      toast.error('Failed to refresh analysis');
    } finally {
      setIsRefreshingAnalysis(false);
    }
  };

  const handleRefreshPartyComparisons = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      toast.error('Please sign in to refresh party comparisons');
      return;
    }

    setIsRefreshingParties(true);
    try {
      const { error } = await supabase
        .from('user_party_comparisons')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['party-comparison'] });
      toast.success('Party comparisons refreshing...');
    } catch (error) {
      console.error('Error refreshing party comparisons:', error);
      toast.error('Failed to refresh party comparisons');
    } finally {
      setIsRefreshingParties(false);
    }
  };

  const handleRefreshRepComparisons = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      toast.error('Please sign in to refresh AI comparisons');
      return;
    }

    setIsRefreshingRepAI(true);
    try {
      const { error } = await supabase
        .from('user_rep_comparisons')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['rep-comparison'] });
      toast.success('Representative comparisons refreshing...');
    } catch (error) {
      console.error('Error refreshing rep comparisons:', error);
      toast.error('Failed to refresh representative comparisons');
    } finally {
      setIsRefreshingRepAI(false);
    }
  };
  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Republican': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'Independent': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Helper functions for image fallbacks
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const getPartyBgColor = (party: string) => {
    if (party === 'Democrat') return 'bg-blue-600';
    if (party === 'Republican') return 'bg-red-600';
    return 'bg-purple-600';
  };

  // Helper component for civic officials
  const RepresentativeCard = ({
    official,
    userScore,
    getPartyColor,
    resolvedScore,
  }: {
    official: CivicOfficial;
    userScore: number;
    getPartyColor: (party: string) => string;
    resolvedScore: number | null;
  }) => {
    const hasImage = official.image_url && official.image_url.trim() !== '';

    return (
      <Link
        to={`/candidate/${official.id}`}
        className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
      >
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
          {hasImage ? (
            <img
              src={official.image_url}
              alt={official.name}
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
            className={cn("w-full h-full flex items-center justify-center", getPartyBgColor(official.party))}
            style={{ display: hasImage ? 'none' : 'flex' }}
          >
            <span className="text-white font-bold text-sm">{getInitials(official.name)}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground line-clamp-2 break-words">{official.name}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{normalizeOfficeName(official.office)}</span>
            <Badge variant="outline" className={cn("text-xs", getPartyColor(official.party))}>
              {official.party}
            </Badge>
          </div>
        </div>
        {resolvedScore !== null ? (
          <ScoreText score={resolvedScore} size="md" />
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            NA
          </Badge>
        )}
      </Link>
    );
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
      <Seo
        title="Your Profile — Pulse"
        description="Manage your Pulse account, address, and topic priorities."
        path="/profile"
        noIndex
      />
      <Header />

      <main className="container py-8 px-4 max-w-4xl">
        {/* Profile Header */}
        <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 md:p-8 mb-8 shadow-elevated">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-1">
              {/* Avatar with the Overall Score right next to it */}
              <div className="flex items-start gap-4 sm:gap-6">
                <AvatarUpload
                  userId={profile.id}
                  currentAvatarUrl={profile.avatar_url}
                  userName={profile.name}
                  onAvatarChange={() => queryClient.invalidateQueries({ queryKey: ['profile'] })}
                />
                <div className="flex flex-1 items-center justify-center rounded-xl border border-border/60 bg-secondary/50 px-4 py-4 text-center">
                  <ScoreText
                    score={profile.overall_score}
                    size="lg"
                    className="[&>span:first-child]:text-4xl [&>span:first-child]:font-extrabold sm:[&>span:first-child]:text-5xl"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="break-words font-display text-2xl md:text-3xl font-bold text-foreground">
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

                {/* Edit Profile Button */}
                <div className="mt-3">
                  <EditProfileDialog
                    profile={profile}
                    onSave={async (data) => {
                      await updateProfile.mutateAsync(data);
                      toast.success('Profile updated successfully!');
                    }}
                    isLoading={updateProfile.isPending}
                  />
                  <ChangePasswordDialog />
                </div>

                {/* Verification badges */}
                <VerificationBadges profile={profile} />
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full gap-2 sm:w-auto lg:self-end">
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        {/* Quiz Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <Link to="/results" className="flex-1">
            <Button variant="secondary" className="w-full gap-2">
              <Share2 className="w-4 h-4" />
              View & Share Results
            </Button>
          </Link>
          <Link to="/quiz?mode=random" className="flex-1">
            <Button variant="default" className="w-full gap-2">
              <HelpCircle className="w-4 h-4" />
              Answer More Questions
            </Button>
          </Link>
          <Link to="/quiz" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <RefreshCw className="w-4 h-4" />
              Retake Full Quiz
            </Button>
          </Link>
          <Button
            variant="ghost"
            className="flex-1 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleResetOnboarding}
            disabled={resetOnboarding.isPending}
          >
            <RotateCcw className="w-4 h-4" />
            {resetOnboarding.isPending ? 'Resetting...' : 'Reset Onboarding'}
          </Button>
        </div>

        <Tabs defaultValue="ai-analysis" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap mb-6">
            <TabsTrigger value="ai-analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="party-alignment">Party Alignment</TabsTrigger>
            <TabsTrigger value="representatives">Representatives</TabsTrigger>
            <TabsTrigger value="elections">Upcoming Elections</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
            <TabsTrigger value="topics">Priority Topics</TabsTrigger>
          </TabsList>

          <TabsContent value="ai-analysis">
        {/* AI Analysis Summary */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                AI Political Analysis
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshPoliticalAnalysis}
                      disabled={isRefreshingAnalysis || analysisLoading}
                      className="gap-1.5 text-xs"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", (isRefreshingAnalysis || analysisLoading) && "animate-spin")} />
                      Refresh
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Regenerate AI political analysis</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
          </TabsContent>

          <TabsContent value="party-alignment">
        {/* Party Alignment */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Party Alignment
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshPartyComparisons}
                      disabled={isRefreshingParties || partyScoresLoading}
                      className="gap-1.5 text-xs"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingParties && "animate-spin")} />
                      Refresh All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Regenerate AI comparison summaries for all parties</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="flex flex-col gap-4">
                <PartyComparisonCard
                  partyId="democrat"
                  partyName="Democratic"
                  score={partyScores?.democrat}
                  isLoading={partyScoresLoading}
                />
                <PartyComparisonCard
                  partyId="republican"
                  partyName="Republican"
                  score={partyScores?.republican}
                  isLoading={partyScoresLoading}
                />
                <PartyComparisonCard
                  partyId="green"
                  partyName="Green"
                  score={partyScores?.green}
                  isLoading={partyScoresLoading}
                />
                <PartyComparisonCard
                  partyId="libertarian"
                  partyName="Libertarian"
                  score={partyScores?.libertarian}
                  isLoading={partyScoresLoading}
                />
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="representatives">
        {/* Your Representatives */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Your Representatives
                {allRepsLoading ? (
                  <Badge variant="outline" className="ml-2 text-xs font-normal animate-pulse">
                    Looking up representatives...
                  </Badge>
                ) : congressionalState && congressionalDistrict ? (
                  <Badge variant="outline" className="ml-2 text-xs font-normal">
                    {congressionalState}-{congressionalDistrict}
                  </Badge>
                ) : null}
              </div>

              {profile.address && (
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRefreshRepComparisons}
                          disabled={isRefreshingRepAI || allRepsLoading}
                          className="gap-1.5 text-xs"
                        >
                          <Sparkles className={cn("h-3.5 w-3.5", isRefreshingRepAI && "animate-pulse")} />
                          {isRefreshingRepAI ? 'Refreshing...' : 'Refresh AI'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Regenerate AI comparison summaries for all representatives</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefreshRepresentatives}
                    disabled={allRepsLoading}
                    aria-label="Refresh representatives"
                  >
                    <RefreshCw className={cn("h-4 w-4", allRepsLoading && "animate-spin")} />
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!profile.address ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">Add your address to see your representatives.</p>
                <Button variant="outline" onClick={handleEditAddress}>
                  Add Address
                </Button>
              </div>
            ) : allRepsLoading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 py-4 text-muted-foreground">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                  <span>Finding your representatives...</span>
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
                        // Convert Representative to CivicOfficial format for RepresentativeComparisonCard
                        const official: CivicOfficial = {
                          id: rep.bioguide_id || rep.id,
                          name: rep.name,
                          party: rep.party,
                          office: rep.office,
                          level: 'federal_legislative',
                          state: rep.state,
                          district: rep.district || undefined,
                          image_url: rep.image_url,
                          is_incumbent: rep.is_incumbent,
                          overall_score: rep.overall_score,
                          coverage_tier: rep.coverage_tier,
                          confidence: rep.confidence,
                        };
                        return (
                          <RepresentativeComparisonCard
                            key={rep.id}
                            official={official}
                            resolvedScore={getResolvedScore(rep.bioguide_id || rep.id, rep.overall_score)}
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
                      {civicData.userWard && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {civicData.userWard}
                        </Badge>
                      )}
                    </h4>
                    {civicData.wardNote && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>{civicData.wardNote}</span>
                      </div>
                    )}
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
          </TabsContent>

          <TabsContent value="elections">
            {/* Upcoming Elections */}
            <UpcomingElectionsCard address={profile?.address} />
          </TabsContent>

          <TabsContent value="badges">
            {/* Badges */}
            <BadgeShelf userId={session?.user?.id} family="voter" />
          </TabsContent>

          <TabsContent value="topics">
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};
