import { Topic, Question, Candidate, Donor, Vote } from '@/types';

// Consolidated 6 federal topics (was 12). Local topics (5) unchanged.
export const topics: Topic[] = [
  { id: 'economy-work', name: 'Economy & Work', icon: '💼', weight: 1 },
  { id: 'health-safety-net', name: 'Health, Education & Welfare', icon: '🤝', weight: 1 },
  { id: 'environment-energy', name: 'Environment & Energy', icon: '🌍', weight: 1 },
  { id: 'national-security-borders', name: 'National Security & Borders', icon: '🛡️', weight: 1 },
  { id: 'rights-justice', name: 'Rights & Justice', icon: '⚖️', weight: 1 },
  { id: 'government-democracy', name: 'Government & Democracy', icon: '🏛️', weight: 1 },
];

// Map from Congress.gov policy area names to consolidated 6-topic IDs (for vote syncing)
export const policyAreaToTopicId: Record<string, string> = {
  // Economy & Work (includes Technology & Science)
  'Economics and Public Finance': 'economy-work',
  'Labor and Employment': 'economy-work',
  'Taxation': 'economy-work',
  'Commerce': 'economy-work',
  'Finance and Financial Sector': 'economy-work',
  'Transportation and Public Works': 'economy-work',
  'Agriculture and Food': 'economy-work',
  'Science, Technology, Communications': 'economy-work',

  // Health, Education & Welfare
  'Health': 'health-safety-net',
  'Families': 'health-safety-net',
  'Education': 'health-safety-net',
  'Social Sciences and History': 'health-safety-net',
  'Social Welfare': 'health-safety-net',
  'Housing and Community Development': 'health-safety-net',

  // Environment & Energy
  'Energy': 'environment-energy',
  'Environmental Protection': 'environment-energy',
  'Water Resources Development': 'environment-energy',
  'Public Lands and Natural Resources': 'environment-energy',
  'Animals': 'environment-energy',

  // National Security & Borders (Defense + Immigration + Foreign Affairs)
  'Armed Forces and National Security': 'national-security-borders',
  'Emergency Management': 'national-security-borders',
  'Immigration': 'national-security-borders',
  'International Affairs': 'national-security-borders',
  'Foreign Trade and International Finance': 'national-security-borders',

  // Rights & Justice (Civil Rights + Judicial & Courts)
  'Civil Rights and Liberties, Minority Issues': 'rights-justice',
  'Crime and Law Enforcement': 'rights-justice',
  'Native Americans': 'rights-justice',
  'Arts, Culture, Religion': 'rights-justice',
  'Sports and Recreation': 'rights-justice',
  'Law': 'rights-justice',
  'Courts': 'rights-justice',
  'Judicial Reform': 'rights-justice',
  'Supreme Court': 'rights-justice',
  'Federal Judiciary': 'rights-justice',

  // Government & Democracy
  'Congress': 'government-democracy',
  'Government Operations and Politics': 'government-democracy',
};

// Sample questions (loaded from database in production)
export const questions: Question[] = [
  {
    id: 'h01',
    topicId: 'health-safety-net',
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
  const userNormalized = userScore + 100;
  const candidateNormalized = candidateScore + 100;
  const difference = Math.abs(userNormalized - candidateNormalized);
  const matchPercentage = Math.round(100 - (difference / 2));
  return Math.max(0, Math.min(100, matchPercentage));
};
