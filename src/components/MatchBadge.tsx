import { cn } from '@/lib/utils';

interface MatchBadgeProps {
  matchScore: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
}

export const MatchBadge = ({ matchScore, size = 'md' }: MatchBadgeProps) => {
  const getMatchColor = (score: number) => {
    if (score >= 70) return 'bg-agree text-agree-foreground';
    if (score >= 40) return 'bg-accent text-accent-foreground';
    return 'bg-disagree text-disagree-foreground';
  };

  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-14 h-14 text-lg',
    lg: 'w-20 h-20 text-2xl',
  };

  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-bold shadow-md",
      getMatchColor(matchScore),
      sizeClasses[size]
    )}>
      {matchScore}%
    </div>
  );
};
