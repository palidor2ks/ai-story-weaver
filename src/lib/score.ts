/**
 * Quiz Score Calculation
 * 
 * Re-exports from the unified scoring system for backward compatibility.
 * All scores are on the -10 to +10 scale.
 */

export { 
  calculateQuizScore, 
  shuffleArray,
  calculateAverageScore,
  calculateWeightedOverallScore,
  calculateMatchPercentage,
  clampScore,
  isValidScore,
} from './scoring';

// Re-export types
export type { 
  QuizAnswer, 
  Question, 
  TopicWeight, 
  TopicInfo,
  ScoringResult,
} from './scoring';
