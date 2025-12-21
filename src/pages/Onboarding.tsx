import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TopicSelector } from '@/components/TopicSelector';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreBar } from '@/components/ScoreBar';
import { useUser } from '@/context/UserContext';
import { topics, questions } from '@/data/mockData';
import { OnboardingStep, Topic, QuestionOption } from '@/types';
import { ArrowRight, ArrowLeft, Sparkles, Target, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Onboarding = () => {
  const navigate = useNavigate();
  const { 
    selectedTopics, 
    setSelectedTopics, 
    addQuizAnswer, 
    quizAnswers,
    completeOnboarding,
    calculateUserScore 
  } = useUser();
  
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const handleTopicToggle = (topic: Topic) => {
    const exists = selectedTopics.some(t => t.id === topic.id);
    if (exists) {
      setSelectedTopics(selectedTopics.filter(t => t.id !== topic.id));
    } else if (selectedTopics.length < 5) {
      setSelectedTopics([...selectedTopics, { ...topic, weight: 1 }]);
    }
  };

  const handleOptionSelect = (option: QuestionOption) => {
    addQuizAnswer({
      questionId: questions[currentQuestionIndex].id,
      selectedOptionId: option.id,
      value: option.value,
    });
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setStep('results');
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    completeOnboarding(name);
    navigate('/feed');
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === questions[currentQuestionIndex]?.id
  );

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="text-center max-w-2xl mx-auto animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-hero mx-auto mb-8 flex items-center justify-center shadow-glow">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Welcome to <span className="text-gradient">Pulse</span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Understand your political alignment and discover how you match with politicians 
              based on real data—not rhetoric.
            </p>

            <div className="space-y-4 mb-10">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-agree/10 flex items-center justify-center">
                  <Target className="w-6 h-6 text-agree" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Take a Quick Quiz</h3>
                  <p className="text-sm text-muted-foreground">Answer questions about issues you care about</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Get Your Score</h3>
                  <p className="text-sm text-muted-foreground">See where you stand on the political spectrum</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Compare & Explore</h3>
                  <p className="text-sm text-muted-foreground">Match with politicians based on real voting records</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                placeholder="Enter your name to get started"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-14 text-lg text-center"
              />
              
              <Button 
                size="xl" 
                variant="hero"
                onClick={() => setStep('topics')}
                disabled={!name.trim()}
                className="w-full"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'topics':
        return (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold text-foreground mb-3">
                What matters most to you?
              </h2>
              <p className="text-muted-foreground">
                Select up to 5 topics that influence your political views. 
                <span className="text-foreground font-medium"> ({selectedTopics.length}/5 selected)</span>
              </p>
            </div>

            <TopicSelector
              topics={topics}
              selectedTopics={selectedTopics}
              onToggle={handleTopicToggle}
            />

            <div className="flex justify-between mt-10">
              <Button variant="ghost" onClick={() => setStep('welcome')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                size="lg"
                variant="hero"
                onClick={() => setStep('quiz')}
                disabled={selectedTopics.length === 0}
              >
                Continue to Quiz
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'quiz':
        return (
          <div className="max-w-2xl mx-auto">
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
                onClick={currentQuestionIndex === 0 ? () => setStep('topics') : handlePrevQuestion}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {currentQuestionIndex === 0 ? 'Back to Topics' : 'Previous'}
              </Button>
              <Button 
                size="lg"
                variant="hero"
                onClick={handleNextQuestion}
                disabled={!currentAnswer}
              >
                {currentQuestionIndex === questions.length - 1 ? 'See Results' : 'Next Question'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'results':
        const scores = calculateUserScore();
        return (
          <div className="max-w-2xl mx-auto text-center animate-fade-in">
            <div className="w-24 h-24 rounded-2xl bg-gradient-hero mx-auto mb-8 flex items-center justify-center shadow-glow animate-pulse-subtle">
              <CheckCircle className="w-12 h-12 text-primary-foreground" />
            </div>

            <h2 className="font-display text-3xl font-bold text-foreground mb-3">
              Your Political Profile
            </h2>
            <p className="text-muted-foreground mb-10">
              Based on your answers, here's where you stand on key issues.
            </p>

            <div className="bg-card rounded-2xl border border-border p-6 mb-8 shadow-elevated">
              <div className="text-center mb-8">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Overall Score
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
              Explore Politicians
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-12 md:py-20 px-4">
        {renderStep()}
      </div>
    </div>
  );
};
