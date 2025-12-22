import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

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
  score: number; // -10 to 10 (now with decimals)
}

export interface Question {
  id: string;
  topicId: string;
  text: string;
  options: QuestionOption[];
  isOnboardingCanonical?: boolean;
  onboardingSlot?: number;
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
  imageUrl?: string;
  overallScore: number;
  topicScores: TopicScore[];
  lastUpdated: Date;
  coverageTier?: CoverageTier;
  confidence?: ConfidenceLevel;
  isIncumbent?: boolean;
  scoreVersion?: string;
  // Transition metadata
  transitionStatus?: 'incoming' | 'outgoing' | 'current' | 'candidate';
  newOffice?: string;
  inaugurationDate?: string;
  // AI answer metadata
  hasAIAnswers?: boolean;
  answerCount?: number;
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

// Government level for feed filtering
export type GovernmentLevel = 'federal' | 'state' | 'local' | 'all';

// Transition status for officials (incoming/outgoing after elections)
export type TransitionStatus = 'incoming' | 'outgoing' | 'current' | 'candidate';
