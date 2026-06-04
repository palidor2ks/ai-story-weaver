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

export interface DonorStatsCaptionInput {
  kind: 'donor-stats';
  donorName: string;
  totalGiven: string;
  donationCount: string;
  recipientCount: string;
  cycleCount: number;
  url: string;
}

export type ShareSurface =
  | 'quiz_results'
  | 'quiz_results_invite'
  | 'candidate_profile'
  | 'donor_profile';

export type CaptionInput = (
  | CandidateAlignmentCaptionInput
  | UserProfileCaptionInput
  | InviteCaptionInput
  | DonorStatsCaptionInput
) & { surface?: ShareSurface };

export function getDefaultHashtags(input: CaptionInput): string {
  if (input.kind === 'invite') return '#Pulse';
  if (input.kind === 'donor-stats') return '#Pulse #FollowTheMoney';
  return '#Pulse #VoterMatch';
}

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
    return lines.join('\n');
  }
  if (input.kind === 'user-profile') {
    return [
      `I just discovered my political profile on Pulse.`,
      `My score: ${formatScore(input.userScore)} (${getScoreLabel(input.userScore)})`,
      '',
      `Find out where you stand: ${input.url}`,
    ].join('\n');
  }
  if (input.kind === 'donor-stats') {
    return [
      `${input.donorName} on Pulse`,
      '',
      `${input.totalGiven} given across ${input.donationCount} donations to ${input.recipientCount} recipients over ${input.cycleCount} cycle${input.cycleCount === 1 ? '' : 's'}.`,
      '',
      `Follow the money: ${input.url}`,
    ].join('\n');
  }
  return [
    `I just took the Pulse political alignment quiz — it shows where you really stand on the issues.`,
    `Take it and see your results: ${input.url}`,
  ].join('\n');
}

export function generateShortCaption(input: CaptionInput): string {
  if (input.kind === 'candidate-alignment') {
    return `My alignment with ${input.candidateName}: ${input.matchScore}% match | ${formatScore(input.userScore)} vs ${formatScore(input.candidateScore)}`;
  }
  if (input.kind === 'user-profile') {
    return `My political profile: ${formatScore(input.userScore)} (${getScoreLabel(input.userScore)}). Find out where you stand on @PulseApp.`;
  }
  if (input.kind === 'donor-stats') {
    return `${input.donorName}: ${input.totalGiven} across ${input.donationCount} donations to ${input.recipientCount} recipients. Follow the money on Pulse.`;
  }
  return `Take the Pulse quiz and see where you really stand on the issues.`;
}

/**
 * Condense a longer block of text (e.g. an AI analysis summary, which can run a
 * few sentences and be repetitive) down to a social-friendly snippet. Trims to
 * the last complete sentence that fits when one lands past the halfway mark,
 * otherwise to a word boundary with an ellipsis. Always returns ≤ maxChars.
 */
export function summarizeForSocial(text: string | null | undefined, maxChars = 240): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  // Prefer ending on a sentence terminator that falls within the budget.
  const head = clean.slice(0, maxChars + 1);
  let sentenceCut = -1;
  for (const m of head.matchAll(/[.!?](?=\s|$)/g)) {
    if (m.index !== undefined && m.index < maxChars) sentenceCut = m.index + 1;
  }
  if (sentenceCut >= Math.floor(maxChars * 0.5)) {
    return clean.slice(0, sentenceCut).trim();
  }

  // Otherwise trim to a word boundary and mark the truncation.
  const wordWindow = clean.slice(0, maxChars - 1);
  const lastSpace = wordWindow.lastIndexOf(' ');
  const base = (lastSpace > 0 ? wordWindow.slice(0, lastSpace) : wordWindow).replace(/[\s,;:.!?-]+$/, '');
  return `${base}…`;
}

export function composeFinalText(body: string, hashtags: string, includeHashtags: boolean): string {
  const trimmed = body.trim();
  if (!includeHashtags || !hashtags) return trimmed;
  if (!trimmed) return hashtags;
  return `${trimmed}\n\n${hashtags}`;
}

