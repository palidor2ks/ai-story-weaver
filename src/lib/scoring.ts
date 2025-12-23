/**
 * Unified Scoring System
 * 
 * All political scores are on the -10 to +10 scale:
 * - Negative values: Left-leaning
 * - Positive values: Right-leaning
 * - Zero: Center
 * 
 * This module provides consistent score calculations for:
 * - Users (from quiz answers)
 * - Candidates (from candidate_answers)
 * - Parties (from party_answers)
 */

import { TopicScore } from '@/types';

// ============= Types =============

export interface QuizAnswer {
  questionId: string;
  value: number; // -10 to +10
}

export interface Question {
  id: string;
  topicId: string;
}

export interface TopicWeight {
  id: string;
  weight: number; // 1-5, where 5 = highest priority
}

export interface TopicInfo {
  id: string;
  name: string;
}

export interface AnswerRecord {
  question_id: string;
  answer_value: number; // -10 to +10
}

export interface ScoringResult {
  overall: number;
  byTopic: TopicScore[];
}

// ============= Core Scoring Functions =============

/**
 * Calculate the average score from a list of answer values.
 * All values should be on -10 to +10 scale.
 */
export function calculateAverageScore(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate weighted overall score from topic scores using user's priority weights.
 * Per PRD v1.6: User ranks topics 1-5, weights are [5, 4, 3, 2, 1] normalized.
 * 
 * @param topicScores - Array of topic scores on -10 to +10 scale
 * @param topicWeights - Array of topic IDs with their weights (5 = most important)
 * @returns Weighted average score on -10 to +10 scale
 */
export function calculateWeightedOverallScore(
  topicScores: Array<{ topicId: string; score: number }>,
  topicWeights: TopicWeight[]
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  topicScores.forEach(ts => {
    const topicWeight = topicWeights.find(tw => tw.id === ts.topicId);
    const weight = topicWeight?.weight || 1;
    weightedSum += ts.score * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 0;
  
  // Round to 2 decimal places for consistency
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Calculate quiz scores from user answers with topic weighting.
 * Returns overall score and per-topic scores, all on -10 to +10 scale.
 */
export function calculateQuizScore(
  answers: QuizAnswer[],
  questions: Question[],
  selectedTopics: TopicWeight[],
  topicInfo: TopicInfo[]
): ScoringResult {
  // Group answers by topic
  const topicAnswers: Record<string, number[]> = {};
  
  answers.forEach(answer => {
    const question = questions.find(q => q.id === answer.questionId);
    if (question) {
      if (!topicAnswers[question.topicId]) {
        topicAnswers[question.topicId] = [];
      }
      topicAnswers[question.topicId].push(answer.value);
    }
  });

  // Calculate per-topic scores (simple average, already on -10 to +10 scale)
  const topicScores: TopicScore[] = Object.entries(topicAnswers).map(([topicId, values]) => {
    const avg = calculateAverageScore(values) || 0;
    // Round to 2 decimal places
    const score = Math.round(avg * 100) / 100;
    const topic = topicInfo.find(t => t.id === topicId);
    return {
      topicId,
      topicName: topic?.name || topicId,
      score,
    };
  });

  // Calculate weighted overall score
  const overall = calculateWeightedOverallScore(
    topicScores.map(ts => ({ topicId: ts.topicId, score: ts.score })),
    selectedTopics
  );

  return { overall, byTopic: topicScores };
}

/**
 * Calculate overall political score from candidate/party answers.
 * Used for candidates and parties who don't have user-defined topic weights.
 * 
 * @param answers - Array of answer records with question_id and answer_value
 * @param questionTopicMap - Optional map of question_id to topic_id for topic-level scores
 * @returns Average score on -10 to +10 scale, or null if no answers
 */
export function calculateEntityScore(answers: AnswerRecord[]): number | null {
  if (answers.length === 0) return null;
  
  const values = answers.map(a => a.answer_value);
  const avg = calculateAverageScore(values);
  
  if (avg === null) return null;
  
  // Round to 2 decimal places
  return Math.round(avg * 100) / 100;
}

/**
 * Calculate party score filtered to specific questions (for comparison with user).
 * Applies user's topic weights when comparing party positions.
 * 
 * @param partyAnswers - Party's answers filtered to user's answered questions
 * @param userTopicWeights - User's topic priority weights
 * @param questionTopicMap - Map of question_id to topic_id
 * @returns Weighted score on -10 to +10 scale
 */
export function calculateWeightedPartyScore(
  partyAnswers: Array<{ question_id: string; answer_value: number }>,
  userTopicWeights: TopicWeight[],
  questionTopicMap: Map<string, string>
): number | null {
  if (partyAnswers.length === 0) return null;

  // Group answers by topic
  const topicAnswers: Record<string, number[]> = {};
  
  partyAnswers.forEach(answer => {
    const topicId = questionTopicMap.get(answer.question_id);
    if (topicId) {
      if (!topicAnswers[topicId]) {
        topicAnswers[topicId] = [];
      }
      topicAnswers[topicId].push(answer.answer_value);
    }
  });

  // Calculate per-topic averages
  const topicScores = Object.entries(topicAnswers).map(([topicId, values]) => ({
    topicId,
    score: calculateAverageScore(values) || 0,
  }));

  // Apply user's topic weights
  return calculateWeightedOverallScore(topicScores, userTopicWeights);
}

/**
 * Calculate match percentage between user and entity (candidate/party).
 * Based on how close their scores are on the -10 to +10 spectrum.
 * 
 * @param userScore - User's score on -10 to +10
 * @param entityScore - Entity's score on -10 to +10
 * @returns Match percentage (0-100)
 */
export function calculateMatchPercentage(userScore: number, entityScore: number): number {
  // Maximum possible difference on -10 to +10 scale is 20
  const maxDifference = 20;
  const actualDifference = Math.abs(userScore - entityScore);
  
  // Convert to percentage (0 = perfect match = 100%, 20 = opposite = 0%)
  const matchPercent = ((maxDifference - actualDifference) / maxDifference) * 100;
  
  return Math.round(matchPercent);
}

// ============= Utility Functions =============

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Clamp a score to the valid -10 to +10 range
 */
export function clampScore(score: number): number {
  return Math.max(-10, Math.min(10, score));
}

/**
 * Validate that a score is within the valid range
 */
export function isValidScore(score: number | null | undefined): score is number {
  return score !== null && score !== undefined && score >= -10 && score <= 10;
}
