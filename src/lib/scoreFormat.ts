/**
 * Score formatting utilities per PRD v1.6
 * Displays scores in L/R format with 2 decimals:
 * - Negative scores: L2.34 (left-leaning)
 * - Positive scores: R6.10 (right-leaning)
 * - Zero: Center 0.00
 */

export type CoverageTier = 'tier_1' | 'tier_2' | 'tier_3';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Format a numeric score (-10 to +10) to L/R display format
 * @param score - Numeric score between -10 and 10
 * @returns Formatted string like "L2.34", "R6.10", or "Center 0.00"
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'NA';
  }
  
  // Clamp to valid range
  const clamped = Math.max(-10, Math.min(10, score));
  
  // Round to nearest integer
  const rounded = Math.round(clamped);
  
  // Handle exact center
  if (rounded === 0) {
    return 'C';
  }
  
  const absValue = Math.abs(rounded);
  
  // Center zone: -3 to 3 (use CL/CR)
  if (rounded >= -3 && rounded <= 3) {
    return rounded < 0 ? `CL${absValue}` : `CR${absValue}`;
  }
  
  // Outside center zone: L/R
  return rounded < 0 ? `L${absValue}` : `R${absValue}`;
}

/**
 * Get the color class for a score
 */
export function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'text-muted-foreground';
  }
  
  if (score <= -3) return 'text-blue-600';
  if (score >= 3) return 'text-red-600';
  return 'text-purple-600';
}

/**
 * Get a label for the score position
 */
export function getScoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'Unknown';
  }
  
  if (score <= -7) return 'Far Left';
  if (score <= -3) return 'Left-Leaning';
  if (score < 3) return 'Moderate / Centrist';
  if (score < 7) return 'Right-Leaning';
  return 'Far Right';
}

/**
 * Get coverage tier display info
 */
export function getCoverageTierInfo(tier: CoverageTier): { label: string; description: string; color: string } {
  switch (tier) {
    case 'tier_1':
      return {
        label: 'Full Coverage',
        description: 'Complete data: stances, donors, and voting record',
        color: 'bg-green-100 text-green-800 border-green-200',
      };
    case 'tier_2':
      return {
        label: 'Partial Coverage',
        description: 'Limited donors or voting record available',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      };
    case 'tier_3':
      return {
        label: 'Basic Coverage',
        description: 'Only stance data available',
        color: 'bg-gray-100 text-gray-800 border-gray-200',
      };
  }
}

/**
 * Get confidence level display info
 */
export function getConfidenceInfo(confidence: ConfidenceLevel): { label: string; color: string } {
  switch (confidence) {
    case 'high':
      return { label: 'High Confidence', color: 'bg-green-100 text-green-800' };
    case 'medium':
      return { label: 'Medium Confidence', color: 'bg-yellow-100 text-yellow-800' };
    case 'low':
      return { label: 'Low Confidence', color: 'bg-red-100 text-red-800' };
  }
}

/**
 * Calculate weighted score from topic scores using PRD v1.6 weighting
 * User ranks topics 1-5, weights are [5, 4, 3, 2, 1] normalized
 */
export function calculateWeightedScore(
  topicScores: Array<{ topicId: string; score: number }>,
  selectedTopicIds: string[]
): number {
  // Weights based on rank (1st = 5, 2nd = 4, etc.), normalized
  const rawWeights = [5, 4, 3, 2, 1];
  const weightSum = rawWeights.reduce((a, b) => a + b, 0); // 15
  const normalizedWeights = rawWeights.map(w => w / weightSum);
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  selectedTopicIds.forEach((topicId, index) => {
    if (index >= 5) return; // Only top 5
    
    const topicScore = topicScores.find(ts => ts.topicId === topicId);
    if (topicScore) {
      const weight = normalizedWeights[index] || 0;
      weightedSum += topicScore.score * weight;
      totalWeight += weight;
    }
  });
  
  if (totalWeight === 0) return 0;
  
  // Round to 2 decimals
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
