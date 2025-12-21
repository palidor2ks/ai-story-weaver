export interface User {
  id: string;
  email: string;
  name: string;
  location?: string;
  topTopics: Topic[];
  overallScore: number;
  topicScores: TopicScore[];
  quizHistory: QuizAttempt[];
  createdAt: Date;
}

export interface Topic {
  id: string;
  name: string;
  icon: string;
  weight: number;
}

export interface TopicScore {
  topicId: string;
  topicName: string;
  score: number; // -100 to 100
}

export interface Question {
  id: string;
  topicId: string;
  text: string;
  options: QuestionOption[];
}

export interface QuestionOption {
  id: string;
  text: string;
  value: number; // e.g., -10, -5, 0, 5, 10
}

export interface QuizAttempt {
  id: string;
  userId: string;
  timestamp: Date;
  answers: QuizAnswer[];
  resultingScore: number;
}

export interface QuizAnswer {
  questionId: string;
  selectedOptionId: string;
  value: number;
}

export interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  state: string;
  district?: string;
  imageUrl: string;
  overallScore: number;
  topicScores: TopicScore[];
  lastUpdated: Date;
}

export interface MatchResult {
  candidate: Candidate;
  matchScore: number; // 0-100%
  agreements: TopicScore[];
  disagreements: TopicScore[];
}

export interface Donor {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
}

export interface Vote {
  id: string;
  billId: string;
  billName: string;
  date: Date;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
  topic: string;
  description: string;
}

export type OnboardingStep = 'welcome' | 'topics' | 'quiz' | 'results';
