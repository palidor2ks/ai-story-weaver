import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface ComparisonSpectrumProps {
  userScore: number; // -10 to 10 (or -100 to 100)
  repScore: number;  // -10 to 10 (or -100 to 100)
  repName?: string;
  repImageUrl?: string | null;
  userImageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  scale?: 10 | 100; // Whether scores are on -10 to 10 or -100 to 100 scale
}

export const ComparisonSpectrum = ({ 
  userScore, 
  repScore, 
  repName = 'Rep',
  repImageUrl,
  userImageUrl,
  size = 'sm',
  scale = 10
}: ComparisonSpectrumProps) => {
  // Normalize scores to 0-100 for positioning
  const normalizeScore = (score: number) => ((score + scale) / (scale * 2)) * 100;
  
  const userPosition = normalizeScore(userScore);
  const repPosition = normalizeScore(repScore);

  // Get initials from name
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const avatarSizes = {
    sm: 'w-6 h-6 top-1/2 -translate-y-1/2',
    md: 'w-7 h-7 top-1/2 -translate-y-1/2',
    lg: 'w-8 h-8 top-1/2 -translate-y-1/2',
  };


  return (
    <TooltipProvider>
      <div className="w-full min-w-[100px]">
        <div className={cn(
          "relative w-full rounded-full bg-gradient-to-r from-blue-500/30 via-muted to-red-500/30 overflow-visible",
          sizeClasses[size]
        )}>
          {/* Representative score marker with avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={cn(
                  "absolute cursor-pointer transition-all hover:scale-110 z-20 -translate-x-1/2",
                  avatarSizes[size]
                )}
                style={{ left: `${repPosition}%` }}
              >
                <Avatar className="w-full h-full ring-2 ring-primary ring-offset-1 ring-offset-background shadow-md">
                  {repImageUrl && (
                    <AvatarImage src={repImageUrl} alt={repName} className="object-cover" />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-[8px] font-semibold">
                    {getInitials(repName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>{repName}: {repScore > 0 ? '+' : ''}{repScore.toFixed(1)}</p>
            </TooltipContent>
          </Tooltip>

          {/* User score marker with avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={cn(
                  "absolute cursor-pointer transition-all hover:scale-110 z-30 -translate-x-1/2",
                  avatarSizes[size]
                )}
                style={{ left: `${userPosition}%` }}
              >
                <Avatar className="w-full h-full ring-2 ring-accent ring-offset-1 ring-offset-background shadow-md">
                  {userImageUrl && (
                    <AvatarImage src={userImageUrl} alt="You" className="object-cover" />
                  )}
                  <AvatarFallback className="bg-accent text-accent-foreground">
                    <User className="w-3 h-3" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>You: {userScore > 0 ? '+' : ''}{userScore.toFixed(1)}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        
        {/* Minimal L/R labels */}
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>L</span>
          <span>R</span>
        </div>
      </div>
    </TooltipProvider>
  );
};
