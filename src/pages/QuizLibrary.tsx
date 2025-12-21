import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTopics, useQuestions } from '@/hooks/useCandidates';
import { useUserTopicScores } from '@/hooks/useProfile';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { BookOpen, CheckCircle, ArrowRight, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const QuizLibrary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: topics = [], isLoading: topicsLoading } = useTopics();
  const { data: questions = [] } = useQuestions();
  const { data: userTopicScores = [] } = useUserTopicScores();

  // Fetch user's answered questions
  const { data: answeredQuestions = [] } = useQuery({
    queryKey: ['answered_questions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('quiz_answers')
        .select('question_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return data.map(a => a.question_id);
    },
    enabled: !!user,
  });

  // Get question count per topic
  const getQuestionCount = (topicId: string) => {
    return questions.filter(q => q.topic_id === topicId).length;
  };

  // Get answered count per topic
  const getAnsweredCount = (topicId: string) => {
    const topicQuestions = questions.filter(q => q.topic_id === topicId);
    return topicQuestions.filter(q => answeredQuestions.includes(q.id)).length;
  };

  // Get user's score for a topic
  const getTopicScore = (topicId: string) => {
    const score = userTopicScores.find(ts => ts.topic_id === topicId);
    return score?.score;
  };

  // Check if user has answered questions for this topic
  const hasCompletedTopic = (topicId: string) => {
    return userTopicScores.some(ts => ts.topic_id === topicId);
  };

  const totalAnswered = answeredQuestions.length;
  const totalQuestions = questions.length;

  if (topicsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Quiz Library
            </h1>
            <p className="text-muted-foreground">
              Answer all available questions to refine your political profile
            </p>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-foreground">{topics.length}</p>
                <p className="text-sm text-muted-foreground">Topics</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-foreground">{totalQuestions}</p>
                <p className="text-sm text-muted-foreground">Questions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-foreground">{totalAnswered}</p>
                <p className="text-sm text-muted-foreground">Answered</p>
              </CardContent>
            </Card>
          </div>

          {/* Answer All Questions Button */}
          <Card className="mb-8 border-primary/30 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                    <PlayCircle className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      Answer All Questions
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Go through all {totalQuestions} questions across all topics
                    </p>
                  </div>
                </div>
                <Button
                  size="lg"
                  variant="hero"
                  onClick={() => navigate('/quiz')}
                  className="gap-2"
                >
                  Start
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
              {totalAnswered > 0 && (
                <div className="mt-4 pt-4 border-t border-primary/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">
                      {totalAnswered} / {totalQuestions} answered
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(totalAnswered / totalQuestions) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Topic List */}
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">
            By Topic
          </h2>
          <div className="space-y-4">
            {topics.map((topic, index) => {
              const questionCount = getQuestionCount(topic.id);
              const answeredCount = getAnsweredCount(topic.id);
              const topicScore = getTopicScore(topic.id);
              const completed = hasCompletedTopic(topic.id);

              return (
                <Card 
                  key={topic.id} 
                  className={cn(
                    "group hover:shadow-lg transition-all duration-200 animate-slide-up",
                    completed && "border-primary/30"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                          completed ? "bg-primary/10" : "bg-secondary"
                        )}>
                          {topic.icon}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-display text-lg font-semibold text-foreground">
                              {topic.name}
                            </h3>
                            {answeredCount === questionCount && questionCount > 0 && (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-muted-foreground">
                              {answeredCount}/{questionCount} answered
                            </span>
                            
                            {topicScore !== undefined && (
                              <ScoreDisplay score={topicScore} size="sm" />
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant={completed ? "outline" : "default"}
                        size="sm"
                        onClick={() => navigate(`/quiz?topic=${topic.id}`)}
                        className="gap-2"
                      >
                        {completed ? 'Retake' : 'Start'}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Info */}
          <div className="mt-8 p-4 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-sm text-muted-foreground">
              Retaking a quiz will update your score for that topic. Your overall score is calculated from your top 5 priority topics.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
