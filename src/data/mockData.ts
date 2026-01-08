import { Topic, Question, Candidate, Donor, Vote } from '@/types';

// New 32 Congress.gov Policy Area Topics
export const topics: Topic[] = [
  { id: 'agriculture-and-food', name: 'Agriculture and Food', icon: '🌾', weight: 1 },
  { id: 'animals', name: 'Animals', icon: '🐾', weight: 1 },
  { id: 'armed-forces-national-security', name: 'Armed Forces and National Security', icon: '🎖️', weight: 1 },
  { id: 'arts-culture-religion', name: 'Arts, Culture, Religion', icon: '🎭', weight: 1 },
  { id: 'civil-rights-liberties', name: 'Civil Rights and Liberties, Minority Issues', icon: '⚖️', weight: 1 },
  { id: 'commerce', name: 'Commerce', icon: '🏪', weight: 1 },
  { id: 'congress', name: 'Congress', icon: '🏛️', weight: 1 },
  { id: 'crime-law-enforcement', name: 'Crime and Law Enforcement', icon: '🚔', weight: 1 },
  { id: 'economics-public-finance', name: 'Economics and Public Finance', icon: '📊', weight: 1 },
  { id: 'education', name: 'Education', icon: '📚', weight: 1 },
  { id: 'emergency-management', name: 'Emergency Management', icon: '🚨', weight: 1 },
  { id: 'energy', name: 'Energy', icon: '⚡', weight: 1 },
  { id: 'environmental-protection', name: 'Environmental Protection', icon: '🌍', weight: 1 },
  { id: 'families', name: 'Families', icon: '👨‍👩‍👧', weight: 1 },
  { id: 'finance-financial-sector', name: 'Finance and Financial Sector', icon: '🏦', weight: 1 },
  { id: 'foreign-trade-international-finance', name: 'Foreign Trade and International Finance', icon: '🚢', weight: 1 },
  { id: 'government-operations-politics', name: 'Government Operations and Politics', icon: '🗳️', weight: 1 },
  { id: 'health', name: 'Health', icon: '🏥', weight: 1 },
  { id: 'housing-community-development', name: 'Housing and Community Development', icon: '🏘️', weight: 1 },
  { id: 'immigration', name: 'Immigration', icon: '🛂', weight: 1 },
  { id: 'international-affairs', name: 'International Affairs', icon: '🌐', weight: 1 },
  { id: 'labor-employment', name: 'Labor and Employment', icon: '👷', weight: 1 },
  { id: 'law', name: 'Law', icon: '📜', weight: 1 },
  { id: 'native-americans', name: 'Native Americans', icon: '🪶', weight: 1 },
  { id: 'public-lands-natural-resources', name: 'Public Lands and Natural Resources', icon: '🏞️', weight: 1 },
  { id: 'science-technology-communications', name: 'Science, Technology, Communications', icon: '🔬', weight: 1 },
  { id: 'social-sciences-history', name: 'Social Sciences and History', icon: '📖', weight: 1 },
  { id: 'social-welfare', name: 'Social Welfare', icon: '🤝', weight: 1 },
  { id: 'sports-recreation', name: 'Sports and Recreation', icon: '⚽', weight: 1 },
  { id: 'taxation', name: 'Taxation', icon: '💵', weight: 1 },
  { id: 'transportation-public-works', name: 'Transportation and Public Works', icon: '🚇', weight: 1 },
  { id: 'water-resources-development', name: 'Water Resources Development', icon: '💧', weight: 1 },
];

// Map from Congress.gov policy area names to topic IDs (for vote syncing)
export const policyAreaToTopicId: Record<string, string> = {
  'Agriculture and Food': 'agriculture-and-food',
  'Animals': 'animals',
  'Armed Forces and National Security': 'armed-forces-national-security',
  'Arts, Culture, Religion': 'arts-culture-religion',
  'Civil Rights and Liberties, Minority Issues': 'civil-rights-liberties',
  'Commerce': 'commerce',
  'Congress': 'congress',
  'Crime and Law Enforcement': 'crime-law-enforcement',
  'Economics and Public Finance': 'economics-public-finance',
  'Education': 'education',
  'Emergency Management': 'emergency-management',
  'Energy': 'energy',
  'Environmental Protection': 'environmental-protection',
  'Families': 'families',
  'Finance and Financial Sector': 'finance-financial-sector',
  'Foreign Trade and International Finance': 'foreign-trade-international-finance',
  'Government Operations and Politics': 'government-operations-politics',
  'Health': 'health',
  'Housing and Community Development': 'housing-community-development',
  'Immigration': 'immigration',
  'International Affairs': 'international-affairs',
  'Labor and Employment': 'labor-employment',
  'Law': 'law',
  'Native Americans': 'native-americans',
  'Public Lands and Natural Resources': 'public-lands-natural-resources',
  'Science, Technology, Communications': 'science-technology-communications',
  'Social Sciences and History': 'social-sciences-history',
  'Social Welfare': 'social-welfare',
  'Sports and Recreation': 'sports-recreation',
  'Taxation': 'taxation',
  'Transportation and Public Works': 'transportation-public-works',
  'Water Resources Development': 'water-resources-development',
};

// Sample questions (will be loaded from database)
export const questions: Question[] = [
  {
    id: 'h01',
    topicId: 'health',
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
