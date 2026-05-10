import { formatScore, getScoreLabel } from '@/lib/scoreFormat';

export interface CardData {
  kind: 'candidate-alignment' | 'user-profile' | 'invite';
  // Header / branding
  brandHost: string; // e.g. polipulseapp.com
  // Candidate alignment
  candidateName?: string;
  candidateOffice?: string;
  candidateParty?: string;
  candidateImage?: string | null;
  candidateScore?: number | null;
  matchScore?: number; // 0-100
  agreements?: { topicName: string; score: number }[];
  disagreements?: { topicName: string; score: number }[];
  // User profile
  userName?: string | null;
  userScore?: number | null;
  topTopics?: { topicName: string; score: number }[];
}

export const CARD_SIZE = 1080;

export const formatScoreSafe = (s: number | null | undefined) => formatScore(s);
export const labelSafe = (s: number | null | undefined) => getScoreLabel(s);
