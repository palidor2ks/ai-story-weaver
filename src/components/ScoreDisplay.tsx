import { formatScore, getScoreColor, getScoreLabel } from '@/lib/scoreFormat';
import { cn } from '@/lib/utils';

interface ScoreDisplayProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl',
};

export const ScoreDisplay = ({ 
  score, 
  size = 'md', 
  showLabel = false,
  className 
}: ScoreDisplayProps) => {
  const formatted = formatScore(score);
  const colorClass = getScoreColor(score);
  const label = getScoreLabel(score);
  
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <span className={cn(
        'font-display font-bold',
        sizeClasses[size],
        colorClass
      )}>
        {formatted}
      </span>
      {showLabel && (
        <span className="text-sm text-muted-foreground mt-1">
          {label}
        </span>
      )}
    </div>
  );
};
