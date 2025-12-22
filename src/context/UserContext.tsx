import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Topic, TopicScore, QuizAnswer } from '@/types';
import { topics as allTopics } from '@/data/mockData';
import { calculateQuizScore } from '@/lib/score';

interface UserContextType {
  user: User | null;
  isOnboarded: boolean;
  selectedTopics: Topic[];
  quizAnswers: QuizAnswer[];
  setUser: (user: User | null) => void;
  setIsOnboarded: (value: boolean) => void;
  setSelectedTopics: (topics: Topic[]) => void;
  addQuizAnswer: (answer: QuizAnswer) => void;
  clearQuizAnswers: () => void;
  calculateUserScore: () => { overall: number; byTopic: TopicScore[] };
  completeOnboarding: (name: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);

  const addQuizAnswer = (answer: QuizAnswer) => {
    setQuizAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === answer.questionId);
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = answer;
        return updated;
      }
      return [...prev, answer];
    });
  };

  const clearQuizAnswers = () => {
    setQuizAnswers([]);
  };

  // Use centralized scoring utility
  const calculateUserScore = (): { overall: number; byTopic: TopicScore[] } => {
    // Build question-topic map from allTopics (legacy support for this context)
    const questionTopicMap: { id: string; topicId: string }[] = [
      { id: 'q1', topicId: 'economy' },
      { id: 'q2', topicId: 'economy' },
      { id: 'q3', topicId: 'healthcare' },
      { id: 'q4', topicId: 'immigration' },
      { id: 'q5', topicId: 'environment' },
      { id: 'q6', topicId: 'education' },
      { id: 'q7', topicId: 'gun-policy' },
      { id: 'q8', topicId: 'criminal-justice' },
    ];

    return calculateQuizScore(
      quizAnswers,
      questionTopicMap,
      selectedTopics.map(t => ({ id: t.id, weight: t.weight || 1 })),
      allTopics.map(t => ({ id: t.id, name: t.name }))
    );
  };

  const completeOnboarding = (name: string) => {
    const scores = calculateUserScore();
    const newUser: User = {
      id: crypto.randomUUID(),
      email: `${name.toLowerCase().replace(/\s/g, '.')}@example.com`,
      name,
      topTopics: selectedTopics,
      overallScore: scores.overall,
      topicScores: scores.byTopic,
      quizHistory: [{
        id: crypto.randomUUID(),
        userId: '',
        timestamp: new Date(),
        answers: quizAnswers,
        resultingScore: scores.overall,
      }],
      createdAt: new Date(),
    };
    setUser(newUser);
    setIsOnboarded(true);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isOnboarded,
        selectedTopics,
        quizAnswers,
        setUser,
        setIsOnboarded,
        setSelectedTopics,
        addQuizAnswer,
        clearQuizAnswers,
        calculateUserScore,
        completeOnboarding,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
