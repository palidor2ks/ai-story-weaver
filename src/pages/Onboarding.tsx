import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TopicSelector } from '@/components/TopicSelector';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreText } from '@/components/ScoreText';
import { DemographicsForm, DemographicsData } from '@/components/DemographicsForm';
import { useAuth } from '@/context/AuthContext';
import { useTopics, useCanonicalQuestions } from '@/hooks/useCandidates';
import { useSaveQuizResults, useSaveUserTopics, useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { OnboardingStep, Topic, QuestionOption, QuizAnswer, TopicScore } from '@/types';
import { formatScore, getScoreLabel, calculateWeightedScore } from '@/lib/scoreFormat';
import { ArrowRight, ArrowLeft, Sparkles, Target, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ExtendedOnboardingStep = OnboardingStep | 'demographics';

export const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: dbTopics = [], isLoading: topicsLoading } = useTopics();
  
  const saveQuizResults = useSaveQuizResults();
  const saveUserTopics = useSaveUserTopics();
  const updateProfile = useUpdateProfile();
  
  const [step, setStep] = useState<ExtendedOnboardingStep>('welcome');
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [calculatedScores, setCalculatedScores] = useState<{ overall: number; byTopic: TopicScore[] } | null>(null);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(new Set());

  // Get selected topic IDs in order (for canonical question fetching)
  const selectedTopicIds = useMemo(() => selectedTopics.map(t => t.id), [selectedTopics]);
  
  // Fetch canonical questions for selected topics (2 per topic = 10 total for 5 topics)
  const { data: canonicalQuestions = [], isLoading: questionsLoading } = useCanonicalQuestions(selectedTopicIds);

  // Transform database topics to app format
  const topics: Topic[] = dbTopics.map(t => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    weight: t.weight || 1,
  }));

  // Transform questions to app format
  const questions = useMemo(() => canonicalQuestions.map(q => ({
    id: q.id,
    topicId: q.topic_id,
    text: q.text,
    options: (q.options || []).map((o: any) => ({
      id: o.id,
      text: o.text,
      value: o.value,
    })),
  })), [canonicalQuestions]);

  // Filter out skipped questions to get active questions
  const activeQuestions = useMemo(() => 
    questions.filter(q => !skippedQuestionIds.has(q.id)),
  [questions, skippedQuestionIds]);

  const handleTopicToggle = (topic: Topic) => {
    const exists = selectedTopics.some(t => t.id === topic.id);
    if (exists) {
      setSelectedTopics(selectedTopics.filter(t => t.id !== topic.id));
    } else if (selectedTopics.length < 5) {
      // Add with weight based on position (first selected = highest weight)
      setSelectedTopics([...selectedTopics, { ...topic, weight: 5 - selectedTopics.length }]);
    }
  };

  const handleOptionSelect = (option: QuestionOption) => {
    const questionId = activeQuestions[currentQuestionIndex].id;
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
    
    // Auto-advance to next question after a short delay
    setTimeout(() => {
      if (currentQuestionIndex < activeQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Calculate scores and show results
        const scores = calculateUserScore();
        setCalculatedScores(scores);
        setStep('results');
      }
    }, 300);
  };

  const handleSkipQuestion = () => {
    const currentQuestion = activeQuestions[currentQuestionIndex];
    setSkippedQuestionIds(prev => new Set([...prev, currentQuestion.id]));
    
    // Move to next question (the active questions list will be recalculated)
    // If we're at the end, calculate scores
    if (currentQuestionIndex >= activeQuestions.length - 1) {
      const scores = calculateUserScore();
      setCalculatedScores(scores);
      setStep('results');
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < activeQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Calculate scores
      const scores = calculateUserScore();
      setCalculatedScores(scores);
      setStep('results');
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const calculateUserScore = (): { overall: number; byTopic: TopicScore[] } => {
    // Group answers by topic
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

    // Calculate score for each topic (average of answers, already in -10 to +10 range)
    const topicScores: TopicScore[] = Object.entries(topicAnswers).map(([topicId, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      // Round to 2 decimals
      const score = Math.round(avg * 100) / 100;
      const topic = topics.find(t => t.id === topicId);
      return {
        topicId,
        topicName: topic?.name || topicId,
        score,
      };
    });

    // Calculate weighted overall score using PRD weighting
    const overallScore = calculateWeightedScore(
      topicScores.map(ts => ({ topicId: ts.topicId, score: ts.score })),
      selectedTopicIds
    );

    return { overall: overallScore, byTopic: topicScores };
  };

  const handleComplete = async () => {
    if (!calculatedScores) return;

    try {
      // Save user topics with proper weights
      await saveUserTopics.mutateAsync(selectedTopicIds);
      
      // Save quiz results
      await saveQuizResults.mutateAsync({
        overallScore: calculatedScores.overall,
        topicScores: calculatedScores.byTopic.map(ts => ({
          topicId: ts.topicId,
          score: ts.score,
        })),
        answers: quizAnswers,
      });

      toast.success('Profile created successfully!');
      navigate('/results');
    } catch (error) {
      console.error('Error saving quiz results:', error);
      toast.error('Failed to save your results. Please try again.');
    }
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === activeQuestions[currentQuestionIndex]?.id
  );

  // Get current question's topic for display
  const currentQuestionTopic = useMemo(() => {
    if (activeQuestions.length === 0 || currentQuestionIndex >= activeQuestions.length) return null;
    const topicId = activeQuestions[currentQuestionIndex]?.topicId;
    return topics.find(t => t.id === topicId);
  }, [currentQuestionIndex, activeQuestions, topics]);

  if (topicsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const handleDemographicsSubmit = async (data: DemographicsData) => {
    try {
      await updateProfile.mutateAsync({
        address: data.address,
        political_party: data.political_party,
        age: data.age,
        income: data.income,
        sex: data.sex,
      });
      setStep('topics');
    } catch (error) {
      console.error('Error saving demographics:', error);
      toast.error('Failed to save your information. Please try again.');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="text-center max-w-2xl mx-auto animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-hero mx-auto mb-8 flex items-center justify-center shadow-glow">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Welcome, <span className="text-gradient">{profile?.name || 'Voter'}</span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Let's discover your political alignment on the Left-Right spectrum and find candidates who share your values.
            </p>

            <div className="space-y-4 mb-10">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-agree/10 flex items-center justify-center">
                  <Target className="w-6 h-6 text-agree" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Select Your Top 5 Topics</h3>
                  <p className="text-sm text-muted-foreground">Choose the issues that matter most to you</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Answer 10 Questions</h3>
                  <p className="text-sm text-muted-foreground">2 questions for each of your top topics</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Get Your L/R Score</h3>
                  <p className="text-sm text-muted-foreground">See where you stand from L10 (Left) to R10 (Right)</p>
                </div>
              </div>
            </div>

            <Button 
              size="xl" 
              variant="hero"
              onClick={() => setStep('demographics')}
              className="w-full"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        );

      case 'demographics':
        return (
          <DemographicsForm
            initialData={{
              address: profile?.address || '',
              political_party: profile?.political_party || '',
              age: profile?.age || null,
              income: profile?.income || '',
              sex: profile?.sex || '',
            }}
            onSubmit={handleDemographicsSubmit}
            onBack={() => setStep('welcome')}
            isLoading={updateProfile.isPending}
          />
        );

      case 'topics':
        return (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold text-foreground mb-3">
                Select Your Top 5 Topics
              </h2>
              <p className="text-muted-foreground">
                Choose the 5 issues that matter most to you. Order matters - select most important first!
                <span className="text-foreground font-medium"> ({selectedTopics.length}/5 selected)</span>
              </p>
            </div>

            <TopicSelector
              topics={topics}
              selectedTopics={selectedTopics}
              onToggle={handleTopicToggle}
            />

            {selectedTopics.length > 0 && (
              <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border">
                <p className="text-sm font-medium text-foreground mb-2">Your priority order:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTopics.map((topic, index) => (
                    <span key={topic.id} className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary">
                      {index + 1}. {topic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-10">
              <Button variant="ghost" onClick={() => setStep('demographics')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                size="lg"
                variant="hero"
                onClick={() => {
                  setCurrentQuestionIndex(0);
                  setQuizAnswers([]);
                  setStep('quiz');
                }}
                disabled={selectedTopics.length !== 5}
              >
                Continue to Quiz ({selectedTopics.length === 5 ? '10 questions' : `${selectedTopics.length * 2} questions`})
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'quiz':
        if (questionsLoading) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          );
        }
        
        if (activeQuestions.length === 0) {
          return (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No questions available for your selected topics.</p>
              <Button variant="ghost" className="mt-4" onClick={() => setStep('topics')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Select different topics
              </Button>
            </div>
          );
        }
        
        return (
          <div className="max-w-2xl mx-auto">
            {/* Topic indicator */}
            {currentQuestionTopic && (
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-2xl">{currentQuestionTopic.icon}</span>
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {currentQuestionTopic.name}
                </span>
              </div>
            )}
            
            <QuizQuestion
              question={activeQuestions[currentQuestionIndex]}
              selectedOptionId={currentAnswer?.selectedOptionId || null}
              onSelect={handleOptionSelect}
              onSkip={handleSkipQuestion}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={activeQuestions.length}
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
                {currentQuestionIndex === activeQuestions.length - 1 ? 'See Results' : 'Next Question'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'results':
        const scores = calculatedScores || { overall: 0, byTopic: [] };
        return (
          <div className="max-w-2xl mx-auto text-center animate-fade-in">
            <div className="w-24 h-24 rounded-2xl bg-gradient-hero mx-auto mb-8 flex items-center justify-center shadow-glow animate-pulse-subtle">
              <CheckCircle className="w-12 h-12 text-primary-foreground" />
            </div>

            <h2 className="font-display text-3xl font-bold text-foreground mb-3">
              Your Political Profile
            </h2>
            <p className="text-muted-foreground mb-10">
              Based on your answers, here's where you stand on the Left-Right spectrum.
            </p>

            <div className="bg-card rounded-2xl border border-border p-6 mb-8 shadow-elevated">
              <div className="text-center mb-8">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Overall Score
                </span>
                <div className="mt-4">
                  <ScoreText score={scores.overall} size="lg" showLabel />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Score Version: v1.0
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-left">
                  By Topic
                </h4>
                {scores.byTopic.map((ts, index) => (
                  <div 
                    key={ts.topicId} 
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className="font-medium text-foreground">{ts.topicName}</span>
                    <ScoreText score={ts.score} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <Button 
              size="xl"
              variant="hero"
              onClick={handleComplete}
              disabled={saveQuizResults.isPending || saveUserTopics.isPending}
              className="w-full"
            >
              {saveQuizResults.isPending ? 'Saving...' : 'Explore Politicians'}
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
