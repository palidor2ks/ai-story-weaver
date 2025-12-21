import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';

interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  overall_score: number;
}

interface PoliticalSpectrumProps {
  userScore: number;
  candidates: Candidate[];
  onCandidateClick?: (id: string) => void;
}

export const PoliticalSpectrum = ({ userScore, candidates, onCandidateClick }: PoliticalSpectrumProps) => {
  // Convert score (-10 to +10) to percentage (0 to 100)
  const scoreToPosition = (score: number) => ((score + 10) / 20) * 100;

  // Group candidates by approximate position to avoid overlap
  const groupedCandidates = useMemo(() => {
    const groups: Record<number, Candidate[]> = {};
    candidates.forEach(c => {
      // Round to nearest 2 points for grouping
      const groupKey = Math.round(c.overall_score / 2) * 2;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(c);
    });
    return groups;
  }, [candidates]);

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500 border-blue-600';
      case 'Republican': return 'bg-red-500 border-red-600';
      case 'Independent': return 'bg-purple-500 border-purple-600';
      default: return 'bg-gray-500 border-gray-600';
    }
  };

  const getPartyRingColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'ring-blue-300';
      case 'Republican': return 'ring-red-300';
      case 'Independent': return 'ring-purple-300';
      default: return 'ring-gray-300';
    }
  };

  return (
    <TooltipProvider>
      <div className="relative py-6">
        {/* Background gradient spectrum with markers on it */}
        <div className="relative h-8 rounded-full overflow-visible shadow-inner">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/30 via-muted to-red-500/30" />
          
          {/* Candidate markers - positioned ON the bar */}
          {Object.entries(groupedCandidates).map(([groupScore, groupCandidates]) => {
            const position = scoreToPosition(Number(groupScore));
            const isStacked = groupCandidates.length > 1;
            
            return groupCandidates.map((candidate, idx) => (
              <Tooltip key={candidate.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCandidateClick?.(candidate.id)}
                    className={cn(
                      "absolute w-6 h-6 rounded-full border-2 transition-all hover:scale-125 cursor-pointer top-1/2 -translate-y-1/2 -translate-x-1/2",
                      getPartyColor(candidate.party),
                      "hover:ring-2",
                      getPartyRingColor(candidate.party)
                    )}
                    style={{
                      left: `${position}%`,
                      marginTop: isStacked ? `${(idx - (groupCandidates.length - 1) / 2) * 12}px` : '0px',
                      zIndex: 10 + idx,
                    }}
                    aria-label={`${candidate.name} - ${formatScore(candidate.overall_score)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-semibold">{candidate.name}</div>
                  <div className="text-muted-foreground">
                    {candidate.party} • {formatScore(candidate.overall_score)}
                  </div>
                </TooltipContent>
              </Tooltip>
            ));
          })}

          {/* User marker - positioned ON the bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="absolute w-8 h-8 rounded-full bg-primary border-2 border-background shadow-lg ring-2 ring-primary/50 flex items-center justify-center cursor-pointer hover:scale-110 transition-all top-1/2 -translate-y-1/2 -translate-x-1/2 z-30"
                style={{ left: `${scoreToPosition(userScore)}%` }}
              >
                <span className="text-[10px] font-bold text-primary-foreground">YOU</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="font-semibold">Your Position</div>
              <div className="text-muted-foreground">
                {formatScore(userScore)} • {getScoreLabel(userScore)}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Labels - removed Center */}
        <div className="flex justify-between mt-4 px-2 text-sm">
          <div className="flex flex-col items-start">
            <span className="font-semibold text-blue-600">Left</span>
            <span className="text-xs text-muted-foreground">Progressive</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-semibold text-red-600">Right</span>
            <span className="text-xs text-muted-foreground">Conservative</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Democrat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Republican</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-muted-foreground">Independent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[6px] text-primary-foreground font-bold">YOU</div>
            <span className="text-muted-foreground">Your Position</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
