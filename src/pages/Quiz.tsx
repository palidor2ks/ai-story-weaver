import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreBar } from '@/components/ScoreBar';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { questions } from '@/data/mockData';
import { QuestionOption } from '@/types';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Quiz = () => {
  const navigate = useNavigate();
  const { 
    user, 
    setUser, 
    addQuizAnswer, 
    quizAnswers, 
    clearQuizAnswers,
    calculateUserScore 
  } = useUser();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);

  const handleOptionSelect = (option: QuestionOption) => {
    addQuizAnswer({
      questionId: questions[currentQuestionIndex].id,
      selectedOptionId: option.id,
      value: option.value,
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    const scores = calculateUserScore();
    if (user) {
      setUser({
        ...user,
        overallScore: scores.overall,
        topicScores: scores.byTopic,
        quizHistory: [
          ...user.quizHistory,
          {
            id: crypto.randomUUID(),
            userId: user.id,
            timestamp: new Date(),
            answers: quizAnswers,
            resultingScore: scores.overall,
          }
        ]
      });
    }
    clearQuizAnswers();
    navigate('/profile');
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === questions[currentQuestionIndex]?.id
  );

  if (showResults) {
    const scores = calculateUserScore();
    
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
                  scores.overall >= 30 && "text-agree",
                  scores.overall <= -30 && "text-disagree",
                  scores.overall > -30 && scores.overall < 30 && "text-accent"
                )}>
                  {scores.overall > 0 ? '+' : ''}{scores.overall}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {scores.overall >= 30 ? 'Leans Progressive' : 
                   scores.overall <= -30 ? 'Leans Conservative' : 
                   'Moderate / Centrist'}
                </p>
              </div>

              <div className="space-y-4">
                {scores.byTopic.map((ts, index) => (
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
              className="w-full"
            >
              Save & View Profile
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
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
