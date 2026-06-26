import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TopicSelector } from '@/components/TopicSelector';
import { TopicIcon } from '@/components/TopicIcon';
import { QuizQuestion } from '@/components/QuizQuestion';
import { ScoreText } from '@/components/ScoreText';
import { DemographicsForm, DemographicsData } from '@/components/DemographicsForm';
import { useAuth } from '@/context/AuthContext';
import { useTopics, useAllCanonicalQuestions, useCanonicalQuestions } from '@/hooks/useCandidates';
import { useSaveQuizResults, useSaveUserTopics, useProfile, useUpdateProfile, useHasCompletedOnboarding } from '@/hooks/useProfile';
import { OnboardingStep, Topic, QuestionOption, QuizAnswer, TopicScore } from '@/types';
import { calculateQuizScore } from '@/lib/score';
import { ArrowRight, ArrowLeft, Sparkles, Target, CheckCircle, AlertTriangle, MapPin, HelpCircle, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';

type ExtendedOnboardingStep = OnboardingStep | 'demographics' | 'local_topics' | 'local_quiz';

export const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();
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

  type DbTopicExt = typeof dbTopics[number] & { scope?: string; display_name?: string };
  type QuestionOption = { id: string; text: string; value: number; is_skip_option?: boolean };

  // Transform database topics to app format — federal topics only
  const topics: Topic[] = dbTopics
    .filter(t => (t as DbTopicExt).scope !== 'local')
    .map(t => ({
      id: t.id,
      name: t.name,
      displayName: (t as DbTopicExt).display_name || undefined,
      icon: t.icon,
      weight: t.weight || 1,
    }));

  // Local topics
  const localTopics: Topic[] = dbTopics
    .filter(t => (t as DbTopicExt).scope === 'local')
    .map(t => ({
      id: t.id,
      name: t.name,
      displayName: (t as DbTopicExt).display_name || undefined,
      icon: t.icon,
      weight: t.weight || 1,
    }));

  // Transform federal questions to app format
  const questions = useMemo(() => canonicalQuestions.map(q => ({
    id: q.id,
    topicId: q.topic_id,
    text: q.text,
    options: (q.options || []).map((o: QuestionOption) => ({
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
    options: (q.options || []).map((o: QuestionOption) => ({
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

      // Fire badge events (fire-and-forget)
      const { logBadgeEvent } = await import('@/lib/badges');
      logBadgeEvent('onboarding_completed');
      logBadgeEvent('priority_picker', { topic_count: allTopicIds.length });
      if (selectedTopicIds.length > 0) logBadgeEvent('federal_quiz_completed');
      if (selectedLocalTopicIds.length > 0) logBadgeEvent('local_quiz_completed');
      const allQuestionsById = new Map([...activeQuestions, ...activeLocalQuestions].map(q => [q.id, q.topicId]));
      for (const ans of allAnswers) {
        logBadgeEvent('question_answered', { question_id: ans.questionId, topic_id: allQuestionsById.get(ans.questionId) });
      }

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

  if (topicsLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
      </div>
    );
  }

  // If already onboarded and not in the middle of an active retake, send to profile
  if (hasCompleted && step === 'welcome' && quizAnswers.length === 0 && localQuizAnswers.length === 0) {
    return <Navigate to="/profile" replace />;
  }

  const handleDemographicsSubmit = async (data: DemographicsData) => {
    try {
      await updateProfile.mutateAsync({
        address: data.address,
        political_party: data.political_party,
        age: data.age,
        income: data.income,
        employment_status: data.employment_status,
        sex: data.sex,
        religion: data.religion,
      });
      setStep('topics');
    } catch (error) {
      console.error('Error saving demographics:', error);
      toast.error('Failed to save your information. Please try again.');
    }
  };

  // Shared gradient CTA button style
  const gradientBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #182B7A, #B3122F)',
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="flex flex-col items-center text-center max-w-sm mx-auto pt-8 pb-10 px-4 animate-fade-in">
            {/* Gradient icon */}
            <div className="bg-gradient-to-br from-poli-navy to-[#B3122F] rounded-full w-16 h-16 flex items-center justify-center mb-6">
              <Sparkles className="w-7 h-7 text-white" />
            </div>

            <h1 className="text-2xl font-black text-poli-navy mb-1">
              Welcome, {profile?.name || 'Voter'}!
            </h1>
            <p className="text-sm text-poli-muted mb-8">
              Let's build your political profile
            </p>

            {/* Feature tiles */}
            <div className="w-full space-y-3 mb-8">
              <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-poli-surface rounded-full flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-poli-navy" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-poli-body text-sm">Select Topics</p>
                  <p className="text-xs text-poli-muted">3 federal issues + 2 local issues that matter most</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-poli-surface rounded-full flex items-center justify-center shrink-0">
                  <HelpCircle className="w-4 h-4 text-poli-navy" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-poli-body text-sm">Answer Questions</p>
                  <p className="text-xs text-poli-muted">12 federal questions + 4 local questions</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 bg-poli-surface rounded-full flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4 text-poli-navy" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-poli-body text-sm">Get Your Score</p>
                  <p className="text-xs text-poli-muted">See where you stand from L10 (Left) to R10 (Right)</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('demographics')}
              style={gradientBtnStyle}
              className="w-full h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 'demographics':
        return (
          <div className="mx-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-sm mx-auto max-w-xl p-5">
              <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-4">
                About You
              </p>
              <DemographicsForm
                initialData={{
                  address: profile?.address || '',
                  political_party: profile?.political_party || '',
                  age: profile?.age || null,
                  income: profile?.income || '',
                  employment_status: profile?.employment_status || '',
                  sex: profile?.sex || '',
                  religion: profile?.religion || '',
                }}
                onSubmit={handleDemographicsSubmit}
                onBack={() => setStep('welcome')}
                isLoading={updateProfile.isPending}
              />
            </div>
          </div>
        );

      case 'topics':
        return (
          <div className="max-w-3xl mx-auto px-4 animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-lg font-black text-poli-navy">
                Choose Topics ({selectedTopics.length}/3)
              </h2>
              <p className="text-xs text-poli-muted mt-1">
                Select the 3 federal issues that matter most. Order matters — first = highest weight.
              </p>
            </div>

            <TopicSelector
              topics={topics}
              selectedTopics={selectedTopics}
              onToggle={handleTopicToggle}
              maxSelections={3}
            />

            {selectedTopics.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-white border border-poli-surface shadow-sm">
                <p className="text-xs font-semibold text-poli-body mb-2">Your priority order:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTopics.map((topic, index) => (
                    <span key={topic.id} className="text-xs px-3 py-1 rounded-full bg-poli-surface text-poli-navy font-medium">
                      {index + 1}. {topic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-8">
              <button
                onClick={() => setStep('demographics')}
                className="text-sm text-poli-muted font-medium"
              >
                <span className="flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </span>
              </button>
              <button
                onClick={() => {
                  setCurrentQuestionIndex(0);
                  setQuizAnswers([]);
                  setStep('quiz');
                }}
                disabled={selectedTopics.length !== 3}
                style={selectedTopics.length === 3 ? gradientBtnStyle : undefined}
                className="flex-1 h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40 disabled:bg-poli-muted disabled:cursor-not-allowed"
              >
                Continue to Quiz →
              </button>
            </div>
          </div>
        );

      case 'quiz':
        if (questionsLoading) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
            </div>
          );
        }

        if (activeQuestions.length === 0) {
          return (
            <div className="text-center py-16 px-4">
              <p className="text-poli-muted text-sm">No questions available for your selected topics.</p>
              <button
                onClick={() => setStep('topics')}
                className="mt-4 text-sm text-poli-muted font-medium flex items-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Select different topics
              </button>
            </div>
          );
        }

        { /* eslint-disable-next-line no-case-declarations */ }
        const currentQuestion = activeQuestions[currentQuestionIndex];
        if (!currentQuestion) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
            </div>
          );
        }

        return (
          <div className="max-w-2xl mx-auto px-4">
            <div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-4 bg-[#F5F6FA]/95 backdrop-blur supports-[backdrop-filter]:bg-[#F5F6FA]/80 border-b border-poli-surface">
              {currentQuestionTopic && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TopicIcon name={currentQuestionTopic.icon} className="w-6 h-6" />
                  <span className="text-sm font-medium text-poli-muted uppercase tracking-wide">
                    {currentQuestionTopic.name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-poli-muted">
                  Question {currentQuestionIndex + 1} of {activeQuestions.length}
                </span>
                <div className="flex-1 mx-4 h-2 bg-poli-surface rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${((currentQuestionIndex + 1) / activeQuestions.length) * 100}%`,
                      background: 'linear-gradient(90deg, #182B7A, #B3122F)',
                    }}
                  />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-poli-body leading-snug text-center">
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

            <div className="flex items-center gap-3 mt-8">
              <button
                onClick={currentQuestionIndex === 0 ? () => setStep('topics') : handlePrevQuestion}
                className="text-sm text-poli-muted font-medium flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentQuestionIndex === 0 ? 'Back to Topics' : 'Previous'}
              </button>
              <button
                onClick={handleNextQuestion}
                disabled={!currentAnswer}
                style={currentAnswer ? gradientBtnStyle : undefined}
                className="flex-1 h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40 disabled:bg-poli-muted disabled:cursor-not-allowed"
              >
                {currentQuestionIndex === activeQuestions.length - 1 ? 'Continue to Local Topics' : 'Next Question'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );

      case 'local_topics':
        return (
          <div className="max-w-3xl mx-auto px-4 animate-fade-in">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-poli-navy" />
                <span className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">
                  Local Issues
                </span>
              </div>
              <h2 className="text-lg font-black text-poli-navy">
                Choose Topics ({selectedLocalTopics.length}/2)
              </h2>
              <p className="text-xs text-poli-muted mt-1">
                Select 2 local issues that matter most in your community. Order matters!
              </p>
            </div>

            <TopicSelector
              topics={localTopics}
              selectedTopics={selectedLocalTopics}
              onToggle={handleLocalTopicToggle}
              maxSelections={2}
            />

            {selectedLocalTopics.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-white border border-poli-surface shadow-sm">
                <p className="text-xs font-semibold text-poli-body mb-2">Your local priority order:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLocalTopics.map((topic, index) => (
                    <span key={topic.id} className="text-xs px-3 py-1 rounded-full bg-poli-surface text-poli-navy font-medium">
                      {index + 1}. {topic.displayName || topic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-8">
              <button
                onClick={() => setStep('quiz')}
                className="text-sm text-poli-muted font-medium flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => {
                  setCurrentLocalQuestionIndex(0);
                  setLocalQuizAnswers([]);
                  setStep('local_quiz');
                }}
                disabled={selectedLocalTopics.length !== 2}
                style={selectedLocalTopics.length === 2 ? gradientBtnStyle : undefined}
                className="flex-1 h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40 disabled:bg-poli-muted disabled:cursor-not-allowed"
              >
                Continue to Local Quiz →
              </button>
            </div>
          </div>
        );

      case 'local_quiz':
        if (localQuestionsLoading) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
            </div>
          );
        }

        if (activeLocalQuestions.length === 0) {
          return (
            <div className="text-center py-16 px-4">
              <p className="text-poli-muted text-sm">No local questions available for your selected topics.</p>
              <button
                onClick={() => setStep('local_topics')}
                className="mt-4 text-sm text-poli-muted font-medium flex items-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Select different local topics
              </button>
            </div>
          );
        }

        { /* eslint-disable-next-line no-case-declarations */ }
        const currentLocalQuestion = activeLocalQuestions[currentLocalQuestionIndex];
        if (!currentLocalQuestion) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
            </div>
          );
        }

        return (
          <div className="max-w-2xl mx-auto px-4">
            <div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-4 bg-[#F5F6FA]/95 backdrop-blur supports-[backdrop-filter]:bg-[#F5F6FA]/80 border-b border-poli-surface">
              <div className="flex items-center justify-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-poli-navy" />
                <span className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">
                  Local Issues
                </span>
              </div>
              {currentLocalQuestionTopic && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TopicIcon name={currentLocalQuestionTopic.icon} className="w-6 h-6" />
                  <span className="text-sm font-medium text-poli-muted uppercase tracking-wide">
                    {currentLocalQuestionTopic.displayName || currentLocalQuestionTopic.name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-poli-muted">
                  Question {currentLocalQuestionIndex + 1} of {activeLocalQuestions.length}
                </span>
                <div className="flex-1 mx-4 h-2 bg-poli-surface rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${((currentLocalQuestionIndex + 1) / activeLocalQuestions.length) * 100}%`,
                      background: 'linear-gradient(90deg, #182B7A, #B3122F)',
                    }}
                  />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-poli-body leading-snug text-center">
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

            <div className="flex items-center gap-3 mt-8">
              <button
                onClick={currentLocalQuestionIndex === 0 ? () => setStep('local_topics') : handleLocalPrevQuestion}
                className="text-sm text-poli-muted font-medium flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentLocalQuestionIndex === 0 ? 'Back to Local Topics' : 'Previous'}
              </button>
              <button
                onClick={handleLocalNextQuestion}
                disabled={!currentLocalAnswer}
                style={currentLocalAnswer ? gradientBtnStyle : undefined}
                className="flex-1 h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40 disabled:bg-poli-muted disabled:cursor-not-allowed"
              >
                {currentLocalQuestionIndex === activeLocalQuestions.length - 1 ? 'See Results' : 'Next Question'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );

      case 'results': {
        const scores = calculatedScores || { overall: 0, byTopic: [] };
        return (
          <div className="max-w-2xl mx-auto px-4 text-center animate-fade-in">
            <div className="bg-gradient-to-br from-poli-navy to-[#B3122F] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>

            <h2 className="text-2xl font-black text-poli-navy mb-2">
              Your Political Profile
            </h2>
            <p className="text-sm text-poli-muted mb-8">
              Based on your answers, here's where you stand on the Left-Right spectrum.
            </p>

            {skippedCount > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-poli-surface shadow-sm mb-6 text-left">
                <AlertTriangle className="w-5 h-5 text-poli-red flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-poli-body">
                    {skippedCount} question{skippedCount !== 1 ? 's' : ''} skipped
                  </p>
                  <p className="text-xs text-poli-muted">
                    Your score is based on {allDisplayAnswers.length} of {allDisplayAnswers.length + skippedCount} questions.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-poli-surface p-6 mb-8 shadow-sm">
              <div className="text-center mb-8">
                <span className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">
                  Overall Score
                </span>
                <div className="mt-4">
                  <ScoreText score={scores.overall} size="lg" showLabel />
                </div>
                <p className="text-xs text-poli-muted mt-2">
                  Score Version: v1.0
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-mono-label text-xs font-bold text-poli-muted uppercase tracking-widest text-left">
                  By Topic
                </h4>
                {scores.byTopic.map((ts, index) => (
                  <div
                    key={ts.topicId}
                    className="flex items-center justify-between p-3 rounded-xl bg-poli-surface animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className="font-semibold text-poli-body text-sm">{ts.topicName}</span>
                    <ScoreText score={ts.score} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleComplete}
              disabled={saveQuizResults.isPending || saveUserTopics.isPending || !canComplete}
              style={canComplete && !saveQuizResults.isPending && !saveUserTopics.isPending ? gradientBtnStyle : undefined}
              className="w-full h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40 disabled:bg-poli-muted disabled:cursor-not-allowed"
              title={!canComplete ? `Answer at least ${minRequiredAnswers} questions to continue` : undefined}
            >
              {saveQuizResults.isPending ? 'Saving...' : 'Explore Politicians'}
              <ArrowRight className="w-4 h-4" />
            </button>

            {!canComplete && (
              <p className="text-sm text-poli-red mt-3">
                Please answer at least {minRequiredAnswers} questions to continue.
              </p>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="bg-[#F5F6FA] min-h-screen">
      <div className="container py-12 md:py-20">
        {renderStep()}
      </div>
    </div>
  );
};
