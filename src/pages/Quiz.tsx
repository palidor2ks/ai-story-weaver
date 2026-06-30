import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { TopicIcon } from '@/components/TopicIcon';
import { ScoreText } from '@/components/ScoreText';
import { Button } from '@/components/ui/button';
import { useQuestions, useTopics } from '@/hooks/useCandidates';
import { useSaveQuizResults, useUserTopics, useUpsertQuizAnswer } from '@/hooks/useProfile';
import { QuizAnswer, TopicScore } from '@/types';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuizAnswers } from '@/hooks/useQuizAnswers';
import { useAuth } from '@/context/AuthContext';
import { shuffleArray, calculateQuizScore } from '@/lib/score';
import { logBadgeEvent } from '@/lib/badges';

export const Quiz = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const topicFilter = searchParams.get('topic');
  const mode = searchParams.get('mode'); // 'random' for random questions from top topics

  const { data: dbQuestions = [], isLoading: questionsLoading } = useQuestions();
  const { data: dbTopics = [] } = useTopics();
  const { data: userTopics = [] } = useUserTopics();
  const saveQuizResults = useSaveQuizResults();
  const upsertAnswer = useUpsertQuizAnswer();

  // Fetch user's existing answers to filter out already answered questions
  const { data: existingAnswers = [], isLoading: answersLoading } = useQuizAnswers(user?.id);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [calculatedScores, setCalculatedScores] = useState<{ overall: number; byTopic: TopicScore[] } | null>(null);

  // Transform database questions to app format
  const allQuestions = useMemo(() => {
    return dbQuestions.map(q => ({
      id: q.id,
      topicId: q.topic_id,
      text: q.text,
      options: (q.options || []).map((o: { id: string; text: string; value: number; is_skip_option?: boolean }) => ({
        id: o.id,
        text: o.text,
        value: o.value,
        is_skip_option: o.is_skip_option ?? false,
      })),
    }));
  }, [dbQuestions]);

  // Filter questions based on mode
  const questions = useMemo(() => {
    let filtered = allQuestions;

    if (topicFilter) {
      // Filter by specific topic, skipping already-answered questions when possible
      const topicQs = allQuestions.filter(q => q.topicId === topicFilter);
      const unanswered = topicQs.filter(q => !existingAnswers.includes(q.id));
      filtered = unanswered.length > 0 ? unanswered : topicQs;
    } else if (mode === 'random') {
      // Get 6 random unanswered questions from user's top 3 topics
      const topTopicIds = userTopics.slice(0, 3).map(ut => ut.topic_id);

      // Filter to questions from top topics that haven't been answered
      const unansweredFromTopTopics = allQuestions.filter(
        q => topTopicIds.includes(q.topicId) && !existingAnswers.includes(q.id)
      );

      // Fisher-Yates shuffle and take 6
      const shuffled = shuffleArray(unansweredFromTopTopics);
      filtered = shuffled.slice(0, 6);

      // If not enough unanswered, add some already answered ones
      if (filtered.length < 6) {
        const answeredFromTopTopics = allQuestions.filter(
          q => topTopicIds.includes(q.topicId) && existingAnswers.includes(q.id)
        );
        const shuffledAnswered = shuffleArray(answeredFromTopTopics);
        filtered = [...filtered, ...shuffledAnswered.slice(0, 6 - filtered.length)];
      }
    } else {
      // Full quiz: prefer unanswered questions, fall back to all (review mode)
      const unanswered = allQuestions.filter(q => !existingAnswers.includes(q.id));
      filtered = unanswered.length > 0 ? unanswered : allQuestions;
    }

    return filtered;
  }, [allQuestions, topicFilter, mode, userTopics, existingAnswers]);

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

  const handleOptionSelect = (option: { id: string; text: string; value: number; is_skip_option?: boolean }) => {
    const questionId = questions[currentQuestionIndex].id;
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

    // Autosave this answer immediately so progress persists if user leaves
    upsertAnswer.mutate({
      questionId,
      selectedOptionId: option.id,
      value: option.value,
    });

    // Auto-advance to next question after a short delay
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Calculate scores and show results
        const scores = calculateUserScoreFromAnswers();
        setCalculatedScores(scores);
        setShowResults(true);
      }
    }, 300);
  };

  const calculateUserScoreFromAnswers = (): { overall: number; byTopic: TopicScore[] } => {
    const questionData = questions.map(q => ({ id: q.id, topicId: q.topicId }));
    const topicWeights = selectedTopics.map(t => ({ id: t.id, weight: t.weight }));
    const topicInfoList = topics.map(t => ({ id: t.id, name: t.name }));

    return calculateQuizScore(quizAnswers, questionData, topicWeights, topicInfoList);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      const scores = calculateUserScoreFromAnswers();
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

      // Fire badge events (fire-and-forget). One question_answered per answer
      // in this session, with topic_id so topic-depth checker runs per topic.
      const questionTopicMap = new Map(questions.map(q => [q.id, q.topicId]));
      for (const ans of quizAnswers) {
        const topicId = questionTopicMap.get(ans.questionId);
        logBadgeEvent('question_answered', { question_id: ans.questionId, topic_id: topicId });
      }

      toast.success('Quiz results saved!');
      navigate('/profile');
    } catch (error) {
      console.error('Error saving quiz results:', error);
      const message = error instanceof Error
        ? error.message.substring(0, 100)
        : 'Unknown error';
      toast.error(`Failed to save results: ${message}`);
    }
  };

  const currentAnswer = quizAnswers.find(
    a => a.questionId === questions[currentQuestionIndex]?.id
  );

  // Get quiz title based on mode
  const getQuizTitle = () => {
    if (topicFilter) {
      const topic = topics.find(t => t.id === topicFilter);
      return topic ? `${topic.icon} ${topic.name} Quiz` : 'Topic Quiz';
    }
    if (mode === 'random') {
      return 'Quick Quiz';
    }
    return 'Full Quiz';
  };

  if (questionsLoading || (user && answersLoading)) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
      </div>
    );
  }

  if (showResults && calculatedScores) {
    return (
      <div className="min-h-screen bg-[#F5F6FA]">
        <div className="max-w-2xl mx-auto px-4 pt-16 pb-12">
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #182B7A, #B3122F)' }}>
              <CheckCircle className="w-10 h-10 text-white" />
            </div>

            <h2 className="text-2xl font-black text-poli-body mb-2">
              Quiz Complete!
            </h2>
            <p className="text-sm text-poli-muted mb-8">
              Here's your updated political profile based on your latest answers.
            </p>

            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 text-left">
              <div className="text-center mb-6">
                <span className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">
                  New Overall Score
                </span>
                <div className={cn(
                  "text-5xl font-black mt-2",
                  calculatedScores.overall >= 30 && "text-red-600",
                  calculatedScores.overall <= -30 && "text-blue-600",
                  calculatedScores.overall > -30 && calculatedScores.overall < 30 && "text-poli-navy"
                )}>
                  {calculatedScores.overall > 0 ? '+' : ''}{calculatedScores.overall}
                </div>
                <p className="text-sm text-poli-muted mt-1">
                  {calculatedScores.overall <= -30 ? 'Leans Progressive' :
                   calculatedScores.overall >= 30 ? 'Leans Conservative' :
                   'Moderate / Centrist'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {calculatedScores.byTopic.map((ts, index) => (
                  <div
                    key={ts.topicId}
                    className="flex items-center justify-between p-3 rounded-xl bg-poli-surface animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className="text-sm font-medium text-poli-body">{ts.topicName}</span>
                    <ScoreText score={ts.score} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleComplete}
              disabled={saveQuizResults.isPending}
              className="w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
            >
              {saveQuizResults.isPending ? 'Saving...' : 'Save & View Profile'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex flex-col items-center justify-center px-4">
        <p className="text-poli-muted text-sm text-center mb-4">
          {mode === 'random'
            ? "You've answered all available questions from your top topics!"
            : "No questions available."}
        </p>
        <button
          onClick={() => navigate('/profile')}
          className="h-10 px-5 rounded-xl border border-poli-surface text-poli-body text-sm font-semibold"
        >
          Back to Profile
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentTopic = topics.find(t => t.id === currentQuestion.topicId);
  const regularOptions = currentQuestion.options.filter(opt => !opt.is_skip_option);
  const skipOption = currentQuestion.options.find(opt => opt.is_skip_option);
  const progressPct = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="bg-[#F5F6FA] min-h-screen">
      <Seo
        title="Take the Quiz — Pulse"
        description="Answer questions on the issues that matter to you and get a detailed political profile across 17 policy topics."
        path="/quiz"
        noIndex
      />

      {/* Sticky header bar */}
      <div className="bg-[#F5F6FA]/95 backdrop-blur-sm border-b border-poli-surface sticky top-0 z-10 px-4 pt-12 pb-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              {currentTopic && (
                <TopicIcon name={currentTopic.icon} className="w-4 h-4" />
              )}
              <span className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">
                {currentTopic ? currentTopic.name : getQuizTitle()}
              </span>
            </div>
            <span className="text-xs text-poli-muted">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
          </div>
          <div className="bg-poli-surface rounded-full h-1.5 mt-2">
            <div
              className="bg-gradient-to-r from-poli-navy to-[#B3122F] rounded-full h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable question + options area */}
      <div className="max-w-2xl mx-auto pb-28">
        <h2 className="text-xl font-black text-poli-body leading-snug px-4 mt-6 mb-4">
          {currentQuestion.text}
        </h2>

        {/* Answer options */}
        {regularOptions.map((option, index) => {
          const isSelected = currentAnswer?.selectedOptionId === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option)}
              className={cn(
                "bg-white rounded-xl p-4 flex items-start gap-3 border shadow-sm mb-2 mx-4 cursor-pointer w-[calc(100%-2rem)] text-left transition-all duration-150",
                isSelected
                  ? "border-poli-navy bg-poli-navy/5"
                  : "border-transparent"
              )}
            >
              <span className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                isSelected
                  ? "bg-poli-navy text-white"
                  : "bg-poli-surface text-poli-dim"
              )}>
                {String.fromCharCode(65 + index)}
              </span>
              <span className="text-sm text-poli-body font-medium">{option.text}</span>
            </button>
          );
        })}

        {/* Not important option */}
        {skipOption && (
          <button
            onClick={() => handleOptionSelect(skipOption)}
            className={cn(
              "text-sm text-poli-muted text-center mt-2 mb-4 underline cursor-pointer w-full",
              currentAnswer?.selectedOptionId === skipOption.id && "text-poli-navy font-semibold"
            )}
          >
            ⊝ Not important to me
          </button>
        )}
      </div>

      {/* Bottom nav */}
      <div className="px-4 pb-8 pt-4 flex gap-3 sticky bottom-0 bg-[#F5F6FA] max-w-2xl mx-auto">
        <button
          onClick={handlePrev}
          disabled={currentQuestionIndex === 0}
          className="border border-poli-surface text-poli-body rounded-xl h-12 flex-shrink-0 px-5 text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!currentAnswer}
          className="flex-1 h-12 rounded-xl font-bold text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
        >
          {currentQuestionIndex === questions.length - 1 ? 'See Results' : 'Next'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
