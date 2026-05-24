import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TopicSelector } from '@/components/TopicSelector';
import { TopicIcon } from '@/components/TopicIcon';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreText } from '@/components/ScoreText';
import { DemographicsForm, DemographicsData } from '@/components/DemographicsForm';
import { useAuth } from '@/context/AuthContext';
import { useTopics, useAllCanonicalQuestions, useCanonicalQuestions } from '@/hooks/useCandidates';
import { useSaveQuizResults, useSaveUserTopics, useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { OnboardingStep, Topic, QuestionOption, QuizAnswer, TopicScore } from '@/types';
import { calculateQuizScore } from '@/lib/score';
import { ArrowRight, ArrowLeft, Sparkles, Target, CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import { toast } from 'sonner';

type ExtendedOnboardingStep = OnboardingStep | 'demographics' | 'local_topics' | 'local_quiz';

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

  // Local topics state
  const [selectedLocalTopics, setSelectedLocalTopics] = useState<Topic[]>([]);
  const [localQuizAnswers, setLocalQuizAnswers] = useState<QuizAnswer[]>([]);
  const [currentLocalQuestionIndex, setCurrentLocalQuestionIndex] = useState(0);
  const [skippedLocalQuestionIds, setSkippedLocalQuestionIds] = useState<Set<string>>(new Set());

  // Get selected topic IDs in order (for saving user topics)
  const selectedTopicIds = useMemo(() => selectedTopics.map(t => t.id), [selectedTopics]);
  const selectedLocalTopicIds = useMemo(() => selectedLocalTopics.map(t => t.id), [selectedLocalTopics]);
  
  // Fetch ALL canonical onboarding questions for federal topics
  const { data: canonicalQuestions = [], isLoading: questionsLoading } = useAllCanonicalQuestions();

  // Fetch canonical questions for selected local topics
  const { data: localCanonicalQuestions = [], isLoading: localQuestionsLoading } = useCanonicalQuestions(selectedLocalTopicIds);

  // Transform database topics to app format — federal topics only
  const topics: Topic[] = dbTopics
    .filter(t => (t as any).scope !== 'local')
    .map(t => ({
      id: t.id,
      name: t.name,
      displayName: (t as any).display_name || undefined,
      icon: t.icon,
      weight: t.weight || 1,
    }));

  // Local topics
  const localTopics: Topic[] = dbTopics
    .filter(t => (t as any).scope === 'local')
    .map(t => ({
      id: t.id,
      name: t.name,
      displayName: (t as any).display_name || undefined,
      icon: t.icon,
      weight: t.weight || 1,
    }));

  // Transform federal questions to app format
  const questions = useMemo(() => canonicalQuestions.map(q => ({
    id: q.id,
    topicId: q.topic_id,
    text: q.text,
    options: (q.options || []).map((o: any) => ({
      id: o.id,
      text: o.text,
      value: o.value,
      is_skip_option: o.is_skip_option ?? false,
    })),
  })), [canonicalQuestions]);

  // Transform local questions to app format
  const localQuestions = useMemo(() => localCanonicalQuestions.map(q => ({
    id: q.id,
    topicId: q.topic_id,
    text: q.text,
    options: (q.options || []).map((o: any) => ({
      id: o.id,
      text: o.text,
      value: o.value,
      is_skip_option: o.is_skip_option ?? false,
    })),
  })), [localCanonicalQuestions]);

  // Filter out skipped questions to get active questions
  const activeQuestions = useMemo(() => 
    questions.filter(q => !skippedQuestionIds.has(q.id)),
  [questions, skippedQuestionIds]);

  const activeLocalQuestions = useMemo(() =>
    localQuestions.filter(q => !skippedLocalQuestionIds.has(q.id)),
  [localQuestions, skippedLocalQuestionIds]);

  // Dynamic minimum: at least 50% of available questions, minimum of 1
  const minRequiredAnswers = useMemo(() => 
    Math.max(1, Math.ceil(questions.length / 2)),
  [questions.length]);

  // Clamp currentQuestionIndex when activeQuestions shrinks
  useEffect(() => {
    if (activeQuestions.length > 0 && currentQuestionIndex >= activeQuestions.length) {
      setCurrentQuestionIndex(activeQuestions.length - 1);
    }
  }, [activeQuestions.length, currentQuestionIndex]);

  // Clamp local question index
  useEffect(() => {
    if (activeLocalQuestions.length > 0 && currentLocalQuestionIndex >= activeLocalQuestions.length) {
      setCurrentLocalQuestionIndex(activeLocalQuestions.length - 1);
    }
  }, [activeLocalQuestions.length, currentLocalQuestionIndex]);

  const handleTopicToggle = (topic: Topic) => {
    setSelectedTopics(prev => {
      const exists = prev.some(t => t.id === topic.id);
      let newTopics: Topic[];
      
      if (exists) {
        newTopics = prev.filter(t => t.id !== topic.id);
      } else if (prev.length < 3) {
        newTopics = [...prev, topic];
      } else {
        return prev;
      }
      
      return newTopics.map((t, index) => ({
        ...t,
        weight: 3 - index
      }));
    });
  };

  const handleLocalTopicToggle = (topic: Topic) => {
    setSelectedLocalTopics(prev => {
      const exists = prev.some(t => t.id === topic.id);
      let newTopics: Topic[];

      if (exists) {
        newTopics = prev.filter(t => t.id !== topic.id);
      } else if (prev.length < 2) {
        newTopics = [...prev, topic];
      } else {
        return prev;
      }

      return newTopics.map((t, index) => ({
        ...t,
        weight: 2 - index
      }));
    });
  };

  const handleOptionSelect = (option: QuestionOption) => {
    const questionId = activeQuestions[currentQuestionIndex].id;
    setQuizAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === questionId);
      const newAnswer = {
        questionId,
        selectedOptionId: option.id,
        value: option.value,
        isSkipped: option.is_skip_option ?? false,
      };
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = newAnswer;
        return updated;
      }
      return [...prev, newAnswer];
    });
    
    setTimeout(() => {
      if (currentQuestionIndex < activeQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Federal quiz done → go to local topics
        setStep('local_topics');
      }
    }, 300);
  };

  const handleLocalOptionSelect = (option: QuestionOption) => {
    const questionId = activeLocalQuestions[currentLocalQuestionIndex].id;
    setLocalQuizAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === questionId);
      const newAnswer = {
        questionId,
        selectedOptionId: option.id,
        value: option.value,
        isSkipped: option.is_skip_option ?? false,
      };
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = newAnswer;
        return updated;
      }
      return [...prev, newAnswer];
    });

    setTimeout(() => {
      if (currentLocalQuestionIndex < activeLocalQuestions.length - 1) {
        setCurrentLocalQuestionIndex(prev => prev + 1);
      } else {
        // Local quiz done → calculate and show results
        const scores = calculateUserScore();
        setCalculatedScores(scores);
        setStep('results');
      }
    }, 300);
  };

  const handleSkipQuestion = () => {
    const currentQuestion = activeQuestions[currentQuestionIndex];
    const newSkippedIds = new Set([...skippedQuestionIds, currentQuestion.id]);
    setSkippedQuestionIds(newSkippedIds);
    
    const currentAnswerCount = quizAnswers.length;
    
    if (currentQuestionIndex >= activeQuestions.length - 1) {
      if (currentAnswerCount >= minRequiredAnswers) {
        setStep('local_topics');
      } else {
        toast.error(`Please answer at least ${minRequiredAnswers} questions to continue.`);
      }
    }
  };

  const handleLocalSkipQuestion = () => {
    const currentQuestion = activeLocalQuestions[currentLocalQuestionIndex];
    const newSkippedIds = new Set([...skippedLocalQuestionIds, currentQuestion.id]);
    setSkippedLocalQuestionIds(newSkippedIds);

    if (currentLocalQuestionIndex >= activeLocalQuestions.length - 1) {
      if (localQuizAnswers.length >= 1) {
        const scores = calculateUserScore();
        setCalculatedScores(scores);
        setStep('results');
      } else {
        toast.error('Please answer at least 1 local question to continue.');
      }
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < activeQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setStep('local_topics');
    }
  };

  const handleLocalNextQuestion = () => {
    if (currentLocalQuestionIndex < activeLocalQuestions.length - 1) {
      setCurrentLocalQuestionIndex(prev => prev + 1);
    } else {
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

  const handleLocalPrevQuestion = () => {
    if (currentLocalQuestionIndex > 0) {
      setCurrentLocalQuestionIndex(prev => prev - 1);
    }
  };

  const calculateUserScore = () => {
    // Build weights for federal topics
    const allTopicsWithWeights = topics.map(t => {
      const priorityIndex = selectedTopics.findIndex(st => st.id === t.id);
      return {
        id: t.id,
        weight: priorityIndex >= 0 ? (3 - priorityIndex) : 1
      };
    });

    // Add local topic weights
    const localTopicWeights = selectedLocalTopics.map((t, index) => ({
      id: t.id,
      weight: 2 - index, // 2 for first, 1 for second
    }));

    const combinedWeights = [...allTopicsWithWeights, ...localTopicWeights];
    const allAnswers = [...quizAnswers, ...localQuizAnswers];
    const allQuestionMeta = [
      ...questions.map(q => ({ id: q.id, topicId: q.topicId })),
      ...localQuestions.map(q => ({ id: q.id, topicId: q.topicId })),
    ];
    const allTopicNames = [
      ...topics.map(t => ({ id: t.id, name: t.name })),
      ...selectedLocalTopics.map(t => ({ id: t.id, name: t.displayName || t.name })),
    ];

    return calculateQuizScore(
      allAnswers,
      allQuestionMeta,
      combinedWeights,
      allTopicNames
    );
  };

  const handleComplete = async () => {
    if (!calculatedScores) return;
    
    // Deduplicate by questionId — local answers take priority over federal
    const allAnswers = [...quizAnswers];
    for (const la of localQuizAnswers) {
      const idx = allAnswers.findIndex(a => a.questionId === la.questionId);
      if (idx >= 0) allAnswers[idx] = la;
      else allAnswers.push(la);
    }
    
    if (allAnswers.length < minRequiredAnswers) {
      toast.error(`Please answer at least ${minRequiredAnswers} questions before continuing.`);
      return;
    }

    try {
      // Save all 5 topic IDs (3 federal + 2 local) with weights
      const allTopicIds = [...selectedTopicIds, ...selectedLocalTopicIds];
      await saveUserTopics.mutateAsync(allTopicIds);
      
      // Save all quiz results (federal + local answers combined)
      await saveQuizResults.mutateAsync({
        overallScore: calculatedScores.overall,
        topicScores: calculatedScores.byTopic.map(ts => ({
          topicId: ts.topicId,
          score: ts.score,
        })),
        answers: allAnswers,
      });

      toast.success('Profile created successfully!');
      navigate('/results');
    } catch (error) {
      console.error('Error saving quiz results:', error);
      toast.error('Failed to save your results. Please try again.');
    }
  };

  // Calculate if user can complete
  const allDisplayAnswers = [...quizAnswers, ...localQuizAnswers];
  const canComplete = allDisplayAnswers.length >= minRequiredAnswers;
  const skippedCount = skippedQuestionIds.size + skippedLocalQuestionIds.size;

  const currentAnswer = quizAnswers.find(
    a => a.questionId === activeQuestions[currentQuestionIndex]?.id
  );

  const currentLocalAnswer = localQuizAnswers.find(
    a => a.questionId === activeLocalQuestions[currentLocalQuestionIndex]?.id
  );

  // Get current question's topic for display
  const currentQuestionTopic = useMemo(() => {
    if (activeQuestions.length === 0 || currentQuestionIndex >= activeQuestions.length) return null;
    const topicId = activeQuestions[currentQuestionIndex]?.topicId;
    return topics.find(t => t.id === topicId);
  }, [currentQuestionIndex, activeQuestions, topics]);

  const currentLocalQuestionTopic = useMemo(() => {
    if (activeLocalQuestions.length === 0 || currentLocalQuestionIndex >= activeLocalQuestions.length) return null;
    const topicId = activeLocalQuestions[currentLocalQuestionIndex]?.topicId;
    return localTopics.find(t => t.id === topicId);
  }, [currentLocalQuestionIndex, activeLocalQuestions, localTopics]);

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
        religion: data.religion,
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
                  <h3 className="font-semibold text-foreground">Select Your Top Topics</h3>
                  <p className="text-sm text-muted-foreground">3 federal issues + 2 local issues that matter most</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Answer 24 Questions</h3>
                  <p className="text-sm text-muted-foreground">20 federal questions + 4 local questions</p>
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
              religion: profile?.religion || '',
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
                Select Your Top 3 Federal Topics
              </h2>
              <p className="text-muted-foreground">
                Choose the 3 federal issues that matter most to you. Order matters - select most important first!
                <span className="text-foreground font-medium"> ({selectedTopics.length}/3 selected)</span>
              </p>
            </div>

            <TopicSelector
              topics={topics}
              selectedTopics={selectedTopics}
              onToggle={handleTopicToggle}
              maxSelections={3}
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
                disabled={selectedTopics.length !== 3}
              >
                Continue to Quiz (20 questions)
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

        const currentQuestion = activeQuestions[currentQuestionIndex];
        if (!currentQuestion) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          );
        }
        
        return (
          <div className="max-w-2xl mx-auto">
            <div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
              {currentQuestionTopic && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TopicIcon name={currentQuestionTopic.icon} className="w-6 h-6" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {currentQuestionTopic.name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {activeQuestions.length}
                </span>
                <div className="flex-1 mx-4 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-hero transition-all duration-500 ease-out"
                    style={{ width: `${((currentQuestionIndex + 1) / activeQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
              <h2 className="font-display text-lg md:text-xl font-semibold text-foreground leading-snug text-center">
                {currentQuestion.text}
              </h2>
            </div>

            <div className="mt-6">
              <QuizQuestion
                question={currentQuestion}
                selectedOptionId={currentAnswer?.selectedOptionId || null}
                onSelect={handleOptionSelect}
                onSkip={handleSkipQuestion}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={activeQuestions.length}
                hideHeader
                hideQuestionText
              />
            </div>


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
                {currentQuestionIndex === activeQuestions.length - 1 ? 'Continue to Local Topics' : 'Next Question'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'local_topics':
        return (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                <MapPin className="w-6 h-6 text-primary" />
                <span className="text-sm font-medium text-primary uppercase tracking-wide">Local Issues</span>
              </div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-3">
                Select Your Top 2 Local Topics
              </h2>
              <p className="text-muted-foreground">
                Choose the 2 local issues that matter most in your community. Order matters!
                <span className="text-foreground font-medium"> ({selectedLocalTopics.length}/2 selected)</span>
              </p>
            </div>

            <TopicSelector
              topics={localTopics}
              selectedTopics={selectedLocalTopics}
              onToggle={handleLocalTopicToggle}
              maxSelections={2}
            />

            {selectedLocalTopics.length > 0 && (
              <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border">
                <p className="text-sm font-medium text-foreground mb-2">Your local priority order:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLocalTopics.map((topic, index) => (
                    <span key={topic.id} className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary">
                      {index + 1}. {topic.displayName || topic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-10">
              <Button variant="ghost" onClick={() => setStep('quiz')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Federal Quiz
              </Button>
              <Button 
                size="lg"
                variant="hero"
                onClick={() => {
                  setCurrentLocalQuestionIndex(0);
                  setLocalQuizAnswers([]);
                  setStep('local_quiz');
                }}
                disabled={selectedLocalTopics.length !== 2}
              >
                Continue to Local Quiz (4 questions)
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case 'local_quiz':
        if (localQuestionsLoading) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          );
        }

        if (activeLocalQuestions.length === 0) {
          return (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No local questions available for your selected topics.</p>
              <Button variant="ghost" className="mt-4" onClick={() => setStep('local_topics')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Select different local topics
              </Button>
            </div>
          );
        }

        const currentLocalQuestion = activeLocalQuestions[currentLocalQuestionIndex];
        if (!currentLocalQuestion) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          );
        }

        return (
          <div className="max-w-2xl mx-auto">
            <div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
              <div className="flex items-center justify-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wide">Local Issues</span>
              </div>
              {currentLocalQuestionTopic && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TopicIcon name={currentLocalQuestionTopic.icon} className="w-6 h-6" />
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {currentLocalQuestionTopic.displayName || currentLocalQuestionTopic.name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Question {currentLocalQuestionIndex + 1} of {activeLocalQuestions.length}
                </span>
                <div className="flex-1 mx-4 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-hero transition-all duration-500 ease-out"
                    style={{ width: `${((currentLocalQuestionIndex + 1) / activeLocalQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
              <h2 className="font-display text-lg md:text-xl font-semibold text-foreground leading-snug text-center">
                {currentLocalQuestion.text}
              </h2>
            </div>

            <div className="mt-6">
              <QuizQuestion
                question={currentLocalQuestion}
                selectedOptionId={currentLocalAnswer?.selectedOptionId || null}
                onSelect={handleLocalOptionSelect}
                onSkip={handleLocalSkipQuestion}
                questionNumber={currentLocalQuestionIndex + 1}
                totalQuestions={activeLocalQuestions.length}
                hideHeader
                hideQuestionText
              />
            </div>


            <div className="flex justify-between mt-8">
              <Button 
                variant="ghost" 
                onClick={currentLocalQuestionIndex === 0 ? () => setStep('local_topics') : handleLocalPrevQuestion}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {currentLocalQuestionIndex === 0 ? 'Back to Local Topics' : 'Previous'}
              </Button>
              <Button 
                size="lg"
                variant="hero"
                onClick={handleLocalNextQuestion}
                disabled={!currentLocalAnswer}
              >
                {currentLocalQuestionIndex === activeLocalQuestions.length - 1 ? 'See Results' : 'Next Question'}
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

            {skippedCount > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20 mb-6 text-left">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {skippedCount} question{skippedCount !== 1 ? 's' : ''} skipped
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your score is based on {allDisplayAnswers.length} of {allDisplayAnswers.length + skippedCount} questions.
                  </p>
                </div>
              </div>
            )}

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
              disabled={saveQuizResults.isPending || saveUserTopics.isPending || !canComplete}
              className="w-full"
              title={!canComplete ? `Answer at least ${minRequiredAnswers} questions to continue` : undefined}
            >
              {saveQuizResults.isPending ? 'Saving...' : 'Explore Politicians'}
              <ArrowRight className="w-5 h-5" />
            </Button>
            
            {!canComplete && (
              <p className="text-sm text-destructive mt-3">
                Please answer at least {minRequiredAnswers} questions to continue.
              </p>
            )}
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
