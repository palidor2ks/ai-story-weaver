import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { usePartyPlatform, calculatePartyAlignment } from '@/hooks/usePartyPlatform';
import { useUserTopicScores } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreText } from '@/components/ScoreText';
import { RepComparisonSummary } from '@/components/RepComparisonSummary';
import { usePartyComparison, useGeneratePartyComparison, isPartyComparisonStale } from '@/hooks/usePartyComparison';
import { getScoreLabelProgCon } from '@/lib/scoreFormat';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Building2, 
  Leaf, 
  Scale, 
  ExternalLink, 
  ArrowLeft, 
  FileText, 
  Target,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

const iconMap: Record<string, typeof Building2> = {
  Building2,
  Leaf,
  Scale,
};

export default function PartyProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: party, isLoading, error } = usePartyPlatform(id);
  const { data: userTopicScores = [] } = useUserTopicScores();

  // Fetch cached AI comparison
  const { data: comparison, isLoading: comparisonLoading } = usePartyComparison(id);
  const generateComparison = useGeneratePartyComparison();

  // Fetch user's quiz answers for AI comparison
  const { data: userAnswers = [] } = useQuery({
    queryKey: ['quiz-answers-with-questions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          value,
          selected_option_id,
          questions!inner (
            text,
            topics!inner (name)
          ),
          question_options!quiz_answers_selected_option_id_fkey (
            is_skip_option
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }

      return data.map((a: any) => ({
        question_id: a.question_id,
        value: a.value,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
        is_skipped: a.question_options?.is_skip_option ?? false,
      }));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch party's answers for AI comparison
  const { data: partyAnswersForAI = [] } = useQuery({
    queryKey: ['party-answers-with-questions', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('party_answers')
        .select(`
          question_id,
          answer_value,
          source_url,
          source_description,
          questions!inner (
            text,
            topics!inner (name)
          )
        `)
        .eq('party_id', id);

      if (error) {
        console.error('Error fetching party answers:', error);
        return [];
      }

      return data.map((a: any) => ({
        question_id: a.question_id,
        value: a.answer_value,
        source_url: a.source_url,
        source_description: a.source_description,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
      }));
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
  });

  // Check if comparison is stale
  const isStale = useMemo(() => {
    return isPartyComparisonStale(comparison ?? null, userAnswers, partyAnswersForAI);
  }, [comparison, userAnswers, partyAnswersForAI]);

  const handleRefreshAI = () => {
    if (id && party && userAnswers.length > 0 && partyAnswersForAI.length > 0) {
      generateComparison.mutate({
        partyId: id,
        partyName: party.name,
        userAnswers,
        partyAnswers: partyAnswersForAI,
        deepAnalysis: false,
      });
    }
  };

  const handleDigDeeper = () => {
    if (id && party && userAnswers.length > 0 && partyAnswersForAI.length > 0) {
      generateComparison.mutate({
        partyId: id,
        partyName: party.name,
        userAnswers,
        partyAnswers: partyAnswersForAI,
        deepAnalysis: true,
      });
    }
  };

  const userScores = userTopicScores.map(ts => ({
    topicId: ts.topic_id,
    score: Number(ts.score),
  }));

  // Calculate alignment
  const partyTopicScores = party?.topicScores || [];
  const userAlignment = calculatePartyAlignment(
    userScores,
    partyTopicScores.map(s => ({ topicId: s.topicId, score: s.score }))
  );

  const getPartyColorClasses = () => {
    switch (id) {
      case 'democrat': return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-600',
        badge: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
      };
      case 'republican': return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-600',
        badge: 'bg-red-500/20 text-red-700 border-red-500/30',
      };
      case 'green': return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        text: 'text-green-600',
        badge: 'bg-green-500/20 text-green-700 border-green-500/30',
      };
      case 'libertarian': return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        text: 'text-yellow-600',
        badge: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
      };
      default: return {
        bg: 'bg-secondary',
        border: 'border-border',
        text: 'text-foreground',
        badge: 'bg-secondary text-foreground',
      };
    }
  };

  const colors = getPartyColorClasses();
  const Icon = iconMap[party?.logo_icon || 'Building2'] || Building2;

  // Group answers by topic
  const answersByTopic = party?.answers.reduce((acc, answer) => {
    const topicId = answer.question?.topic_id || 'other';
    const topicName = answer.question?.topics?.name || 'Other';
    if (!acc[topicId]) {
      acc[topicId] = {
        name: topicName,
        icon: answer.question?.topics?.icon || '📋',
        answers: [],
      };
    }
    acc[topicId].answers.push(answer);
    return acc;
  }, {} as Record<string, { name: string; icon: string; answers: typeof party.answers }>) || {};

  const getConfidenceIcon = (confidence: string | null) => {
    switch (confidence) {
      case 'high': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'medium': return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      case 'low': return <HelpCircle className="w-3 h-3 text-orange-500" />;
      default: return null;
    }
  };

  // Use centralized getScoreLabelProgCon from scoreFormat.ts

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-48 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 max-w-4xl text-center">
          <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Party Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The party you're looking for doesn't exist.
          </p>
          <Link to="/parties">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Parties
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${party.name} — Pulse`}
        description={`Explore the ${party.name}'s official platform, positions across policy topics, and how they compare with your views.`}
        path={`/party/${party.id}`}
        type="article"
      />
      <Header />
      
      <main className="container py-8 px-4 max-w-4xl">
        {/* Back Link */}
        <Link 
          to="/parties" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All Parties
        </Link>

        {/* Mobile sticky identity bar */}
        <div className="md:hidden sticky top-16 z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${party.color}30` }}
          >
            <Icon className="w-5 h-5" style={{ color: party.color }} />
          </div>
          <p className={cn("font-display font-bold text-sm truncate", colors.text)}>{party.name}</p>
        </div>

        {/* Party Header */}
        <Card className={cn("mb-8 shadow-elevated", colors.bg, colors.border)}>

          <CardContent className="p-6 md:p-8">
            <div className="flex items-start gap-6">
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${party.color}30` }}
              >
                <Icon className="w-10 h-10" style={{ color: party.color }} />
              </div>
              
              <div className="flex-1">
                <h1 className={cn("font-display text-3xl font-bold", colors.text)}>
                  {party.name}
                </h1>
                <p className="text-muted-foreground mt-2 leading-relaxed">
                  {party.description}
                </p>
                
                <div className="flex items-center gap-4 mt-4 flex-wrap">
                  {party.website_url && (
                    <a 
                      href={party.website_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={cn("inline-flex items-center gap-1 text-sm hover:underline", colors.text)}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Official Website
                    </a>
                  )}
                  <Badge variant="outline" className={colors.badge}>
                    {party.answers.length} documented positions
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="shadow-sm">
            <CardContent className="p-4 text-center">
              <span className="text-sm text-muted-foreground">Platform Score</span>
              <div className="mt-1">
                <ScoreText score={party.overallScore} size="lg" className="text-3xl" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm">
            <CardContent className="p-4 text-center">
              <span className="text-sm text-muted-foreground">Topics Covered</span>
              <div className="text-3xl font-bold text-foreground mt-1">
                {Object.keys(answersByTopic).length}
              </div>
            </CardContent>
          </Card>
          
          <Card className={cn("shadow-sm", colors.bg, colors.border)}>
            <CardContent className="p-4 text-center">
              <span className="text-sm text-muted-foreground">Your Alignment</span>
              <div className={cn("text-3xl font-bold mt-1", colors.text)}>
                {userScores.length > 0 ? `${userAlignment}%` : 'N/A'}
              </div>
              {userScores.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Complete quiz to see</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Comparison Summary */}
        {user && userAnswers.length > 0 && (
          <Card className="mb-8 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                AI Comparison Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RepComparisonSummary
                summary={comparison?.summary ?? null}
                deepAnalysis={comparison?.deep_analysis ?? null}
                keyAgreements={[]}
                keyDisagreements={[]}
                sources={comparison?.sources ?? []}
                isLoading={comparisonLoading}
                isGenerating={generateComparison.isPending}
                isStale={isStale && !!comparison}
                onDigDeeper={handleDigDeeper}
                onRefresh={handleRefreshAI}
                hasDeepAnalysis={!!comparison?.deep_analysis}
              />
            </CardContent>
          </Card>
        )}

        {/* Topic Scores */}
        {party.topicScores.length > 0 && (
          <Card className="mb-8 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Target className="w-5 h-5 text-accent" />
                Positions by Topic
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {party.topicScores
                  .sort((a, b) => b.answerCount - a.answerCount)
                  .map((topic) => (
                    <div 
                      key={topic.topicId}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {topic.topicName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {topic.answerCount} questions
                        </span>
                      </div>
                      <ScoreText score={topic.score} size="sm" />
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Questions by Topic */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              All Positions ({party.answers.length} questions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(answersByTopic).length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No positions documented yet. Check back soon!
                </p>
              </div>
            ) : (
              <Accordion type="multiple" className="w-full">
                {Object.entries(answersByTopic)
                  .sort((a, b) => b[1].answers.length - a[1].answers.length)
                  .map(([topicId, topic]) => (
                    <AccordionItem key={topicId} value={topicId}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{topic.icon}</span>
                          <span className="font-medium">{topic.name}</span>
                          <Badge variant="secondary" className="ml-2">
                            {topic.answers.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {topic.answers.map((answer) => (
                            <div 
                              key={answer.id}
                              className="p-4 rounded-lg bg-secondary/30 border border-border"
                            >
                              {/* Question */}
                              <p className="font-medium text-foreground mb-3">
                                {answer.question?.text}
                              </p>
                              
                              {/* Party's Specific Answer from question_options */}
                              {(() => {
                                const matchingOption = answer.question_options?.find(
                                  (opt) => opt.value === answer.answer_value
                                );
                                return matchingOption ? (
                                  <div className={cn(
                                    "p-3 rounded-lg mb-3 border-l-4",
                                    answer.answer_value < 0 
                                      ? "bg-blue-500/5 border-blue-500"
                                      : answer.answer_value > 0
                                      ? "bg-red-500/5 border-red-500"
                                      : "bg-gray-500/5 border-gray-500"
                                  )}>
                                    <p className="text-sm">
                                      <span className="font-medium text-muted-foreground">Party Position: </span>
                                      <span className="text-foreground">{matchingOption.text}</span>
                                    </p>
                                  </div>
                                ) : null;
                              })()}
                              
                              {/* Ideological indicators */}
                              <div className="flex items-center gap-3 flex-wrap mb-3">
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-sm",
                                    answer.answer_value < 0 
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                      : answer.answer_value > 0
                                      ? "bg-red-500/10 text-red-600 border-red-500/30"
                                      : "bg-gray-500/10 text-gray-600 border-gray-500/30"
                                  )}
                                >
                                  {getScoreLabelProgCon(answer.answer_value)}
                                </Badge>
                                <ScoreText score={answer.answer_value} size="sm" />
                                {answer.confidence && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    {getConfidenceIcon(answer.confidence)}
                                    {answer.confidence} confidence
                                  </div>
                                )}
                              </div>

                              {/* AI explanation/notes */}
                              {answer.notes && (
                                <p className="text-sm text-muted-foreground mb-3 italic">
                                  {answer.notes}
                                </p>
                              )}

                              {/* Source link */}
                              {answer.source_url && (
                                <a 
                                  href={answer.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    "inline-flex items-center gap-1 text-sm hover:underline",
                                    colors.text
                                  )}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {answer.source_description || 'View Source'}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
