import { cn } from '@/lib/utils';

interface ScoreTextProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

/**
 * Displays a score in L10-R10 format or "NA" if no score is available.
 * 
 * Score format:
 * - Negative scores: L1 to L10 (left-leaning)
 * - Zero: C (center)
 * - Positive scores: R1 to R10 (right-leaning)
 * - No score/null: NA
 */
export function ScoreText({ score, size = 'md', showLabel = false, className }: ScoreTextProps) {
  const formatScoreText = (s: number | null | undefined): string => {
    if (s === null || s === undefined) {
      return 'NA';
    }
    
    // Clamp to valid range (-10 to 10)
    const clamped = Math.max(-10, Math.min(10, s));
    
    // Round to nearest integer for display
    const rounded = Math.round(clamped);
    
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
  };

  const getScoreColorClass = (s: number | null | undefined): string => {
    if (s === null || s === undefined) {
      return 'text-muted-foreground';
    }
    
    if (s <= -3) return 'text-blue-600';
    if (s >= 3) return 'text-red-600';
    return 'text-purple-600';
  };

  const getLabel = (s: number | null | undefined): string => {
    if (s === null || s === undefined) {
      return 'Not Available';
    }
    if (s <= -7) return 'Far Left';
    if (s <= -3) return 'Left-Leaning';
    if (s < 3) return 'Moderate';
    if (s < 7) return 'Right-Leaning';
    return 'Far Right';
  };

  const sizeClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-bold',
    lg: 'text-xl font-bold',
  };

  const scoreText = formatScoreText(score);
  const isNA = scoreText === 'NA';

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <span 
        className={cn(
          sizeClasses[size],
          isNA ? 'text-muted-foreground' : getScoreColorClass(score)
        )}
      >
        {scoreText}
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {getLabel(score)}
        </span>
      )}
    </div>
  );
}

/**
 * Inline version for use in text or tables
 */
export function ScoreTextInline({ score, className }: { score: number | null | undefined; className?: string }) {
  const formatScoreText = (s: number | null | undefined): string => {
    if (s === null || s === undefined) {
      return 'NA';
    }
    
    const clamped = Math.max(-10, Math.min(10, s));
    const rounded = Math.round(clamped);
    
    if (rounded === 0) {
      return 'C';
    }
    
    const absValue = Math.abs(rounded);
    
    // Center zone: -3 to 3 (use CL/CR)
    if (rounded >= -3 && rounded <= 3) {
      return rounded < 0 ? `CL${absValue}` : `CR${absValue}`;
    }
    
    return rounded < 0 ? `L${absValue}` : `R${absValue}`;
  };

  const getScoreColorClass = (s: number | null | undefined): string => {
    if (s === null || s === undefined) {
      return 'text-muted-foreground';
    }
    if (s <= -3) return 'text-blue-600';
    if (s >= 3) return 'text-red-600';
    return 'text-purple-600';
  };

  const scoreText = formatScoreText(score);
  const isNA = scoreText === 'NA';

  return (
    <span 
      className={cn(
        "font-semibold",
        isNA ? 'text-muted-foreground' : getScoreColorClass(score),
        className
      )}
    >
      {scoreText}
    </span>
  );
}