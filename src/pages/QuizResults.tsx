import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile, useUserTopicScores, useUserTopics } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';
import { Loader2, Sparkles, ArrowRight, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIProfileSummary {
  summary: string;
  keyInsights: string[];
}

export const QuizResults = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: userTopics = [] } = useUserTopics();
  const [aiSummary, setAiSummary] = useState<AIProfileSummary | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Fetch AI summary on mount
  useEffect(() => {
    const fetchAISummary = async () => {
      if (!profile || userTopicScores.length === 0) return;
      
      setIsLoadingAI(true);
      try {
        const topicScoresForAI = userTopicScores.map(ts => ({
          topicId: ts.topic_id,
          topicName: ts.topics?.name || ts.topic_id,
          score: ts.score,
        }));

        const { data, error } = await supabase.functions.invoke('ai-profile-summary', {
          body: {
            overallScore: profile.overall_score,
            topicScores: topicScoresForAI,
          },
        });

        if (error) throw error;
        setAiSummary(data);
      } catch (error) {
        console.error('Failed to fetch AI summary:', error);
        // Don't show error toast - AI summary is optional enhancement
      } finally {
        setIsLoadingAI(false);
      }
    };

    fetchAISummary();
  }, [profile, userTopicScores]);

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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4 max-w-3xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Your Political Profile
          </h1>
          <p className="text-muted-foreground">
            Based on your quiz responses and topic priorities
          </p>
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
            ) : aiSummary ? (
              <div className="space-y-4">
                <p className="text-foreground leading-relaxed">{aiSummary.summary}</p>
                
                {aiSummary.keyInsights && aiSummary.keyInsights.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Key Insights</h4>
                    <ul className="space-y-2">
                      {aiSummary.keyInsights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
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
