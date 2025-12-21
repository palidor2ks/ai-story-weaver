import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProfile, useUserTopicScores, useUserTopics } from '@/hooks/useProfile';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';
import { Loader2, Sparkles, ArrowRight, BarChart3, Users, CheckCircle, XCircle, Share2, Copy, Twitter, Facebook, Linkedin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchBadge } from '@/components/MatchBadge';

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
  const [profileAnalysis, setProfileAnalysis] = useState<ProfileAnalysis | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [politicianMatches, setPoliticianMatches] = useState<PoliticianMatch[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

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

        {/* AI Summary Card */}
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

        {/* Politicians Match Card */}
        <Card className="mb-8 shadow-elevated animate-slide-up" style={{ animationDelay: '150ms' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Your Top Candidate Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMatches || politicianMatches.length === 0 ? (
              <div className="flex items-center gap-3 text-muted-foreground py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Finding your best candidate matches...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {politicianMatches.map((politician, index) => (
                  <div 
                    key={politician.id} 
                    className="flex items-start gap-4 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/candidate/${politician.id}`)}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                        {politician.image_url ? (
                          <img 
                            src={politician.image_url} 
                            alt={politician.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-bold">
                            {politician.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className={cn(
                        "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background",
                        getPartyColor(politician.party)
                      )} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-foreground truncate">{politician.name}</h4>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          politician.party === 'Democrat' ? 'bg-blue-100 text-blue-700' :
                          politician.party === 'Republican' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        )}>
                          {politician.party}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{politician.office}</p>
                      
                      {/* AI Match Reason */}
                      <div className="flex items-start gap-2 text-sm">
                        {politician.matchScore >= 60 ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="text-muted-foreground">{politician.aiReason}</span>
                      </div>
                    </div>

                    {/* Match Score */}
                    <div className="flex-shrink-0">
                      <MatchBadge matchScore={politician.matchScore} size="md" />
                    </div>
                  </div>
                ))}
              </div>
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
