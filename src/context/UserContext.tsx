import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Topic, TopicScore, QuizAnswer } from '@/types';
import { topics as allTopics } from '@/data/mockData';

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

  const calculateUserScore = (): { overall: number; byTopic: TopicScore[] } => {
    // Group answers by topic
    const topicAnswers: Record<string, number[]> = {};
    
    quizAnswers.forEach(answer => {
      // We need to find the topic for this question
      // For now, we'll use a simple mapping based on question IDs
      const questionTopicMap: Record<string, string> = {
        q1: 'economy',
        q2: 'economy',
        q3: 'healthcare',
        q4: 'immigration',
        q5: 'environment',
        q6: 'education',
        q7: 'gun-policy',
        q8: 'criminal-justice',
      };
      
      const topicId = questionTopicMap[answer.questionId];
      if (topicId) {
        if (!topicAnswers[topicId]) {
          topicAnswers[topicId] = [];
        }
        topicAnswers[topicId].push(answer.value);
      }
    });

    // Calculate score for each topic
    const topicScores: TopicScore[] = Object.entries(topicAnswers).map(([topicId, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      // Normalize to -100 to 100 scale
      const normalizedScore = Math.round(avg * 10);
      const topic = allTopics.find(t => t.id === topicId);
      return {
        topicId,
        topicName: topic?.name || topicId,
        score: normalizedScore,
      };
    });

    // Calculate overall score (weighted by selected topics)
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
