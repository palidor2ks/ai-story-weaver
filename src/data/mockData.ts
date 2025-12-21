import { Topic, Question, Candidate, Donor, Vote } from '@/types';

export const topics: Topic[] = [
  { id: 'economy', name: 'Economy', icon: '💰', weight: 1 },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥', weight: 1 },
  { id: 'immigration', name: 'Immigration', icon: '🌍', weight: 1 },
  { id: 'environment', name: 'Environment', icon: '🌱', weight: 1 },
  { id: 'education', name: 'Education', icon: '📚', weight: 1 },
  { id: 'foreign-policy', name: 'Foreign Policy', icon: '🌐', weight: 1 },
  { id: 'civil-rights', name: 'Civil Rights', icon: '⚖️', weight: 1 },
  { id: 'gun-policy', name: 'Gun Policy', icon: '🔫', weight: 1 },
  { id: 'technology', name: 'Technology', icon: '💻', weight: 1 },
  { id: 'criminal-justice', name: 'Criminal Justice', icon: '🏛️', weight: 1 },
];

export const questions: Question[] = [
  {
    id: 'q1',
    topicId: 'economy',
    text: 'The government should increase taxes on the wealthy to fund social programs.',
    options: [
      { id: 'q1-a', text: 'Strongly Agree', value: 10 },
      { id: 'q1-b', text: 'Agree', value: 5 },
      { id: 'q1-c', text: 'Neutral', value: 0 },
      { id: 'q1-d', text: 'Disagree', value: -5 },
      { id: 'q1-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q2',
    topicId: 'economy',
    text: 'The minimum wage should be raised to $15/hour nationally.',
    options: [
      { id: 'q2-a', text: 'Strongly Agree', value: 10 },
      { id: 'q2-b', text: 'Agree', value: 5 },
      { id: 'q2-c', text: 'Neutral', value: 0 },
      { id: 'q2-d', text: 'Disagree', value: -5 },
      { id: 'q2-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q3',
    topicId: 'healthcare',
    text: 'The government should provide universal healthcare for all citizens.',
    options: [
      { id: 'q3-a', text: 'Strongly Agree', value: 10 },
      { id: 'q3-b', text: 'Agree', value: 5 },
      { id: 'q3-c', text: 'Neutral', value: 0 },
      { id: 'q3-d', text: 'Disagree', value: -5 },
      { id: 'q3-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q4',
    topicId: 'immigration',
    text: 'There should be a pathway to citizenship for undocumented immigrants.',
    options: [
      { id: 'q4-a', text: 'Strongly Agree', value: 10 },
      { id: 'q4-b', text: 'Agree', value: 5 },
      { id: 'q4-c', text: 'Neutral', value: 0 },
      { id: 'q4-d', text: 'Disagree', value: -5 },
      { id: 'q4-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q5',
    topicId: 'environment',
    text: 'The U.S. should prioritize renewable energy over fossil fuels.',
    options: [
      { id: 'q5-a', text: 'Strongly Agree', value: 10 },
      { id: 'q5-b', text: 'Agree', value: 5 },
      { id: 'q5-c', text: 'Neutral', value: 0 },
      { id: 'q5-d', text: 'Disagree', value: -5 },
      { id: 'q5-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q6',
    topicId: 'education',
    text: 'College tuition should be free at public universities.',
    options: [
      { id: 'q6-a', text: 'Strongly Agree', value: 10 },
      { id: 'q6-b', text: 'Agree', value: 5 },
      { id: 'q6-c', text: 'Neutral', value: 0 },
      { id: 'q6-d', text: 'Disagree', value: -5 },
      { id: 'q6-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q7',
    topicId: 'gun-policy',
    text: 'There should be stricter background checks for gun purchases.',
    options: [
      { id: 'q7-a', text: 'Strongly Agree', value: 10 },
      { id: 'q7-b', text: 'Agree', value: 5 },
      { id: 'q7-c', text: 'Neutral', value: 0 },
      { id: 'q7-d', text: 'Disagree', value: -5 },
      { id: 'q7-e', text: 'Strongly Disagree', value: -10 },
    ],
  },
  {
    id: 'q8',
    topicId: 'criminal-justice',
    text: 'Police departments should receive increased funding for training and resources.',
    options: [
      { id: 'q8-a', text: 'Strongly Agree', value: -10 },
      { id: 'q8-b', text: 'Agree', value: -5 },
      { id: 'q8-c', text: 'Neutral', value: 0 },
      { id: 'q8-d', text: 'Disagree', value: 5 },
      { id: 'q8-e', text: 'Strongly Disagree', value: 10 },
    ],
  },
];

export const candidates: Candidate[] = [
  {
    id: 'c1',
    name: 'Sarah Mitchell',
    party: 'Democrat',
    office: 'Senator',
    state: 'California',
    imageUrl: '',
    overallScore: 65,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: 70 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: 85 },
      { topicId: 'immigration', topicName: 'Immigration', score: 60 },
      { topicId: 'environment', topicName: 'Environment', score: 90 },
      { topicId: 'education', topicName: 'Education', score: 75 },
    ],
    lastUpdated: new Date('2024-01-15'),
  },
  {
    id: 'c2',
    name: 'James Richardson',
    party: 'Republican',
    office: 'Representative',
    state: 'Texas',
    district: 'TX-12',
    imageUrl: '',
    overallScore: -45,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: -60 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: -40 },
      { topicId: 'immigration', topicName: 'Immigration', score: -70 },
      { topicId: 'environment', topicName: 'Environment', score: -50 },
      { topicId: 'gun-policy', topicName: 'Gun Policy', score: -80 },
    ],
    lastUpdated: new Date('2024-01-10'),
  },
  {
    id: 'c3',
    name: 'Maria Santos',
    party: 'Democrat',
    office: 'Representative',
    state: 'New York',
    district: 'NY-14',
    imageUrl: '',
    overallScore: 82,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: 85 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: 95 },
      { topicId: 'immigration', topicName: 'Immigration', score: 80 },
      { topicId: 'environment', topicName: 'Environment', score: 90 },
      { topicId: 'criminal-justice', topicName: 'Criminal Justice', score: 75 },
    ],
    lastUpdated: new Date('2024-01-12'),
  },
  {
    id: 'c4',
    name: 'Robert Thompson',
    party: 'Republican',
    office: 'Senator',
    state: 'Florida',
    imageUrl: '',
    overallScore: -30,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: -45 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: -20 },
      { topicId: 'immigration', topicName: 'Immigration', score: -55 },
      { topicId: 'foreign-policy', topicName: 'Foreign Policy', score: -35 },
      { topicId: 'gun-policy', topicName: 'Gun Policy', score: -60 },
    ],
    lastUpdated: new Date('2024-01-08'),
  },
  {
    id: 'c5',
    name: 'Emily Chen',
    party: 'Independent',
    office: 'Representative',
    state: 'Washington',
    district: 'WA-7',
    imageUrl: '',
    overallScore: 25,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: 20 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: 40 },
      { topicId: 'environment', topicName: 'Environment', score: 50 },
      { topicId: 'technology', topicName: 'Technology', score: 30 },
      { topicId: 'civil-rights', topicName: 'Civil Rights', score: 35 },
    ],
    lastUpdated: new Date('2024-01-14'),
  },
  {
    id: 'c6',
    name: 'Michael Brooks',
    party: 'Democrat',
    office: 'Senator',
    state: 'Michigan',
    imageUrl: '',
    overallScore: 55,
    topicScores: [
      { topicId: 'economy', topicName: 'Economy', score: 50 },
      { topicId: 'healthcare', topicName: 'Healthcare', score: 65 },
      { topicId: 'environment', topicName: 'Environment', score: 70 },
      { topicId: 'education', topicName: 'Education', score: 60 },
      { topicId: 'criminal-justice', topicName: 'Criminal Justice', score: 45 },
    ],
    lastUpdated: new Date('2024-01-11'),
  },
];

export const getDonorsForCandidate = (candidateId: string): Donor[] => {
  const donorsByCandidate: Record<string, Donor[]> = {
    c1: [
      { id: 'd1', name: 'ActBlue', type: 'PAC', amount: 2500000, cycle: '2024' },
      { id: 'd2', name: 'Tech Workers Union', type: 'Organization', amount: 500000, cycle: '2024' },
      { id: 'd3', name: 'Environmental Defense Fund', type: 'PAC', amount: 350000, cycle: '2024' },
      { id: 'd4', name: 'Individual Contributors', type: 'Individual', amount: 1200000, cycle: '2024' },
    ],
    c2: [
      { id: 'd5', name: 'America First PAC', type: 'PAC', amount: 1800000, cycle: '2024' },
      { id: 'd6', name: 'Oil & Gas Association', type: 'Organization', amount: 750000, cycle: '2024' },
      { id: 'd7', name: 'NRA Victory Fund', type: 'PAC', amount: 400000, cycle: '2024' },
      { id: 'd8', name: 'Individual Contributors', type: 'Individual', amount: 950000, cycle: '2024' },
    ],
    c3: [
      { id: 'd9', name: 'Progressive Action PAC', type: 'PAC', amount: 3200000, cycle: '2024' },
      { id: 'd10', name: 'Teachers Union', type: 'Organization', amount: 600000, cycle: '2024' },
      { id: 'd11', name: 'Climate Action Now', type: 'PAC', amount: 450000, cycle: '2024' },
    ],
  };
  return donorsByCandidate[candidateId] || [];
};

export const getVotesForCandidate = (candidateId: string): Vote[] => {
  const votesByCandidate: Record<string, Vote[]> = {
    c1: [
      { id: 'v1', billId: 'HR-1234', billName: 'Climate Action Act', date: new Date('2024-01-05'), position: 'Yea', topic: 'Environment', description: 'Legislation to reduce carbon emissions' },
      { id: 'v2', billId: 'HR-5678', billName: 'Medicare Expansion', date: new Date('2024-01-03'), position: 'Yea', topic: 'Healthcare', description: 'Expand Medicare coverage to age 60+' },
      { id: 'v3', billId: 'HR-9012', billName: 'Tax Reform Act', date: new Date('2023-12-15'), position: 'Yea', topic: 'Economy', description: 'Increase taxes on incomes over $400k' },
    ],
    c2: [
      { id: 'v4', billId: 'HR-1234', billName: 'Climate Action Act', date: new Date('2024-01-05'), position: 'Nay', topic: 'Environment', description: 'Legislation to reduce carbon emissions' },
      { id: 'v5', billId: 'HR-3456', billName: 'Border Security Act', date: new Date('2024-01-02'), position: 'Yea', topic: 'Immigration', description: 'Increase border security funding' },
      { id: 'v6', billId: 'HR-7890', billName: 'Gun Rights Protection', date: new Date('2023-12-20'), position: 'Yea', topic: 'Gun Policy', description: 'Protect 2nd Amendment rights' },
    ],
  };
  return votesByCandidate[candidateId] || [];
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
