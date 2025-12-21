import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { ScoreText } from '@/components/ScoreText';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProfile, useUserTopicScores, useUserTopics } from '@/hooks/useProfile';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials, CivicOfficial } from '@/hooks/useCivicOfficials';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';
import { Loader2, Sparkles, ArrowRight, BarChart3, Users, CheckCircle, XCircle, Share2, Copy, Twitter, Facebook, Linkedin, Building2, MapPin, User } from 'lucide-react';
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

interface PoliticianMatch {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  image_url: string | null;
  matchScore: number;
  overall_score: number;
  aiReason?: string;
}

export const QuizResults = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: userTopics = [] } = useUserTopics();
  const { data: candidates = [] } = useCandidates();
  const { data: repsData, isLoading: repsLoading } = useRepresentatives(profile?.address);
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(profile?.address);
  const [profileAnalysis, setProfileAnalysis] = useState<ProfileAnalysis | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [politicianMatches, setPoliticianMatches] = useState<PoliticianMatch[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  const federalReps = repsData?.representatives ?? [];
  const allRepsLoading = repsLoading || civicLoading;

  // Fetch AI profile analysis on mount
  useEffect(() => {
    const fetchProfileAnalysis = async () => {
      if (!profile || userTopicScores.length === 0) return;
      
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
  }, [profile, userTopicScores, toast]);

  // Calculate politician matches when candidates are loaded
  useEffect(() => {
    const calculateMatches = async () => {
      if (!profile || candidates.length === 0) return;
      
      setIsLoadingMatches(true);
      
      // Calculate match scores for all candidates
      const matches: PoliticianMatch[] = candidates
        .filter(c => c.overall_score !== null)
        .map(candidate => ({
          id: candidate.id,
          name: candidate.name,
          party: candidate.party,
          office: candidate.office,
          image_url: candidate.image_url,
          matchScore: calculateMatchScore(profile.overall_score || 0, candidate.overall_score || 0),
          overall_score: candidate.overall_score || 0,
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5); // Top 5 matches

      // Generate AI reasons for top matches
      try {
        const matchesWithReasons = await Promise.all(
          matches.map(async (match) => {
            const reason = generateMatchReason(
              profile.overall_score || 0,
              match.overall_score,
              match.party,
              match.matchScore
            );
            return { ...match, aiReason: reason };
          })
        );
        setPoliticianMatches(matchesWithReasons);
      } catch (error) {
        console.error('Failed to generate match reasons:', error);
        setPoliticianMatches(matches);
      } finally {
        setIsLoadingMatches(false);
      }
    };

    calculateMatches();
  }, [profile, candidates]);

  // Generate a match reason based on scores
  const generateMatchReason = (
    userScore: number,
    candidateScore: number,
    party: string,
    matchScore: number
  ): string => {
    const scoreDiff = Math.abs(userScore - candidateScore);
    const userLeaning = userScore < -2 ? 'progressive' : userScore > 2 ? 'conservative' : 'moderate';
    const candidateLeaning = candidateScore < -2 ? 'progressive' : candidateScore > 2 ? 'conservative' : 'moderate';
    
    if (matchScore >= 80) {
      if (userLeaning === candidateLeaning) {
        return `Strong alignment on ${userLeaning} values. You share similar positions on most key issues.`;
      }
      return `High compatibility despite different leanings. Your centrist approach aligns well with this candidate.`;
    } else if (matchScore >= 60) {
      return `Moderate alignment. You agree on some issues but differ on others, particularly around ${userLeaning === 'progressive' ? 'economic' : 'social'} policy.`;
    } else if (matchScore >= 40) {
      return `Mixed compatibility. While you may share some common ground, there are notable differences in core policy areas.`;
    } else {
      return `Significant ideological differences. This ${party} candidate holds ${candidateLeaning} positions that contrast with your ${userLeaning} views.`;
    }
  };

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
    return bWeight - aWeight; // Higher weight = higher priority
  });

  const getScoreBarWidth = (score: number) => {
    // Convert -10 to +10 scale to 0-100% for visualization
    return ((score + 10) / 20) * 100;
  };

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500';
      case 'Republican': return 'bg-red-500';
      default: return 'bg-purple-500';
    }
  };

  const getPartyBadgeColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Republican': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'Independent': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Helper component for civic officials
  const RepresentativeCard = ({ 
    official, 
    userScore 
  }: { 
    official: CivicOfficial; 
    userScore: number; 
  }) => {
    const matchScore = official.overall_score !== null 
      ? calculateMatchScore(userScore, official.overall_score) 
      : null;
    
    return (
      <div className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
          {official.image_url ? (
            <img src={official.image_url} alt={official.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-6 h-6 text-primary-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground truncate">{official.name}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{official.office}</span>
            <Badge variant="outline" className={cn("text-xs", getPartyBadgeColor(official.party))}>
              {official.party}
            </Badge>
          </div>
        </div>
        {official.overall_score !== null ? (
          <ScoreText score={official.overall_score} size="md" />
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            NA
          </Badge>
        )}
      </div>
    );
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = `I just discovered my political profile! My score: ${formatScore(profile?.overall_score)} (${getScoreLabel(profile?.overall_score)}). Find out where you stand on the issues.`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: 'Link copied!',
        description: 'Share your results with friends and family.',
      });
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please copy the URL manually.',
        variant: 'destructive',
      });
    }
  };

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Political Profile',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4 max-w-3xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Your Political Profile
          </h1>
          <p className="text-muted-foreground mb-4">
            Based on your quiz responses and topic priorities
          </p>
          
          {/* Share Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Share2 className="w-4 h-4" />
                Share Results
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShareTwitter} className="cursor-pointer">
                <Twitter className="w-4 h-4 mr-2" />
                Share on X
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShareFacebook} className="cursor-pointer">
                <Facebook className="w-4 h-4 mr-2" />
                Share on Facebook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShareLinkedIn} className="cursor-pointer">
                <Linkedin className="w-4 h-4 mr-2" />
                Share on LinkedIn
              </DropdownMenuItem>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <DropdownMenuItem onClick={handleNativeShare} className="cursor-pointer">
                  <Share2 className="w-4 h-4 mr-2" />
                  More Options...
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Overall Score Card */}
        <Card className="mb-8 shadow-elevated border-primary/20 animate-slide-up">
          <CardContent className="pt-8 pb-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">Your Overall Score</p>
            <div className="mb-4">
              <ScoreDisplay score={profile.overall_score} size="xl" showLabel />
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

        {/* Your Representatives Card */}
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
                        <RepresentativeCard
                          key={official.id}
                          official={official}
                          userScore={profile.overall_score ?? 0}
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
                      {federalReps.map((rep) => (
                          <Link
                            key={rep.id}
                            to={`/candidate/${rep.bioguide_id || rep.id}`}
                            className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                          >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                              <User className="w-6 h-6 text-primary-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground truncate">{rep.name}</h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-muted-foreground">{rep.office}</span>
                                <Badge variant="outline" className={cn("text-xs", getPartyBadgeColor(rep.party))}>
                                  {rep.party}
                                </Badge>
                              </div>
                            </div>
                            {rep.overall_score !== null ? (
                              <ScoreText score={rep.overall_score} size="md" />
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                NA
                              </Badge>
                            )}
                          </Link>
                        ))}
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
                        <RepresentativeCard
                          key={official.id}
                          official={official}
                          userScore={profile.overall_score ?? 0}
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
                        <RepresentativeCard
                          key={official.id}
                          official={official}
                          userScore={profile.overall_score ?? 0}
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
                        <RepresentativeCard
                          key={official.id}
                          official={official}
                          userScore={profile.overall_score ?? 0}
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
            onClick={() => navigate('/feed')}
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
