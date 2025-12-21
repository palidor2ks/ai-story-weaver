import { cn } from '@/lib/utils';

interface ScoreBarProps {
  score: number; // -100 to 100
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const ScoreBar = ({ 
  score, 
  label, 
  showValue = true, 
  size = 'md',
  animated = true 
}: ScoreBarProps) => {
  // Normalize score from -100 to 100 to 0 to 100 for display
  const normalizedPosition = ((score + 100) / 200) * 100;
  
  const getScoreColor = (score: number) => {
    if (score >= 30) return 'bg-agree';
    if (score <= -30) return 'bg-disagree';
    return 'bg-accent';
  };

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {showValue && (
            <span className={cn(
              "text-sm font-bold",
              score >= 30 && "text-agree",
              score <= -30 && "text-disagree",
              score > -30 && score < 30 && "text-accent"
            )}>
              {score > 0 ? '+' : ''}{score}
            </span>
          )}
        </div>
      )}
      <div className={cn(
        "relative w-full rounded-full bg-secondary overflow-hidden",
        sizeClasses[size]
      )}>
        {/* Center line indicator */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-muted-foreground/30 z-10" />
        
        {/* Score indicator */}
        <div 
          className={cn(
            "absolute top-0 bottom-0 rounded-full transition-all duration-700 ease-out",
            getScoreColor(score),
            animated && "animate-score-fill"
          )}
          style={{ 
            left: score < 0 ? `${normalizedPosition}%` : '50%',
            width: `${Math.abs(score) / 2}%`,
            '--score-width': `${Math.abs(score) / 2}%`
          } as React.CSSProperties}
        />
      </div>
    </div>
  );
};
