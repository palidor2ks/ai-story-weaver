import { formatScore, getScoreLabel } from '@/lib/scoreFormat';

export interface CardData {
  kind: 'candidate-alignment' | 'user-profile' | 'invite' | 'donor-stats';
  // Donor stats
  donorName?: string;
  donorType?: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  donorLocation?: string | null;
  totalGiven?: string;
  donationCount?: string;
  recipientCount?: string;
  cycleCount?: number;
  // Header / branding
  brandHost: string; // e.g. www.polipulseapp.com
  // Candidate alignment
  candidateName?: string;
  candidateOffice?: string;
  candidateState?: string | null;
  candidateDistrict?: string | null;
  candidateParty?: string;
  candidateImage?: string | null;
  candidateScore?: number | null;
  matchScore?: number; // 0-100
  agreements?: { topicName: string; score: number }[];
  disagreements?: { topicName: string; score: number }[];
  // Candidate stat card extras
  incumbent?: boolean;
  coverageTier?: string;
  confidence?: string;
  ieCycle?: string | null;
  totalRaised?: number | null;
  totalSpent?: number | null;
  // Outside (independent-expenditure) spending split by stance.
  outsideSupport?: number | null;
  outsideOppose?: number | null;
  topDonors?: { name: string; amount: number; primaryCause?: string | null; primaryCauseStance?: string | null }[];
  topSpenders?: { name: string; support: number; oppose: number; primaryCause?: string | null; primaryCauseStance?: string | null }[];
  aiPositions?: { topic: string; stance: string }[];
  aiGoals?: string[];
  aiCauses?: string[];
  aiAnalysisLoading?: boolean;
  // User profile
  userName?: string | null;
  userScore?: number | null;
  topTopics?: { topicName: string; score: number }[];
  // Funding sources breakdown (candidate cards only)
  fundingBreakdown?: { label: string; pct: number; color: string }[];
  fundingCycle?: string;
}

export const CARD_SIZE = 1080;

export const formatScoreSafe = (s: number | null | undefined) => formatScore(s);
export const labelSafe = (s: number | null | undefined) => getScoreLabel(s);
