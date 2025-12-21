import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TopicSelector } from '@/components/TopicSelector';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreBar } from '@/components/ScoreBar';
import { DemographicsForm, DemographicsData } from '@/components/DemographicsForm';
import { useAuth } from '@/context/AuthContext';
import { useTopics, useQuestions } from '@/hooks/useCandidates';
import { useSaveQuizResults, useSaveUserTopics, useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { OnboardingStep, Topic, QuestionOption, QuizAnswer, TopicScore } from '@/types';
import { ArrowRight, ArrowLeft, Sparkles, Target, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ExtendedOnboardingStep = OnboardingStep | 'demographics';

export const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: dbTopics = [], isLoading: topicsLoading } = useTopics();
  const { data: dbQuestions = [], isLoading: questionsLoading } = useQuestions();
  
  const saveQuizResults = useSaveQuizResults();
  const saveUserTopics = useSaveUserTopics();
  const updateProfile = useUpdateProfile();
  
  const [step, setStep] = useState<ExtendedOnboardingStep>('welcome');
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [calculatedScores, setCalculatedScores] = useState<{ overall: number; byTopic: TopicScore[] } | null>(null);

  // Transform database topics to app format
  const topics: Topic[] = dbTopics.map(t => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    weight: t.weight || 1,
  }));

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

  const handleTopicToggle = (topic: Topic) => {
    const exists = selectedTopics.some(t => t.id === topic.id);
    if (exists) {
      setSelectedTopics(selectedTopics.filter(t => t.id !== topic.id));
    } else if (selectedTopics.length < 5) {
      setSelectedTopics([...selectedTopics, { ...topic, weight: 1 }]);
    }
  };

  const handleOptionSelect = (option: QuestionOption) => {
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

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
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

    // Calculate score for each topic
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

    // Calculate overall score
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

  const handleComplete = async () => {
    if (!calculatedScores) return;

    try {
      // Save user topics
      await saveUserTopics.mutateAsync(selectedTopics.map(t => t.id));
      
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
      navigate('/feed');
    } catch (error) {
      console.error('Error saving quiz results:', error);
      toast.error('Failed to save your results. Please try again.');
    }
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === questions[currentQuestionIndex]?.id
  );

  if (topicsLoading || questionsLoading) {
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
              Let's discover your political alignment and find candidates who share your values.
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
        if (questions.length === 0) {
          return (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No questions available.</p>
            </div>
          );
        }
        
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
