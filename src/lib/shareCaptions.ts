import { formatScore, getScoreLabel } from '@/lib/scoreFormat';

export interface TopicLite {
  topicName: string;
  score: number;
}

export interface CandidateAlignmentCaptionInput {
  kind: 'candidate-alignment';
  candidateName: string;
  candidateOffice: string;
  candidateParty: string;
  candidateScore: number | null;
  userScore: number | null;
  matchScore: number;
  agreements: TopicLite[];
  disagreements: TopicLite[];
  url: string;
}

export interface UserProfileCaptionInput {
  kind: 'user-profile';
  userName?: string | null;
  userScore: number | null;
  topTopics: TopicLite[];
  url: string;
}

export interface InviteCaptionInput {
  kind: 'invite';
  url: string;
}

export type CaptionInput =
  | CandidateAlignmentCaptionInput
  | UserProfileCaptionInput
  | InviteCaptionInput;

export function generateLongCaption(input: CaptionInput): string {
  if (input.kind === 'candidate-alignment') {
    const lines: string[] = [];
    lines.push(`My political alignment with ${input.candidateName} (${input.candidateParty}) — ${input.candidateOffice}`);
    lines.push('');
    lines.push(`Match Score: ${input.matchScore}% aligned`);
    if (input.agreements.length > 0) {
      lines.push('');
      lines.push('Where we agree:');
      input.agreements.slice(0, 2).forEach(a => lines.push(`• ${a.topicName}`));
    }
    if (input.disagreements.length > 0) {
      lines.push('');
      lines.push('Where we differ:');
      input.disagreements.slice(0, 2).forEach(d => lines.push(`• ${d.topicName}`));
    }
    lines.push('');
    lines.push(`My position: ${formatScore(input.userScore)} | Their position: ${formatScore(input.candidateScore)}`);
    lines.push('');
    lines.push(`Discover your alignment at ${input.url}`);
    lines.push('#Pulse #VoterMatch');
    return lines.join('\n');
  }
  if (input.kind === 'user-profile') {
    return [
      `I just discovered my political profile on Pulse.`,
      `My score: ${formatScore(input.userScore)} (${getScoreLabel(input.userScore)})`,
      '',
      `Find out where you stand: ${input.url}`,
      '#Pulse #VoterMatch',
    ].join('\n');
  }
  return [
    `I just took the Pulse political alignment quiz — it shows where you really stand on the issues.`,
    `Take it and see your results: ${input.url}`,
    '#Pulse',
  ].join('\n');
}

export function generateShortCaption(input: CaptionInput): string {
  if (input.kind === 'candidate-alignment') {
    return `My alignment with ${input.candidateName}: ${input.matchScore}% match | ${formatScore(input.userScore)} vs ${formatScore(input.candidateScore)}`;
  }
  if (input.kind === 'user-profile') {
    return `My political profile: ${formatScore(input.userScore)} (${getScoreLabel(input.userScore)}). Find out where you stand on @PulseApp.`;
  }
  return `Take the Pulse quiz and see where you really stand on the issues.`;
}
