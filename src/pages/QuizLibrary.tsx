import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTopics, useQuestions } from '@/hooks/useCandidates';
import { useUserTopicScores } from '@/hooks/useProfile';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { BookOpen, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const QuizLibrary = () => {
  const navigate = useNavigate();
  const { data: topics = [], isLoading: topicsLoading } = useTopics();
  const { data: questions = [] } = useQuestions();
  const { data: userTopicScores = [] } = useUserTopicScores();

  // Get question count per topic
  const getQuestionCount = (topicId: string) => {
    return questions.filter(q => q.topic_id === topicId).length;
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
              Explore quizzes by topic to refine your political profile
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
                <p className="text-3xl font-bold text-foreground">{questions.length}</p>
                <p className="text-sm text-muted-foreground">Questions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-foreground">{userTopicScores.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Topic List */}
          <div className="space-y-4">
            {topics.map((topic, index) => {
              const questionCount = getQuestionCount(topic.id);
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
                            {completed && (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-muted-foreground">
                              {questionCount} question{questionCount !== 1 ? 's' : ''}
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
