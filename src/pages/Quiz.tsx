import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreBar } from '@/components/ScoreBar';
import { Button } from '@/components/ui/button';
import { useQuestions, useTopics } from '@/hooks/useCandidates';
import { useSaveQuizResults, useUserTopics } from '@/hooks/useProfile';
import { QuizAnswer, TopicScore } from '@/types';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const Quiz = () => {
  const navigate = useNavigate();
  const { data: dbQuestions = [], isLoading: questionsLoading } = useQuestions();
  const { data: dbTopics = [] } = useTopics();
  const { data: userTopics = [] } = useUserTopics();
  const saveQuizResults = useSaveQuizResults();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [calculatedScores, setCalculatedScores] = useState<{ overall: number; byTopic: TopicScore[] } | null>(null);

  // Transform database questions to app format
  const questions = dbQuestions.map(q => ({
    id: q.id,
    topicId: q.topic_id,
    text: q.text,
    options: (q.options || []).map((o: any) => ({
      id: o.id,
      text: o.text,
      value: o.value,
    })),
  }));

  const topics = dbTopics.map(t => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    weight: t.weight || 1,
  }));

  const selectedTopics = userTopics.map(ut => ({
    id: ut.topics?.id || ut.topic_id,
    name: ut.topics?.name || ut.topic_id,
    icon: ut.topics?.icon || '',
    weight: ut.weight,
  }));

  const handleOptionSelect = (option: { id: string; text: string; value: number }) => {
    const questionId = questions[currentQuestionIndex].id;
    setQuizAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === questionId);
      const newAnswer = {
        questionId,
        selectedOptionId: option.id,
        value: option.value,
      };
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = newAnswer;
        return updated;
      }
      return [...prev, newAnswer];
    });
  };

  const calculateUserScore = (): { overall: number; byTopic: TopicScore[] } => {
    const topicAnswers: Record<string, number[]> = {};
    
    quizAnswers.forEach(answer => {
      const question = questions.find(q => q.id === answer.questionId);
      if (question) {
        if (!topicAnswers[question.topicId]) {
          topicAnswers[question.topicId] = [];
        }
        topicAnswers[question.topicId].push(answer.value);
      }
    });

    const topicScores: TopicScore[] = Object.entries(topicAnswers).map(([topicId, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const normalizedScore = Math.round(avg * 10);
      const topic = topics.find(t => t.id === topicId);
      return {
        topicId,
        topicName: topic?.name || topicId,
        score: normalizedScore,
      };
    });

    let overallScore = 0;
    let totalWeight = 0;
    
    topicScores.forEach(ts => {
      const selectedTopic = selectedTopics.find(st => st.id === ts.topicId);
      const weight = selectedTopic?.weight || 1;
      overallScore += ts.score * weight;
      totalWeight += weight;
    });

    if (totalWeight > 0) {
      overallScore = Math.round(overallScore / totalWeight);
    }

    return { overall: overallScore, byTopic: topicScores };
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      const scores = calculateUserScore();
      setCalculatedScores(scores);
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    if (!calculatedScores) return;

    try {
      await saveQuizResults.mutateAsync({
        overallScore: calculatedScores.overall,
        topicScores: calculatedScores.byTopic.map(ts => ({
          topicId: ts.topicId,
          score: ts.score,
        })),
        answers: quizAnswers,
      });

      toast.success('Quiz results saved!');
      navigate('/profile');
    } catch (error) {
      console.error('Error saving quiz results:', error);
      toast.error('Failed to save your results. Please try again.');
    }
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === questions[currentQuestionIndex]?.id
  );

  if (questionsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (showResults && calculatedScores) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 max-w-2xl">
          <div className="text-center animate-fade-in">
            <div className="w-24 h-24 rounded-2xl bg-gradient-hero mx-auto mb-8 flex items-center justify-center shadow-glow animate-pulse-subtle">
              <CheckCircle className="w-12 h-12 text-primary-foreground" />
            </div>

            <h2 className="font-display text-3xl font-bold text-foreground mb-3">
              Quiz Complete!
            </h2>
            <p className="text-muted-foreground mb-10">
              Here's your updated political profile based on your latest answers.
            </p>

            <div className="bg-card rounded-2xl border border-border p-6 mb-8 shadow-elevated">
              <div className="text-center mb-8">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  New Overall Score
                </span>
                <div className={cn(
                  "text-5xl font-display font-bold mt-2",
                  calculatedScores.overall >= 30 && "text-agree",
                  calculatedScores.overall <= -30 && "text-disagree",
                  calculatedScores.overall > -30 && calculatedScores.overall < 30 && "text-accent"
                )}>
                  {calculatedScores.overall > 0 ? '+' : ''}{calculatedScores.overall}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {calculatedScores.overall >= 30 ? 'Leans Progressive' : 
                   calculatedScores.overall <= -30 ? 'Leans Conservative' : 
                   'Moderate / Centrist'}
                </p>
              </div>

              <div className="space-y-4">
                {calculatedScores.byTopic.map((ts, index) => (
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
            </div>

            <Button 
              size="xl"
              variant="hero"
              onClick={handleComplete}
              disabled={saveQuizResults.isPending}
              className="w-full"
            >
              {saveQuizResults.isPending ? 'Saving...' : 'Save & View Profile'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground">No questions available.</p>
          <Button className="mt-4" onClick={() => navigate('/profile')}>
            Back to Profile
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 px-4 max-w-2xl">
        <QuizQuestion
          question={questions[currentQuestionIndex]}
          selectedOptionId={currentAnswer?.selectedOptionId || null}
          onSelect={handleOptionSelect}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={questions.length}
        />

        <div className="flex justify-between mt-8">
          <Button 
            variant="ghost" 
            onClick={handlePrev}
            disabled={currentQuestionIndex === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button 
            size="lg"
            variant="hero"
            onClick={handleNext}
            disabled={!currentAnswer}
          >
            {currentQuestionIndex === questions.length - 1 ? 'See Results' : 'Next Question'}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </main>
    </div>
  );
};
