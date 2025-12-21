import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ComparisonSpectrumProps {
  userScore: number; // -10 to 10 (or -100 to 100)
  repScore: number;  // -10 to 10 (or -100 to 100)
  repName?: string;
  size?: 'sm' | 'md' | 'lg';
  scale?: 10 | 100; // Whether scores are on -10 to 10 or -100 to 100 scale
}

export const ComparisonSpectrum = ({ 
  userScore, 
  repScore, 
  repName = 'Rep',
  size = 'sm',
  scale = 10
}: ComparisonSpectrumProps) => {
  // Normalize scores to 0-100 for positioning
  const normalizeScore = (score: number) => ((score + scale) / (scale * 2)) * 100;
  
  const userPosition = normalizeScore(userScore);
  const repPosition = normalizeScore(repScore);

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const markerSizes = {
    sm: 'w-3 h-3 -top-0.5',
    md: 'w-4 h-4 -top-0.5',
    lg: 'w-5 h-5 -top-0.5',
  };

  return (
    <TooltipProvider>
      <div className="w-full min-w-[100px]">
        <div className={cn(
          "relative w-full rounded-full bg-gradient-to-r from-blue-500/30 via-muted to-red-500/30 overflow-visible",
          sizeClasses[size]
        )}>
          {/* Center line indicator */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-muted-foreground/40 z-10 -translate-x-1/2" />
          
          {/* Representative score marker */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={cn(
                  "absolute rounded-full bg-primary border-2 border-background shadow-sm cursor-pointer transition-all hover:scale-110 z-20",
                  markerSizes[size]
                )}
                style={{ left: `${repPosition}%`, transform: 'translateX(-50%)' }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>{repName}: {repScore > 0 ? '+' : ''}{repScore.toFixed(1)}</p>
            </TooltipContent>
          </Tooltip>

          {/* User score marker */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={cn(
                  "absolute rounded-full bg-accent border-2 border-background shadow-sm cursor-pointer transition-all hover:scale-110 z-30",
                  markerSizes[size]
                )}
                style={{ left: `${userPosition}%`, transform: 'translateX(-50%)' }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>You: {userScore > 0 ? '+' : ''}{userScore.toFixed(1)}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        
        {/* Legend */}
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>L</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>{repName}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span>You</span>
            </div>
          </div>
          <span>R</span>
        </div>
      </div>
    </TooltipProvider>
  );
};
