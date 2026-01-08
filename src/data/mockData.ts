import { Topic, Question, Candidate, Donor, Vote } from '@/types';

// Consolidated 10 Topics (from original 32 Congress.gov Policy Areas)
export const topics: Topic[] = [
  { id: 'economy', name: 'Economy & Jobs', icon: '💼', weight: 1 },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥', weight: 1 },
  { id: 'environment', name: 'Environment & Energy', icon: '🌍', weight: 1 },
  { id: 'immigration', name: 'Immigration', icon: '🛂', weight: 1 },
  { id: 'defense', name: 'Defense & Foreign Policy', icon: '🌐', weight: 1 },
  { id: 'civil-rights', name: 'Civil Rights & Justice', icon: '⚖️', weight: 1 },
  { id: 'education', name: 'Education', icon: '📚', weight: 1 },
  { id: 'social-programs', name: 'Social Programs', icon: '🤝', weight: 1 },
  { id: 'government', name: 'Government & Democracy', icon: '🏛️', weight: 1 },
  { id: 'technology', name: 'Technology & Science', icon: '🔬', weight: 1 },
];

// Map from Congress.gov policy area names to consolidated topic IDs (for vote syncing)
export const policyAreaToTopicId: Record<string, string> = {
  // Economy & Jobs
  'Economics and Public Finance': 'economy',
  'Labor and Employment': 'economy',
  'Taxation': 'economy',
  'Commerce': 'economy',
  'Finance and Financial Sector': 'economy',
  'Transportation and Public Works': 'economy',
  
  // Healthcare
  'Health': 'healthcare',
  'Families': 'healthcare',
  
  // Environment & Energy
  'Energy': 'environment',
  'Environmental Protection': 'environment',
  'Water Resources Development': 'environment',
  'Public Lands and Natural Resources': 'environment',
  'Animals': 'environment',
  'Agriculture and Food': 'environment',
  
  // Immigration
  'Immigration': 'immigration',
  
  // Defense & Foreign Policy
  'Armed Forces and National Security': 'defense',
  'International Affairs': 'defense',
  'Foreign Trade and International Finance': 'defense',
  
  // Civil Rights & Justice (includes arts-culture-religion, sports-recreation)
  'Civil Rights and Liberties, Minority Issues': 'civil-rights',
  'Crime and Law Enforcement': 'civil-rights',
  'Law': 'civil-rights',
  'Native Americans': 'civil-rights',
  'Arts, Culture, Religion': 'civil-rights',
  'Sports and Recreation': 'civil-rights',
  
  // Education (includes social-sciences-history)
  'Education': 'education',
  'Social Sciences and History': 'education',
  
  // Social Programs
  'Social Welfare': 'social-programs',
  'Housing and Community Development': 'social-programs',
  
  // Government & Democracy
  'Congress': 'government',
  'Government Operations and Politics': 'government',
  'Emergency Management': 'government',
  
  // Technology & Science
  'Science, Technology, Communications': 'technology',
};

// Sample questions (will be loaded from database)
export const questions: Question[] = [
  {
    id: 'h01',
    topicId: 'healthcare',
    text: 'Should the federal government expand access to public health insurance?',
    options: [
      { id: 'h01-a', text: 'Yes — because universal coverage should be the goal', value: -10 },
      { id: 'h01-b', text: 'Yes — but focus on gaps in coverage', value: -5 },
      { id: 'h01-c', text: 'Neutral — support targeted expansion only', value: 0 },
      { id: 'h01-d', text: 'No — but allow limited public options', value: 5 },
      { id: 'h01-e', text: 'No — because private insurance should lead', value: 10 },
    ],
  },
];

export const candidates: Candidate[] = [];

export const getDonorsForCandidate = (candidateId: string): Donor[] => {
  return [];
};

export const getVotesForCandidate = (candidateId: string): Vote[] => {
  return [];
};

export const calculateMatchScore = (userScore: number, candidateScore: number): number => {
  // Convert both scores from -100 to 100 scale to 0-200 scale
  const userNormalized = userScore + 100;
  const candidateNormalized = candidateScore + 100;
  
  // Calculate the absolute difference
  const difference = Math.abs(userNormalized - candidateNormalized);
  
  // Convert difference to a percentage match (0-200 difference -> 100-0 match)
  const matchPercentage = Math.round(100 - (difference / 2));
  
  return Math.max(0, Math.min(100, matchPercentage));
};
